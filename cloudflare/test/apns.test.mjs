import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import {
  alertPayload, apnsEnvironment, createApnsClient, pemToDer, signProviderToken, validApnsToken,
} from '../src/apns.js';
import { deliver } from '../src/alerts.js';
import { normalizeSubscription } from '../src/index.js';

const subtle = webcrypto.subtle;
const TOKEN = 'a'.repeat(64);

async function testKey() {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const der = Buffer.from(await subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
  const pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
  return { pem, publicKey: pair.publicKey };
}

function fromB64url(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const r = responses.shift() || { status: 200 };
    return new Response(r.body ? JSON.stringify(r.body) : null, { status: r.status });
  };
  fn.calls = calls;
  return fn;
}

test('ES256 provider token verifies with the public key', async () => {
  const { pem, publicKey } = await testKey();
  const jwt = await signProviderToken({ keyPem: pem, keyId: 'KEY1234567', teamId: 'TEAM123456', nowS: 1700000000, subtle });
  const [h, c, sig] = jwt.split('.');
  assert.deepEqual(JSON.parse(fromB64url(h)), { alg: 'ES256', kid: 'KEY1234567' });
  assert.deepEqual(JSON.parse(fromB64url(c)), { iss: 'TEAM123456', iat: 1700000000 });
  assert.equal(fromB64url(sig).length, 64);
  const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, fromB64url(sig), new TextEncoder().encode(`${h}.${c}`));
  assert.ok(ok);
});

test('pemToDer accepts escaped newlines from env vars', async () => {
  const { pem } = await testKey();
  assert.deepEqual(pemToDer(pem.replace(/\n/g, '\\n')), pemToDer(pem));
});

test('provider token is cached for ~50 minutes', async () => {
  const { pem } = await testKey();
  let t = 1_700_000_000_000;
  const client = createApnsClient({ keyPem: pem, keyId: 'K', teamId: 'T', topic: 'x', fetchImpl: fakeFetch([]), now: () => t, subtle });
  const a = await client.providerToken();
  t += 49 * 60 * 1000;
  assert.equal(await client.providerToken(), a);
  t += 2 * 60 * 1000;
  assert.notEqual(await client.providerToken(), a);
});

test('send uses the right host, headers and payload', async () => {
  const { pem } = await testKey();
  const f = fakeFetch([{ status: 200 }, { status: 200 }]);
  const client = createApnsClient({ keyPem: pem, keyId: 'K', teamId: 'T', topic: 'ch.example.app', fetchImpl: f, subtle });
  const payload = alertPayload('Titel', 'Text');
  assert.deepEqual(payload, { aps: { alert: { title: 'Titel', body: 'Text' }, sound: 'default', 'interruption-level': 'active' } });
  assert.equal((await client.send({ deviceToken: TOKEN, environment: 'sandbox', payload })).ok, true);
  assert.equal((await client.send({ deviceToken: TOKEN, payload })).ok, true);
  assert.equal(f.calls[0].url, `https://api.sandbox.push.apple.com/3/device/${TOKEN}`);
  assert.equal(f.calls[1].url, `https://api.push.apple.com/3/device/${TOKEN}`);
  const h = f.calls[0].init.headers;
  assert.equal(h['apns-topic'], 'ch.example.app');
  assert.equal(h['apns-push-type'], 'alert');
  assert.match(h.authorization, /^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  assert.deepEqual(JSON.parse(f.calls[0].init.body), payload);
});

test('410 and BadDeviceToken mark the token dead, others do not', async () => {
  const { pem } = await testKey();
  const f = fakeFetch([
    { status: 410, body: { reason: 'Unregistered' } },
    { status: 400, body: { reason: 'BadDeviceToken' } },
    { status: 429, body: { reason: 'TooManyRequests' } },
  ]);
  const client = createApnsClient({ keyPem: pem, keyId: 'K', teamId: 'T', topic: 'x', fetchImpl: f, subtle });
  const p = alertPayload('a', 'b');
  assert.deepEqual(await client.send({ deviceToken: TOKEN, payload: p }), { ok: false, status: 410, reason: 'Unregistered', dropToken: true });
  assert.equal((await client.send({ deviceToken: TOKEN, payload: p })).dropToken, true);
  assert.equal((await client.send({ deviceToken: TOKEN, payload: p })).dropToken, false);
});

test('deliver: APNs with token, clears dead token; ntfy without token', async () => {
  const { pem } = await testKey();
  const env = { APNS_KEY_P8: pem, APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T', APNS_TOPIC: 'ch.computerworks.waehrungen' };
  const cleared = [];
  const clearToken = async id => { cleared.push(id); };
  const msg = { title: 'Währungsübersicht: USD fällt', message: 'x', tags: [], priority: 4 };
  const f1 = fakeFetch([{ status: 200 }]);
  assert.equal(await deliver(env, { id: 'a', topic: 'wae-x', apns_token: TOKEN, apns_env: 'sandbox' }, msg, { fetchImpl: f1, appUrl: '', dry: false, clearToken }), true);
  assert.match(f1.calls[0].url, /sandbox/);
  const f2 = fakeFetch([{ status: 410, body: { reason: 'Unregistered' } }]);
  assert.equal(await deliver(env, { id: 'b', topic: 'wae-x', apns_token: TOKEN, apns_env: 'production' }, msg, { fetchImpl: f2, appUrl: '', dry: false, clearToken }), false);
  assert.deepEqual(cleared, ['b']);
  const f3 = fakeFetch([{ status: 200 }]);
  assert.equal(await deliver(env, { id: 'c', topic: 'wae-' + '0'.repeat(32), apns_token: null }, msg, { fetchImpl: f3, appUrl: '', dry: false, clearToken }), true);
  assert.equal(f3.calls[0].url, 'https://ntfy.sh/');
});

test('subscription accepts, clears and rejects APNs tokens', () => {
  const base = { topic: 'wae-' + '0'.repeat(32), currencies: { USD: { enabled: true, down: 0.5, up: 0.25 }, EUR: { enabled: true, down: 0.5, up: 0.25 } } };
  assert.equal(normalizeSubscription(base).apns, undefined);
  assert.deepEqual(normalizeSubscription({ ...base, apnsToken: TOKEN.toUpperCase(), apnsEnv: 'sandbox' }).apns, { token: TOKEN, environment: 'sandbox' });
  assert.deepEqual(normalizeSubscription({ ...base, apnsToken: TOKEN }).apns, { token: TOKEN, environment: 'production' });
  assert.deepEqual(normalizeSubscription({ ...base, apnsToken: null }).apns, { token: null, environment: null });
  assert.equal(normalizeSubscription({ ...base, apnsToken: 'xyz' }), null);
  assert.equal(normalizeSubscription({ ...base, apnsToken: TOKEN, apnsEnv: 'dev' }), null);
  assert.equal(validApnsToken(TOKEN), true);
  assert.equal(apnsEnvironment('x'), 'production');
});
