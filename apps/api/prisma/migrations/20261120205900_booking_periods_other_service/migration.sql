-- AlterTable
ALTER TABLE "ProfessionalService" ADD COLUMN     "customName" TEXT;

-- CreateTable
CREATE TABLE "AvailabilityPeriod" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvailabilityPeriod_professionalId_endDate_idx" ON "AvailabilityPeriod"("professionalId", "endDate");

-- AddForeignKey
ALTER TABLE "AvailabilityPeriod" ADD CONSTRAINT "AvailabilityPeriod_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AvailabilityPeriod" ADD CONSTRAINT period_valid_range CHECK ("endDate" >= "startDate");

-- "Other" category so professionals can describe a service that isn't listed (idempotent).
INSERT INTO "ServiceCategory" (id, slug, icon, "sortOrder", "isActive", "remoteAllowed", "requiredVerifications", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'other-services', '✨', 99, true, true, '{}', now(), now()) ON CONFLICT (slug) DO NOTHING;
INSERT INTO "ServiceCategory" (id, "parentId", slug, icon, "sortOrder", "isActive", "remoteAllowed", "requiredVerifications", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p.id, 'other', '✨', 0, true, true, '{}', now(), now() FROM "ServiceCategory" p WHERE p.slug = 'other-services'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO "CategoryTranslation" (id, "categoryId", locale, name)
SELECT gen_random_uuid()::text, c.id, t.locale, t.name FROM "ServiceCategory" c
JOIN (VALUES ('other-services', 'en', 'Other'), ('other-services', 'ro', 'Altele'), ('other', 'en', 'Something else'), ('other', 'ro', 'Altceva')) AS t(slug, locale, name) ON t.slug = c.slug
ON CONFLICT ("categoryId", locale) DO NOTHING;
INSERT INTO "CategoryCountry" (id, "categoryId", "countryCode", "isActive", "requiredVerifications", "overrideRequirements")
SELECT gen_random_uuid()::text, c.id, 'RO', true, '{}', false FROM "ServiceCategory" c
WHERE c.slug IN ('other-services', 'other') AND EXISTS (SELECT 1 FROM "Country" WHERE code = 'RO')
ON CONFLICT ("categoryId", "countryCode") DO NOTHING;
