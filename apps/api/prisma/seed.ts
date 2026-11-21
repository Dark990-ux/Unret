/* eslint-disable no-console */
import { PrismaClient, VerificationType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

type Cat = { slug: string; en: string; ro: string; icon?: string; remote?: boolean; req?: VerificationType[]; children?: Cat[] };

/** PRD §5 category hierarchy. Required verifications reflect regulated trades in Romania (e.g. ANRE for electricians). */
const CATEGORIES: Cat[] = [
  { slug: 'home-services', en: 'Home Services', ro: 'Servicii pentru casă', icon: '🏠', children: [
    { slug: 'electrical', en: 'Electrical services', ro: 'Servicii electrice', icon: '⚡', req: ['QUALIFICATION'] },
    { slug: 'plumbing', en: 'Plumbing', ro: 'Instalații sanitare', icon: '🚰' },
    { slug: 'heating-cooling', en: 'Heating and cooling', ro: 'Încălzire și climatizare', icon: '🌡️', req: ['QUALIFICATION'] },
    { slug: 'painting', en: 'Painting', ro: 'Zugrăveli', icon: '🎨' },
    { slug: 'carpentry', en: 'Carpentry', ro: 'Tâmplărie', icon: '🪚' },
    { slug: 'cleaning', en: 'Cleaning', ro: 'Curățenie', icon: '🧽' },
    { slug: 'gardening', en: 'Gardening', ro: 'Grădinărit', icon: '🌿' },
    { slug: 'renovations', en: 'Renovations', ro: 'Renovări', icon: '🧱' },
    { slug: 'locksmith', en: 'Locksmith', ro: 'Lăcătușerie', icon: '🔑' },
    { slug: 'handyman', en: 'Handyman & small repairs', ro: 'Mici reparații', icon: '🧰' },
    { slug: 'furniture-assembly', en: 'Furniture assembly', ro: 'Montaj mobilă', icon: '🪑' },
    { slug: 'tiling', en: 'Tiling', ro: 'Faianță și gresie', icon: '🔲' },
    { slug: 'flooring', en: 'Flooring & parquet', ro: 'Parchet și pardoseli', icon: '🪵' },
    { slug: 'drywall', en: 'Drywall & plastering', ro: 'Rigips și tencuieli', icon: '🧱' },
    { slug: 'roofing', en: 'Roofing', ro: 'Acoperișuri', icon: '🏠' },
    { slug: 'windows-doors', en: 'Windows & doors', ro: 'Montaj ferestre și uși', icon: '🚪' },
    { slug: 'gas-installations', en: 'Gas installations', ro: 'Instalații de gaze', icon: '🔥', req: ['QUALIFICATION'] },
    { slug: 'appliance-repair', en: 'Appliance repair', ro: 'Reparații electrocasnice', icon: '🧺' },
    { slug: 'pest-control', en: 'Pest control', ro: 'Dezinsecție și deratizare', icon: '🐜' },
    { slug: 'moving', en: 'Moving & transport', ro: 'Mutări și transport', icon: '🚚' },
  ] },
  { slug: 'automotive', en: 'Automotive', ro: 'Auto', icon: '🚗', children: [
    { slug: 'mechanical-repairs', en: 'Mechanical repairs', ro: 'Reparații mecanice', icon: '🔧' },
    { slug: 'diagnostics', en: 'Diagnostics', ro: 'Diagnoză', icon: '🩺' },
    { slug: 'bodywork', en: 'Bodywork', ro: 'Tinichigerie', icon: '🛠️' },
    { slug: 'vehicle-detailing', en: 'Vehicle detailing', ro: 'Detailing auto', icon: '✨' },
    { slug: 'tire-services', en: 'Tire services', ro: 'Vulcanizare', icon: '🛞' },
    { slug: 'auto-electrics', en: 'Car electrics', ro: 'Electrică auto', icon: '🔋' },
    { slug: 'car-ac', en: 'Car air conditioning', ro: 'Climatizare auto', icon: '❄️' },
    { slug: 'windshield', en: 'Windshield repair', ro: 'Parbrize', icon: '🪟' },
    { slug: 'towing', en: 'Towing & roadside help', ro: 'Tractări și asistență rutieră', icon: '🛻' },
    { slug: 'car-inspection', en: 'Technical inspection (ITP)', ro: 'Inspecție tehnică (ITP)', icon: '📋', req: ['QUALIFICATION'] },
    { slug: 'pre-purchase-check', en: 'Pre-purchase car check', ro: 'Verificare înainte de cumpărare', icon: '🔎' },
    { slug: 'motorcycle-repair', en: 'Motorcycle repair', ro: 'Service moto', icon: '🏍️' },
  ] },
  { slug: 'education', en: 'Education', ro: 'Educație', icon: '🎓', remote: true, children: [
    { slug: 'private-tutoring', en: 'Private tutoring', ro: 'Meditații', icon: '📚', remote: true },
    { slug: 'languages', en: 'Languages', ro: 'Limbi străine', icon: '🗣️', remote: true },
    { slug: 'music-lessons', en: 'Music lessons', ro: 'Lecții de muzică', icon: '🎹', remote: true },
    { slug: 'professional-training', en: 'Professional training', ro: 'Training profesional', icon: '📈', remote: true },
    { slug: 'exam-prep', en: 'Exam preparation', ro: 'Pregătire examene', icon: '📝', remote: true },
    { slug: 'homework-help', en: 'Homework help', ro: 'Ajutor la teme', icon: '✏️', remote: true },
    { slug: 'coding-lessons', en: 'Coding lessons', ro: 'Cursuri de programare', icon: '💻', remote: true },
    { slug: 'art-lessons', en: 'Drawing & painting lessons', ro: 'Lecții de desen și pictură', icon: '🎨', remote: true },
    { slug: 'dance-lessons', en: 'Dance lessons', ro: 'Lecții de dans', icon: '💃' },
    { slug: 'driving-lessons', en: 'Driving lessons', ro: 'Școală de șoferi', icon: '🚘', req: ['QUALIFICATION'] },
    { slug: 'speech-therapy', en: 'Speech therapy', ro: 'Logopedie', icon: '🗨️', remote: true, req: ['QUALIFICATION'] },
  ] },
  { slug: 'technology', en: 'Technology', ro: 'Tehnologie', icon: '💻', remote: true, children: [
    { slug: 'computer-repair', en: 'Computer repair', ro: 'Reparații calculatoare', icon: '🖥️' },
    { slug: 'software-development', en: 'Software development', ro: 'Dezvoltare software', icon: '👩‍💻', remote: true },
    { slug: 'it-support', en: 'IT support', ro: 'Suport IT', icon: '🛟', remote: true },
    { slug: 'network-installation', en: 'Network installation', ro: 'Instalare rețele', icon: '📡' },
    { slug: 'phone-repair', en: 'Phone & tablet repair', ro: 'Reparații telefoane și tablete', icon: '📱' },
    { slug: 'web-design', en: 'Website design', ro: 'Creare site-uri web', icon: '🌐', remote: true },
    { slug: 'smart-home', en: 'Smart home setup', ro: 'Casă inteligentă', icon: '🏡' },
    { slug: 'cctv-alarms', en: 'CCTV & alarm systems', ro: 'Camere video și alarme', icon: '📹' },
    { slug: 'tv-installation', en: 'TV & antenna installation', ro: 'Montaj TV și antene', icon: '📺' },
    { slug: 'data-recovery', en: 'Data recovery', ro: 'Recuperare date', icon: '💾', remote: true },
    { slug: 'cybersecurity', en: 'Cybersecurity', ro: 'Securitate cibernetică', icon: '🛡️', remote: true },
  ] },
  { slug: 'business-services', en: 'Business Services', ro: 'Servicii pentru afaceri', icon: '💼', remote: true, children: [
    { slug: 'accounting', en: 'Accounting', ro: 'Contabilitate', icon: '🧾', remote: true, req: ['QUALIFICATION'] },
    { slug: 'consulting', en: 'Consulting', ro: 'Consultanță', icon: '🧭', remote: true },
    { slug: 'marketing', en: 'Marketing', ro: 'Marketing', icon: '📣', remote: true },
    { slug: 'graphic-design', en: 'Graphic design', ro: 'Design grafic', icon: '🖌️', remote: true },
    { slug: 'administrative-services', en: 'Administrative services', ro: 'Servicii administrative', icon: '🗂️', remote: true },
    { slug: 'legal-services', en: 'Legal services', ro: 'Servicii juridice', icon: '⚖️', remote: true, req: ['QUALIFICATION'] },
    { slug: 'tax-consulting', en: 'Tax consulting', ro: 'Consultanță fiscală', icon: '💶', remote: true, req: ['QUALIFICATION'] },
    { slug: 'translations', en: 'Translations', ro: 'Traduceri', icon: '🌍', remote: true },
    { slug: 'copywriting', en: 'Copywriting', ro: 'Copywriting', icon: '✍️', remote: true },
    { slug: 'social-media', en: 'Social media management', ro: 'Administrare social media', icon: '📲', remote: true },
    { slug: 'virtual-assistant', en: 'Virtual assistant', ro: 'Asistent virtual', icon: '🗓️', remote: true },
    { slug: 'hr-recruiting', en: 'HR & recruiting', ro: 'Resurse umane și recrutare', icon: '🤝', remote: true },
  ] },
  { slug: 'personal-services', en: 'Personal Services', ro: 'Servicii personale', icon: '🙋', children: [
    { slug: 'photography', en: 'Photography', ro: 'Fotografie', icon: '📷' },
    { slug: 'fitness-coaching', en: 'Fitness coaching', ro: 'Antrenament fitness', icon: '🏋️', remote: true },
    { slug: 'beauty-services', en: 'Beauty services', ro: 'Servicii de înfrumusețare', icon: '💇' },
    { slug: 'event-services', en: 'Event services', ro: 'Organizare evenimente', icon: '🎉' },
    { slug: 'babysitting', en: 'Babysitting', ro: 'Babysitting', icon: '🧸' },
    { slug: 'elderly-care', en: 'Elderly care', ro: 'Îngrijire vârstnici', icon: '🧓' },
    { slug: 'pet-care', en: 'Pet sitting & dog walking', ro: 'Îngrijire animale de companie', icon: '🐕' },
    { slug: 'hairdressing', en: 'Hairdressing at home', ro: 'Coafor la domiciliu', icon: '💈' },
    { slug: 'makeup', en: 'Makeup', ro: 'Machiaj', icon: '💄' },
    { slug: 'massage', en: 'Massage', ro: 'Masaj', icon: '💆' },
    { slug: 'catering', en: 'Catering & personal chef', ro: 'Catering și bucătar personal', icon: '🍽️' },
    { slug: 'dj-music', en: 'DJ & live music', ro: 'DJ și muzică live', icon: '🎧' },
    { slug: 'videography', en: 'Videography', ro: 'Filmare evenimente', icon: '🎬' },
    { slug: 'tailoring', en: 'Tailoring & alterations', ro: 'Croitorie și retușuri', icon: '🧵' },
  ] },
  // Professionals describe services that aren't listed yet; admins can later promote frequent ones to real categories.
  { slug: 'other-services', en: 'Other', ro: 'Altele', icon: '✨', remote: true, children: [
    { slug: 'other', en: 'Something else', ro: 'Altceva', icon: '✨', remote: true },
  ] },
];

async function upsertCategory(c: Cat, parentId: string | null, order: number): Promise<void> {
  const cat = await prisma.serviceCategory.upsert({
    where: { slug: c.slug },
    create: { slug: c.slug, parentId, icon: c.icon, sortOrder: order, remoteAllowed: !!c.remote, requiredVerifications: c.req ?? [] },
    update: { parentId, icon: c.icon, sortOrder: order, remoteAllowed: !!c.remote, requiredVerifications: c.req ?? [] },
  });
  for (const [locale, name] of [['en', c.en], ['ro', c.ro]] as const)
    await prisma.categoryTranslation.upsert({
      where: { categoryId_locale: { categoryId: cat.id, locale } },
      create: { categoryId: cat.id, locale, name },
      update: { name },
    });
  await prisma.categoryCountry.upsert({
    where: { categoryId_countryCode: { categoryId: cat.id, countryCode: 'RO' } },
    create: { categoryId: cat.id, countryCode: 'RO', isActive: true, requiredVerifications: [] },
    update: {},
  });
  for (const [i, child] of (c.children ?? []).entries()) await upsertCategory(child, cat.id, i);
}

const PASSWORD = 'Unret-demo-2026!';

async function user(email: string, name: string, extra: Partial<{ role: 'ADMIN' | 'USER'; city: string }> = {}) {
  return prisma.user.upsert({
    where: { email },
    create: { email, name, passwordHash: await bcrypt.hash(PASSWORD, 12), countryCode: 'RO', preferredLanguage: 'ro', termsAcceptedAt: new Date(), role: extra.role ?? 'USER', city: extra.city },
    update: {},
  });
}

async function catId(slug: string) {
  return (await prisma.serviceCategory.findUniqueOrThrow({ where: { slug } })).id;
}

const weekdays = (start = '08:00', end = '18:00') => [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: start, endTime: end }));

