import axios from '../../../config/axios.ts'; 
import type {
    LoginPayload, AuthResponse, RegisterPayload, ActivatePayload, User
} from '../types';

const BASE_URL = '/users'; 

export const authApi = {
  login: async (data: LoginPayload): Promise<AuthResponse> => {
    const response = await axios.post(`${BASE_URL}/login_with_email/`, data);
    return response.data;
  },

  register: async (data: RegisterPayload): Promise<{ message: string, user: User }> => {
    const response = await axios.post(`${BASE_URL}/register_with_email/`, data);
    return response.data;
  },

  activate: async (data: ActivatePayload): Promise<AuthResponse> => {
    const response = await axios.post(`${BASE_URL}/activate/`, data);
    return response.data;
  },

  requestPasswordReset: async (email: string): Promise<{ message: string }> => {
    const response = await axios.post(`${BASE_URL}/password_reset_request/`, { email });
    return response.data;
  }
};