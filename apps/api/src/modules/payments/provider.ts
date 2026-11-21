import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface CreateIntentInput {
  amountMinor: number;
  currency: string;
  platformFeeMinor: number;
  jobId: string;
  /** Shown to the customer on the provider's payment page, e.g. "Rewire the kitchen · deposit". */
  description: string;
  /** Where the provider's payment page sends the customer back to. */
  returnUrl: string;
  customerEmail?: string | null;
}

export interface PaymentIntent {
  reference: string;
  clientSecret: string;
  providerFeeMinor: number;
  /** Hosted payment page. When present the client redirects the customer there. */
  checkoutUrl?: string;
}

/** Who receives a payout: a connected account at the provider, or a bank account (IBAN). */
export interface Payee {
  accountRef?: string | null;
  iban?: string;
  holderName?: string;
}

export type ProviderEvent =
  | { kind: 'payment'; reference: string; status: 'SUCCEEDED' | 'FAILED' }
  | { kind: 'payee'; accountRef: string; payoutsEnabled: boolean; detailsSubmitted: boolean }
  | { kind: 'ignored' };

export interface PayeeStatus {
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

/**
 * Payment service provider abstraction. UNRET never sees or stores card data:
 * the customer pays on the provider's page and the provider notifies UNRET through a
 * signed webhook (UNRET can also ask the provider for the result directly).
 */
export interface PaymentProvider {
  readonly name: string;
  /** True when professionals are paid through their own account at the provider (marketplace payouts). */
  readonly usesPayeeAccounts: boolean;
  createIntent(input: CreateIntentInput): Promise<PaymentIntent>;
  /** Current result of a payment, for when the webhook has not arrived (yet). */
  paymentStatus(reference: string): Promise<'SUCCEEDED' | 'FAILED' | 'PENDING'>;
  /** Closes an unpaid payment page so it can no longer be paid. */
  cancelIntent(reference: string): Promise<void>;
  refund(reference: string, amountMinor: number): Promise<{ ok: boolean }>;
  /** Sends the professional's share of a held payment to them. */
  payout(input: { paymentReference: string; amountMinor: number; currency: string; jobId: string; payee: Payee }): Promise<{ reference: string }>;
  /** Verifies a webhook signature and returns a normalized event, or null when the signature is invalid. */
  parseWebhook(rawBody: Buffer, signature: string | undefined): ProviderEvent | null;

  // Connected accounts (only when usesPayeeAccounts)
  createPayeeAccount?(input: { email: string; country: string; businessType: 'individual' | 'company'; professionalId: string }): Promise<string>;
  payeeOnboardingUrl?(accountRef: string, returnUrl: string, refreshUrl: string): Promise<string>;
  payeeStatus?(accountRef: string): Promise<PayeeStatus>;
  payeeDashboardUrl?(accountRef: string): Promise<string>;
}

/** Development provider: simulates a PSP. Payments are confirmed via POST /payments/:id/mock-confirm. */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly usesPayeeAccounts = false;
  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    // Illustrative PSP fee: 1.4% + 1.00 in the payment currency.
    const providerFeeMinor = Math.round(input.amountMinor * 0.014) + 100;
    return { reference: `mock_${randomUUID()}`, clientSecret: `mock_secret_${randomUUID()}`, providerFeeMinor };
  }
  async paymentStatus() {
    return 'PENDING' as const;
  }
  async cancelIntent() {}
  async refund() {
    return { ok: true };
  }
  async payout() {
    return { reference: `mock_payout_${randomUUID()}` };
  }
  parseWebhook() {
    return null;
  }
}
