'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RealtimePostgresChangesPayload, User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { resolveUserRole, type CentrumRole } from '@/lib/supabase-role';

export type NotificationCategory = 'tickets' | 'announcements' | 'service_requests' | 'customization';

export type NotificationPreferences = {
  user_id: string;
  in_app_enabled: boolean;
  ticket_notifications: boolean;
  announcement_notifications: boolean;
  service_request_notifications: boolean;
  customization_notifications: boolean;
  reminder_popups: boolean;
};

type NotificationRow = {
  id: number;
  recipient_id: string;
  category: NotificationCategory;
  event_type: string;
  title: string;
  body: string;
  href: string;
  source_type: string | null;
  source_id: string | null;
  created_at: string;
  read_at: string | null;
};

const REMINDER_DELAY_MS = 5 * 60 * 1000;

export function defaultNotificationPreferences(userId = ''): NotificationPreferences {
  return {
    user_id: userId,
    in_app_enabled: true,
    ticket_notifications: true,
    announcement_notifications: true,
    service_request_notifications: true,
    customization_notifications: true,
    reminder_popups: true,
  };
}

function categoryEnabled(preferences: NotificationPreferences, category: NotificationCategory) {
  if (!preferences.in_app_enabled) return false;
  if (category === 'tickets') return preferences.ticket_notifications;
  if (category === 'announcements') return preferences.announcement_notifications;
  if (category === 'service_requests') return preferences.service_request_notifications;
  return preferences.customization_notifications;
}

function mergeNotification(current: NotificationRow[], incoming: NotificationRow) {
  const withoutIncoming = current.filter((item) => item.id !== incoming.id);
  return [incoming, ...withoutIncoming]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50);
}

function categoryLabel(category: NotificationCategory) {
  if (category === 'tickets') return 'Support';
  if (category === 'announcements') return 'Announcement';
  if (category === 'service_requests') return 'Service request';
  return 'Customization';
}

function formatNotificationTime(value: string) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff >= 0 && diff < minute) return 'Just now';
  if (diff >= 0 && diff < hour) return `${Math.max(1, Math.floor(diff / minute))}m ago`;
  if (diff >= 0 && diff < day) return `${Math.floor(diff / hour)}h ago`;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

