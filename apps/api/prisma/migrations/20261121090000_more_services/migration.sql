-- More services in each area (idempotent: safe on databases that already have them).
CREATE TEMP TABLE new_services(parent text, slug text, en text, ro text, icon text, remote boolean, req "VerificationType"[], sort int);
INSERT INTO new_services VALUES
('home-services', 'locksmith', 'Locksmith', 'Lăcătușerie', '🔑', false, '{}'::"VerificationType"[], 10),
('home-services', 'handyman', 'Handyman & small repairs', 'Mici reparații', '🧰', false, '{}'::"VerificationType"[], 11),
('home-services', 'furniture-assembly', 'Furniture assembly', 'Montaj mobilă', '🪑', false, '{}'::"VerificationType"[], 12),
('home-services', 'tiling', 'Tiling', 'Faianță și gresie', '🔲', false, '{}'::"VerificationType"[], 13),
('home-services', 'flooring', 'Flooring & parquet', 'Parchet și pardoseli', '🪵', false, '{}'::"VerificationType"[], 14),
('home-services', 'drywall', 'Drywall & plastering', 'Rigips și tencuieli', '🧱', false, '{}'::"VerificationType"[], 15),
('home-services', 'roofing', 'Roofing', 'Acoperișuri', '🏠', false, '{}'::"VerificationType"[], 16),
('home-services', 'windows-doors', 'Windows & doors', 'Montaj ferestre și uși', '🚪', false, '{}'::"VerificationType"[], 17),
('home-services', 'gas-installations', 'Gas installations', 'Instalații de gaze', '🔥', false, '{QUALIFICATION}'::"VerificationType"[], 18),
('home-services', 'appliance-repair', 'Appliance repair', 'Reparații electrocasnice', '🧺', false, '{}'::"VerificationType"[], 19),
('home-services', 'pest-control', 'Pest control', 'Dezinsecție și deratizare', '🐜', false, '{}'::"VerificationType"[], 20),
('home-services', 'moving', 'Moving & transport', 'Mutări și transport', '🚚', false, '{}'::"VerificationType"[], 21),
('automotive', 'auto-electrics', 'Car electrics', 'Electrică auto', '🔋', false, '{}'::"VerificationType"[], 22),
('automotive', 'car-ac', 'Car air conditioning', 'Climatizare auto', '❄️', false, '{}'::"VerificationType"[], 23),
('automotive', 'windshield', 'Windshield repair', 'Parbrize', '🪟', false, '{}'::"VerificationType"[], 24),
('automotive', 'towing', 'Towing & roadside help', 'Tractări și asistență rutieră', '🛻', false, '{}'::"VerificationType"[], 25),
('automotive', 'car-inspection', 'Technical inspection (ITP)', 'Inspecție tehnică (ITP)', '📋', false, '{QUALIFICATION}'::"VerificationType"[], 26),
('automotive', 'pre-purchase-check', 'Pre-purchase car check', 'Verificare înainte de cumpărare', '🔎', false, '{}'::"VerificationType"[], 27),
('automotive', 'motorcycle-repair', 'Motorcycle repair', 'Service moto', '🏍️', false, '{}'::"VerificationType"[], 28),
('education', 'exam-prep', 'Exam preparation', 'Pregătire examene', '📝', true, '{}'::"VerificationType"[], 29),
('education', 'homework-help', 'Homework help', 'Ajutor la teme', '✏️', true, '{}'::"VerificationType"[], 30),
('education', 'coding-lessons', 'Coding lessons', 'Cursuri de programare', '💻', true, '{}'::"VerificationType"[], 31),
('education', 'art-lessons', 'Drawing & painting lessons', 'Lecții de desen și pictură', '🎨', true, '{}'::"VerificationType"[], 32),
('education', 'dance-lessons', 'Dance lessons', 'Lecții de dans', '💃', false, '{}'::"VerificationType"[], 33),
('education', 'driving-lessons', 'Driving lessons', 'Școală de șoferi', '🚘', false, '{QUALIFICATION}'::"VerificationType"[], 34),
('education', 'speech-therapy', 'Speech therapy', 'Logopedie', '🗨️', true, '{QUALIFICATION}'::"VerificationType"[], 35),
('technology', 'phone-repair', 'Phone & tablet repair', 'Reparații telefoane și tablete', '📱', false, '{}'::"VerificationType"[], 36),
('technology', 'web-design', 'Website design', 'Creare site-uri web', '🌐', true, '{}'::"VerificationType"[], 37),
('technology', 'smart-home', 'Smart home setup', 'Casă inteligentă', '🏡', false, '{}'::"VerificationType"[], 38),
('technology', 'cctv-alarms', 'CCTV & alarm systems', 'Camere video și alarme', '📹', false, '{}'::"VerificationType"[], 39),
('technology', 'tv-installation', 'TV & antenna installation', 'Montaj TV și antene', '📺', false, '{}'::"VerificationType"[], 40),
('technology', 'data-recovery', 'Data recovery', 'Recuperare date', '💾', true, '{}'::"VerificationType"[], 41),
('technology', 'cybersecurity', 'Cybersecurity', 'Securitate cibernetică', '🛡️', true, '{}'::"VerificationType"[], 42),
('business-services', 'legal-services', 'Legal services', 'Servicii juridice', '⚖️', true, '{QUALIFICATION}'::"VerificationType"[], 43),
('business-services', 'tax-consulting', 'Tax consulting', 'Consultanță fiscală', '💶', true, '{QUALIFICATION}'::"VerificationType"[], 44),
('business-services', 'translations', 'Translations', 'Traduceri', '🌍', true, '{}'::"VerificationType"[], 45),
('business-services', 'copywriting', 'Copywriting', 'Copywriting', '✍️', true, '{}'::"VerificationType"[], 46),
('business-services', 'social-media', 'Social media management', 'Administrare social media', '📲', true, '{}'::"VerificationType"[], 47),
('business-services', 'virtual-assistant', 'Virtual assistant', 'Asistent virtual', '🗓️', true, '{}'::"VerificationType"[], 48),
('business-services', 'hr-recruiting', 'HR & recruiting', 'Resurse umane și recrutare', '🤝', true, '{}'::"VerificationType"[], 49),
('personal-services', 'babysitting', 'Babysitting', 'Babysitting', '🧸', false, '{}'::"VerificationType"[], 50),
('personal-services', 'elderly-care', 'Elderly care', 'Îngrijire vârstnici', '🧓', false, '{}'::"VerificationType"[], 51),
('personal-services', 'pet-care', 'Pet sitting & dog walking', 'Îngrijire animale de companie', '🐕', false, '{}'::"VerificationType"[], 52),
('personal-services', 'hairdressing', 'Hairdressing at home', 'Coafor la domiciliu', '💈', false, '{}'::"VerificationType"[], 53),
('personal-services', 'makeup', 'Makeup', 'Machiaj', '💄', false, '{}'::"VerificationType"[], 54),
('personal-services', 'massage', 'Massage', 'Masaj', '💆', false, '{}'::"VerificationType"[], 55),
('personal-services', 'catering', 'Catering & personal chef', 'Catering și bucătar personal', '🍽️', false, '{}'::"VerificationType"[], 56),
('personal-services', 'dj-music', 'DJ & live music', 'DJ și muzică live', '🎧', false, '{}'::"VerificationType"[], 57),
('personal-services', 'videography', 'Videography', 'Filmare evenimente', '🎬', false, '{}'::"VerificationType"[], 58),
('personal-services', 'tailoring', 'Tailoring & alterations', 'Croitorie și retușuri', '🧵', false, '{}'::"VerificationType"[], 59);

