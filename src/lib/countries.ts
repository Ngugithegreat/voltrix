// Country selection at signup drives which deposit rails a user sees.
// KE -> M-Pesa + Crypto + Card; UG -> MTN + Airtel + Crypto + Card;
// everyone else -> Card + Crypto.

export type Country = { code: string; name: string; flag: string; dial: string };

export const COUNTRIES: Country[] = [
  { code: "KE", name: "Kenya", flag: "🇰🇪", dial: "254" },
  { code: "UG", name: "Uganda", flag: "🇺🇬", dial: "256" },
  { code: "TZ", name: "Tanzania", flag: "🇹🇿", dial: "255" },
  { code: "NG", name: "Nigeria", flag: "🇳🇬", dial: "234" },
  { code: "GH", name: "Ghana", flag: "🇬🇭", dial: "233" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦", dial: "27" },
  { code: "RW", name: "Rwanda", flag: "🇷🇼", dial: "250" },
  { code: "ZM", name: "Zambia", flag: "🇿🇲", dial: "260" },
  { code: "CM", name: "Cameroon", flag: "🇨🇲", dial: "237" },
  { code: "CI", name: "Côte d’Ivoire", flag: "🇨🇮", dial: "225" },
  { code: "SN", name: "Senegal", flag: "🇸🇳", dial: "221" },
  { code: "ET", name: "Ethiopia", flag: "🇪🇹", dial: "251" },
  { code: "EG", name: "Egypt", flag: "🇪🇬", dial: "20" },
  { code: "MA", name: "Morocco", flag: "🇲🇦", dial: "212" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", dial: "44" },
  { code: "US", name: "United States", flag: "🇺🇸", dial: "1" },
  { code: "CA", name: "Canada", flag: "🇨🇦", dial: "1" },
  { code: "IN", name: "India", flag: "🇮🇳", dial: "91" },
  { code: "PK", name: "Pakistan", flag: "🇵🇰", dial: "92" },
  { code: "PH", name: "Philippines", flag: "🇵🇭", dial: "63" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩", dial: "62" },
  { code: "BR", name: "Brazil", flag: "🇧🇷", dial: "55" },
  { code: "DE", name: "Germany", flag: "🇩🇪", dial: "49" },
  { code: "FR", name: "France", flag: "🇫🇷", dial: "33" },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪", dial: "971" },
  { code: "OTHER", name: "Other country", flag: "🌍", dial: "" },
];

export function countryByCode(code: string | null | undefined): Country | undefined {
  if (!code) return undefined;
  return COUNTRIES.find((c) => c.code === code);
}

export type Rail = "mpesa" | "mtn" | "airtel" | "card" | "crypto";

/** Deposit rails available to a user in a given country. */
export function railsForCountry(code: string | null | undefined): Rail[] {
  // Card removed — the Paystack card/bank rail isn't operational. M-Pesa / mobile
  // money and crypto are the live rails.
  if (code === "KE") return ["mpesa", "crypto"];
  if (code === "UG") return ["mtn", "airtel", "crypto"];
  return ["crypto"];
}

export function dialFor(code: string | null | undefined): string {
  return countryByCode(code)?.dial || "";
}
