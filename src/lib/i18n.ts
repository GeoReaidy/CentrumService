export type Locale = "en" | "fr" | "ar";

export const DEFAULT_LOCALE: Locale = "en";
export const LANGUAGE_STORAGE_KEY = "centrum_language";

export const localeLabels: Record<Locale, string> = {
  en: "EN",
  fr: "FR",
  ar: "عربي",
};

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "fr" || value === "ar";
}

export function localeDirection(locale: Locale) {
  return locale === "ar" ? "rtl" : "ltr";
}

export function localizedField(
  row: Record<string, unknown> | null | undefined,
  baseField: string,
  locale: Locale,
): string {
  if (!row) return "";

  if (locale !== "en") {
    const translated = row[`${baseField}_${locale}`];
    if (typeof translated === "string" && translated.trim()) return translated.trim();
  }

  const english = row[baseField];
  return typeof english === "string" ? english.trim() : "";
}

export function localizedDateLocale(locale: Locale) {
  if (locale === "fr") return "fr-LB";
  if (locale === "ar") return "ar-LB";
  return "en-LB";
}
