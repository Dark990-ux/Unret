-- "Notify me when X is free"
CREATE TABLE "AvailabilityAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AvailabilityAlert_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AvailabilityAlert_userId_professionalId_key" ON "AvailabilityAlert"("userId", "professionalId");
CREATE INDEX "AvailabilityAlert_professionalId_idx" ON "AvailabilityAlert"("professionalId");
ALTER TABLE "AvailabilityAlert" ADD CONSTRAINT "AvailabilityAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AvailabilityAlert" ADD CONSTRAINT "AvailabilityAlert_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
