/**
 * Lightweight stale-while-revalidate cache + request dedup for GET API calls.
 *
 * Usage:
 *   import { cachedGet, invalidate } from './cache';
 *   const data = await cachedGet('/apartments', { ttl: 30_000 });
 *
 * - Same in-flight request is shared (no duplicate network calls).
 * - After ttl ms the value is stale; next read triggers a background refresh
 *   but still returns the cached value immediately (zero perceived latency).
 * - invalidate(key) forces the next call to wait for fresh data.
 * - Mutations (POST/PUT/DELETE) call invalidate() for affected keys.
 */

import apiClient from './apiClient';

// { key -> { data, ts, promise } }
const cache = new Map();
// { key -> Promise } — in-flight requests
const inflight = new Map();

const DEFAULT_TTL = 30_000; // 30 s

/**
 * Fetch `url` with stale-while-revalidate caching.
 * @param {string} url
 * @param {{ ttl?: number, params?: object }} options
 */
export async function cachedGet(url, { ttl = DEFAULT_TTL, params } = {}) {
  // Build a stable cache key that includes query params
  const key = params
    ? `${url}?${new URLSearchParams(
        Object.fromEntries(
          Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
        )
      ).toString()}`
    : url;

  const now = Date.now();
  const entry = cache.get(key);

  // Cache hit, still fresh → return immediately
  if (entry && now - entry.ts < ttl) {
    return entry.data;
  }

  // Already fetching this key → share the promise
  if (inflight.has(key)) {
    // If we have stale data return it while waiting
    if (entry) return entry.data;
    return inflight.get(key);
  }

  // Start a new request
  const promise = apiClient
    .get(url, params ? { params } : undefined)
    .then((res) => {
      cache.set(key, { data: res.data, ts: Date.now() });
      inflight.delete(key);
      return res.data;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, promise);

  // If we have stale data return it immediately and revalidate in background
  if (entry) return entry.data;

  return promise;
}

/**
 * Remove one or more cache entries by key prefix so the next read fetches fresh data.
 * Pass a string or an array of strings. Prefix-match: '/apartments' clears
 * '/apartments', '/apartments?foo=1', etc.
 * @param {string | string[]} keys
 */
export function invalidate(keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  for (const [k] of cache) {
    if (list.some((prefix) => k === prefix || k.startsWith(prefix + '?'))) {
      cache.delete(k);
    }
  }
}

/** Wipe the entire cache (e.g. on logout). */
export function clearCache() {
  cache.clear();
  inflight.clear();
}