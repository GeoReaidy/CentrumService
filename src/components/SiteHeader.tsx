'use client';

import Link from "next/link";
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

  return (
    <header className="site-header">
      <div className="container nav-wrap">
        <Link href="/" className="brand" aria-label="Centrum Service homepage">
          Centrum Service
        </Link>

        <nav className="main-nav" aria-label="Main navigation">
          {links.map((link) => {
            const activePrefix = "activePrefix" in link ? link.activePrefix : link.href;
            const active = link.href === "/"
              ? pathname === "/"
              : pathname === link.href || pathname.startsWith(`${activePrefix}/`) || pathname === activePrefix;

            return (
              <Link
                href={link.href}
                key={link.href}
                className={active ? "nav-link-active" : undefined}
                aria-current={active ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
