'use client';

import { useEffect, useId, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

type TurnstileWidgetProps = {
  onToken: (token: string) => void;
  resetKey?: number;
};

const SCRIPT_ID = "centrum-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function TurnstileWidget({ onToken, resetKey = 0 }: TurnstileWidgetProps) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const reactId = useId().replace(/:/g, "");
  const containerId = `centrum-turnstile-${reactId}`;
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    function renderWidget() {
      if (cancelled || !window.turnstile || widgetId.current) return;
      widgetId.current = window.turnstile.render(`#${containerId}`, {
        sitekey: siteKey,
        callback: (token: string) => onToken(token),
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
        theme: "auto",
      });
    }

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (window.turnstile) {
      renderWidget();
    } else if (existing) {
      existing.addEventListener("load", renderWidget, { once: true });
    } else {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.addEventListener("load", renderWidget, { once: true });
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [containerId, onToken, siteKey]);

  useEffect(() => {
    onToken("");
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
  }, [resetKey, onToken]);

  if (!siteKey) return null;
  return <div id={containerId} className="turnstile-widget" aria-label="Security verification" />;
}
