'use client';

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
          <a href="/" className="brand" aria-label="Centrum Service homepage">
            Centrum Service
          </a>

          <nav className="main-nav" aria-label="Main navigation">
            {links.map((link) => {
              const activePrefix = "activePrefix" in link ? link.activePrefix : link.href;
              const active = link.href === "/"
                  ? pathname === "/"
                  : pathname === link.href || pathname.startsWith(`${activePrefix}/`) || pathname === activePrefix;

              return (
                  <a
                      href={link.href}
                      key={link.href}
                      className={active ? "nav-link-active" : undefined}
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