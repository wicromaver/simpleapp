// Web: scheduled notifications aren't available in browsers when the page is closed,
// so the web app doesn't schedule any. (Phones get them via useNotifications.ts.)
import type { CoreSettings, Item, Jump } from '@simpleapp/core';

import type { NotificationPermission } from './useNotifications';

export type { NotificationPermission };

export function useNotifications(_items: Item[], _settings: CoreSettings, _now: Date, _onOpen: (j: Jump) => void): NotificationPermission {
  return 'unknown';
}
