export interface UserImage {
  id: number;
  url: string;
}

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  /** UserOutputSerializer exposes `profile_img`, an object — not a URL string. */
  profile_img: UserImage | null;
  phone: string | null;
  is_verified: boolean;
  is_active: boolean;
  avatar_url: string | null;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface AuthResponse {
  message?: string;
  user: User;
  tokens: AuthTokens;
}

// Payloads para las peticiones
export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
}

export interface ActivatePayload {
  email: string;
  code: string;
}

/**
 * register and resend_verification_code answer without tokens. `user` is null
 * when resend replies neutrally (unknown email or already-active account).
 */
export interface PendingActivationResponse {
  message: string;
  user: User | null;
}
