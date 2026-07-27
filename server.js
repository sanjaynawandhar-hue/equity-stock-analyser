/**
 * Equity Stock Analyser — Express proxy backend.
 *
 * Acts as a CORS-safe proxy in front of Yahoo Finance, NSE India and Google
 * News so the browser can fetch market data without cross-origin / header
 * restrictions. Data-source endpoints are added incrementally in later build
 * steps; this file currently establishes the server, static hosting and a
 * health check.
 */
'use strict';

const path = require('path');
const express = require('express');

const cache = require('./lib/cache');
const yahoo = require('./lib/yahoo');
const td = require('./lib/twelvedata');
const nse = require('./lib/nse');
const mock = require('./lib/mock');
const news = require('./lib/news');
const screener = require('./lib/screener');
const symbols = require('./lib/symbols');

const app = express();
const PORT = process.env.PORT || 3000;

// Mock mode: 'off' = live only, 'on' = always synthetic, 'auto' = live first,
// fall back to synthetic when live fails (e.g. Yahoo IP rate-limits). Default
// 'auto' so the app is always demoable; mock responses are tagged mock:true.
const MOCK_MODE = (process.env.ESA_MOCK || 'auto').toLowerCase();

// Cache TTLs
const TTL = {
  history: 24 * 60 * 60 * 1000,     // historical candles change once/day
  fundamentals: 15 * 60 * 1000,     // live-ish fundamentals
  quote: 5 * 60 * 1000,             // live quote
  shareholding: 24 * 60 * 60 * 1000, // shareholding changes quarterly
  news: 30 * 60 * 1000,             // news feed
  search: 60 * 60 * 1000,           // symbol search results
};

// Build a live-quote object from Yahoo chart meta (fallback source).
async function yahooQuote(symbol) {
  const c = await yahoo.chart(symbol, { range: '5d', interval: '1d', events: '', proxy: true });
  const candles = c.candles || [];
  const lastC = candles[candles.length - 1] || null;
  const prevC = candles[candles.length - 2] || null;
  const last = c.meta.regularMarketPrice ?? (lastC && lastC.close);
  // Day change must be vs the PREVIOUS trading day's close — i.e. the
  // second-to-last daily candle — NOT chartPreviousClose (start of the range).
  const prev = (prevC && prevC.close != null) ? prevC.close : (c.meta.previousClose ?? null);
  const change = last != null && prev != null ? Math.round((last - prev) * 100) / 100 : null;
  return {
    symbol: nse.nseSymbol(symbol),
    source: 'yahoo',
    companyName: null,
    lastPrice: last,
    change,
    changePercent: prev ? Math.round((change / prev) * 10000) / 100 : null,
    open: lastC && lastC.open,
    dayHigh: lastC && lastC.high,
    dayLow: lastC && lastC.low,
    previousClose: prev,
    volume: lastC && lastC.volume,
    vwap: null,
    yearHigh: c.meta.fiftyTwoWeekHigh,
    yearLow: c.meta.fiftyTwoWeekLow,
    industry: null,
    lastUpdateTime: null,
  };
}

// Resolve data with the configured mock policy.
//   forceMock: caller passed ?mock=1
//   live():    async producer for real data
//   fake():    sync producer for synthetic data
async function resolve({ forceMock, live, fake }) {
  if (MOCK_MODE === 'on' || forceMock) return { data: fake(), mock: true };
  try {
    return { data: await live(), mock: false };
  } catch (err) {
    if (MOCK_MODE === 'auto') return { data: fake(), mock: true, fallbackReason: err.message };
    throw err;
  }
}
const wantsMock = (req) => req.query.mock === '1' || req.query.mock === 'true';

// Screener.in page (real revenue/profit + shareholding), fetched once per stock
// and shared by /financials and /shareholding. In-flight dedup avoids double
// fetches when both routes fire together on first load.
const screenerInflight = new Map();
async function getScreener(symbol) {
  const k = `screener:${symbol}`;
  const hit = cache.get(k);
  if (hit !== undefined) return hit;
  if (screenerInflight.has(symbol)) return screenerInflight.get(symbol);
  const p = screener.company(symbol)
    .then((d) => { cache.set(k, d, TTL.shareholding); screenerInflight.delete(symbol); return d; },
      (e) => { screenerInflight.delete(symbol); throw e; });
  screenerInflight.set(symbol, p);
  return p;
}

