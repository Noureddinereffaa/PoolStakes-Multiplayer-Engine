import { useEffect, useRef } from 'react';

async function urlBase64ToUint8Array(base64String: string): Promise<Uint8Array> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return new Uint8Array([...rawData].map(char => char.charCodeAt(0)));
}

export function usePushNotifications(token: string | null) {
  const subscribed = useRef(false);

  useEffect(() => {
    if (!token || subscribed.current) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    let cancelled = false;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;

        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          subscribed.current = true;
          return;
        }

        const resp = await fetch('/api/push/vapid-key');
        const { publicKey } = await resp.json();
        if (!publicKey || cancelled) return;

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: await urlBase64ToUint8Array(publicKey),
        });

        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(sub.toJSON()),
        });

        subscribed.current = true;
      } catch {}
    })();

    return () => { cancelled = true; };
  }, [token]);
}
