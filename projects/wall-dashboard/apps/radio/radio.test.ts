import assert from 'node:assert/strict';
import { test } from 'node:test';
import { radio } from './index.ts';
import { readIcyTitle } from './icy.ts';
import { mediaSources, probe, wildcard } from './logic.ts';

const reply = (status: number, headers: Record<string, string>) =>
  new Response(status === 200 ? 'x' : null, { status, headers });
const fake =
  (routes: Record<string, Response>) =>
  async (url: URL): Promise<Response> =>
    routes[url.href] ?? reply(404, {});

test('probe keeps the first host exact and wildcards redirect targets', async () => {
  const hosts = await probe(
    'https://radio.example.de/live',
    fake({
      'https://radio.example.de/live': reply(302, { location: 'https://f131.cdn.net/a' }),
      'https://f131.cdn.net/a': reply(200, { 'content-type': 'audio/mpeg' }),
    }),
  );
  assert.deepEqual(hosts, ['radio.example.de', '*.cdn.net']);
});

test('probe rejects http, playlists, and bad urls', async () => {
  const redirectToHttp = fake({
    'https://a.de/x': reply(302, { location: 'http://b.de/x' }),
  });
  await assert.rejects(probe('https://a.de/x', redirectToHttp), /https/);
  await assert.rejects(probe('http://a.de/x', fake({})), /https/);
  await assert.rejects(probe('javascript:alert(1)', fake({})), /https/);
  await assert.rejects(probe('nope', fake({})), /Ungültig/);
  const playlist = fake({ 'https://a.de/x': reply(200, { 'content-type': 'audio/x-mpegurl' }) });
  await assert.rejects(probe('https://a.de/x', playlist), /Audio/);
});

test('wildcard allows the parent domain, never a bare suffix', () => {
  assert.equal(wildcard('f111.rndfnk.com'), '*.rndfnk.com');
  assert.equal(wildcard('edge1.fra.cdn.net:8443'), '*.fra.cdn.net:8443');
  assert.equal(wildcard('a.b.example.co.uk'), '*.b.example.co.uk');
  assert.equal(wildcard('example.co.uk'), 'example.co.uk');
  assert.equal(wildcard('example.com'), 'example.com');
});

test('default stations yield exactly their hosts as media sources', () => {
  assert.deepEqual(mediaSources(radio().config.stations), [
    'https://streamtdy.ir-media-tec.com',
    'https://*.streamabc.net',
    'https://wdr-diemaus-live.icecastssl.wdr.de',
    'https://*.rndfnk.com',
    'https://radio.toggo.de',
  ]);
});

test('readIcyTitle reads StreamTitle after metaint audio bytes, across chunks', async () => {
  const meta = new TextEncoder().encode("StreamTitle='Maus - Club';");
  const block = new Uint8Array(Math.ceil(meta.length / 16) * 16);
  block.set(meta);
  const body = new Uint8Array([...new Uint8Array(8), block.length / 16, ...block, 1, 2, 3]);
  const chunks = async function* () {
    for (let i = 0; i < body.length; i += 5) yield body.subarray(i, i + 5);
  };
  assert.equal(await readIcyTitle(chunks(), 8), 'Maus - Club');
  assert.equal(await readIcyTitle(chunks(), 200), '');
});
