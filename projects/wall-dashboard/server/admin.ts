// The admin PIN, checked on the server for every request that carries one (x-pin header). The
// shell asks for it when someone picks an admin user and sends it along until it locks again.
import { secret } from '#sdk';

// A 4-digit PIN falls to brute force in minutes without this: 5 misses lock it for a minute.
const maxMisses = 5;
const lockMs = 60_000;

/** Returns null for the right PIN, else why not. `expected`/`now` are injectable for tests. */
export const pinCheck = (expected = () => secret('ADMIN_PIN'), now = Date.now) => {
  let misses = 0;
  let lockedUntil = 0;
  return (pin: string | null) => {
    const want = expected();
    if (!want) return 'ADMIN_PIN nicht gesetzt';
    if (now() < lockedUntil) return 'gesperrt, 1 Minute warten';
    if (pin === want) {
      misses = 0;
      return null;
    }
    if (++misses >= maxMisses) {
      misses = 0;
      lockedUntil = now() + lockMs;
    }
    return 'falsche PIN';
  };
};
