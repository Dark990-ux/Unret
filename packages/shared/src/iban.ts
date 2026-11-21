/** IBAN validation (ISO 13616): country length + mod-97 checksum. */
const LENGTHS: Record<string, number> = {
  RO: 24, MD: 24, BG: 22, HU: 28, DE: 22, AT: 20, FR: 27, IT: 27, ES: 24, NL: 18, BE: 16, PL: 28, GB: 22, IE: 22, PT: 25, GR: 27, CZ: 24, SK: 24, SI: 19, HR: 21,
};

export function normalizeIban(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

export function formatIban(iban: string): string {
  return normalizeIban(iban).replace(/(.{4})/g, '$1 ').trim();
}

export type IbanCheck = { valid: true; iban: string; country: string; bankCode: string | null } | { valid: false; reason: string };

export function checkIban(input: string): IbanCheck {
  const iban = normalizeIban(input);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return { valid: false, reason: 'An IBAN starts with 2 letters and 2 digits, e.g. RO49 AAAA 1B31 0075 9384 0000' };
  const country = iban.slice(0, 2);
  const expected = LENGTHS[country];
  if (expected && iban.length !== expected) return { valid: false, reason: `An IBAN from ${country} has ${expected} characters (this one has ${iban.length})` };
  if (iban.length < 15 || iban.length > 34) return { valid: false, reason: 'This IBAN has the wrong length' };
  if (country === 'RO' && !/^RO\d{2}[A-Z]{4}[A-Z0-9]{16}$/.test(iban)) return { valid: false, reason: 'A Romanian IBAN looks like RO49 AAAA 1B31 0075 9384 0000' };
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const v = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) remainder = (remainder * 10 + Number(d)) % 97;
  }
  if (remainder !== 1) return { valid: false, reason: 'This IBAN is not valid. Please check it for typos.' };
  return { valid: true, iban, country, bankCode: country === 'RO' ? iban.slice(4, 8) : null };
}

/** "RO49 •••• •••• •••• •••• 0000" */
export function maskIban(countryCode: string, last4: string): string {
  return `${countryCode}•• •••• •••• •••• ${last4}`;
}
