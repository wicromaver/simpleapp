// Which local notifications the device should have scheduled right now (pure).
// The app cancels and re-schedules from this list whenever items or settings change.
// Phones cap pending notifications (iOS: 64), so only the soonest ones in a short
// horizon are scheduled; the list rolls forward as the app is opened.

import { addDaysStr, atMinutes, fmtDate, timeToMin } from './dates';
import { kindOf, notificationTimes, timeLabel } from './items';
import type { CoreSettings, Item } from './types';

export interface PlannedNotification {
  /** Stable per item + alert, e.g. "<itemId>@15" or "<itemId>@reminder". */
  key: string;
  itemId: string;
  at: Date;
  title: string;
  body: string;
}

export const NOTIFICATION_LIMIT = 60;
export const NOTIFICATION_HORIZON_DAYS = 14;

function leadLabel(min: number): string {
  if (min >= 60 && min % 60 === 0) return min === 60 ? 'In 1 hour' : `In ${min / 60} hours`;
  return `In ${min} min`;
}

export function planNotifications(
  items: Item[],
  settings: CoreSettings,
  now: Date,
  opts: { limit?: number; horizonDays?: number } = {},
): PlannedNotification[] {
  const limit = opts.limit ?? NOTIFICATION_LIMIT;
  const lastDay = addDaysStr(fmtDate(now), opts.horizonDays ?? NOTIFICATION_HORIZON_DAYS);
  const out: PlannedNotification[] = [];

  for (const it of items) {
    if (!it.date || it.date > lastDay) continue;
    const kind = kindOf(it);
    if (kind === 'reminder') {
      const [at] = notificationTimes(it, settings);
      if (at && at > now) {
        out.push({ key: `${it.id}@reminder`, itemId: it.id, at, title: it.title, body: it.date === fmtDate(now) ? 'Today' : 'Reminder for today' });
      }
    } else if (kind === 'event') {
      const start = atMinutes(it.date, timeToMin(it.start!));
      for (const lead of [...new Set(settings.eventAlerts)].sort((a, b) => b - a)) {
        const at = new Date(start.getTime() - lead * 60_000);
        if (at <= now) continue;
        out.push({ key: `${it.id}@${lead}`, itemId: it.id, at, title: it.title, body: `${leadLabel(lead)} · ${timeLabel(it)}` });
      }
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, limit);
}
