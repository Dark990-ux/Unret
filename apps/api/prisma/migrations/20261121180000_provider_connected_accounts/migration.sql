-- Connected account at the payment provider (Stripe Connect) for each professional
ALTER TABLE "ProfessionalProfile" ADD COLUMN "providerAccountId" TEXT;
ALTER TABLE "ProfessionalProfile" ADD COLUMN "providerPayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProfessionalProfile" ADD COLUMN "providerDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProfessionalProfile" ADD COLUMN "providerAccountUpdatedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "ProfessionalProfile_providerAccountId_key" ON "ProfessionalProfile"("providerAccountId");
