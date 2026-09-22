import pino from 'pino';
import { config } from '../config/env.js';

const isDevelopment = config.NODE_ENV === 'development';

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
