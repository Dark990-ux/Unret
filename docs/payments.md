# Payments with Stripe Connect

UNRET supports three ways to pay for a job:

| Method | Who handles the money | Confirmation |
|---|---|---|
| Card / bank transfer | Customer pays the professional directly (the professional's IBAN can be shown on the job page) | The professional confirms in the app |
| Cash | Customer pays face to face | The professional confirms in the app |
| Through UNRET | **Stripe**: the customer pays by card on Stripe's secure page | Automatic |

## How "Through UNRET" works

UNRET uses Stripe Connect with **separate charges and transfers**:

1. The customer taps **Pay deposit** or **Pay now** and is sent to Stripe Checkout. UNRET never sees card details.
2. The money lands on UNRET's Stripe balance and is **held**.
3. UNRET transfers the professional's share (price minus the platform fee) to the professional's Stripe account:
   - the **deposit** when the professional starts the work,
   - **the rest** when the job is completed.
4. If the job is cancelled, money that is still held is **refunded** to the customer automatically.

Professionals set up payouts once (**Earnings → Set up payouts with Stripe** on the website, or **Account → Payout account** in the app). Stripe asks for their bank account (IBAN) and verifies their identity. Money that arrives before they finish is kept and sent automatically as soon as their account is active.

## Setup

### 1. Create a Stripe account (free)

1. Sign up at https://dashboard.stripe.com/register. Choose **Romania** as the country.
2. Stay in **Test mode** (switch at the top of the dashboard). Test mode needs no business verification and moves no real money.
3. Enable Connect: **Dashboard → Connect → Get started**. Choose **Platform or marketplace**, and **Express** accounts for your professionals.
4. Copy the **Secret key** (`sk_test_...`) from **Developers → API keys**.

### 2. Configure UNRET

With Docker, create a file named `.env` next to `docker-compose.yml`:

```
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_your_key_here
```

Then restart: `docker compose up -d --build`.

Without Docker, put the same lines in `apps/api/.env` and restart the API.

> Never commit the `.env` file or share the secret key. Anyone with it can act on your Stripe account.

### 3. Webhooks (recommended)

UNRET asks Stripe for the result when the customer comes back from the payment page, and refreshes a professional's payout status when they open their Earnings page. So everything works without webhooks. Webhooks make updates instant, even if the customer closes the browser.

- **Locally:** install the Stripe CLI and run
  `stripe listen --forward-to localhost:4000/api/v1/payments/webhook`.
  Put the `whsec_...` it prints in `STRIPE_WEBHOOK_SECRET`.
- **On a server:** in **Developers → Webhooks**, add the endpoint `https://YOUR-API-DOMAIN/api/v1/payments/webhook`, listening to these events:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
  - `checkout.session.expired`
  - `account.updated` (enable "Listen to events on Connected accounts")

  Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.

### 4. Try it

- **Customer:** pay a job "Through UNRET" with the test card `4242 4242 4242 4242`, any future date, any CVC.
- **Professional:** in test mode, Stripe onboarding accepts test data. Use the test IBAN `RO49AAAA1B31007593840000`, and Stripe's test values for identity checks (e.g. the code `000 000` for SMS).

## Going live

1. Complete your business verification in Stripe and switch to **Live mode**.
2. Replace the key with `sk_live_...` and create a live webhook endpoint (new `whsec_...`).
3. Set `DATA_ENCRYPTION_KEY` and real random `JWT_*` secrets on the server.
4. Check the platform fee per country (`Country.platformFeeBps`, 10% by default for Romania) and that your terms of service describe how payments are held.

## Fees

- **Platform fee:** UNRET keeps it from each payment. It is set per country and is 10% in Romania.
- **Stripe's card fee:** UNRET estimates it at about 1.5% + 1.25 RON for European cards when it calculates the professional's share. The exact fee for each payment is shown in the Stripe dashboard.
