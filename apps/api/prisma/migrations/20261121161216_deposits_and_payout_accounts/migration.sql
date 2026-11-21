-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('FULL', 'DEPOSIT', 'BALANCE');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "depositMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "depositNote" TEXT;

-- AlterTable
ALTER TABLE "OfferRevision" ADD COLUMN     "depositNote" TEXT,
ADD COLUMN     "depositPercent" INTEGER;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "kind" "PaymentKind" NOT NULL DEFAULT 'FULL';

-- CreateTable
CREATE TABLE "PayoutAccount" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "ibanEncrypted" TEXT NOT NULL,
    "ibanLast4" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "bankCode" TEXT,
    "showToCustomers" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayoutAccount_professionalId_key" ON "PayoutAccount"("professionalId");

-- AddForeignKey
ALTER TABLE "PayoutAccount" ADD CONSTRAINT "PayoutAccount_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfferRevision" ADD CONSTRAINT offer_deposit_range CHECK ("depositPercent" IS NULL OR "depositPercent" BETWEEN 10 AND 50);
ALTER TABLE "Job" ADD CONSTRAINT job_deposit_range CHECK ("depositMinor" >= 0 AND "depositMinor" <= "agreedPriceMinor");