async function pro(opts: {
  email: string; name: string; business?: string; headline: string; bio: string; city: string; lat: number; lng: number;
  radius: number; services: { slug: string; price?: number; pricing: 'FIXED' | 'HOURLY' | 'ESTIMATE' | 'ON_REQUEST'; desc: string }[];
  years: number; remote?: boolean; verified?: VerificationType[]; qualifiedFor?: string[];
  hours?: { weekday: number; startTime: string; endTime: string }[]; emergency?: boolean;
}) {
  const u = await user(opts.email, opts.name, { city: opts.city });
  const existing = await prisma.professionalProfile.findUnique({ where: { userId: u.id } });
  if (existing) return existing;
  const p = await prisma.professionalProfile.create({
    data: {
      userId: u.id, businessName: opts.business, headline: opts.headline, biography: opts.bio, city: opts.city, countryCode: 'RO',
      baseLat: opts.lat, baseLng: opts.lng, serviceRadiusKm: opts.radius, experienceYears: opts.years, languages: ['ro', 'en'],
      remoteAvailable: !!opts.remote, emergencyAvailable: !!opts.emergency, visibility: 'PUBLIC',
      // Reputation counters are never invented: they are derived from real jobs and reviews.
      availabilityRules: { create: opts.hours ?? weekdays() },
    },
  });
  for (const [i, s] of opts.services.entries())
    await prisma.professionalService.create({
      data: { professionalId: p.id, categoryId: await catId(s.slug), pricingType: s.pricing, indicativePriceMinor: s.price ? s.price * 100 : null, currency: 'RON', description: s.desc, isPrimary: i === 0 },
    });
  for (const type of opts.verified ?? [])
    await prisma.verification.create({ data: { professionalId: p.id, type, documentKey: `verification/${u.id}/seed.pdf`, documentName: 'seed.pdf', status: 'APPROVED', reviewedAt: new Date() } });
  for (const slug of opts.qualifiedFor ?? [])
    await prisma.verification.create({ data: { professionalId: p.id, type: 'QUALIFICATION', categoryId: await catId(slug), documentKey: `verification/${u.id}/seed-q.pdf`, documentName: 'seed-q.pdf', status: 'APPROVED', reviewedAt: new Date() } });
  return p;
}

