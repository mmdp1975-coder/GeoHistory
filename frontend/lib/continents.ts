// frontend/lib/continents.ts
// Mappa minima ISO country → continent; estendila se serve
export const COUNTRY_TO_CONTINENT: Record<string, string> = {
  "Italy": "Europe",
  "France": "Europe",
  "Spain": "Europe",
  "Portugal": "Europe",
  "United States": "North America",
  "Canada": "North America",
  "Mexico": "North America",
  "Brazil": "South America",
  "Argentina": "South America",
  "Colombia": "South America",
  "Morocco": "Africa",
  "Egypt": "Africa",
  "South Africa": "Africa",
  "India": "Asia",
  "China": "Asia",
  "Japan": "Asia",
  "Australia": "Oceania",
  "New Zealand": "Oceania",
  "United Kingdom": "Europe",
  "Germany": "Europe",
  "Greece": "Europe",
  "Turkey": "Asia",
  "Saudi Arabia": "Asia",
  "Russia": "Europe",
};
export function countryToContinent(country?: string | null): string | null {
  if (!country) return null;
  return COUNTRY_TO_CONTINENT[country] ?? null;
}
