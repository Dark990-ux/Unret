-- "When are you available?": every day, specific weekdays or specific dates
ALTER TABLE "ServiceRequest" ADD COLUMN "availabilityMode" TEXT;
ALTER TABLE "ServiceRequest" ADD COLUMN "availableWeekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "ServiceRequest" ADD COLUMN "availableDates" TEXT[] DEFAULT ARRAY[]::TEXT[];
