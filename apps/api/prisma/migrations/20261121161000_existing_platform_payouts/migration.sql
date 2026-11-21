-- Payments made through UNRET before payout tracking existed: treat completed jobs as paid out, others as held.
UPDATE "Payment" p SET "payoutStatus" = CASE WHEN j.status = 'COMPLETED' THEN 'SENT'::"PayoutStatus" ELSE 'HELD'::"PayoutStatus" END
FROM "Job" j WHERE j.id = p."jobId" AND p.method = 'PLATFORM' AND p.status = 'SUCCEEDED';
UPDATE "Payment" SET "payoutStatus" = 'REFUNDED' WHERE method = 'PLATFORM' AND status = 'REFUNDED';
-- Legacy direct payments recorded by a party count as confirmed.
UPDATE "Payment" SET "confirmedAt" = "createdAt" WHERE method = 'DIRECT' AND status = 'RECORDED' AND "confirmedAt" IS NULL;
