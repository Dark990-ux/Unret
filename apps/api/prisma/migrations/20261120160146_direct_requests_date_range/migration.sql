-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "preferredDateTo" TIMESTAMP(3),
ADD COLUMN     "targetProfessionalId" TEXT;

-- CreateIndex
CREATE INDEX "ServiceRequest_targetProfessionalId_status_idx" ON "ServiceRequest"("targetProfessionalId", "status");

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_targetProfessionalId_fkey" FOREIGN KEY ("targetProfessionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
