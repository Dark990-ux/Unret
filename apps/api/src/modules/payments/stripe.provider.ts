import { Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { CreateIntentInput, PayeeStatus, PaymentIntent, PaymentProvider, Payee, ProviderEvent, ProviderSubscription, ProviderSubStatus } from './provider';

const withQuery = (url: string, query: string) => url + (url.includes('?') ? '&' : '?') + query;

/**
 * Stripe Connect with "separate charges and transfers":
 *  - the customer pays on Stripe Checkout (UNRET never sees card data); the money lands on UNRET's Stripe balance,
 *  - UNRET holds it and later transfers the professional's share to their Express connected account
 *    (deposit when work starts, the rest when the job is completed) — see PayoutsService,
 *  - professionals add their bank account and verify their identity in Stripe's hosted onboarding.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe';
  readonly usesPayeeAccounts = true;
  private log = new Logger('Stripe');
  private stripe: Stripe;

  /** `apiBase` points the SDK at another server, e.g. stripe-mock in tests (STRIPE_API_BASE). */
  constructor(secretKey: string, private webhookSecret?: string, apiBase?: string) {
    const base = apiBase ? new URL(apiBase) : null;
    this.stripe = new Stripe(secretKey, {
      appInfo: { name: 'UNRET' }, maxNetworkRetries: 2,
      ...(base ? { host: base.hostname, port: Number(base.port) || (base.protocol === 'https:' ? 443 : 80), protocol: base.protocol.replace(':', '') as 'http' | 'https' } : {}),
    });
  }

  /** Estimate for European cards (≈1.5% + 1.25 RON). Stripe's exact fee is visible in the Stripe dashboard. */
  private estimateFee(amountMinor: number) {
    return Math.round(amountMinor * 0.015) + 125;
  }

  async createIntent(i: CreateIntentInput): Promise<PaymentIntent> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: i.jobId,
      customer_email: i.customerEmail ?? undefined,
      line_items: [{ quantity: 1, price_data: { currency: i.currency.toLowerCase(), unit_amount: i.amountMinor, product_data: { name: i.description.slice(0, 250) } } }],
      payment_intent_data: { transfer_group: i.jobId, description: i.description.slice(0, 500), metadata: { jobId: i.jobId, platformFeeMinor: String(i.platformFeeMinor) } },
      metadata: { jobId: i.jobId },
      success_url: withQuery(i.returnUrl, 'payment=success'),
      cancel_url: withQuery(i.returnUrl, 'payment=cancelled'),
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // the page stays valid for 1 hour
    });
    if (!session.url) throw new Error('Stripe did not return a checkout page');
    return { reference: session.id, clientSecret: '', checkoutUrl: session.url, providerFeeMinor: this.estimateFee(i.amountMinor) };
  }

  async paymentStatus(reference: string) {
    const s = await this.stripe.checkout.sessions.retrieve(reference);
    if (s.payment_status === 'paid' || s.payment_status === 'no_payment_required') return 'SUCCEEDED' as const;
    if (s.status === 'expired') return 'FAILED' as const;
    return 'PENDING' as const;
  }

  async cancelIntent(reference: string) {
    const s = await this.stripe.checkout.sessions.retrieve(reference);
    if (s.status === 'open') await this.stripe.checkout.sessions.expire(reference);
  }

  private async paymentIntentOf(reference: string) {
    const s = await this.stripe.checkout.sessions.retrieve(reference, { expand: ['payment_intent'] });
    const pi = s.payment_intent;
    if (!pi || typeof pi === 'string') throw new Error(`Checkout session ${reference} has no payment`);
    return pi;
  }

  async refund(reference: string, amountMinor: number) {
    const pi = await this.paymentIntentOf(reference);
    await this.stripe.refunds.create({ payment_intent: pi.id, amount: amountMinor }, { idempotencyKey: `refund_${reference}_${amountMinor}` });
    return { ok: true };
  }

  async payout(input: { paymentReference: string; amountMinor: number; currency: string; jobId: string; payee: Payee }) {
    if (!input.payee.accountRef) throw new Error('The professional has no Stripe account yet');
    const pi = await this.paymentIntentOf(input.paymentReference);
    const charge = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id;
    const transfer = await this.stripe.transfers.create(
      {
        amount: input.amountMinor, currency: input.currency.toLowerCase(), destination: input.payee.accountRef,
        transfer_group: input.jobId, ...(charge ? { source_transaction: charge } : {}), metadata: { jobId: input.jobId, payment: input.paymentReference },
      },
      { idempotencyKey: `payout_${input.paymentReference}` },
    );
    return { reference: transfer.id };
  }

  parseWebhook(rawBody: Buffer, signature: string | undefined): ProviderEvent | null {
    if (!this.webhookSecret || !signature) return null;
    let ev: Stripe.Event;
    try {
      ev = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (e) {
      this.log.warn(`Rejected webhook: ${(e as Error).message}`);
      return null;
    }
    switch (ev.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const s = ev.data.object as Stripe.Checkout.Session;
        if (s.mode === 'subscription') {
          const sub = typeof s.subscription === 'string' ? s.subscription : s.subscription?.id ?? null;
          return { kind: 'subscription_checkout', reference: s.id, subscriptionRef: sub, localId: s.metadata?.subscriptionId ?? null };
        }
        return s.payment_status === 'paid' ? { kind: 'payment', reference: s.id, status: 'SUCCEEDED' } : { kind: 'ignored' };
      }
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired':
        return { kind: 'payment', reference: (ev.data.object as Stripe.Checkout.Session).id, status: 'FAILED' };
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        return { kind: 'subscription', subscription: this.mapSub(ev.data.object as Stripe.Subscription) };
      case 'invoice.payment_failed': {
        const inv = ev.data.object as Stripe.Invoice & { subscription?: string | { id: string } | null };
        const ref = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id;
        return ref ? { kind: 'subscription_payment_failed', subscriptionRef: ref } : { kind: 'ignored' };
      }
      case 'account.updated': {
        const a = ev.data.object as Stripe.Account;
        return { kind: 'payee', accountRef: a.id, payoutsEnabled: !!a.payouts_enabled, detailsSubmitted: !!a.details_submitted };
      }
      default:
        return { kind: 'ignored' };
    }
  }

  async createPayeeAccount(input: { email: string; country: string; businessType: 'individual' | 'company'; professionalId: string }) {
    const a = await this.stripe.accounts.create(
      {
        type: 'express', country: input.country, email: input.email, business_type: input.businessType,
        capabilities: { transfers: { requested: true } }, metadata: { professionalId: input.professionalId },
      },
      { idempotencyKey: `account_${input.professionalId}` },
    );
    return a.id;
  }

  async payeeOnboardingUrl(accountRef: string, returnUrl: string, refreshUrl: string) {
    const link = await this.stripe.accountLinks.create({ account: accountRef, type: 'account_onboarding', return_url: returnUrl, refresh_url: refreshUrl });
    return link.url;
  }

  async payeeStatus(accountRef: string): Promise<PayeeStatus> {
    const a = await this.stripe.accounts.retrieve(accountRef);
    return { payoutsEnabled: !!a.payouts_enabled, detailsSubmitted: !!a.details_submitted };
  }

  async payeeDashboardUrl(accountRef: string) {
    return (await this.stripe.accounts.createLoginLink(accountRef)).url;
  }

  // ── Monthly plans for professionals (Stripe Billing) ──

  private mapSub(s: Stripe.Subscription): ProviderSubscription {
    const map: Record<string, ProviderSubStatus> = { active: 'ACTIVE', trialing: 'ACTIVE', past_due: 'PAST_DUE', unpaid: 'PAST_DUE', canceled: 'CANCELLED', incomplete_expired: 'CANCELLED', incomplete: 'PENDING', paused: 'CANCELLED' };
    const end = (s as any).current_period_end ?? (s.items?.data?.[0] as any)?.current_period_end ?? Math.floor(Date.now() / 1000);
    return { ref: s.id, status: map[s.status] ?? 'PENDING', currentPeriodEnd: new Date(end * 1000), cancelAtPeriodEnd: !!s.cancel_at_period_end, localId: s.metadata?.subscriptionId ?? null };
  }

  async ensurePlanPrice(plan: { code: string; name: string; priceMinor: number; currency: string }) {
    const product = await this.stripe.products.create({ name: `UNRET ${plan.name}`, metadata: { plan: plan.code } }, { idempotencyKey: `product_${plan.code}_${plan.priceMinor}_${plan.currency}` });
    const price = await this.stripe.prices.create(
      { product: product.id, unit_amount: plan.priceMinor, currency: plan.currency.toLowerCase(), recurring: { interval: 'month' }, metadata: { plan: plan.code } },
      { idempotencyKey: `price_${plan.code}_${plan.priceMinor}_${plan.currency}` },
    );
    return price.id;
  }

  async createSubscriptionCheckout(i: { priceRef: string; localId: string; professionalId: string; customerEmail?: string | null; returnUrl: string; planName: string }) {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: i.priceRef, quantity: 1 }],
      customer_email: i.customerEmail ?? undefined,
      client_reference_id: i.professionalId,
      metadata: { subscriptionId: i.localId },
      subscription_data: { metadata: { subscriptionId: i.localId, professionalId: i.professionalId } },
      success_url: withQuery(i.returnUrl, 'subscription=success'),
      cancel_url: withQuery(i.returnUrl, 'subscription=cancelled'),
    });
    if (!session.url) throw new Error('Stripe did not return a checkout page');
    return { reference: session.id, checkoutUrl: session.url };
  }

  async subscriptionFromCheckout(reference: string) {
    const s = await this.stripe.checkout.sessions.retrieve(reference, { expand: ['subscription'] });
    if (s.status !== 'complete' || !s.subscription || typeof s.subscription === 'string') return null;
    return this.mapSub(s.subscription);
  }

  async getSubscription(ref: string) {
    return this.mapSub(await this.stripe.subscriptions.retrieve(ref));
  }

  async setCancelAtPeriodEnd(ref: string, cancel: boolean) {
    return this.mapSub(await this.stripe.subscriptions.update(ref, { cancel_at_period_end: cancel }));
  }

  /** Upgrade/downgrade right away; Stripe charges or credits the difference on the next invoice. */
  async changeSubscriptionPrice(ref: string, priceRef: string) {
    const sub = await this.stripe.subscriptions.retrieve(ref);
    const item = sub.items.data[0];
    return this.mapSub(await this.stripe.subscriptions.update(ref, { items: [{ id: item.id, price: priceRef }], proration_behavior: 'create_prorations', cancel_at_period_end: false }));
  }
}
