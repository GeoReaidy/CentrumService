import Link from "next/link";

const exploreLinks = [
  { href: "/plans", label: "Plans" },
  { href: "/coverage", label: "Coverage" },
  { href: "/contact", label: "Contact" },
  { href: "/about", label: "About Centrum" },
];

const legalLinks = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/acceptable-use", label: "Acceptable Use" },
];

export function SiteFooter() {
  return (
    <footer className="site-footer" aria-label="Site footer">
      <div className="container footer-grid">
        <div className="footer-brand-block">
          <Link href="/" className="footer-brand">
            Centrum Service
          </Link>
          <p>Local internet service for homes and businesses across North Bekaa, Lebanon.</p>
          <div className="footer-contact-list" aria-label="Centrum Service contact details">
            <a href="tel:+96103822947">+961 03 822 947</a>
            <a href="mailto:tonyreaidy@live.com">tonyreaidy@live.com</a>
            <span>Monday–Saturday · 08:00–18:00</span>
          </div>
        </div>

        <nav className="footer-nav" aria-label="Explore Centrum Service">
          <h2>Explore</h2>
          {exploreLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>

        <nav className="footer-nav" aria-label="Legal information">
          <h2>Legal</h2>
          {legalLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="container footer-bottom">
        <p>© {new Date().getFullYear()} Centrum Service. All rights reserved.</p>
        <p>Serving North Bekaa, Lebanon.</p>
      </div>
    </footer>
  );
}
