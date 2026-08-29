"use client";

import { localeLabels, type Locale } from "@/lib/i18n";
import { useLanguage } from "@/components/LanguageProvider";

const locales: Locale[] = ["en", "fr", "ar"];

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useLanguage();

  return (
    <div
      className={`language-selector${compact ? " language-selector-compact" : ""}`}
      role="group"
      aria-label="Language"
    >
      {locales.map((item) => (
        <button
          key={item}
          type="button"
          className={locale === item ? "is-active" : undefined}
          onClick={() => setLocale(item)}
          aria-pressed={locale === item}
          lang={item}
          dir={item === "ar" ? "rtl" : "ltr"}
        >
          {localeLabels[item]}
        </button>
      ))}
    </div>
  );
}
