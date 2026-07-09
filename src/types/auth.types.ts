import { UserRole } from './enums';

export interface IUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  churchId: string | null;
  role: UserRole;
  isActive: boolean;
  avatarUrl?: string;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  sub: string;
  churchId: string | null;
  role: UserRole;
  iat: number;
  exp: number;
}
