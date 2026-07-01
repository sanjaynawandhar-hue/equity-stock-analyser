/**
 * Twelve Data client — an official market-data API (free tier) used as the
 * PREFERRED live source for quotes and historical OHLCV, because unlike
 * Yahoo/NSE it doesn't block server/datacenter IPs. Activated only when a
 * TWELVEDATA_KEY env var is present; otherwise callers fall back to Yahoo→mock.
 *
 *   quote(symbol)  → live quote (our normalized shape)
 *   chart(symbol)  → historical candles (our normalized shape)
 */
'use strict';

const BASE = 'https://api.twelvedata.com';
const KEY = () => process.env.TWELVEDATA_KEY || '';
const enabled = () => !!KEY();

// Map our Yahoo-style symbol to Twelve Data's { symbol, exchange }.
function toTD(input) {
  const s = String(input || '').trim().toUpperCase();
  if (!s) throw new Error('empty symbol');
  if (s === '^NSEI') return { symbol: 'NIFTY 50', exchange: 'NSE', isIndex: true };
  if (s === '^BSESN') return { symbol: 'SENSEX', exchange: 'BSE', isIndex: true };
  if (s.startsWith('^')) throw new Error('index not supported by Twelve Data client');
  if (s.endsWith('.BO')) return { symbol: s.slice(0, -3), exchange: 'BSE' };
  if (s.endsWith('.NS')) return { symbol: s.slice(0, -3), exchange: 'NSE' };
  return { symbol: s, exchange: 'NSE' };
}

async function tdGet(pathAndQuery) {
  const url = `${BASE}${pathAndQuery}&apikey=${encodeURIComponent(KEY())}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const json = await res.json().catch(() => ({}));
  if (json && json.status === 'error') {
    const e = new Error(json.message || `Twelve Data error ${json.code || ''}`.trim());
    if (json.code === 429) e.rateLimited = true;
    throw e;
  }
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);
  return json;
}

const num = (v) => (v == null || v === '' ? null : (Number.isNaN(+v) ? null : +v));
const round = (n) => (n == null ? null : Math.round(n * 100) / 100);

const INTERVAL = { '1d': '1day', '1wk': '1week', '1mo': '1month' };
function rangeToDays(range) {
  const m = /^(\d+)(y|mo|wk|d)$/.exec(String(range));
  if (!m) return 3650;
  const n = +m[1];
  return { y: n * 365, mo: n * 30, wk: n * 7, d: n }[m[2]] || 3650;
}

/** Historical OHLCV. Returns our chart shape (events left empty). */
async function chart(symbol, { range = '10y', interval = '1d' } = {}) {
  const { symbol: sym, exchange, isIndex } = toTD(symbol);
  const tdInterval = INTERVAL[interval] || '1day';
  const stepDays = interval === '1wk' ? 7 : interval === '1mo' ? 30 : 1;
  const outputsize = Math.min(5000, Math.ceil(rangeToDays(range) / stepDays) + 50);

  const q = `/time_series?symbol=${encodeURIComponent(sym)}&exchange=${exchange}` +
    `&interval=${tdInterval}&outputsize=${outputsize}&order=ASC&timezone=UTC`;
  const json = await tdGet(q);
  const values = json.values || [];
  if (!values.length) throw new Error(`Twelve Data: no series for ${sym}`);

  const candles = values.map((v) => ({
    time: Math.floor(new Date(v.datetime.replace(' ', 'T') + (v.datetime.length <= 10 ? 'T00:00:00Z' : 'Z')).getTime() / 1000),
    open: round(num(v.open)), high: round(num(v.high)), low: round(num(v.low)),
    close: round(num(v.close)), adjclose: round(num(v.close)), volume: num(v.volume),
  })).filter((c) => c.close != null && Number.isFinite(c.time))
    .sort((a, b) => a.time - b.time);

  const last = candles[candles.length - 1] || {};
  const prev = candles[candles.length - 2] || last;
  const recent = candles.slice(-252);
  const highs = recent.map((c) => c.high).filter((x) => x != null);
  const lows = recent.map((c) => c.low).filter((x) => x != null);

  return {
    meta: {
      symbol, currency: 'INR', exchange, instrumentType: isIndex ? 'INDEX' : 'EQUITY',
      regularMarketPrice: last.close, previousClose: prev.close,
      fiftyTwoWeekHigh: highs.length ? Math.max(...highs) : null,
      fiftyTwoWeekLow: lows.length ? Math.min(...lows) : null,
      firstTradeDate: candles[0] && candles[0].time, gmtoffset: 19800, timezone: 'IST',
    },
    candles, dividends: [], splits: [],
  };
}

/** Live quote. Returns our quote shape. */
async function quote(symbol) {
  const { symbol: sym, exchange } = toTD(symbol);
  const q = `/quote?symbol=${encodeURIComponent(sym)}&exchange=${exchange}&timezone=UTC`;
  const j = await tdGet(q);
  const fw = j.fifty_two_week || {};
  return {
    symbol: sym,
    source: 'twelvedata',
    companyName: j.name || null,
    lastPrice: round(num(j.close)),
    change: round(num(j.change)),
    changePercent: round(num(j.percent_change)),
    open: round(num(j.open)),
    dayHigh: round(num(j.high)),
    dayLow: round(num(j.low)),
    previousClose: round(num(j.previous_close)),
    vwap: null,
    yearHigh: round(num(fw.high)),
    yearLow: round(num(fw.low)),
    industry: null,
    lastUpdateTime: j.datetime || null,
  };
}

module.exports = { enabled, quote, chart, toTD };
