import { createContext } from 'react';

export type NotificationVariant = 'info' | 'success' | 'error';

export interface NotificationItem {
  id: string;
  variant: NotificationVariant;
  title?: string;
  message: string;
  /** Milliseconds before auto-dismiss. Pass 0 to keep it until dismissed. */
  duration: number;
}

export type NotifyInput = Omit<NotificationItem, 'id' | 'variant' | 'duration'> &
  Partial<Pick<NotificationItem, 'variant' | 'duration'>>;

export interface NotificationContextValue {
  notify: (input: NotifyInput) => string;
  dismiss: (id: string) => void;
}

export const NotificationContext = createContext<NotificationContextValue | null>(null);