async function main() {
  console.log('Seeding countries…');
  await prisma.country.upsert({
    where: { code: 'RO' },
    create: { code: 'RO', name: 'România', currency: 'RON', defaultLanguage: 'ro', defaultTimezone: 'Europe/Bucharest', phonePrefix: '+40', isActive: true, platformFeeBps: 1000 },
    update: {},
  });
  // Prepared for international expansion; inactive until launch.
  for (const c of [
    { code: 'MD', name: 'Moldova', currency: 'MDL', defaultLanguage: 'ro', defaultTimezone: 'Europe/Chisinau', phonePrefix: '+373' },
    { code: 'BG', name: 'България', currency: 'EUR', defaultLanguage: 'bg', defaultTimezone: 'Europe/Sofia', phonePrefix: '+359' },
    { code: 'HU', name: 'Magyarország', currency: 'HUF', defaultLanguage: 'hu', defaultTimezone: 'Europe/Budapest', phonePrefix: '+36' },
  ])
    await prisma.country.upsert({ where: { code: c.code }, create: { ...c, isActive: false }, update: {} });

  console.log('Seeding categories…');
  for (const [i, c] of CATEGORIES.entries()) await upsertCategory(c, null, i);

  console.log('Seeding subscription plans…');
  for (const plan of [
    { code: 'basic', name: 'Basic', priceMinor: 0, features: { teamSeats: 1, analytics: false } },
    { code: 'pro', name: 'Pro', priceMinor: 4900, features: { teamSeats: 1, analytics: true, portfolioItems: 50 } },
    { code: 'business', name: 'Business', priceMinor: 14900, features: { teamSeats: 10, analytics: true, sharedCalendar: true } },
  ])
    await prisma.subscriptionPlan.upsert({ where: { code_countryCode: { code: plan.code, countryCode: 'RO' } }, create: { ...plan, countryCode: 'RO', currency: 'RON' }, update: {} });

  console.log('Seeding users…');
  await user('admin@unret.ro', 'UNRET Admin', { role: 'ADMIN' });
  const ana = await user('ana.popescu@example.com', 'Ana Popescu', { city: 'București' });
  await user('mihai.ionescu@example.com', 'Mihai Ionescu', { city: 'Cluj-Napoca' });

  const ion = await pro({
    email: 'ion.electric@example.com', name: 'Ion Dumitrescu', business: 'Electric Dumitrescu', city: 'București', lat: 44.4378, lng: 26.0946, radius: 30,
    headline: 'Electrician autorizat ANRE · intervenții rapide', years: 14, emergency: true,
    bio: 'Electrician autorizat ANRE gradul II B cu 14 ani de experiență. Instalații electrice complete pentru apartamente și case, tablouri electrice, prize, iluminat, depanări urgente.',
    services: [{ slug: 'electrical', pricing: 'HOURLY', price: 150, desc: 'Instalații, depanări, tablouri electrice' }],
    verified: ['IDENTITY'], qualifiedFor: ['electrical'],
    hours: [...weekdays('08:00', '19:00'), { weekday: 6, startTime: '09:00', endTime: '14:00' }],
  });
  await pro({
    email: 'apa.instal@example.com', name: 'Radu Stan', business: 'AquaFix Instalații', city: 'București', lat: 44.4268, lng: 26.1525, radius: 25,
    headline: 'Instalator sanitar — țevi, centrale, obiecte sanitare', years: 9,
    bio: 'Montaj și reparații instalații sanitare: înlocuire țevi, montaj baterii, wc, cabine de duș, desfundări. Lucrăm curat și cu garanție.',
    services: [{ slug: 'plumbing', pricing: 'ESTIMATE', price: 200, desc: 'Reparații și montaj instalații sanitare' }],
    verified: ['IDENTITY', 'BUSINESS'],
  });
  await pro({
    email: 'curat.casa@example.com', name: 'Elena Marin', business: 'Casa Curată', city: 'București', lat: 44.4500, lng: 26.0800, radius: 20,
    headline: 'Curățenie generală și după constructor', years: 6,
    bio: 'Echipă de curățenie profesională pentru apartamente, case și birouri. Folosim produse ecologice. Curățenie generală, după renovare, spălat geamuri.',
    services: [{ slug: 'cleaning', pricing: 'FIXED', price: 350, desc: 'Curățenie generală apartament 2 camere' }],
    verified: ['IDENTITY'],
    hours: [...weekdays('07:00', '20:00'), { weekday: 6, startTime: '08:00', endTime: '16:00' }],
  });
  await pro({
    email: 'zugrav@example.com', name: 'Vasile Georgescu', city: 'București', lat: 44.4100, lng: 26.1000, radius: 35,
    headline: 'Zugrav — vopsitorii, glet, tapet', years: 20,
    bio: 'Zugrăveli interioare și exterioare, glet, șlefuire, montaj tapet și rigips. Peste 20 de ani de experiență și atenție la detalii.',
    services: [{ slug: 'painting', pricing: 'ESTIMATE', price: 25, desc: 'Preț orientativ pe mp, cu materiale separat' }, { slug: 'renovations', pricing: 'ON_REQUEST', desc: 'Renovări complete' }],
  });
  await pro({
    email: 'tutor.mate@example.com', name: 'Andreea Vlad', city: 'Cluj-Napoca', lat: 46.7712, lng: 23.6236, radius: 15, remote: true,
    headline: 'Profesor de matematică · pregătire BAC și admitere', years: 8,
    bio: 'Profesoară de matematică, pregătire pentru Evaluarea Națională, Bacalaureat și admitere la facultate. Lecții online sau la domiciliu în Cluj.',
    services: [{ slug: 'private-tutoring', pricing: 'HOURLY', price: 120, desc: 'Lecție de 60 de minute' }, { slug: 'languages', pricing: 'HOURLY', price: 100, desc: 'Engleză nivel începător-intermediar' }],
    verified: ['IDENTITY'], qualifiedFor: ['private-tutoring'],
    hours: [...weekdays('14:00', '21:00'), { weekday: 6, startTime: '10:00', endTime: '16:00' }],
  });
  await pro({
    email: 'it.help@example.com', name: 'Cristian Pop', business: 'ByteCare', city: 'Cluj-Napoca', lat: 46.7600, lng: 23.5800, radius: 20, remote: true,
    headline: 'Reparații PC/laptop, rețele și suport IT pentru firme mici', years: 11,
    bio: 'Service calculatoare și laptopuri, recuperare date, instalare rețele WiFi, suport IT lunar pentru birouri. Intervenții la domiciliu sau remote.',
    services: [
      { slug: 'computer-repair', pricing: 'FIXED', price: 150, desc: 'Diagnoză și curățare laptop' },
      { slug: 'it-support', pricing: 'HOURLY', price: 180, desc: 'Suport IT remote sau on-site' },
      { slug: 'network-installation', pricing: 'ON_REQUEST', desc: 'Rețele pentru case și birouri' },
    ],
    verified: ['IDENTITY', 'BUSINESS'],
  });
  await pro({
    email: 'auto.service@example.com', name: 'Florin Neagu', business: 'Neagu Auto', city: 'București', lat: 44.4800, lng: 26.0500, radius: 15,
    headline: 'Service auto: mecanică, diagnoză, vulcanizare', years: 17,
    bio: 'Service auto complet: revizii, distribuție, frâne, suspensie, diagnoză computerizată și vulcanizare. Piese originale sau aftermarket, la alegere.',
    services: [
      { slug: 'mechanical-repairs', pricing: 'ESTIMATE', desc: 'Reparații mecanice' },
      { slug: 'diagnostics', pricing: 'FIXED', price: 120, desc: 'Diagnoză computerizată' },
      { slug: 'tire-services', pricing: 'FIXED', price: 160, desc: 'Schimb anvelope set 4 roți' },
    ],
    verified: ['IDENTITY', 'BUSINESS'],
  });
  await pro({
    email: 'foto@example.com', name: 'Ioana Rusu', city: 'București', lat: 44.4400, lng: 26.1100, radius: 50,
    headline: 'Fotograf evenimente și portrete', years: 7,
    bio: 'Fotografie de nuntă, botez, evenimente corporate și ședințe foto de portret. Livrare rapidă a fotografiilor editate în galerie online.',
    services: [{ slug: 'photography', pricing: 'FIXED', price: 1500, desc: 'Eveniment până la 4 ore, 200+ fotografii editate' }, { slug: 'event-services', pricing: 'ON_REQUEST', desc: 'Coordonare evenimente mici' }],
    verified: ['IDENTITY'],
    hours: [{ weekday: 0, startTime: '10:00', endTime: '20:00' }, ...weekdays('10:00', '18:00'), { weekday: 6, startTime: '10:00', endTime: '22:00' }],
  });

  // A completed job with a verified review, so profiles show real data.
  const existingJob = await prisma.job.findFirst({ where: { customerId: ana.id } });
  if (!existingJob) {
    console.log('Seeding a completed demo job…');
    const req = await prisma.serviceRequest.create({
      data: {
        customerId: ana.id, categoryId: await catId('electrical'), title: 'Înlocuire tablou electric apartament',
        description: 'Tabloul electric este vechi, cu siguranțe fuzibile. Doresc înlocuirea cu un tablou nou cu siguranțe automate și diferențial.',
        serviceMode: 'ON_SITE', city: 'București', addressText: 'Str. Exemplu 10, Sector 2', lat: 44.4400, lng: 26.1200,
        countryCode: 'RO', currency: 'RON', status: 'OFFER_ACCEPTED', publishedAt: new Date(Date.now() - 20 * 864e5), matchWave: 1,
      },
    });
    await prisma.requestMatch.create({ data: { requestId: req.id, professionalId: ion.id, included: true, score: 0.91, breakdown: {}, wave: 1, notifiedAt: new Date(Date.now() - 20 * 864e5) } });
    const offer = await prisma.offer.create({
      data: {
        requestId: req.id, professionalId: ion.id, status: 'ACCEPTED', expiresAt: new Date(Date.now() - 10 * 864e5), createdAt: new Date(Date.now() - 20 * 864e5 + 3600e3),
        revisions: { create: { revision: 1, priceMinor: 120000, currency: 'RON', priceType: 'FIXED', description: 'Tablou 12 module, siguranțe automate, diferențial 30mA, manoperă inclusă.', materialsIncluded: true, createdById: ion.userId } },
      },
      include: { revisions: true },
    });
    const job = await prisma.job.create({
      data: {
        requestId: req.id, offerId: offer.id, acceptedRevisionId: offer.revisions[0].id, customerId: ana.id, professionalId: ion.id,
        agreedPriceMinor: 120000, currency: 'RON', priceType: 'FIXED', scope: offer.revisions[0].description, status: 'COMPLETED',
        customerConfirmedAt: new Date(Date.now() - 15 * 864e5), professionalConfirmedAt: new Date(Date.now() - 15 * 864e5), completedAt: new Date(Date.now() - 15 * 864e5),
      },
    });
    await prisma.jobEvent.createMany({ data: [
      { jobId: job.id, type: 'CREATED', toStatus: 'ACCEPTED', actorId: ana.id },
      { jobId: job.id, type: 'STATUS_CHANGE', fromStatus: 'ACCEPTED', toStatus: 'IN_PROGRESS', actorId: ion.userId },
      { jobId: job.id, type: 'STATUS_CHANGE', fromStatus: 'IN_PROGRESS', toStatus: 'COMPLETED', actorId: ana.id },
    ] });
    await prisma.payment.create({ data: { jobId: job.id, method: 'DIRECT', grossMinor: 120000, payoutMinor: 120000, currency: 'RON', status: 'RECORDED', paymentMethodNote: 'bank_transfer' } });
    await prisma.review.create({
      data: { jobId: job.id, customerId: ana.id, professionalId: ion.id, overall: 5, communication: 5, quality: 5, punctuality: 4, text: 'Foarte profesionist, a lucrat curat și a explicat tot. Recomand!' },
    });
    const conv = await prisma.conversation.create({ data: { requestId: req.id, jobId: job.id, customerId: ana.id, professionalId: ion.id } });
    await prisma.message.createMany({ data: [
      { conversationId: conv.id, kind: 'SYSTEM', body: 'Offer sent: 1.200,00 RON (fixed price)' },
      { conversationId: conv.id, senderId: ion.userId, body: 'Bună ziua! Pot veni joi dimineață să înlocuiesc tabloul.' },
      { conversationId: conv.id, senderId: ana.id, body: 'Perfect, vă aștept joi la 9.' },
    ] });
  }

  console.log(`\n✔ Seed complete. Demo password for all accounts: ${PASSWORD}`);
  console.log('  Admin:        admin@unret.ro');
  console.log('  Customer:     ana.popescu@example.com');
  console.log('  Professional: ion.electric@example.com');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
