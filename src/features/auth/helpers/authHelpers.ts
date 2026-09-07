const AUTH_PAGES = ['/signin', '/signup', '/auth', '/forgot-password'];

function isAuthRoute(path: string): boolean {
    return AUTH_PAGES.some(route => path === route || path.startsWith(route + '?') || path.startsWith(route + '/'));
}

/**
 * Validates and sanitizes callback URL to prevent open redirect attacks
 * Only allows internal URLs (same origin) and non-auth pages
 */
export function validateCallbackUrl(url: string | null): string {
    const DEFAULT_DESTINATION = '/accounts';

    if (!url || url === '/') return DEFAULT_DESTINATION;

    // Decode the URL
    const decodedUrl = decodeURIComponent(url);

    // Guard against circular redirects to login/auth routes
    if (isAuthRoute(decodedUrl)) {
        return DEFAULT_DESTINATION;
    }

    // Only allow relative paths (starting with /)
    if (decodedUrl.startsWith('/') && !decodedUrl.startsWith('//')) {
        return decodedUrl;
    }

    // Check if it's a full URL with the same origin
    if (typeof window !== 'undefined') {
        try {
            const urlObj = new URL(decodedUrl, window.location.origin);
            if (urlObj.origin === window.location.origin) {
                const target = urlObj.pathname + urlObj.search + urlObj.hash;
                if (target === '/' || isAuthRoute(target)) {
                    return DEFAULT_DESTINATION;
                }
                return target;
            }
        } catch {
            // Invalid URL, return default
        }
    }

    // Default to /accounts if validation fails
    return DEFAULT_DESTINATION;
}
