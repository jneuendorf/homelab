import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Dashboard } from '#sdk';

/** The host-local dashboard.local.ts wins over the sanitized sample in git. */
export const configPath = () => {
  const local = fileURLToPath(new URL('../dashboard.local.ts', import.meta.url));
  return existsSync(local)
    ? local
    : fileURLToPath(new URL('../dashboard.config.ts', import.meta.url));
};

export const loadConfig = async (): Promise<Dashboard> => (await import(configPath())).default;
