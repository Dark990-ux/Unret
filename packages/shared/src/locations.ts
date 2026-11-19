/**
 * Built-in city list used for location pickers until a geocoding provider is integrated.
 * Coordinates are city centres (WGS84).
 */
export interface City {
  name: string;
  countryCode: string;
  lat: number;
  lng: number;
}

export const CITIES: City[] = [
  { name: 'București', countryCode: 'RO', lat: 44.4268, lng: 26.1025 },
  { name: 'Cluj-Napoca', countryCode: 'RO', lat: 46.7712, lng: 23.6236 },
  { name: 'Timișoara', countryCode: 'RO', lat: 45.7489, lng: 21.2087 },
  { name: 'Iași', countryCode: 'RO', lat: 47.1585, lng: 27.6014 },
  { name: 'Constanța', countryCode: 'RO', lat: 44.1598, lng: 28.6348 },
  { name: 'Craiova', countryCode: 'RO', lat: 44.3302, lng: 23.7949 },
  { name: 'Brașov', countryCode: 'RO', lat: 45.6427, lng: 25.5887 },
  { name: 'Galați', countryCode: 'RO', lat: 45.4353, lng: 28.008 },
  { name: 'Ploiești', countryCode: 'RO', lat: 44.9367, lng: 26.0129 },
  { name: 'Oradea', countryCode: 'RO', lat: 47.0465, lng: 21.9189 },
  { name: 'Brăila', countryCode: 'RO', lat: 45.2692, lng: 27.9575 },
  { name: 'Arad', countryCode: 'RO', lat: 46.1866, lng: 21.3123 },
  { name: 'Pitești', countryCode: 'RO', lat: 44.8565, lng: 24.8692 },
  { name: 'Sibiu', countryCode: 'RO', lat: 45.7983, lng: 24.1256 },
  { name: 'Bacău', countryCode: 'RO', lat: 46.5672, lng: 26.9146 },
  { name: 'Târgu Mureș', countryCode: 'RO', lat: 46.5386, lng: 24.5575 },
  { name: 'Baia Mare', countryCode: 'RO', lat: 47.6567, lng: 23.585 },
  { name: 'Buzău', countryCode: 'RO', lat: 45.1517, lng: 26.8167 },
  { name: 'Botoșani', countryCode: 'RO', lat: 47.7487, lng: 26.6694 },
  { name: 'Satu Mare', countryCode: 'RO', lat: 47.79, lng: 22.89 },
  { name: 'Suceava', countryCode: 'RO', lat: 47.6514, lng: 26.2556 },
  { name: 'Voluntari', countryCode: 'RO', lat: 44.4925, lng: 26.1914 },
  { name: 'Otopeni', countryCode: 'RO', lat: 44.55, lng: 26.0667 },
  { name: 'Florești', countryCode: 'RO', lat: 46.7476, lng: 23.4906 },
];

export function citiesFor(countryCode: string): City[] {
  return CITIES.filter((c) => c.countryCode === countryCode);
}
