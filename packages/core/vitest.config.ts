import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // All date logic runs in device-local time; pin a zone so tests are deterministic.
    env: { TZ: 'America/New_York' },
  },
});
