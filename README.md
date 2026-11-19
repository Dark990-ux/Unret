# UNRET

A services marketplace connecting customers with independent professionals and service companies. It launches in Romania and is built to support more countries later.

```
apps/api      NestJS + Prisma + PostgreSQL. A modular monolith exposing a REST API (/api/v1) plus real-time updates (socket.io)
apps/web      Next.js 14 (App Router) + Tailwind. Public site, customer & professional dashboards, admin
packages/shared  Statuses, state machines, money helpers and matching weights shared by API, web and (later) mobile
```

## Quick start

Requirements: Node 20+, pnpm 10, PostgreSQL 16, Redis 7 (`docker compose up -d` starts both).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # set real secrets outside development
pnpm --filter @unret/shared build
pnpm --filter @unret/api exec prisma migrate deploy
pnpm db:seed
pnpm --filter @unret/api dev                # http://localhost:4000/api/v1 (docs: /api/docs)
pnpm --filter @unret/web dev                # http://localhost:3000
```

Demo accounts (password `Unret-demo-2026!`): `admin@unret.ro`, `ana.popescu@example.com` (customer), `ion.electric@example.com` (licensed electrician). Other demo professionals are listed in `apps/api/prisma/seed.ts`.

## What is implemented

| Area | Notes |
|---|---|
| Accounts | Email or phone sign-up; one account can act as customer and professional; JWT access tokens + rotating refresh tokens (reuse detection); TOTP two-factor authentication (`ADMIN_MFA_REQUIRED=true` enforces it for admin actions); GDPR data export and account deletion (anonymised) |
| Professional profiles | Individual or company; services with indicative prices; portfolio; languages; working area; visibility levels: HIDDEN (essentials missing) → LIMITED (receives matched requests) → PUBLIC (listed in search) |
| Verification | Separate badges for identity, business, qualification (tied to a specific service) and additional checks. Required checks can vary by category and by country. Documents are private, served through short-lived signed links, and every admin view is logged |
| Categories | Hierarchical; localized names (ro/en); per-country availability and requirements; managed in the admin interface with no app release needed |
| Requests | Draft → Published → Offers received → Offer accepted; plus Cancelled and Expired. The exact address is shown only to the professional who is hired |
| Matching | Steps follow PRD §20 and are explainable: every professional considered gets a recorded decision, a reason and a score breakdown. Requests go out to a first group of 10, and the group expands after 12 hours if fewer than 2 offers arrive. Subscriptions play no part in ranking |
| Offers | Fixed price or estimate, materials, extra costs, proposed time and expiry. Revisions never overwrite earlier versions. Accepting checks the version the customer saw. Customers can request changes or decline |
| Jobs | The accepted offer becomes the agreement record. Changes to price, scope or schedule must be accepted by the other party, with full history kept. Completion needs both sides to confirm (it auto-completes 7 days after the professional confirms). Includes cancellations, disputes, a timeline, and assigning jobs to company team members |
| Calendar | Weekly hours, blocked periods, emergency availability, pausing new requests, open slots. The database itself prevents double booking (exclusion constraint) |
| Messaging & notifications | Conversations linked to requests or jobs, attachments, real-time delivery. In-app notifications plus email/push/SMS through a Redis queue (delivery is currently only logged), with per-user preferences; essential notifications cannot be turned off |
| Payments | Direct (recorded only) or online through a payment-provider interface (`MockPaymentProvider` in development). Records fees, payouts and refunds; card data is never stored |
| Reviews | Only the customer of a completed job can review, once per job, with four ratings. Professionals can reply; admins moderate |
| Admin | Statistics (PRD §26 metrics), users (suspend/reactivate), verification queue, categories, reports, disputes, review moderation, payments and refunds, subscription plans, risk indicators, countries, audit log |
| Internationalisation | Money stored in integer minor units with a currency code; times in UTC with time zones for availability; country table; ro/en interface |

## Before going live

- **Payment provider:** implement `PaymentProvider` in `apps/api/src/modules/payments/provider.ts` for a provider that supports marketplace payouts in Romania (e.g. Stripe Connect, Adyen for Platforms, Mangopay), including webhook signature checks.
- **Delivery channels:** connect real email, push (Expo/FCM/APNs) and SMS providers in `notifications/channels.ts`.
- **File storage:** replace the local-disk driver in `files/storage.service.ts` with S3-compatible storage and presigned URLs.
- **Notification language:** server-generated notification texts are English only.
- **Locations:** location is chosen from a built-in city list; a geocoding provider is needed for street-level accuracy.
- **Legal pages:** terms and privacy pages are placeholders that need legal review.
- **Mobile app:** React Native/Expo is not built yet. The API and `packages/shared` are ready to be used by it.
