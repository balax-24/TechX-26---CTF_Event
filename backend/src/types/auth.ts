export type UserRole = 'participant' | 'admin' | 'superadmin';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  teamId?: string | null;
  teamRole?: 'captain' | 'member' | null;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}
