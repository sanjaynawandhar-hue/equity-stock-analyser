/**
 * NSE India client.
 *
 * NSE's JSON APIs require a browser-like session: you must first hit the site
 * root to receive cookies, then send them (plus a matching User-Agent/Referer)
 * on the API call. NSE also aggressively rate-limits/blocks non-browser
 * traffic, so every call here is best-effort — callers are expected to fall
 * back to Yahoo/mock when these throw.
 *
 *   quote():        live quote via /api/quote-equity
 *   shareholding(): promoter/FII/DII/public breakdown (best-effort)
 */
'use strict';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const ROOT = 'https://www.nseindia.com';

let cookie = '';
let cookieTs = 0;
const COOKIE_TTL = 10 * 60 * 1000;

function nseSymbol(input) {
  return String(input || '').trim().toUpperCase().replace(/\.(NS|BO)$/, '');
}

function baseHeaders(referer) {
  return {
    'User-Agent': UA,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    Referer: referer || `${ROOT}/`,
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    Connection: 'keep-alive',
  };
}

async function warmUp(force = false) {
  if (!force && cookie && Date.now() - cookieTs < COOKIE_TTL) return cookie;
  const res = await fetch(`${ROOT}/get-quotes/equity?symbol=RELIANCE`, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  const list =
    (res.headers.getSetCookie && res.headers.getSetCookie()) ||
    (res.headers.raw && res.headers.raw()['set-cookie']) ||
    [];
  cookie = list.map((c) => c.split(';')[0]).join('; ');
  cookieTs = Date.now();
  if (!cookie) throw new Error('NSE warm-up returned no cookies');
  return cookie;
}

async function nseGet(apiPath, referer) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const jar = await warmUp(attempt > 0);
      const res = await fetch(`${ROOT}${apiPath}`, {
        headers: { ...baseHeaders(referer), Cookie: jar },
      });
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        lastErr = new Error(`NSE ${res.status}`);
        if (res.status === 429) lastErr.rateLimited = true;
        continue; // refresh cookie & retry once
      }
      if (!res.ok) { lastErr = new Error(`NSE ${res.status}`); continue; }
      const text = await res.text();
      if (!text || text.trim().startsWith('<')) { lastErr = new Error('NSE returned non-JSON'); continue; }
      return JSON.parse(text);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('NSE request failed');
}

/** Live quote for an equity. */
async function quote(symbolInput) {
  const symbol = nseSymbol(symbolInput);
  const json = await nseGet(
    `/api/quote-equity?symbol=${encodeURIComponent(symbol)}`,
    `${ROOT}/get-quotes/equity?symbol=${symbol}`
  );
  const p = json.priceInfo || {};
  const info = json.info || {};
  const meta = json.metadata || {};
  return {
    symbol,
    source: 'nse',
    companyName: info.companyName || meta.companyName || null,
    lastPrice: num(p.lastPrice),
    change: num(p.change),
    changePercent: num(p.pChange),
    open: num(p.open),
    dayHigh: num(p.intraDayHighLow && p.intraDayHighLow.max),
    dayLow: num(p.intraDayHighLow && p.intraDayHighLow.min),
    previousClose: num(p.previousClose),
    vwap: num(p.vwap),
    yearHigh: num(p.weekHighLow && p.weekHighLow.max),
    yearLow: num(p.weekHighLow && p.weekHighLow.min),
    industry: (info.industry || meta.industry) || null,
    lastUpdateTime: (json.metadata && json.metadata.lastUpdateTime) || null,
  };
}

/** Shareholding pattern (promoter/FII/DII/public) — best-effort. */
async function shareholding(symbolInput) {
  const symbol = nseSymbol(symbolInput);
  // NSE exposes shareholding under corp-info; shape varies, so we parse
  // defensively and let callers fall back if this fails.
  const json = await nseGet(
    `/api/corp-info?symbol=${encodeURIComponent(symbol)}&corpType=shareholdings_patterns&market=equities`,
    `${ROOT}/get-quotes/equity?symbol=${symbol}`
  );
  const rows = (json && (json.data || json.shareholdingPatterns || json)) || null;
  if (!rows) throw new Error('NSE shareholding: unrecognized shape');
  return { symbol, source: 'nse', raw: rows };
}

function num(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isNaN(n) ? null : n;
}

module.exports = { quote, shareholding, warmUp, nseSymbol };
