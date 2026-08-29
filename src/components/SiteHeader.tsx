'use client';

import { usePathname } from "next/navigation";
import styles from "./SiteHeader.module.css";
import { LanguageSelector } from "@/components/LanguageSelector";

const links = [
  { href: "/", label: "Home" },
  { href: "/coverage", label: "Coverage" },
  { href: "/plans", label: "Plans" },
  { href: "/contact", label: "Contact" },
  { href: "/portal", label: "Portal", activePrefix: "/portal" },
];

export function SiteHeader() {
  const pathname = usePathname();

  const renderLinks = () =>
    links.map((link) => {
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
          aria-current={active ? "page" : undefined}
        >
          {link.label}
        </a>
      );
    });

  return (
    <header className="site-header">
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

        <nav
          className={`main-nav ${styles.desktopNav}`}
          aria-label="Main navigation"
        >
          {renderLinks()}
          <LanguageSelector compact />
        </nav>

        <details className={styles.mobileNav}>
          <summary
            className={styles.mobileNavToggle}
            aria-label="Open navigation menu"
          >
            <span />
            <span />
            <span />
          </summary>

          <nav className={styles.mobileNavPanel} aria-label="Mobile navigation">
            {renderLinks()}
            <LanguageSelector />
          </nav>
        </details>
      </div>
    </header>
  );
}
