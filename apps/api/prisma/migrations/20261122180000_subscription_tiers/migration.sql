-- Subscription tiers: FREE / STANDARD / DELUXE / VIP with daily request limits and visibility
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PENDING' BEFORE 'ACTIVE';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PAST_DUE' AFTER 'ACTIVE';

ALTER TABLE "SubscriptionPlan" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SubscriptionPlan" ADD COLUMN "providerPriceRef" TEXT;
ALTER TABLE "ProfessionalSubscription" ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProfessionalSubscription" ADD COLUMN "provider" TEXT;
ALTER TABLE "ProfessionalSubscription" ADD COLUMN "providerRef" TEXT;
CREATE UNIQUE INDEX "ProfessionalSubscription_providerRef_key" ON "ProfessionalSubscription"("providerRef");
ALTER TABLE "RequestMatch" ADD COLUMN "limitSkippedAt" TIMESTAMP(3);
ALTER TABLE "ProfessionalProfile" ADD COLUMN "planLimitNoticeAt" TIMESTAMP(3);

-- Replace the old placeholder plans with the four tiers (prices in EUR per month)
UPDATE "ProfessionalSubscription" SET "status" = 'CANCELLED' WHERE "status" = 'ACTIVE' AND "planId" IN (SELECT id FROM "SubscriptionPlan" WHERE code IN ('basic', 'pro', 'business'));
UPDATE "SubscriptionPlan" SET "isActive" = false WHERE code IN ('basic', 'pro', 'business');
INSERT INTO "SubscriptionPlan" (id, code, name, "countryCode", "priceMinor", currency, features, "isActive", "sortOrder")
SELECT gen_random_uuid()::text, v.code, v.name, c.code, v.price, 'EUR', v.features::jsonb, true, v.sort
FROM "Country" c
CROSS JOIN (VALUES
  ('free',     'Free',     0,    '{"requestsPerDay": 7,   "visibility": 0, "badge": null,       "highlights": ["Up to 7 new requests per day", "Public profile and portfolio", "Unlimited offers and messages"]}', 1),
  ('standard', 'Standard', 599,  '{"requestsPerDay": 50,  "visibility": 1, "badge": "standard", "highlights": ["Up to 50 new requests per day", "Shown higher in search and matching", "Standard badge on your profile"]}', 2),
  ('deluxe',   'Deluxe',   999,  '{"requestsPerDay": 100, "visibility": 2, "badge": "deluxe",   "highlights": ["Up to 100 new requests per day", "Shown even higher in search and matching", "Deluxe badge on your profile"]}', 3),
  ('vip',      'VIP',      1999, '{"requestsPerDay": null, "visibility": 3, "badge": "vip",     "highlights": ["Unlimited new requests", "Top placement in search and matching", "VIP badge on your profile"]}', 4)
) AS v(code, name, price, features, sort)
WHERE c."isActive" = true
ON CONFLICT ("code", "countryCode") DO UPDATE SET name = EXCLUDED.name, "priceMinor" = EXCLUDED."priceMinor", currency = EXCLUDED.currency, features = EXCLUDED.features, "isActive" = true, "sortOrder" = EXCLUDED."sortOrder";
