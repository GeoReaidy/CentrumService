"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  LANGUAGE_STORAGE_KEY,
  isLocale,
  localeDirection,
  type Locale,
} from "@/lib/i18n";
import { translateUiAttribute, translateUiText } from "@/lib/ui-translations";

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const FALLBACK_LANGUAGE_CONTEXT: LanguageContextValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => {
    // A no-op fallback keeps isolated UI such as an error boundary or portal
    // notification from crashing before the root provider has mounted.
  },
};

const LanguageContext = createContext<LanguageContextValue>(FALLBACK_LANGUAGE_CONTEXT);

const sourceText = new WeakMap<Text, string>();
const lastText = new WeakMap<Text, string>();
const sourceAttributes = new WeakMap<Element, Map<string, string>>();
const lastAttributes = new WeakMap<Element, Map<string, string>>();
const translatedAttributes = ["placeholder", "aria-label", "title"] as const;

function shouldSkip(node: Node) {
  const element = node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement;
  return Boolean(element?.closest("script, style, noscript, pre, code, [data-no-translate='true']"));
}

function translateTextNode(node: Text, locale: Locale) {
  if (shouldSkip(node)) return;
  const current = node.nodeValue ?? "";
  const previousRendered = lastText.get(node);
  let source = sourceText.get(node);

  if (!source || current !== previousRendered) {
    source = current;
    sourceText.set(node, source);
  }

  const translated = translateUiText(source, locale);
  if (current !== translated) node.nodeValue = translated;
  lastText.set(node, translated);
}

function translateAttributes(element: Element, locale: Locale) {
  if (shouldSkip(element)) return;
  let sources = sourceAttributes.get(element);
  let rendered = lastAttributes.get(element);
  if (!sources) {
    sources = new Map();
    sourceAttributes.set(element, sources);
  }
  if (!rendered) {
    rendered = new Map();
    lastAttributes.set(element, rendered);
  }

  for (const attribute of translatedAttributes) {
    if (!element.hasAttribute(attribute)) continue;
    const current = element.getAttribute(attribute) ?? "";
    const previousRendered = rendered.get(attribute);
    let source = sources.get(attribute);
    if (!source || current !== previousRendered) {
      source = current;
      sources.set(attribute, source);
    }
    const translated = translateUiAttribute(source, locale);
    if (current !== translated) element.setAttribute(attribute, translated);
    rendered.set(attribute, translated);
  }
}

function translateNode(node: Node, locale: Locale) {
  if (node.nodeType === Node.TEXT_NODE) {
    translateTextNode(node as Text, locale);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE || shouldSkip(node)) return;
  const element = node as Element;
  translateAttributes(element, locale);
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) translateTextNode(current as Text, locale);
    else translateAttributes(current as Element, locale);
    current = walker.nextNode();
  }
}

function preferredBrowserLocale(): Locale {
  const value = navigator.language.toLowerCase();
  if (value.startsWith("ar")) return "ar";
  if (value.startsWith("fr")) return "fr";
  return DEFAULT_LOCALE;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    setLocaleState(isLocale(saved) ? saved : preferredBrowserLocale());
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDirection(locale);
    document.documentElement.dataset.locale = locale;
    translateNode(document.body, locale);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          translateTextNode(mutation.target as Text, locale);
          continue;
        }
        if (mutation.type === "attributes" && mutation.target instanceof Element) {
          translateAttributes(mutation.target, locale);
          continue;
        }
        for (const added of mutation.addedNodes) translateNode(added, locale);
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...translatedAttributes],
    });

    return () => observer.disconnect();
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
