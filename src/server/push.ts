import webPush from 'web-push';
import { prisma } from './db';
import { logger } from './logger';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@8ballpool.com';

let vapidReady = false;

if (vapidPublicKey && vapidPrivateKey) {
  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  vapidReady = true;
} else {
  logger.warn('VAPID keys not configured — push notifications disabled');
}

export function getVapidPublicKey(): string {
  return vapidPublicKey;
}

export function isPushEnabled(): boolean {
  return vapidReady;
}

export async function subscribeUser(userId: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    update: { userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    create: { userId, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
  });
}

export async function unsubscribeUser(endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

async function getUserSubscriptions(userId: string) {
  return prisma.pushSubscription.findMany({ where: { userId } });
}

export async function sendPushNotification(userId: string, title: string, body: string, url: string = '/', tag: string = 'game-notification'): Promise<void> {
  if (!vapidReady) return;

  const subs = await getUserSubscriptions(userId);
  if (subs.length === 0) return;

  const payload = JSON.stringify({ title, body, url, tag });

  for (const sub of subs) {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Subscription expired or invalid — clean up
        await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
      } else {
        logger.error('Push send failed', { userId, error: String(err) });
      }
    }
  }
}
