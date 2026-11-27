export type Station = {
  id: string;
  label: string;
  icon: string;
  url: string;
  /** CSP host sources the stream needs: its own host + where it redirects (resolved on add). */
  hosts: string[];
};

// Station hosts → media-src sources. Only stations' own hosts and their redirects get in.
export const mediaSources = (stations: Station[]) => [
  ...new Set(stations.flatMap((s) => s.hosts.map((h) => `https://${h}`))),
];

// Redirect targets are load balancers (f111.rndfnk.com today, f131 tomorrow): allow the host's
// parent domain. Errs on the strict side: a CDN that rotates a deeper label (edge1.fra.cdn.net →
// edge2.ams.cdn.net) gets blocked, and the tile says so (see ui.ts).
// ponytail: no public-suffix list; `tldts`' getDomain() if parent-of-host is too strict
const twoPart = /^(co|com|org|net|ac|gov)\.[a-z]{2}$/; // example.co.uk → not *.co.uk
export const wildcard = (host: string) => {
  const [name, port] = host.split(':');
  const parent = name.split('.').slice(1).join('.');
  if (!parent.includes('.') || twoPart.test(parent)) {
    return host;
  }
  return `*.${parent}${port ? `:${port}` : ''}`;
};

type Fetch = (url: URL, init: RequestInit) => Promise<Response>;

/** Follows redirects by hand to learn every host the browser will hit; rejects non-audio. */
export const probe = async (url: string, fetchFn: Fetch = fetch): Promise<string[]> => {
  if (!URL.canParse(url)) {
    throw new Error('Ungültige Adresse');
  }
  let next = new URL(url);
  const hosts: string[] = [];
  for (let hop = 0; hop < 5; hop++) {
    if (next.protocol !== 'https:') {
      throw new Error('Nur https-Adressen');
    }
    hosts.push(hop === 0 ? next.host : wildcard(next.host));
    const res = await fetchFn(next, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
    await res.body?.cancel(); // a live stream never ends
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      next = new URL(location, next);
      continue;
    }
    if (!res.ok) {
      throw new Error(`Sender antwortet mit ${res.status}`);
    }
    // playlists (.m3u/.pls) and HLS don't play in a plain <audio> everywhere
    const type = res.headers.get('content-type') ?? '';
    if (!/^audio\//i.test(type) || /mpegurl|scpls/i.test(type)) {
      throw new Error('Kein Audio-Stream (MP3/AAC-Adresse nötig)');
    }
    return [...new Set(hosts)];
  }
  throw new Error('Zu viele Weiterleitungen');
};
