'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { defaultNotificationPreferences, type NotificationCategory, type NotificationPreferences } from '@/components/NotificationCenter';
import { toFriendlyErrorMessage } from '@/lib/friendly-error';
import { CentrumInlineLoading } from '@/components/CentrumLoading';

type Props = {
  userId: string;
  isAdmin?: boolean;
};

type ToggleKey = Exclude<keyof NotificationPreferences, 'user_id'>;

export function NotificationPreferencesCard({ userId, isAdmin = false }: Props) {
  const supabase = getSupabaseBrowserClient();
  const [preferences, setPreferences] = useState<NotificationPreferences>(() => defaultNotificationPreferences(userId));
  const [initialPreferences, setInitialPreferences] = useState<NotificationPreferences>(() => defaultNotificationPreferences(userId));
  const [loading, setLoading] = useState(() => Boolean(supabase));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    void supabase
      .from('notification_preferences')
      .select('user_id,in_app_enabled,ticket_notifications,announcement_notifications,service_request_notifications,customization_notifications,reminder_popups')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error('Notification settings load failed', error);
          setErrorMessage(toFriendlyErrorMessage(error, 'Notification settings could not be loaded right now.'));
        } else {
          const next = (data as NotificationPreferences | null) ?? defaultNotificationPreferences(userId);
          setPreferences(next);
          setInitialPreferences(next);
        }
        setLoading(false);
      });
    return () => { active = false; };
  }, [supabase, userId]);

  function setToggle(key: ToggleKey, value: boolean) {
    setPreferences((current) => ({ ...current, [key]: value }));
    setMessage('');
    setErrorMessage('');
  }

  async function markDisabledCategoriesRead(next: NotificationPreferences) {
    if (!supabase) return;
    const disabledCategories: NotificationCategory[] = [];
    if (!next.in_app_enabled || !next.ticket_notifications) disabledCategories.push('tickets');
    if (!next.in_app_enabled || !next.announcement_notifications) disabledCategories.push('announcements');
    if (!next.in_app_enabled || !next.service_request_notifications) disabledCategories.push('service_requests');
    if (!next.in_app_enabled || !next.customization_notifications) disabledCategories.push('customization');
    if (!disabledCategories.length) return;

    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', userId)
      .in('category', disabledCategories)
      .is('read_at', null);
    if (error) console.error('Disabled notification cleanup failed', error);
  }

  async function save() {
    if (!supabase || saving) return;
    setSaving(true);
    setMessage('');
    setErrorMessage('');

    const payload = {
      user_id: userId,
      in_app_enabled: preferences.in_app_enabled,
      ticket_notifications: preferences.ticket_notifications,
      announcement_notifications: preferences.announcement_notifications,
      service_request_notifications: preferences.service_request_notifications,
      customization_notifications: preferences.customization_notifications,
      reminder_popups: preferences.reminder_popups,
    };

    const { data, error } = await supabase
      .from('notification_preferences')
      .upsert(payload, { onConflict: 'user_id' })
      .select('user_id,in_app_enabled,ticket_notifications,announcement_notifications,service_request_notifications,customization_notifications,reminder_popups')
      .single();

    if (error) {
      console.error('Notification settings save failed', error);
      setErrorMessage(toFriendlyErrorMessage(error, 'Notification settings could not be saved. Please try again.'));
      setSaving(false);
      return;
    }

    const saved = data as NotificationPreferences;
    await markDisabledCategoriesRead(saved);
    setPreferences(saved);
    setInitialPreferences(saved);
    setMessage('Notification settings saved.');
    setSaving(false);
  }

  const hasChanges = JSON.stringify(preferences) !== JSON.stringify(initialPreferences);

  return (
    <article className="card notification-preferences-card" id="notifications">
      <div className="badge card-badge">Notifications</div>
      <h2>Notification Settings</h2>
      <p className="page-intro">
        Choose what Centrum surfaces in the notification bell. Unread reminders can reappear until you open or mark them read.
      </p>

      {loading ? <p className="field-note"><CentrumInlineLoading message="Loading notification preferences…" /></p> : (
        <div className="notification-settings-list">
          <NotificationToggle
            label="In-app notifications"
            description="Show the notification bell and notification history while you are signed in."
            checked={preferences.in_app_enabled}
            onChange={(value) => setToggle('in_app_enabled', value)}
          />
          <NotificationToggle
            label={isAdmin ? 'Support ticket activity' : 'Ticket replies & status'}
            description={isAdmin ? 'New tickets and customer replies.' : 'Centrum replies and ticket status changes.'}
            checked={preferences.ticket_notifications}
            disabled={!preferences.in_app_enabled}
            onChange={(value) => setToggle('ticket_notifications', value)}
          />
          <NotificationToggle
            label="Announcements"
            description={isAdmin ? 'Reserved for announcement-related alerts.' : 'Published Centrum notices and service announcements.'}
            checked={preferences.announcement_notifications}
            disabled={!preferences.in_app_enabled}
            onChange={(value) => setToggle('announcement_notifications', value)}
          />
          <NotificationToggle
            label={isAdmin ? 'Technician & service requests' : 'Service request updates'}
            description={isAdmin ? 'New technical visits, plan changes, relocations and equipment requests.' : 'Status or admin-note updates on your service requests.'}
            checked={preferences.service_request_notifications}
            disabled={!preferences.in_app_enabled}
            onChange={(value) => setToggle('service_request_notifications', value)}
          />
          <NotificationToggle
            label={isAdmin ? 'Customization requests' : 'Customization updates'}
            description={isAdmin ? 'New plan recommendation / customization questionnaires.' : 'Status changes on customization requests submitted while signed in.'}
            checked={preferences.customization_notifications}
            disabled={!preferences.in_app_enabled}
            onChange={(value) => setToggle('customization_notifications', value)}
          />
          <NotificationToggle
            label="Unread reminder popups"
            description="If you close an unread reminder without opening it, Centrum can show it again later."
            checked={preferences.reminder_popups}
            disabled={!preferences.in_app_enabled}
            onChange={(value) => setToggle('reminder_popups', value)}
          />
        </div>
      )}

      {errorMessage ? <p className="form-alert form-alert-error">{errorMessage}</p> : null}
      {message ? <p className="form-alert form-alert-success">{message}</p> : null}
      <div className="section-actions">
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={loading || saving || !hasChanges}>
          {saving ? 'Saving…' : 'Save Notification Settings'}
        </button>
      </div>
      <p className="field-note">Disabling a category marks its current unread notification reminders as read. The underlying tickets, requests and announcements are not deleted.</p>
    </article>
  );
}

function NotificationToggle({
  label,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={`notification-setting-row ${disabled ? 'is-disabled' : ''}`}>
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
