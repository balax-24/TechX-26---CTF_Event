import pino from 'pino';
import { config } from '../config/env.js';

const isDevelopment = config.NODE_ENV === 'development';

/**
 * Redacts sensitive authentication tokens (e.g., ?token=..., &access_token=...) from URLs
 * to ensure credentials never appear in structured logs, monitoring systems, or proxy traces.
 */
export function sanitizeLogUrl(url: string): string {
  if (!url || typeof url !== 'string') return url;
  return url.replace(/([?&](?:token|access_token|secret|password|key)=)[^&]+/gi, '$1[REDACTED]');
}

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'body.password',
      'body.password_hash',
      'body.flag',
      'body.submitted_flag',
      'body.invite_code',
      '*.password',
      '*.token',
      '*.secret',
    ],
    remove: true,
  },
  serializers: {
    url(url: string) {
      return sanitizeLogUrl(url);
    },
    req(req: any) {
      if (req && req.url) {
        req.url = sanitizeLogUrl(req.url);
      }
      return req;
    },
  },
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

