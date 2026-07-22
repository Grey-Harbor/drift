import type { Metadata } from 'next';

export const siteName = 'Drift';
export const siteUrl = 'https://drift.greyharborsoftware.com';
export const siteDescription =
  'Tenant-safe graph persistence for connected application data, with storage kept behind a replaceable adapter boundary.';
export const siteKeywords = [
  'graph persistence',
  'tenant-safe data',
  'connected application data',
  'TypeScript',
  'Node.js',
  'storage adapters',
  'SQLite',
  'graph traversal',
] as const;

export const socialCard = {
  url: '/brand/social-card.svg',
  width: 1731,
  height: 909,
  alt: 'Drift graph persistence',
} as const;

function withTrailingSlash(path: string): string {
  if (path === '/') {
    return path;
  }

  return path.endsWith('/') ? path : `${path}/`;
}

export function buildPageMetadata({
  title,
  description,
  canonicalPath,
}: {
  title: string;
  description: string | undefined;
  canonicalPath: string;
}): Metadata {
  const canonical = withTrailingSlash(canonicalPath);
  const resolvedDescription = description ?? siteDescription;

  return {
    title,
    description: resolvedDescription,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description: resolvedDescription,
      url: canonical,
      siteName,
      type: 'website',
      images: [socialCard],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: resolvedDescription,
      images: [socialCard.url],
    },
  };
}
