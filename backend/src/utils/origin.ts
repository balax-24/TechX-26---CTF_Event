import { config } from '../config/env.js';

/**
 * Checks whether an incoming HTTP Origin or Referer is permitted by the platform.
 * Supports:
 * 1. Missing Origin (curl, server-to-server, native clients, non-browser)
 * 2. Wildcard '*' in CORS_ORIGIN
 * 3. Explicit exact matches configured in CORS_ORIGIN
 * 4. PUBLIC_HOST matching (both with and without explicit port)
 * 5. In LAN deployment mode (DEPLOYMENT_MODE === 'lan'):
 *    - Loopback (localhost, 127.0.0.1, ::1)
 *    - RFC 1918 Private IPv4 networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16)
 * 
 * Rejects external/malicious domains (e.g. evil-phishing.com, evil-hacker.com).
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
  if (!origin) return true;

  const allowedOrigins = config.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);

  // 1. Explicit wildcard or exact configured match
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    return true;
  }

  try {
    const parsed = new URL(origin);
    const originHost = parsed.origin;
    const originWithoutPort = `${parsed.protocol}//${parsed.hostname}`;

    // 2. Exact match against origin URL or origin without port
    if (allowedOrigins.some((allowed) => allowed === originHost || allowed === originWithoutPort)) {
      return true;
    }

    // 3. Dynamic PUBLIC_HOST match
    if (config.PUBLIC_HOST) {
      if (
        parsed.hostname === config.PUBLIC_HOST ||
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1'
      ) {
        return true;
      }
    }

    // 4. In LAN deployment mode: permit private network RFC-1918 / loopback / link-local addresses
    if (config.DEPLOYMENT_MODE === 'lan') {
      const hostname = parsed.hostname;
      // Loopback
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
        return true;
      }
      // IPv4 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16)
      if (
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
        /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
        /^169\.254\.\d{1,3}\.\d{1,3}$/.test(hostname)
      ) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}
