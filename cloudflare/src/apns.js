// Apple Push Notification service (APNs) with token-based auth (ES256 JWT, WebCrypto).
// Self-contained and app-agnostic, so other Workers (e.g. Aktien Pro) can copy or import it.
// Production Workers reach APNs over HTTP/2; local `wrangler dev` (HTTP/1.1) cannot.

export const APNS_HOSTS = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
};
export const APNS_TOKEN_RE = /^[0-9a-f]{64,200}$/;
export const JWT_MAX_AGE_S = 50 * 60;

export function validApnsToken(token) {
  return typeof token === 'string' && APNS_TOKEN_RE.test(token);
}

export function apnsEnvironment(value) {
  return value === 'sandbox' ? 'sandbox' : 'production';
}

function b64url(bytes) {
  let s = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlText(text) {
  return b64url(new TextEncoder().encode(text));
}

/** PEM (.p8, PKCS#8) to DER bytes. */
export function pemToDer(pem) {
  const body = String(pem || '')
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\s+/g, '');
  if (!body) throw new Error('APNs-Schlüssel fehlt');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function importSigningKey(pem, subtle = crypto.subtle) {
  return subtle.importKey('pkcs8', pemToDer(pem), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/** Signed provider token. WebCrypto returns the raw r||s signature that JWS ES256 expects. */
export async function signProviderToken({ keyPem, keyId, teamId, nowS, subtle = crypto.subtle }) {
  const header = b64urlText(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = b64urlText(JSON.stringify({ iss: teamId, iat: nowS }));
  const input = `${header}.${claims}`;
  const key = await importSigningKey(keyPem, subtle);
  const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input));
  return `${input}.${b64url(sig)}`;
}

/** Caches one provider token per key for ~50 minutes (Apple: refresh between 20 and 60 min). */
export function createApnsClient({ keyPem, keyId, teamId, topic, fetchImpl = fetch, now = () => Date.now(), subtle }) {
  let cached = null;
  async function providerToken() {
    const nowS = Math.floor(now() / 1000);
    if (cached && nowS - cached.iat < JWT_MAX_AGE_S) return cached.token;
    const token = await signProviderToken({ keyPem, keyId, teamId, nowS, subtle });
    cached = { token, iat: nowS };
    return token;
  }

  /**
   * Sends one notification. Returns { ok, status, reason, dropToken }.
   * `dropToken` is true when Apple says the token is dead (410, BadDeviceToken, Unregistered).
   */
  async function send({ deviceToken, environment = 'production', payload, pushType = 'alert', priority = 10, collapseId, expiration }) {
    if (!validApnsToken(deviceToken)) return { ok: false, status: 0, reason: 'BadDeviceToken', dropToken: true };
    const host = APNS_HOSTS[apnsEnvironment(environment)];
    const headers = {
      authorization: `bearer ${await providerToken()}`,
      'apns-topic': topic,
      'apns-push-type': pushType,
      'apns-priority': String(priority),
      'content-type': 'application/json',
    };
    if (collapseId) headers['apns-collapse-id'] = collapseId;
    if (expiration != null) headers['apns-expiration'] = String(expiration);
    let res;
    try {
      res = await fetchImpl(`${host}/3/device/${deviceToken}`, { method: 'POST', headers, body: JSON.stringify(payload) });
    } catch (e) {
      return { ok: false, status: 0, reason: e && e.message ? e.message : 'Netzwerkfehler', dropToken: false };
    }
    if (res.status === 200) return { ok: true, status: 200, reason: null, dropToken: false };
    let reason = null;
    try { reason = (await res.json()).reason || null; } catch { /* leerer Körper */ }
    if (res.status === 403 && reason === 'ExpiredProviderToken') cached = null;
    const dropToken = res.status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered';
    return { ok: false, status: res.status, reason, dropToken };
  }

  return { send, providerToken };
}

/** Standard visible alert. `interruption` 'active' needs no extra entitlement ('time-sensitive' does). */
export function alertPayload(title, body, { sound = 'default', interruption = 'active', threadId, extra } = {}) {
  const aps = { alert: { title, body }, sound, 'interruption-level': interruption };
  if (threadId) aps['thread-id'] = threadId;
  return { aps, ...(extra || {}) };
}

/** Client from Worker env: APNS_KEY_P8 (secret), APNS_KEY_ID, APNS_TEAM_ID, APNS_TOPIC. Null if not configured. */
let envClient = null;
let envClientKey = '';
export function apnsFromEnv(env, fetchImpl = fetch) {
  const keyPem = env && env.APNS_KEY_P8;
  const keyId = env && env.APNS_KEY_ID;
  const teamId = env && env.APNS_TEAM_ID;
  const topic = env && env.APNS_TOPIC;
  if (!keyPem || !keyId || !teamId || !topic) return null;
  const id = `${keyId}|${teamId}|${topic}`;
  if (fetchImpl !== fetch) return createApnsClient({ keyPem, keyId, teamId, topic, fetchImpl });
  if (!envClient || envClientKey !== id) {
    envClient = createApnsClient({ keyPem, keyId, teamId, topic, fetchImpl });
    envClientKey = id;
  }
  return envClient;
}
