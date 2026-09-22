/**
 * Cross-Site Request Forgery (CSRF) & Origin Defense for Mutating Endpoints
 */

export function verifyRequestOrigin(req: Request): boolean {
  // Safe methods don't require origin check
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return true;
  }

  const host = req.headers.get('host');
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');

  if (!host) {
    return false;
  }

  // If origin header is present, compare origin host
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host === host) {
        return true;
      }
    } catch {
      return false;
    }
  }

  // Fallback to referer header if origin is absent
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.host === host) {
        return true;
      }
    } catch {
      return false;
    }
  }

  // In standard browser fetch / navigation from same site, origin or referer is always sent
  // For non-browser automated tests where neither is set, allow only in test/dev environment
  if (!origin && !referer && process.env.NODE_ENV !== 'production') {
    return true;
  }

  return false;
}
