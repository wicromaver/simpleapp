// Keeps the phone's scheduled local notifications in line with the plan from core.
// Local notifications are scheduled on the device, so they fire even with no internet.
import { planNotifications, type CoreSettings, type Item, type Jump } from '@simpleapp/core';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

export type NotificationPermission = 'unknown' | 'granted' | 'denied';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const CHANNEL = 'reminders';

export function useNotifications(
  items: Item[],
  settings: CoreSettings,
  now: Date,
  onOpen: (j: Jump) => void,
): NotificationPermission {
  const [permission, setPermission] = useState<NotificationPermission>('unknown');
  const lastSignature = useRef('');
  const running = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Reminders and alerts',
        importance: Notifications.AndroidImportance.HIGH,
      }).catch(() => {});
    }
    Notifications.getPermissionsAsync()
      .then((p) => setPermission(p.granted ? 'granted' : p.canAskAgain ? 'unknown' : 'denied'))
      .catch(() => {});
  }, []);

  // Tapping a notification opens that day on the calendar.
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const date = response?.notification.request.content.data?.date;
    if (typeof date === 'string') onOpen({ tab: 'calendar', date });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  useEffect(() => {
    const plan = planNotifications(items, settings, now);
    const signature = plan.map((p) => `${p.key}|${p.at.getTime()}|${p.title}|${p.body}`).join('\n');
    if (signature === lastSignature.current || running.current) return;

    const t = setTimeout(async () => {
      running.current = true;
      try {
        // Ask only once there's actually something to remind about.
        let granted = (await Notifications.getPermissionsAsync()).granted;
        if (!granted && plan.length) {
          const req = await Notifications.requestPermissionsAsync();
          granted = req.granted;
          setPermission(granted ? 'granted' : req.canAskAgain ? 'unknown' : 'denied');
        }
        if (!granted) return;
        setPermission('granted');
        await Notifications.cancelAllScheduledNotificationsAsync();
        for (const p of plan) {
          const item = items.find((i) => i.id === p.itemId);
          await Notifications.scheduleNotificationAsync({
            identifier: p.key,
            content: { title: p.title, body: p.body, data: { itemId: p.itemId, date: item?.date ?? null } },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: CHANNEL },
          });
        }
        lastSignature.current = signature;
      } catch {
        // Leave the signature unchanged so the next change retries.
      } finally {
        running.current = false;
      }
    }, 800);
    return () => clearTimeout(t);
  }, [items, settings, now]);

  return permission;
}
