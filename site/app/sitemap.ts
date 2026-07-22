import type { MetadataRoute } from 'next';

import { getDocParams, routeFromSlug } from '@/lib/docs';
import { siteUrl } from '@/lib/seo';

export const dynamic = 'force-static';

function absoluteUrl(path: string): string {
  const canonicalPath = path === '/' || path.endsWith('/') ? path : `${path}/`;
  return new URL(canonicalPath, siteUrl).toString();
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: absoluteUrl('/'),
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...getDocParams().map(({ slug }) => ({
      url: absoluteUrl(routeFromSlug(slug)),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ];
}
