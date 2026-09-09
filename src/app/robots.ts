import { MetadataRoute } from 'next';
import { getServerSideURL } from '@/utils/utilities/getURL';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getServerSideURL();

  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/docs',
          '/docs/*',
          '/api-docs',
          '/api-docs/*',
          '/security',
          '/terms',
          '/privacy',
          '/signin',
          '/signup',
        ],
        disallow: [
          '/api/',
          '/trpc/',
          '/accounts',
          '/accounts/*',
          '/gpm',
          '/gpm/*',
          '/checklist',
          '/checklist/*',
          '/revenue',
          '/revenue/*',
          '/users',
          '/users/*',
          '/settings',
          '/settings/*',
          '/logs',
          '/logs/*',
          '/_next/',
          '/admin',
          '/admin/*',
        ],
      },
      {
        userAgent: 'Googlebot',
        allow: [
          '/',
          '/docs',
          '/docs/*',
          '/api-docs',
          '/api-docs/*',
          '/security',
          '/terms',
          '/privacy',
        ],
        disallow: [
          '/api/',
          '/trpc/',
          '/accounts',
          '/gpm',
          '/checklist',
          '/revenue',
          '/users',
          '/settings',
          '/logs',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
