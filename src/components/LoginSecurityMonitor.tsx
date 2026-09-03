'use client';

import { useEffect } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

const DEVICE_KEY = 'centrum_login_device_id';

function deviceLabel() {
  const browser = /Edg\//.test(navigator.userAgent) ? 'Edge' : /Firefox\//.test(navigator.userAgent) ? 'Firefox' : /Chrome\//.test(navigator.userAgent) ? 'Chrome' : /Safari\//.test(navigator.userAgent) ? 'Safari' : 'Browser';
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || 'device';
  return `${browser} on ${platform}`.slice(0, 160);
}

export function LoginSecurityMonitor() {
  const supabase = getSupabaseBrowserClient();
  useEffect(() => {
    if (!supabase) return;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      let deviceId = window.localStorage.getItem(DEVICE_KEY);
      if (!deviceId) {
        deviceId = window.crypto.randomUUID();
        window.localStorage.setItem(DEVICE_KEY, deviceId);
      }
      const sessionMarker = `centrum_login_checked:${data.user.id}:${deviceId}`;
      if (window.sessionStorage.getItem(sessionMarker)) return;
      const { error } = await supabase.functions.invoke('register-login-device', { body: { device_id: deviceId, label: deviceLabel() } });
      if (!error) window.sessionStorage.setItem(sessionMarker, '1');
      else console.error('Login security check failed', error);
    })();
  }, [supabase]);
  return null;
}

export const LOGIN_DEVICE_STORAGE_KEY = DEVICE_KEY;
