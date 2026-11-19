import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface CreateIntentInput {
  amountMinor: number;
  currency: string;
  platformFeeMinor: number;
  jobId: string;
  /** The provider's connected-account id of the professional (marketplace payouts). */
  payeeAccountRef?: string | null;
}

export interface PaymentIntent {
  reference: string;
  clientSecret: string;
  providerFeeMinor: number;
  checkoutUrl?: string;
}

/**
 * Payment service provider abstraction. UNRET never sees or stores card data:
 * the client collects payment details directly with the PSP (e.g. Stripe Connect,
 * Adyen for Platforms, or Mangopay) using `clientSecret`, and the PSP notifies
 * UNRET through a signed webhook.
 */
export interface PaymentProvider {
  readonly name: string;
  createIntent(input: CreateIntentInput): Promise<PaymentIntent>;
  refund(reference: string, amountMinor: number): Promise<{ ok: boolean }>;
  /** Verifies a webhook signature and returns a normalized event. */
  parseWebhook(rawBody: Buffer, signature: string | undefined): { reference: string; status: 'SUCCEEDED' | 'FAILED' } | null;
}

/** Development provider: simulates a PSP. Payments are confirmed via POST /payments/:id/mock-confirm. */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    // Illustrative PSP fee: 1.4% + 1.00 in the payment currency.
    const providerFeeMinor = Math.round(input.amountMinor * 0.014) + 100;
    return { reference: `mock_${randomUUID()}`, clientSecret: `mock_secret_${randomUUID()}`, providerFeeMinor };
  }
  async refund() {
    return { ok: true };
  }
  parseWebhook() {
    return null;
  }
}
