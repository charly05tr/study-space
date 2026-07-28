export interface User {
  id: number;
  email: string;
  first_name: String;
  last_name: String;
  profile_image: String | null;
  phone: string | null;
  is_verified: boolean;
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
  phone?: string;
}

export interface ActivatePayload {
  email: string;
  code: string;
}