export function NotificationCenter() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<CentrumRole>("customer");
  const [preferences, setPreferences] = useState<NotificationPreferences>(() => defaultNotificationPreferences());
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [snoozedUntil, setSnoozedUntil] = useState<Record<number, number>>({});
  const [clock, setClock] = useState(Date.now());
  const [loadError, setLoadError] = useState('');

  const fetchPreferences = useCallback(async (userId: string) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('user_id,in_app_enabled,ticket_notifications,announcement_notifications,service_request_notifications,customization_notifications,reminder_popups')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Notification preferences load failed', error);
      setPreferences(defaultNotificationPreferences(userId));
      return;
    }

    setPreferences((data as NotificationPreferences | null) ?? defaultNotificationPreferences(userId));
  }, [supabase]);

  const fetchNotifications = useCallback(async (userId: string) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('notifications')
      .select('id,recipient_id,category,event_type,title,body,href,source_type,source_id,created_at,read_at')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Notifications load failed', error);
      setLoadError('Notifications are temporarily unavailable.');
      return;
    }

    setLoadError('');
    setNotifications((data as NotificationRow[] | null) ?? []);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    async function boot() {
      const { data, error } = await supabase!.auth.getUser();
      if (cancelled) return;
      if (error || !data.user) {
        setUser(null);
        setNotifications([]);
        return;
      }

      setUser(data.user);
      setRole(await resolveUserRole(supabase!, data.user));
      await Promise.all([fetchPreferences(data.user.id), fetchNotifications(data.user.id)]);
    }

    void boot();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (cancelled) return;
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      setDrawerOpen(false);
      if (!nextUser) {
        setRole("customer");
        setNotifications([]);
        return;
      }
      setRole(await resolveUserRole(supabase, nextUser));
      await Promise.all([fetchPreferences(nextUser.id), fetchNotifications(nextUser.id)]);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [fetchNotifications, fetchPreferences, supabase]);

  useEffect(() => {
    if (!supabase || !user) return;

    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload: RealtimePostgresChangesPayload<NotificationRow>) => {
          const incoming = payload.new as NotificationRow;
          if (!incoming?.id) return;
          setNotifications((current) => mergeNotification(current, incoming));
          setClock(Date.now());
        },
      )
      .subscribe();

    const refresh = () => {
      void fetchNotifications(user.id);
      void fetchPreferences(user.id);
    };
    const poll = window.setInterval(refresh, 30_000);
    const tick = window.setInterval(() => setClock(Date.now()), 15_000);
    window.addEventListener('focus', refresh);

    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
      window.removeEventListener('focus', refresh);
      void supabase.removeChannel(channel);
    };
  }, [fetchNotifications, fetchPreferences, supabase, user]);

  const visibleNotifications = useMemo(
    () => notifications.filter((item) => categoryEnabled(preferences, item.category)),
    [notifications, preferences],
  );

  const unreadNotifications = useMemo(
    () => visibleNotifications.filter((item) => !item.read_at),
    [visibleNotifications],
  );

  const reminder = useMemo(() => {
    if (!preferences.in_app_enabled || !preferences.reminder_popups) return null;
    return unreadNotifications.find((item) => (snoozedUntil[item.id] ?? 0) <= clock) ?? null;
  }, [clock, preferences.in_app_enabled, preferences.reminder_popups, snoozedUntil, unreadNotifications]);

  async function markRead(notification: NotificationRow) {
    if (!supabase || notification.read_at) return;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: readAt } : item));
    const { error } = await supabase.from('notifications').update({ read_at: readAt }).eq('id', notification.id);
    if (error) {
      console.error('Notification read update failed', error);
      void fetchNotifications(notification.recipient_id);
    }
  }

  async function markAllRead() {
    if (!supabase || !user || unreadNotifications.length === 0) return;
    const readAt = new Date().toISOString();
    const unreadIds = unreadNotifications.map((item) => item.id);
    setNotifications((current) => current.map((item) => unreadIds.includes(item.id) ? { ...item, read_at: readAt } : item));
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: readAt })
      .eq('recipient_id', user.id)
      .is('read_at', null);
    if (error) {
      console.error('Mark all notifications read failed', error);
      void fetchNotifications(user.id);
    }
  }

  async function openNotification(notification: NotificationRow) {
    await markRead(notification);
    setDrawerOpen(false);
    window.location.assign(notification.href);
  }

  function remindLater(notification: NotificationRow) {
    setSnoozedUntil((current) => ({ ...current, [notification.id]: Date.now() + REMINDER_DELAY_MS }));
    setClock(Date.now());
  }

  if (!supabase || !user || !preferences.in_app_enabled) return null;

  return (
    <div className="notification-center" aria-live="polite">
      <button
        type="button"
        className="notification-bell"
        aria-label={unreadNotifications.length ? `Notifications, ${unreadNotifications.length} unread` : 'Notifications'}
        aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen((open) => !open)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadNotifications.length ? <span className="notification-count">{Math.min(99, unreadNotifications.length)}</span> : null}
      </button>

      {drawerOpen ? (
        <section className="notification-drawer" aria-label="Notification center">
          <div className="notification-drawer-header">
            <div>
              <span className="badge card-badge">Notifications</span>
              <h2>{unreadNotifications.length ? `${unreadNotifications.length} unread` : 'You’re caught up'}</h2>
            </div>
            <button type="button" className="notification-close" onClick={() => setDrawerOpen(false)} aria-label="Close notifications">×</button>
          </div>

          <div className="notification-drawer-actions">
            <button type="button" className="btn btn-secondary btn-compact" onClick={() => void markAllRead()} disabled={!unreadNotifications.length}>Mark all read</button>
            <button type="button" className="btn btn-secondary btn-compact" onClick={() => { setDrawerOpen(false); router.push(role === 'admin' ? '/admin/account#notifications' : role === 'manager' ? '/manager#notifications' : '/portal/account#notifications'); }}>Settings</button>
          </div>

          {loadError ? <p className="form-alert form-alert-error">{loadError}</p> : null}

          <div className="notification-list">
            {visibleNotifications.length ? visibleNotifications.map((notification) => (
              <button
                type="button"
                className={`notification-item ${notification.read_at ? 'is-read' : 'is-unread'}`}
                key={notification.id}
                onClick={() => void openNotification(notification)}
              >
                <span className="notification-item-topline">
                  <span>{categoryLabel(notification.category)}</span>
                  <time dateTime={notification.created_at}>{formatNotificationTime(notification.created_at)}</time>
                </span>
                <strong>{notification.title}</strong>
                {notification.body ? <span className="notification-item-body">{notification.body}</span> : null}
              </button>
            )) : <p className="empty-state">No notifications yet.</p>}
          </div>
        </section>
      ) : null}

      {reminder ? (
        <aside className="notification-reminder" role="status" aria-label="Unread notification reminder">
          <div className="notification-reminder-heading">
            <span className="badge card-badge">Unread · {categoryLabel(reminder.category)}</span>
            <button type="button" className="notification-close" onClick={() => remindLater(reminder)} aria-label="Remind me later">×</button>
          </div>
          <strong>{reminder.title}</strong>
          {reminder.body ? <p>{reminder.body}</p> : null}
          <div className="notification-reminder-actions">
            <button type="button" className="btn btn-primary btn-compact" onClick={() => void openNotification(reminder)}>Open</button>
            <button type="button" className="btn btn-secondary btn-compact" onClick={() => void markRead(reminder)}>Mark read</button>
            <button type="button" className="btn btn-secondary btn-compact" onClick={() => remindLater(reminder)}>Later</button>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
