-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "paymentCheckResolvedAt" TIMESTAMP(3),
ADD COLUMN     "paymentCheckStage" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paymentEscalatedAt" TIMESTAMP(3),
ADD COLUMN     "paymentReminder1At" TIMESTAMP(3),
ADD COLUMN     "paymentReminder2At" TIMESTAMP(3),
ADD COLUMN     "paymentTicketId" TEXT;

-- CreateIndex
CREATE INDEX "Job_paymentCheckStage_paymentCheckResolvedAt_idx" ON "Job"("paymentCheckStage", "paymentCheckResolvedAt");

