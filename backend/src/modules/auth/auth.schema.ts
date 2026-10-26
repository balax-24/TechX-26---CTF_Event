import { z } from 'zod';

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and dashes'),
  email: z.string().email('Please provide a valid email address').max(255),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password cannot exceed 100 characters'),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.preprocess(
  (val: any) => {
    if (val && typeof val === 'object') {
      const identifier =
        typeof val.identifier === 'string' && val.identifier.trim().length > 0
          ? val.identifier
          : typeof val.emailOrUsername === 'string' && val.emailOrUsername.trim().length > 0
          ? val.emailOrUsername
          : typeof val.username === 'string' && val.username.trim().length > 0
          ? val.username
          : typeof val.email === 'string' && val.email.trim().length > 0
          ? val.email
          : val.identifier;
      return {
        ...val,
        identifier: typeof identifier === 'string' ? identifier : '',
      };
    }
    return val;
  },
  z.object({
    identifier: z.string().min(1, 'Username or email is required'),
    password: z.string().min(1, 'Password is required'),
  })
);

export type LoginInput = z.infer<typeof loginSchema>;
