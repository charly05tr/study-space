import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Notification } from './Notification';
import {
  NotificationContext,
  type NotificationItem,
  type NotifyInput,
} from './notificationContext';

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider = ({ children }: NotificationProviderProps) => {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    ({ variant = 'info', duration = 5000, ...rest }: NotifyInput) => {
      const id = crypto.randomUUID();
      setItems((current) => [...current, { id, variant, duration, ...rest }]);

      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  // Pending timers would otherwise outlive the provider on unmount.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed top-4 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {items.map((item) => (
          <Notification
            key={item.id}
            variant={item.variant}
            title={item.title}
            message={item.message}
            onDismiss={() => dismiss(item.id)}
            className="pointer-events-auto"
          />
        ))}
      </div>
    </NotificationContext.Provider>
  );
};
