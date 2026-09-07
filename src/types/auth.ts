import type { User, Account, Session } from '@/generated/prisma/client';

export type SafeUser = Omit<User, 'password'>;

export type AuthUser = {
  id: string;
  name?: string;
  email: string;
  image?: string;
  emailVerified?: Date;
  role?: string[];
};

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  confirmPassword: string;
  firstName?: string;
  lastName?: string;
  acceptTerms: boolean;
}

export interface MagicLinkCredentials {
  email: string;
}

export interface ResetPasswordCredentials {
  email: string;
}

export interface ChangePasswordCredentials {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface UpdateProfileData {
  firstName?: string;
  lastName?: string;
  username?: string;
  bio?: string;
  phone?: string;
  website?: string;
  location?: string;
}

export interface SecuritySettings {
  twoFactorEnabled: boolean;
  emailNotifications: boolean;
  securityAlerts: boolean;
}

// Authentication response types
export interface AuthResponse {
  success: boolean;
  message?: string;
  user?: SafeUser;
  requiresTwoFactor?: boolean;
  redirectTo?: string;
}

export interface LoginAttemptResult {
  success: boolean;
  message: string;
  user?: SafeUser;
  requiresTwoFactor?: boolean;
  isLocked?: boolean;
  remainingAttempts?: number;
}
