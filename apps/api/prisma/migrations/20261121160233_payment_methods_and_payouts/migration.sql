-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('NOT_APPLICABLE', 'HELD', 'SENT', 'REFUNDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'TRANSFER';
ALTER TYPE "PaymentMethod" ADD VALUE 'CASH';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'AWAITING_CONFIRMATION';
ALTER TYPE "PaymentStatus" ADD VALUE 'CONFIRMED';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedById" TEXT,
ADD COLUMN     "customerMarkedPaidAt" TIMESTAMP(3),
ADD COLUMN     "payoutAt" TIMESTAMP(3),
ADD COLUMN     "payoutReference" TEXT,
ADD COLUMN     "payoutStatus" "PayoutStatus" NOT NULL DEFAULT 'NOT_APPLICABLE';

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "paymentMethod" "PaymentMethod";
