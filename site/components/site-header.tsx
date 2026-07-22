import Link from 'next/link';

const navItems = [
  { href: '/docs', label: 'Docs' },
  { href: '/docs/tutorial', label: 'Tutorial' },
  { href: '/docs/how-to', label: 'How-to' },
  { href: '/docs/reference', label: 'API' },
  { href: '/docs/explanation', label: 'Explanation' },
] as const;

export function SiteHeader() {
  return (
    <header className="topbar">
      <Link className="brand" href="/" aria-label="Drift home">
        <span className="brand-mark" aria-hidden="true">
          <img src="/drift-mark.svg" alt="" width={60} height={60} />
        </span>
        <span className="brand-copy">
          <span className="brand-name">Drift</span>
          <span className="brand-tag">Connected data, kept portable</span>
        </span>
      </Link>

      <div className="topbar-actions">
        <nav className="topnav" aria-label="Primary">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <a
          className="repo-link"
          href="https://github.com/Grey-Harbor/drift"
          aria-label="Drift on GitHub"
          target="_blank"
          rel="noreferrer"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 2a10 10 0 0 0-3.16 19.48c.5.09.68-.22.68-.48v-1.67c-2.78.61-3.37-1.17-3.37-1.17-.46-1.17-1.13-1.48-1.13-1.48-.92-.64.07-.63.07-.63 1.02.08 1.56 1.05 1.56 1.05.9 1.54 2.35 1.1 2.92.84.09-.66.35-1.1.63-1.35-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.04-2.68-.1-.26-.45-1.33.1-2.77 0 0 .84-.27 2.75 1.03a9.6 9.6 0 0 1 5 0c1.9-1.3 2.74-1.03 2.74-1.03.55 1.44.2 2.51.1 2.77.65.7 1.04 1.59 1.04 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.67.92.67 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"
            />
          </svg>
        </a>
      </div>
    </header>
  );
}
