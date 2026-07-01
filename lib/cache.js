/**
 * Tiny two-tier cache: in-memory Map backed by JSON files on disk so cached
 * data survives restarts. Keeps us under Yahoo/NSE rate limits and speeds up
 * repeat searches. TTL is per-entry (ms).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CACHE_DIR = path.join(__dirname, '..', 'cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const mem = new Map(); // key -> { expires, value }

function fileFor(key) {
  const hash = crypto.createHash('sha1').update(key).digest('hex');
  return path.join(CACHE_DIR, `${hash}.json`);
}

function get(key) {
  const now = Date.now();

  const hit = mem.get(key);
  if (hit) {
    if (hit.expires > now) return hit.value;
    mem.delete(key);
  }

  // Fall back to disk.
  const fp = fileFor(key);
  try {
    const raw = fs.readFileSync(fp, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.expires > now) {
      mem.set(key, parsed);
      return parsed.value;
    }
    fs.unlinkSync(fp); // expired
  } catch (_) { /* miss */ }

  return undefined;
}

function set(key, value, ttlMs) {
  const entry = { expires: Date.now() + ttlMs, value };
  mem.set(key, entry);
  try {
    fs.writeFileSync(fileFor(key), JSON.stringify(entry));
  } catch (_) { /* disk cache is best-effort */ }
}

/**
 * Wrap an async producer with caching. On a cache miss the producer runs; if it
 * throws we serve stale-if-available so a transient upstream failure doesn't
 * blank the section.
 */
async function wrap(key, ttlMs, producer) {
  const cached = get(key);
  if (cached !== undefined) return { data: cached, cached: true };

  try {
    const value = await producer();
    set(key, value, ttlMs);
    return { data: value, cached: false };
  } catch (err) {
    // Serve stale even if expired, if we have anything on disk/mem.
    const stale = readStale(key);
    if (stale !== undefined) return { data: stale, cached: true, stale: true };
    throw err;
  }
}

function readStale(key) {
  const hit = mem.get(key);
  if (hit) return hit.value;
  try {
    const parsed = JSON.parse(fs.readFileSync(fileFor(key), 'utf8'));
    return parsed.value;
  } catch (_) { return undefined; }
}

module.exports = { get, set, wrap, CACHE_DIR };