INSERT INTO "ServiceCategory" (id, "parentId", slug, icon, "sortOrder", "isActive", "remoteAllowed", "requiredVerifications", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p.id, n.slug, n.icon, n.sort, true, n.remote, n.req, now(), now()
FROM new_services n JOIN "ServiceCategory" p ON p.slug = n.parent
ON CONFLICT (slug) DO NOTHING;

INSERT INTO "CategoryTranslation" (id, "categoryId", locale, name)
SELECT gen_random_uuid()::text, c.id, t.locale, t.name
FROM new_services n JOIN "ServiceCategory" c ON c.slug = n.slug
CROSS JOIN LATERAL (VALUES ('en', n.en), ('ro', n.ro)) AS t(locale, name)
ON CONFLICT ("categoryId", locale) DO NOTHING;

INSERT INTO "CategoryCountry" (id, "categoryId", "countryCode", "isActive", "requiredVerifications", "overrideRequirements")
SELECT gen_random_uuid()::text, c.id, 'RO', true, '{}', false
FROM new_services n JOIN "ServiceCategory" c ON c.slug = n.slug
WHERE EXISTS (SELECT 1 FROM "Country" WHERE code = 'RO')
ON CONFLICT ("categoryId", "countryCode") DO NOTHING;

DROP TABLE new_services;
