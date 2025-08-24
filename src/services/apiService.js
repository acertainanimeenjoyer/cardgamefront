// src/services/apiService.js

// Resolve API base URL across common setups without using `typeof import` (which is invalid)
const API_BASE =
  // Vite / modern bundlers (ESM)
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE) ||
  // CRA / Next / generic Node envs
  (typeof process !== 'undefined' && (
    process.env?.REACT_APP_API_BASE ||
    process.env?.NEXT_PUBLIC_API_BASE ||
    process.env?.API_BASE
  )) ||
  // default to relative paths
  '';

/** If you're using cookie/session auth in dev across ports, set this to true */
const WITH_CREDENTIALS =
  (typeof import.meta !== 'undefined' && String(import.meta.env?.VITE_API_WITH_CREDENTIALS) === 'true') ||
  (typeof process !== 'undefined' && String(process.env?.VITE_API_WITH_CREDENTIALS) === 'true');

/** Read JWT from common storage keys (adjust to your app if needed) */
const getStoredToken = () => {
  try {
    if (typeof localStorage !== 'undefined') {
      for (const k of ['token', 'authToken', 'jwt', 'accessToken']) {
        const v = localStorage.getItem(k);
        if (v) return v;
      }
    }
    if (typeof sessionStorage !== 'undefined') {
      for (const k of ['token', 'authToken', 'jwt', 'accessToken']) {
        const v = sessionStorage.getItem(k);
        if (v) return v;
      }
    }
  } catch {}
  return null;
};

/** Optional: allow setting an override token at runtime (e.g., after login) */
let tokenOverride = null;
export const setAuthToken = (t) => { tokenOverride = t || null; };
export const getAuthToken = () => tokenOverride || getStoredToken();

/**
 * request(urlOrConfig, method?, body?, token?)
 * - Backward compatible with your current calls.
 * - Auto-attaches Authorization header if not provided.
 */
export const request = async (...args) => {
  let url, method = 'GET', body, token, headers;

  // Support object-style config OR positional args
  if (typeof args[0] === 'object' && args[0] !== null) {
    const cfg = args[0];
    url     = cfg.url || '';
    method  = cfg.method || 'GET';
    body    = cfg.data ?? cfg.body;   // keep 'data' alias
    token   = cfg.token;              // explicit token still supported
    headers = cfg.headers;
  } else {
    [url, method = 'GET', body, token] = args;
  }

  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;

  const authToken = token ?? getAuthToken();

  const opts = {
    method,
    headers: {
      Accept: 'application/json',
      ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(headers || {}),
    },
    ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}),
    ...(WITH_CREDENTIALS ? { credentials: 'include' } : {}),
  };

  // Minimal, safe debug snapshot (don’t print huge arrays)
  const brief = (() => {
    if (!body || typeof body !== 'object') return body;
    try {
      const b = {
        action: body.action,
        sc: Array.isArray(body.selectedCards) ? body.selectedCards.length : undefined,
        pHand: Array.isArray(body.hand) ? body.hand.length : undefined,
        pDeck: Array.isArray(body.deck) ? body.deck.length : undefined,
        pDiscard: Array.isArray(body.discardPile) ? body.discardPile.length : undefined,
        eHand: Array.isArray(body.enemyHand) ? body.enemyHand.length : undefined,
        eDeck: Array.isArray(body.enemyDeck) ? body.enemyDeck.length : undefined,
        eDiscard: Array.isArray(body.enemyDiscard) ? body.enemyDiscard.length : undefined,
        // keep ids to correlate, omit heavy blobs
        roomId: body.roomId, campaignId: body.campaignId, enemyId: body.enemyId,
      };
      return b;
    } catch { return undefined; }
  })();

  try {
    console.debug('[API][REQ]', { url: API_BASE + url, method, body: brief });
  } catch {}

  const res = await fetch(API_BASE + url, opts);

  const text = await res.text();

  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { data = { message: text }; }

  if (!res.ok) {
    // Show status + a short preview of the server text to pinpoint backend failure
    const preview = (text || '').slice(0, 200);
    console.error('[API][ERR]', { url: API_BASE + url, status: res.status, statusText: res.statusText, preview });
    const detail = data?.message || preview || `${res.status} ${res.statusText}`;
    throw new Error(`${opts.method || 'GET'} ${url} failed: ${detail}`);
  }

  try {
    console.debug('[API][RES]', { url: API_BASE + url, status: res.status, keys: Object.keys(data || {}) });
  } catch {}

  return data;
};

export default { request, setAuthToken, getAuthToken };
