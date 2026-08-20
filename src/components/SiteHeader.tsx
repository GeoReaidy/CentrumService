'use client';

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/coverage", label: "Coverage" },
  { href: "/plans", label: "Plans" },
  { href: "/contact", label: "Contact" },
  { href: "/portal", label: "Portal", activePrefix: "/portal" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  return (
    <header className={`site-header${mobileMenuOpen ? " mobile-menu-open" : ""}`}>
      <div className="container nav-wrap">
        <a href="/" className="brand site-brand" aria-label="Centrum Service homepage">
          <img
            className="brand-logo-wide"
            src="/brand/centrum-logo-wide.png"
            alt="Centrum Service"
            width={1100}
            height={194}
          />

          <span className="mobile-brand-lockup" aria-hidden="true">
            <img
              className="mobile-brand-mark"
              src="/brand/centrum-mark-192.png"
              alt=""
              width={192}
              height={192}
            />
            <span className="mobile-brand-name">Centrum</span>
          </span>
        </a>

        <button
          type="button"
          className="mobile-nav-toggle"
          aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={mobileMenuOpen}
          aria-controls="main-navigation"
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav
          id="main-navigation"
          className={`main-nav${mobileMenuOpen ? " main-nav-open" : ""}`}
          aria-label="Main navigation"
        >
          {links.map((link) => {
            const activePrefix = "activePrefix" in link ? link.activePrefix : link.href;
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname === link.href ||
                  pathname.startsWith(`${activePrefix}/`) ||
                  pathname === activePrefix;

            return (
              <a
                href={link.href}
                key={link.href}
                className={active ? "nav-link-active" : undefined}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </a>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