// Normalize a user ticker to a Yahoo symbol. Adds .NS (NSE) unless the caller
// already provided an exchange suffix or is querying an index (^...).
function toYahooSymbol(input) {
  const s = String(input || '').trim().toUpperCase();
  if (!s) return '';
  if (s.startsWith('^')) return s;                       // index, e.g. ^NSEI
  if (/\.(NS|BO)$/.test(s)) return s;                    // already suffixed
  return `${s}.NS`;
}

app.use(express.json());

// Lightweight request logger (dev-friendly, no dependency).
app.use((req, _res, next) => {
  const started = Date.now();
  const done = () => {
    // eslint-disable-next-line no-console
    console.log(`${req.method} ${req.originalUrl} — ${Date.now() - started}ms`);
  };
  _res.on('finish', done);
  next();
});

// --- API routes (populated in later build steps) --------------------------
const api = express.Router();

api.get('/health', async (req, res) => {
  const out = {
    ok: true, service: 'equity-stock-analyser', time: new Date().toISOString(),
    build: 'td1', tdEnabled: td.enabled(),
  };
  // /api/health?td=1 runs a one-off Twelve Data test to surface any error.
  if (req.query.td === '1' && td.enabled()) {
    try {
      const q = await td.quote('RELIANCE.NS');
      out.tdTest = { ok: true, price: q.lastPrice, name: q.companyName };
    } catch (e) { out.tdTest = { ok: false, error: e.message }; }
  }
  res.json(out);
});

// --- Search: curated autocomplete + fuzzy, optionally augmented with a live
//     Yahoo symbol search (covers EVERY listed stock). ?web=1 does the lookup.
// GET /api/search?q=rel[&web=1]
api.get('/search', async (req, res) => {
  const q = String(req.query.q || '');
  const local = symbols.search(q, 8);
  const result = { query: q, matches: local.matches, suggestion: local.suggestion };

  if (req.query.web === '1' && q.trim().length >= 2) {
    try {
      const key = `symsearch:${q.trim().toLowerCase()}`;
      const { data: web } = await cache.wrap(key, TTL.search, () => yahoo.searchSymbols(q));
      const seen = new Set(result.matches.map((m) => m.symbol.replace(/\.(NS|BO)$/, '').toUpperCase()));
      for (const w of web) {
        const bare = w.symbol.replace(/\.(NS|BO)$/, '').toUpperCase();
        if (seen.has(bare)) continue;                  // skip dups (prefer curated / NSE)
        seen.add(bare);
        // NSE stocks resolve from the bare ticker; keep .BO explicit for BSE-only.
        result.matches.push({ symbol: w.symbol.endsWith('.BO') ? w.symbol : bare, name: w.name, sector: w.exchange });
      }
      result.matches = result.matches.slice(0, 10);
      if (web.length) result.suggestion = null;        // real hits found; drop the "did you mean"
      result.web = true;
    } catch (_) { /* keep curated-only results */ }
  }
  res.json(result);
});

// --- Yahoo Finance: historical OHLCV + corporate-action events ------------
// GET /api/history?symbol=RELIANCE&range=10y&interval=1d&events=div,splits
api.get('/history', async (req, res) => {
  const symbol = toYahooSymbol(req.query.symbol);
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });

  const range = String(req.query.range || '10y');
  const interval = String(req.query.interval || '1d');
  const events = String(req.query.events || 'div,splits');
  const key = `history:${symbol}:${range}:${interval}:${events}`;

  try {
    const { data, cached, stale } = await cache.wrap(key, TTL.history, async () => {
      const r = await resolve({
        forceMock: wantsMock(req),
        live: async () => {
          // Prefer Twelve Data (real, unblocked) when a key is set; else Yahoo.
          if (td.enabled()) {
            try { return { ...(await td.chart(symbol, { range, interval })), _source: 'twelvedata' }; }
            catch (_) { /* fall through to Yahoo */ }
          }
          return { ...(await yahoo.chart(symbol, { range, interval, events, proxy: true })), _source: 'yahoo' };
        },
        fake: () => mock.chart(symbol, { range, interval }),
      });
      return { ...r.data, __mock: r.mock, __fallbackReason: r.fallbackReason };
    });
    const { __mock, __fallbackReason, _source, ...payload } = data;
    res.json({
      symbol, source: __mock ? 'mock' : (_source || 'yahoo'), mock: !!__mock,
      cached: !!cached, stale: !!stale, fallbackReason: __fallbackReason, ...payload,
    });
  } catch (err) {
    const rl = err && (err.rateLimited || /429/.test(err.message || ''));
    res.status(rl ? 429 : 502).json({
      error: rl ? 'rate_limited' : 'history_fetch_failed', symbol, message: err.message,
    });
  }
});

