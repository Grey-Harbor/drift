import type { Metadata } from 'next';
import Link from 'next/link';

import { SiteFooter } from '@/components/site-footer';
import { buildPageMetadata, siteDescription, siteName, siteUrl, socialCard } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Tenant-safe graph persistence for connected data',
  description: siteDescription,
  canonicalPath: '/',
});

const principles = [
  {
    title: 'Tenant-safe by default',
    description: 'Scoped API keys establish clear boundaries before graph data is read or changed.',
  },
  {
    title: 'Bounded, useful reads',
    description:
      'Traverse relationships and retrieve declarative aggregates without unbounded queries.',
  },
  {
    title: 'Storage stays replaceable',
    description:
      'SQLite is the first adapter, not the architecture. Core behavior depends on a stable repository port.',
  },
] as const;

const paths = [
  {
    title: 'Tutorial',
    description: 'Build a first tenant-scoped graph from the ground up.',
    href: '/docs/tutorial',
  },
  {
    title: 'How-to',
    description: 'Run, operate, release, and contribute to Drift.',
    href: '/docs/how-to',
  },
  {
    title: 'Explanation',
    description: 'Understand the boundaries behind adapters, retrieval, and tenancy.',
    href: '/docs/explanation',
  },
  {
    title: 'Reference',
    description: 'Check the model, routes, scopes, and contract behavior.',
    href: '/docs/reference',
  },
] as const;

const useCases = [
  {
    title: 'Services and dependencies',
    description: 'Model what runs where, what depends on it, and what a change can affect.',
  },
  {
    title: 'Inventory and assets',
    description: 'Keep equipment, products, ownership, and lifecycle data connected and queryable.',
  },
  {
    title: 'Documents and work',
    description:
      'Represent related records without turning ordinary application data into a platform.',
  },
] as const;

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: siteName,
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Any',
  description: siteDescription,
  url: siteUrl,
  image: new URL(socialCard.url, siteUrl).toString(),
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <main className="landing" id="main">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">Graph persistence for application data</span>
            <h1>Drift</h1>
            <p className="lede">
              A compact, tenant-safe persistence service for things that already relate to one
              another: inventory, services, dependencies, documents, work, and more.
            </p>
            <div className="actions">
              <Link className="button primary" href="/docs/tutorial">
                Start with the tutorial
              </Link>
              <Link className="button secondary" href="/docs/reference/api">
                See the API
              </Link>
            </div>
          </div>

          <aside className="hero-panel" aria-label="What Drift gives you">
            <div className="hero-panel-card">
              <strong>Things and relationships</strong>
              <p>
                Store typed vertices, connect them with typed edges, and keep the model explicit.
              </p>
            </div>
            <div className="hero-panel-card">
              <strong>Clear operational bounds</strong>
              <p>
                Use tenancy, optimistic versions, and deliberate read limits to keep behavior
                dependable.
              </p>
            </div>
            <div className="hero-panel-card">
              <strong>A portable core</strong>
              <p>
                Use SQLite today while keeping application rules independent from any one database.
              </p>
            </div>
          </aside>
        </section>

        <section className="section" aria-labelledby="principles-heading">
          <div className="section-heading">
            <p className="eyebrow">Focused by design</p>
            <h2 id="principles-heading">Connected data, kept ordinary</h2>
            <p>
              Drift handles graph-shaped persistence and stays out of the rest of the application.
            </p>
          </div>
          <div className="card-grid">
            {principles.map((principle) => (
              <article className="info-card" key={principle.title}>
                <h3>{principle.title}</h3>
                <p>{principle.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="why-heading">
          <div className="section-heading">
            <p className="eyebrow">Why it exists</p>
            <h2 id="why-heading">A persistence layer, not a graph platform</h2>
            <p>
              Most teams do not need a hosted graph product or an unbounded query engine. They need
              a small, stable layer that stores connected application data, preserves tenant
              boundaries, and leaves storage choices open as the system grows.
            </p>
          </div>
        </section>

        <section className="section" aria-labelledby="docs-heading">
          <div className="section-heading">
            <p className="eyebrow">Guides &amp; reference</p>
            <h2 id="docs-heading">Choose your path</h2>
            <p>Learn, operate, look up, or understand Drift without mixing those jobs together.</p>
          </div>
          <div className="path-grid">
            {paths.map((path) => (
              <article className="path-card" key={path.title}>
                <h3>{path.title}</h3>
                <p>{path.description}</p>
                <Link href={path.href}>Open {path.title.toLowerCase()}</Link>
              </article>
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="fits-heading">
          <div className="section-heading">
            <p className="eyebrow">What it fits</p>
            <h2 id="fits-heading">The relationships already in your application</h2>
          </div>
          <div className="story-grid">
            {useCases.map((useCase) => (
              <article className="story-card" key={useCase.title}>
                <h3>{useCase.title}</h3>
                <p>{useCase.description}</p>
              </article>
            ))}
          </div>
        </section>

        <SiteFooter />
      </main>
    </>
  );
}
