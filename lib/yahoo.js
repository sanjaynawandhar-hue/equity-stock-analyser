/**
 * Yahoo Finance client.
 *
 *  - chart():        v8 chart endpoint — OHLCV candles + dividend/split events.
 *  - quoteSummary(): v10 endpoint — fundamentals (P/E, EPS, ROE, market cap…).
 *
 * The v10 endpoint now requires a crumb + matching cookie; we lazily obtain and
 * cache a session, refreshing on 401/403. The v8 chart endpoint works without a
 * crumb, so historical data keeps working even if the crumb flow breaks.
 */
'use strict';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const BASES = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];

let session = null; // { cookie, crumb, ts }
const SESSION_TTL = 30 * 60 * 1000;

async function ensureSession(force = false) {
  if (!force && session && Date.now() - session.ts < SESSION_TTL) return session;

  // 1) Grab a cookie from Yahoo.
  let cookie = '';
  try {
    const res = await fetch('https://fc.yahoo.com/', {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      redirect: 'manual',
    });
    cookie = collectCookies(res);
  } catch (_) { /* try consent host below */ }

  if (!cookie) {
    try {
      const res = await fetch('https://finance.yahoo.com/', {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
      });
      cookie = collectCookies(res);
    } catch (_) { /* proceed crumb-less */ }
  }

  // 2) Exchange the cookie for a crumb.
  let crumb = '';
  try {
    const res = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, Accept: 'text/plain', Cookie: cookie },
    });
    crumb = (await res.text()).trim();
    if (crumb.includes('<') || crumb.length > 40) crumb = ''; // got HTML, not a crumb
  } catch (_) { /* proceed crumb-less */ }

  session = { cookie, crumb, ts: Date.now() };
  return session;
}

function collectCookies(res) {
  // Node fetch exposes multiple Set-Cookie via getSetCookie() (undici).
  const list =
    (res.headers.getSetCookie && res.headers.getSetCookie()) ||
    (res.headers.raw && res.headers.raw()['set-cookie']) ||
    [];
  return list.map((c) => c.split(';')[0]).join('; ');
}

// Public reader proxy — fetches from its own (unblocked) servers and returns
// the page text. Lets us reach Yahoo's chart API even when our egress IP is
// rate-limited. Used only for non-crumb endpoints (charts).
const READER_PROXY = 'https://r.jina.ai/';

function buildUrl(base, pathAndQuery, sess, withCrumb) {
  let url = base + pathAndQuery;
  if (withCrumb && sess && sess.crumb) {
    url += (url.includes('?') ? '&' : '?') + 'crumb=' + encodeURIComponent(sess.crumb);
  }
  return url;
}
function directHeaders(sess) {
  return {
    'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://finance.yahoo.com/', Origin: 'https://finance.yahoo.com',
    ...(sess && sess.cookie ? { Cookie: sess.cookie } : {}),
  };
}
// Pull the JSON object out of the proxy's text response (it may prepend a
// "Markdown Content:" header and append trailing text).
function extractJson(text) {
  const s = text.indexOf('{');
  if (s < 0) return null;
  const body = text.slice(s).trim();
  try { return JSON.parse(body); } catch (_) { /* try trimming trailing */ }
  const e = body.lastIndexOf('}');
  if (e > 0) { try { return JSON.parse(body.slice(0, e + 1)); } catch (_) {} }
  return null;
}

async function yfetch(pathAndQuery, { withCrumb = false, proxy = false } = {}) {
  let lastErr;

  // --- 1) Direct (fast; our server IP is usually 429'd, but cheap to try) ---
  for (let attempt = 0; attempt < (withCrumb ? 2 : 1); attempt++) {
    const sess = await ensureSession(attempt > 0);
    for (const base of BASES) {
      const url = buildUrl(base, pathAndQuery, sess, withCrumb);
      try {
        const res = await fetch(url, { headers: directHeaders(sess) });
        if (res.status === 401 || res.status === 403) { lastErr = new Error(`Yahoo ${res.status}`); break; }
        if (res.status === 429) { lastErr = new Error('Yahoo 429'); lastErr.rateLimited = true; continue; }
        if (!res.ok) { lastErr = new Error(`Yahoo ${res.status}`); continue; }
        return await res.json();
      } catch (err) { lastErr = err; }
    }
  }

  // --- 2) Proxy fallback — bypasses the IP block (charts only) ---
  if (proxy) {
    const sess = await ensureSession();
    for (const base of BASES) {
      const url = buildUrl(base, pathAndQuery, sess, withCrumb);
      try {
        const res = await fetch(READER_PROXY + url, {
          headers: { 'User-Agent': UA, Accept: 'text/plain' },
          signal: AbortSignal.timeout(35000),
        });
        if (!res.ok) { lastErr = new Error(`proxy ${res.status}`); continue; }
        const json = extractJson(await res.text());
        if (json) return json;
        lastErr = new Error('proxy returned no JSON');
      } catch (err) { lastErr = err; }
    }
  }

  throw lastErr || new Error('Yahoo request failed');
}