// --- Yahoo Finance: fundamentals -----------------------------------------
// GET /api/fundamentals?symbol=RELIANCE
api.get('/fundamentals', async (req, res) => {
  const symbol = toYahooSymbol(req.query.symbol);
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });

  const key = `fundamentals:${symbol}`;
  try {
    if (wantsMock(req)) { const d = mock.quoteSummary(symbol); return res.json({ symbol, source: 'mock', mock: true, ...d }); }
    const { data, cached } = await cache.wrap(key, TTL.fundamentals, async () => {
      // Build fundamentals from REAL sources only. Fields we can't get are left
      // null (frontend shows "—") — never fabricated.
      const out = { symbol, mock: false };
      try {
        const info = await yahoo.assetInfo(symbol);
        if (info) { out.name = info.name; out.sector = info.sector; out.industry = info.industry; }
      } catch (_) { /* ignore */ }
      try {
        const s = await getScreener(symbol);
        if (s.ratios) Object.assign(out, s.ratios); // marketCap, peRatio, ROE, ROCE, bookValue, dividendYield…
      } catch (_) { /* ratios unavailable */ }
      return out;
    });
    res.json({ source: 'real', cached: !!cached, asOf: new Date().toISOString(), ...data });
  } catch (err) {
    res.status(502).json({ error: 'fundamentals_fetch_failed', symbol, message: err.message });
  }
});

// --- News: Google News RSS (with mock fallback) --------------------------
// GET /api/news?symbol=RELIANCE
api.get('/news', async (req, res) => {
  const symbol = toYahooSymbol(req.query.symbol);
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });
  const dict = symbols.BY_SYMBOL.get(symbols.stripSuffix(symbol));
  const company = (dict && dict.name) || symbols.stripSuffix(symbol);
  const key = `news:${symbol}:${wantsMock(req) ? 'm' : 'l'}`;

  try {
    const { data, cached } = await cache.wrap(key, TTL.news, async () => {
      const r = await resolve({
        forceMock: wantsMock(req),
        live: async () => ({ items: await news.fetchGoogleNews(`${company} stock`, { limit: 40 }), query: company }),
        fake: () => mock.news(symbol),
      });
      return { ...r.data, __mock: r.mock };
    });
    const { __mock, items, ...rest } = data;
    res.json({
      symbol, company, source: __mock ? 'mock' : 'google-news', mock: !!__mock,
      cached: !!cached, count: (items || []).length, groups: news.groupByYear(items || []), ...rest,
    });
  } catch (err) {
    res.status(502).json({ error: 'news_fetch_failed', symbol, message: err.message });
  }
});

// --- Peer comparison: same-sector competitors ----------------------------
// GET /api/peers?symbol=RELIANCE
// Real metrics (P/E, market cap, ROCE) come from each peer's own Screener page.
async function peerRatios(bareSymbol, dictName) {
  try {
    const s = await getScreener(toYahooSymbol(bareSymbol));
    const r = s.ratios || {};
    const real = r.peRatio != null || r.marketCap != null || r.roce != null;
    return { symbol: bareSymbol, name: dictName || bareSymbol, peRatio: r.peRatio ?? null, marketCap: r.marketCap ?? null, roce: r.roce ?? null, mock: !real };
  } catch (_) {
    return { symbol: bareSymbol, name: dictName || bareSymbol, peRatio: null, marketCap: null, roce: null, mock: true };
  }
}

