// Server only (node:https); logic.ts is bundled for the browser too.
import type { IncomingMessage } from 'node:http';
import https from 'node:https';

/** Now-playing text from the stream's in-band ICY metadata (`StreamTitle='…';`), '' if none.
 *  The browser's <audio> can't read it, so the server asks the stream once per poll. node:https,
 *  not fetch(): many stream servers answer `ICY 200 OK`, which fetch() rejects. */
export const icyTitle = async (url: string): Promise<string> => {
  const res = await openIcy(url);
  const metaint = Number(res.headers['icy-metaint']);
  if (!(metaint > 0 && metaint <= 65_536)) {
    res.destroy();
    return '';
  }
  return readIcyTitle(res, metaint); // leaving its for-await closes the stream
};

const openIcy = (url: string, hops = 5): Promise<IncomingMessage> =>
  new Promise((resolve, reject) => {
    // lenient parser: node:https rejects the `ICY 200 OK` status line too
    const options = { headers: { 'icy-metadata': '1' }, timeout: 5000, insecureHTTPParser: true };
    const req = https.get(url, options, (res) => {
      const { location } = res.headers;
      if (!location || (res.statusCode ?? 0) < 300 || (res.statusCode ?? 0) >= 400) {
        return resolve(res);
      }
      res.destroy();
      if (!hops) {
        return reject(new Error('too many redirects'));
      }
      resolve(openIcy(new URL(location, url).href, hops - 1)); // http: → https.get throws
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });

/** Audio bytes up to metaint, then 1 length byte (×16), then the metadata block. */
export const readIcyTitle = async (stream: AsyncIterable<Uint8Array>, metaint: number) => {
  let buf = new Uint8Array(0);
  const need = () => (buf.length > metaint ? metaint + 1 + buf[metaint] * 16 : metaint + 1);
  for await (const chunk of stream) {
    const next = new Uint8Array(buf.length + chunk.length);
    next.set(buf);
    next.set(chunk, buf.length);
    buf = next;
    if (buf.length < need()) {
      continue;
    }
    const meta = new TextDecoder().decode(buf.subarray(metaint + 1, need()));
    return /StreamTitle='(.*?)';/.exec(meta)?.[1]?.trim() ?? '';
  }
  return '';
};