/** Symbol search (autocomplete over ALL listed stocks). Indian listings only.
 *  Uses the reader proxy so it works even when the direct IP is blocked. */
async function searchSymbols(query) {
  const q = `/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=12&newsCount=0&listsCount=0&enableFuzzyQuery=true`;
  const json = await yfetch(q, { proxy: true });
  const quotes = (json && json.quotes) || [];
  const out = [];
  for (const x of quotes) {
    const sym = x.symbol || '';
    if (!/\.(NS|BO)$/.test(sym)) continue;                       // Indian NSE/BSE only
    const type = x.quoteType || 'EQUITY';
    if (!['EQUITY', 'ETF', 'INDEX', 'MUTUALFUND'].includes(type)) continue;
    out.push({
      symbol: sym,
      name: x.shortname || x.longname || sym.replace(/\.(NS|BO)$/, ''),
      exchange: sym.endsWith('.BO') ? 'BSE' : 'NSE',
    });
  }
  return out;
}

/** Historical OHLCV + corporate-action events. `proxy` enables the reader
 *  proxy fallback so charts work even when the direct IP is rate-limited. */
async function chart(symbol, { range = '10y', interval = '1d', events = 'div,splits', proxy = false } = {}) {
  const q = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}` +
    `&interval=${interval}&events=${events}&includeAdjustedClose=true`;
  const json = await yfetch(q, { proxy });
  const result = json && json.chart && json.chart.result && json.chart.result[0];
  if (!result) {
    const msg = json && json.chart && json.chart.error && json.chart.error.description;
    throw new Error(msg || `No chart data for ${symbol}`);
  }
  return normalizeChart(result);
}

function normalizeChart(result) {
  const ts = result.timestamp || [];
  const q = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
  const adj = (result.indicators && result.indicators.adjclose && result.indicators.adjclose[0]) || {};

  const candles = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open ? q.open[i] : null;
    const c = q.close ? q.close[i] : null;
    if (o == null || c == null) continue; // skip holidays / missing points
    candles.push({
      time: ts[i],                       // unix seconds
      open: round(o),
      high: round(q.high ? q.high[i] : null),
      low: round(q.low ? q.low[i] : null),
      close: round(c),
      adjclose: round(adj.adjclose ? adj.adjclose[i] : null),
      volume: q.volume ? q.volume[i] : null,
    });
  }

  const ev = result.events || {};
  const dividends = Object.values(ev.dividends || {}).map((d) => ({
    time: d.date, amount: round(d.amount),
  }));
  const splits = Object.values(ev.splits || {}).map((s) => ({
    time: s.date, ratio: `${s.numerator}:${s.denominator}`,
    numerator: s.numerator, denominator: s.denominator,
  }));

  return {
    meta: {
      symbol: result.meta.symbol,
      currency: result.meta.currency,
      exchange: result.meta.exchangeName,
      instrumentType: result.meta.instrumentType,
      regularMarketPrice: result.meta.regularMarketPrice,
      previousClose: result.meta.chartPreviousClose ?? result.meta.previousClose,
      fiftyTwoWeekHigh: result.meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: result.meta.fiftyTwoWeekLow,
      firstTradeDate: result.meta.firstTradeDate,
      gmtoffset: result.meta.gmtoffset,
      timezone: result.meta.timezone,
    },
    candles,
    dividends: dividends.sort((a, b) => a.time - b.time),
    splits: splits.sort((a, b) => a.time - b.time),
  };
}

const SUMMARY_MODULES = [
  'price',
  'summaryDetail',
  'defaultKeyStatistics',
  'financialData',
  'assetProfile',
  'summaryProfile',
];

/** Fundamentals via quoteSummary. */
async function quoteSummary(symbol, modules = SUMMARY_MODULES) {
  const q = `/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules.join(',')}`;
  const json = await yfetch(q, { withCrumb: true });
  const result = json && json.quoteSummary && json.quoteSummary.result && json.quoteSummary.result[0];
  if (!result) {
    const msg = json && json.quoteSummary && json.quoteSummary.error;
    throw new Error((msg && (msg.description || msg)) || `No fundamentals for ${symbol}`);
  }
  return normalizeSummary(result);
}

// Yahoo wraps numbers as { raw, fmt, longFmt }. Unwrap to raw.
const raw = (v) => (v && typeof v === 'object' && 'raw' in v ? v.raw : (v ?? null));

function normalizeSummary(r) {
  const price = r.price || {};
  const sd = r.summaryDetail || {};
  const ks = r.defaultKeyStatistics || {};
  const fd = r.financialData || {};
  const prof = r.assetProfile || r.summaryProfile || {};

  return {
    name: price.longName || price.shortName || null,
    symbol: price.symbol || null,
    exchange: price.exchangeName || null,
    currency: price.currency || null,
    quoteType: price.quoteType || null,

    price: raw(price.regularMarketPrice),
    previousClose: raw(price.regularMarketPreviousClose) ?? raw(sd.previousClose),
    change: raw(price.regularMarketChange),
    changePercent: raw(price.regularMarketChangePercent),
    dayHigh: raw(sd.dayHigh),
    dayLow: raw(sd.dayLow),
    open: raw(price.regularMarketOpen),
    volume: raw(price.regularMarketVolume) ?? raw(sd.volume),
    marketCap: raw(price.marketCap) ?? raw(sd.marketCap),

    beta: raw(sd.beta) ?? raw(ks.beta),
    peRatio: raw(sd.trailingPE),
    forwardPE: raw(sd.forwardPE),
    eps: raw(ks.trailingEps),
    pegRatio: raw(ks.pegRatio),
    priceToBook: raw(ks.priceToBook),
    dividendYield: raw(sd.dividendYield),
    dividendRate: raw(sd.dividendRate),
    fiftyTwoWeekHigh: raw(sd.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: raw(sd.fiftyTwoWeekLow),

    // financialData (ratios are fractions, e.g. ROE 0.18 = 18%)
    returnOnEquity: raw(fd.returnOnEquity),
    returnOnAssets: raw(fd.returnOnAssets),
    debtToEquity: raw(fd.debtToEquity),
    profitMargins: raw(fd.profitMargins),
    revenueGrowth: raw(fd.revenueGrowth),
    earningsGrowth: raw(fd.earningsGrowth),
    totalRevenue: raw(fd.totalRevenue),
    grossMargins: raw(fd.grossMargins),
    operatingMargins: raw(fd.operatingMargins),
    currentRatio: raw(fd.currentRatio),

    sector: prof.sector || null,
    industry: prof.industry || null,
    website: prof.website || null,
    longBusinessSummary: prof.longBusinessSummary || null,
    fullTimeEmployees: prof.fullTimeEmployees || null,
    country: prof.country || null,
  };
}

/** Revenue & profit history (annual + quarterly) for the trend chart. */
async function financials(symbol) {
  const modules = ['earnings', 'incomeStatementHistory', 'incomeStatementHistoryQuarterly'];
  const q = `/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules.join(',')}`;
  const json = await yfetch(q, { withCrumb: true });
  const result = json && json.quoteSummary && json.quoteSummary.result && json.quoteSummary.result[0];
  if (!result) throw new Error(`No financials for ${symbol}`);
  return normalizeFinancials(result);
}

function normalizeFinancials(r) {
  const annual = [];
  const quarterly = [];

  // Preferred: the compact earnings.financialsChart (revenue + earnings/profit).
  const fc = r.earnings && r.earnings.financialsChart;
  if (fc) {
    (fc.yearly || []).forEach((y) => annual.push({ period: String(y.date), revenue: raw(y.revenue), profit: raw(y.earnings) }));
    (fc.quarterly || []).forEach((q) => quarterly.push({ period: String(q.date), revenue: raw(q.revenue), profit: raw(q.earnings) }));
  }

  // Fallback / extend from full income statements (deeper history).
  if (!annual.length && r.incomeStatementHistory) {
    (r.incomeStatementHistory.incomeStatementHistory || []).forEach((s) => {
      const yr = s.endDate && s.endDate.fmt ? s.endDate.fmt.slice(0, 4) : null;
      annual.push({ period: yr, revenue: raw(s.totalRevenue), profit: raw(s.netIncome) });
    });
    annual.reverse(); // Yahoo lists most-recent first
  }
  if (!quarterly.length && r.incomeStatementHistoryQuarterly) {
    (r.incomeStatementHistoryQuarterly.incomeStatementHistory || []).forEach((s) => {
      const p = s.endDate && s.endDate.fmt ? s.endDate.fmt : null;
      quarterly.push({ period: p, revenue: raw(s.totalRevenue), profit: raw(s.netIncome) });
    });
    quarterly.reverse();
  }

  return { annual: annual.filter((a) => a.revenue != null), quarterly: quarterly.filter((q) => q.revenue != null) };
}

function round(n) {
  if (n == null || Number.isNaN(n)) return null;
  return Math.round(n * 100) / 100;
}

module.exports = {
  chart, quoteSummary, financials, searchSymbols, ensureSession, SUMMARY_MODULES,
  // exported for offline unit tests
  _normalizeChart: normalizeChart, _normalizeSummary: normalizeSummary,
};