api.get('/peers', async (req, res) => {
  const symbol = toYahooSymbol(req.query.symbol);
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });
  const key = `peers:${symbol}`;

  try {
    const { data, cached } = await cache.wrap(key, TTL.fundamentals, async () => {
      // Sector: dictionary first, then real sector via Yahoo search.
      let sector = symbols.sectorOf(symbol);
      if (!sector) {
        try { const info = await yahoo.assetInfo(symbol); sector = info && info.sector; } catch (_) { /* ignore */ }
      }
      const self = symbols.stripSuffix(symbol);
      const dictSelf = symbols.BY_SYMBOL.get(self);
      const peerList = symbols.peers(symbol, 5, sector);

      // Fetch each company's real ratios (from its Screener page) in parallel.
      const rows = await Promise.all([
        peerRatios(self, dictSelf && dictSelf.name).then((r) => ({ ...r, isSelf: true })),
        ...peerList.map((p) => peerRatios(p.symbol, p.name).then((r) => ({ ...r, isSelf: false }))),
      ]);
      return { sector: sector || null, rows, source: 'screener' };
    });
    res.json({ symbol, cached: !!cached, ...data });
  } catch (err) {
    res.status(502).json({ error: 'peers_fetch_failed', symbol, message: err.message });
  }
});

// --- Revenue & profit trend: REAL from Screener.in, else "not available" --
// GET /api/financials?symbol=RELIANCE
api.get('/financials', async (req, res) => {
  const symbol = toYahooSymbol(req.query.symbol);
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });
  try {
    if (wantsMock(req)) { const d = mock.financials(symbol); return res.json({ symbol, source: 'mock', mock: true, ...d }); }
    let fin = null;
    try { const s = await getScreener(symbol); fin = s.financials; } catch (_) { /* unavailable */ }
    if (fin && fin.annual && fin.annual.length) {
      return res.json({ symbol, source: 'screener', mock: false, ...fin });
    }
    // No real data → honest "not available" (never fabricated numbers).
    return res.json({ symbol, source: 'unavailable', mock: false, available: false, annual: [], quarterly: [] });
  } catch (err) {
    res.status(502).json({ error: 'financials_fetch_failed', symbol, message: err.message });
  }
});

// --- NSE (with Yahoo/mock fallback): live quote --------------------------
// GET /api/quote?symbol=RELIANCE
api.get('/quote', async (req, res) => {
  const symbol = toYahooSymbol(req.query.symbol);
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });
  const key = `quote:${symbol}`;

  try {
    const { data, cached } = await cache.wrap(key, TTL.quote, async () => {
      if (MOCK_MODE === 'on' || wantsMock(req)) {
        return { ...mock.quote(symbol), mock: true };
      }
      // 1) Twelve Data  2) NSE  3) Yahoo  4) mock (auto only)
      if (td.enabled()) {
        try { return { ...(await td.quote(symbol)), mock: false }; } catch (_) { /* fall through */ }
      }
      try {
        return { ...(await nse.quote(symbol)), mock: false };
      } catch (nseErr) {
        try {
          return { ...(await yahooQuote(symbol)), mock: false, fallbackFrom: 'nse', fallbackReason: nseErr.message };
        } catch (yErr) {
          if (MOCK_MODE === 'auto') {
            return { ...mock.quote(symbol), mock: true, fallbackReason: yErr.message };
          }
          throw yErr;
        }
      }
    });
    res.json({ cached: !!cached, asOf: new Date().toISOString(), ...data });
  } catch (err) {
    const rl = err && (err.rateLimited || /429/.test(err.message || ''));
    res.status(rl ? 429 : 502).json({ error: rl ? 'rate_limited' : 'quote_fetch_failed', symbol, message: err.message });
  }
});

// --- Shareholding: REAL from Screener.in, else "not available" -----------
// GET /api/shareholding?symbol=RELIANCE
api.get('/shareholding', async (req, res) => {
  const symbol = toYahooSymbol(req.query.symbol);
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });
  try {
    if (wantsMock(req)) { const d = mock.shareholding(symbol); return res.json({ symbol, source: 'mock', mock: true, available: true, ...d }); }
    let shp = null;
    try { const s = await getScreener(symbol); shp = s.shareholding; } catch (_) { /* unavailable */ }
    if (shp && shp.quarters && shp.quarters.length) {
      return res.json({ symbol, source: 'screener', mock: false, available: true, ...shp });
    }
    return res.json({ symbol, source: 'unavailable', mock: false, available: false });
  } catch (err) {
    res.status(502).json({ error: 'shareholding_fetch_failed', symbol, message: err.message });
  }
});

app.use('/api', api);

// --- Static frontend ------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback: serve the app shell for any non-API GET.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Equity Stock Analyser running at http://localhost:${PORT}`);
});
