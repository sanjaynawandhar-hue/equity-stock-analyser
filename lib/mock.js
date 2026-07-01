/**
 * Deterministic mock data generator.
 *
 * Produces realistic-looking (but synthetic) OHLCV history, corporate actions
 * and fundamentals so the app is fully demoable/testable when the live sources
 * are unreachable (e.g. Yahoo IP rate-limits). Everything is seeded from the
 * symbol so repeated calls are stable and cache-friendly.
 *
 * Responses are always tagged `mock:true` upstream so the UI can show a clear
 * "demo data" indicator — this is never passed off as live data.
 */
'use strict';

const symbols = require('./symbols'); // real names/sectors for known tickers

// --- Seeded PRNG (mulberry32) --------------------------------------------
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Per-symbol "personality" (start price, drift, vol, profile) ----------
const PROFILES = {
  'RELIANCE.NS': { name: 'Reliance Industries Limited', start: 520, drift: 0.00042, vol: 0.016, sector: 'Energy', industry: 'Oil & Gas Refining & Marketing', pe: 24.6, eps: 61.9, beta: 0.42, roe: 0.089, de: 44.2 },
  'TCS.NS': { name: 'Tata Consultancy Services Limited', start: 1250, drift: 0.00038, vol: 0.014, sector: 'Technology', industry: 'Information Technology Services', pe: 28.1, eps: 132.4, beta: 0.68, roe: 0.51, de: 9.1 },
  'INFY.NS': { name: 'Infosys Limited', start: 480, drift: 0.00036, vol: 0.015, sector: 'Technology', industry: 'Information Technology Services', pe: 25.3, eps: 63.8, beta: 0.74, roe: 0.31, de: 8.4 },
  'HDFCBANK.NS': { name: 'HDFC Bank Limited', start: 520, drift: 0.00035, vol: 0.015, sector: 'Financial Services', industry: 'Banks - Regional', pe: 19.7, eps: 87.6, beta: 0.85, roe: 0.17, de: 0 },
  'ICICIBANK.NS': { name: 'ICICI Bank Limited', start: 220, drift: 0.00045, vol: 0.017, sector: 'Financial Services', industry: 'Banks - Regional', pe: 18.2, eps: 63.4, beta: 0.92, roe: 0.18, de: 0 },
  'INFY.BO': { name: 'Infosys Limited', start: 480, drift: 0.00036, vol: 0.015, sector: 'Technology', industry: 'Information Technology Services', pe: 25.3, eps: 63.8, beta: 0.74, roe: 0.31, de: 8.4 },
  '^NSEI': { name: 'NIFTY 50', start: 7500, drift: 0.00040, vol: 0.011, sector: null, industry: null, pe: 22.4, eps: null, beta: 1.0, roe: null, de: null, index: true },
};

function profileFor(symbol) {
  if (PROFILES[symbol]) return PROFILES[symbol];
  // Generic but stable profile for any other ticker.
  const rnd = mulberry32(hashSeed(symbol));
  const base = 100 + Math.floor(rnd() * 1900);
  const nice = symbol.replace(/\.(NS|BO)$/, '');
  const dict = symbols.BY_SYMBOL.get(nice); // real name/sector when it's a known ticker
  return {
    name: dict ? dict.name : `${nice} Ltd`,
    start: base,
    drift: 0.0002 + rnd() * 0.0004,
    vol: 0.012 + rnd() * 0.01,
    sector: dict ? dict.sector : ['Energy', 'Technology', 'Financial Services', 'Consumer Cyclical', 'Healthcare', 'Industrials'][Math.floor(rnd() * 6)],
    industry: 'Diversified',
    pe: 12 + rnd() * 30,
    eps: 10 + rnd() * 90,
    beta: 0.5 + rnd() * 0.9,
    roe: 0.08 + rnd() * 0.3,
    de: rnd() * 60,
  };
}

const DAY = 86400;

function rangeToDays(range) {
  const m = /^(\d+)(y|mo|d|wk)$/.exec(String(range));
  if (!m) return 3650;
  const n = +m[1];
  return { y: n * 365, mo: n * 30, wk: n * 7, d: n }[m[2]] || 3650;
}
function intervalToDays(interval) {
  return { '1d': 1, '1wk': 7, '1mo': 30 }[interval] || 1;
}

// --- Mock chart ----------------------------------------------------------
function chart(symbol, { range = '10y', interval = '1d' } = {}) {
  const p = profileFor(symbol);
  const rnd = mulberry32(hashSeed(symbol + ':' + range + ':' + interval));

  const now = Math.floor(Date.now() / 1000);
  const totalDays = rangeToDays(range);
  const step = intervalToDays(interval);
  const startTs = now - totalDays * DAY;

  const candles = [];
  let price = p.start;
  for (let d = 0; d <= totalDays; d += step) {
    const ts = startTs + d * DAY;
    const date = new Date(ts * 1000);
    // Skip weekends for daily granularity to look realistic.
    if (step === 1 && (date.getUTCDay() === 0 || date.getUTCDay() === 6)) continue;

    const shock = (rnd() - 0.5) * 2;
    const ret = p.drift * step + p.vol * Math.sqrt(step) * shock;
    const open = price;
    price = Math.max(1, price * (1 + ret));
    const close = price;
    const hi = Math.max(open, close) * (1 + rnd() * 0.012);
    const lo = Math.min(open, close) * (1 - rnd() * 0.012);
    const vol = Math.floor((p.index ? 0 : 1) * (500000 + rnd() * 6000000));
    candles.push({
      time: ts,
      open: round(open), high: round(hi), low: round(lo),
      close: round(close), adjclose: round(close),
      volume: p.index ? null : vol,
    });
  }

  // Corporate actions (skip for index).
  const dividends = [];
  const splits = [];
  if (!p.index && candles.length) {
    const firstTs = candles[0].time;
    const years = Math.ceil(totalDays / 365);
    for (let y = 1; y <= years; y++) {
      const ts = firstTs + y * 365 * DAY - 45 * DAY;
      if (ts < now) dividends.push({ time: ts, amount: round(3 + rnd() * 9) });
    }
    // One split roughly mid-history for some symbols.
    if (rnd() > 0.5) {
      const ts = firstTs + Math.floor(totalDays * 0.55) * DAY;
      splits.push({ time: ts, ratio: '2:1', numerator: 2, denominator: 1 });
    }
  }

  const last = candles[candles.length - 1] || { close: p.start };
  const prev = candles[candles.length - 2] || last;
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  return {
    meta: {
      symbol,
      currency: 'INR',
      exchange: symbol.endsWith('.BO') ? 'BSE' : (p.index ? 'NSI' : 'NSI'),
      instrumentType: p.index ? 'INDEX' : 'EQUITY',
      regularMarketPrice: last.close,
      previousClose: prev.close,
      fiftyTwoWeekHigh: round(Math.max(...highs.slice(-252))),
      fiftyTwoWeekLow: round(Math.min(...lows.slice(-252))),
      firstTradeDate: candles.length ? candles[0].time : startTs,
      gmtoffset: 19800,
      timezone: 'IST',
    },
    candles,
    dividends,
    splits,
  };
}

// --- Mock fundamentals ---------------------------------------------------
function quoteSummary(symbol) {
  const p = profileFor(symbol);
  const c = chart(symbol, { range: '1y', interval: '1d' });
  const price = c.meta.regularMarketPrice;
  const prev = c.meta.previousClose;
  const change = round(price - prev);
  const shares = 6_000_000_000; // rough
  return {
    name: p.name,
    symbol,
    exchange: c.meta.exchange,
    currency: 'INR',
    quoteType: p.index ? 'INDEX' : 'EQUITY',

    price,
    previousClose: prev,
    change,
    changePercent: prev ? change / prev : 0,
    dayHigh: round(price * 1.01),
    dayLow: round(price * 0.99),
    open: prev,
    volume: p.index ? null : Math.floor(2_000_000 + Math.random() * 4_000_000),
    marketCap: p.index ? null : Math.round(price * shares),

    beta: p.beta,
    peRatio: round(p.pe),
    forwardPE: round(p.pe * 0.9),
    eps: p.eps,
    pegRatio: round(1.2 + (p.pe / 100)),
    priceToBook: round(2 + (p.roe || 0.1) * 5),
    dividendYield: p.index ? null : round(0.004 + (1 / p.pe) * 0.05, 4),
    dividendRate: p.index ? null : round(price * 0.005),
    fiftyTwoWeekHigh: c.meta.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: c.meta.fiftyTwoWeekLow,

    returnOnEquity: p.roe,
    returnOnAssets: p.roe != null ? round(p.roe * 0.4, 4) : null,
    debtToEquity: p.de,
    profitMargins: round(0.08 + (p.roe || 0.1) * 0.3, 4),
    revenueGrowth: round(0.05 + Math.random() * 0.15, 4),
    earningsGrowth: round(0.05 + Math.random() * 0.2, 4),
    totalRevenue: p.index ? null : Math.round(price * shares * 0.45),
    grossMargins: round(0.3 + Math.random() * 0.2, 4),
    operatingMargins: round(0.15 + Math.random() * 0.15, 4),
    currentRatio: round(1 + Math.random() * 1.5, 2),

    sector: p.sector,
    industry: p.industry,
    website: null,
    longBusinessSummary: p.index
      ? 'The NIFTY 50 is a benchmark Indian stock market index representing the weighted average of 50 of the largest Indian companies listed on the NSE.'
      : `${p.name} is a leading company operating in the ${p.sector} sector. (Demo profile — synthetic data.)`,
    fullTimeEmployees: p.index ? null : Math.floor(5000 + Math.random() * 200000),
    country: 'India',
  };
}

// --- Mock live quote (NSE-shaped) ----------------------------------------
function quote(symbol) {
  const p = profileFor(symbol);
  const c = chart(symbol, { range: '1y', interval: '1d' });
  const last = c.meta.regularMarketPrice;
  const prev = c.meta.previousClose;
  const change = round(last - prev);
  return {
    symbol: symbol.replace(/\.(NS|BO)$/, ''),
    source: 'mock',
    companyName: p.name,
    lastPrice: last,
    change,
    changePercent: prev ? round((change / prev) * 100, 2) : 0,
    open: prev,
    dayHigh: round(last * 1.012),
    dayLow: round(last * 0.988),
    previousClose: prev,
    vwap: round((last + prev) / 2),
    yearHigh: c.meta.fiftyTwoWeekHigh,
    yearLow: c.meta.fiftyTwoWeekLow,
    industry: p.industry,
    lastUpdateTime: new Date().toISOString(),
  };
}

// --- Mock shareholding pattern (recent quarters) -------------------------
function shareholding(symbol) {
  const p = profileFor(symbol);
  const rnd = mulberry32(hashSeed('shp:' + symbol));

  // Banks/financials typically have zero promoter holding; others high.
  const isBank = p.sector === 'Financial Services';
  let promoter = isBank ? 0 : 45 + rnd() * 25; // 45-70%
  const quarters = [];
  const now = new Date();
  const labels = [];
  for (let i = 3; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i * 3, 1);
    const q = Math.floor(d.getMonth() / 3) + 1;
    labels.push(`Q${q} ${d.getFullYear()}`);
  }

  for (let i = 0; i < labels.length; i++) {
    // Slight quarter-over-quarter drift (banks stay promoter-less).
    promoter = isBank ? 0 : clamp(promoter + (rnd() - 0.5) * 1.5, 40, 75);
    const remaining = 100 - promoter;
    const fii = clamp(remaining * (0.35 + (rnd() - 0.5) * 0.06), 0, remaining);
    const dii = clamp(remaining * (0.28 + (rnd() - 0.5) * 0.06), 0, remaining - fii);
    const publicPct = Math.max(0, remaining - fii - dii);
    quarters.push({
      quarter: labels[i],
      promoter: round(promoter, 2),
      fii: round(fii, 2),
      dii: round(dii, 2),
      public: round(publicPct, 2),
    });
  }

  const first = quarters[0].promoter;
  const latest = quarters[quarters.length - 1].promoter;
  const trend = latest > first + 0.3 ? 'rising' : latest < first - 0.3 ? 'falling' : 'stable';

  return { symbol: symbol.replace(/\.(NS|BO)$/, ''), source: 'mock', quarters, promoterTrend: trend };
}

// --- Mock revenue & profit (annual 10y + quarterly 8q) -------------------
function financials(symbol) {
  const p = profileFor(symbol);
  const rnd = mulberry32(hashSeed('fin:' + symbol));
  const nowYear = new Date().getFullYear();

  // Base annual revenue scaled loosely off price; grow with noise.
  let revenue = (p.index ? 400000 : 20000 + rnd() * 180000); // ₹ Cr order via *1e7 below
  let margin = 0.08 + rnd() * 0.14;

  const annual = [];
  for (let y = 9; y >= 0; y--) {
    const year = nowYear - y - 1;
    revenue = revenue * (1 + 0.04 + rnd() * 0.14);          // 4–18% YoY
    margin = clamp(margin + (rnd() - 0.5) * 0.02, 0.05, 0.28);
    annual.push({ period: String(year), revenue: Math.round(revenue * 1e7), profit: Math.round(revenue * margin * 1e7) });
  }

  // Last 8 quarters derived from the latest annual run-rate.
  const quarterly = [];
  let qRev = annual[annual.length - 1].revenue / 4;
  for (let i = 7; i >= 0; i--) {
    const d = new Date(nowYear, new Date().getMonth() - i * 3, 1);
    const q = Math.floor(d.getMonth() / 3) + 1;
    qRev = qRev * (1 + 0.005 + (rnd() - 0.4) * 0.06);
    quarterly.push({ period: `Q${q} ${d.getFullYear()}`, revenue: Math.round(qRev), profit: Math.round(qRev * margin) });
  }

  return { annual, quarterly, source: 'mock' };
}

// --- Mock news (spread across ~10 years of "major events") ---------------
const NEWS_TEMPLATES = [
  ['{C} reports record quarterly profit, beats street estimates', 'Economic Times', 'Strong operating margins and revenue growth drove the beat.'],
  ['{C} board approves dividend and bonus issue', 'Mint', 'The company rewarded shareholders after a robust financial year.'],
  ['Brokerages raise target price on {C} citing growth outlook', 'Moneycontrol', 'Analysts turned bullish on medium-term earnings visibility.'],
  ['{C} announces major capex expansion plan', 'Business Standard', 'The investment aims to scale capacity over the coming years.'],
  ['{C} shares hit fresh 52-week high on strong volumes', 'Livemint', 'Buying interest picked up amid positive sector momentum.'],
  ['{C} completes strategic acquisition to boost market share', 'Reuters', 'The deal strengthens the company\'s competitive positioning.'],
  ['FIIs increase stake in {C}, shareholding data shows', 'CNBC-TV18', 'Foreign investors raised holdings over the latest quarter.'],
  ['{C} faces regulatory scrutiny; management issues clarification', 'The Hindu BusinessLine', 'The company said it remains compliant with all norms.'],
  ['{C} launches new product line to tap emerging demand', 'Financial Express', 'The move diversifies the revenue base.'],
  ['{C} stock corrects after weak guidance despite profit growth', 'ET Markets', 'Investors reacted to cautious near-term commentary.'],
];

function news(symbol) {
  const p = profileFor(symbol);
  const company = (p.name || symbol.replace(/\.(NS|BO)$/, '')).replace(/ (Limited|Ltd)\.?$/i, '');
  const rnd = mulberry32(hashSeed('news:' + symbol));
  const now = Date.now();
  const items = [];
  // ~2 items per year for 10 years + a few recent.
  for (let y = 0; y < 10; y++) {
    const perYear = 1 + Math.floor(rnd() * 2);
    for (let k = 0; k < perYear; k++) {
      const tmpl = NEWS_TEMPLATES[Math.floor(rnd() * NEWS_TEMPLATES.length)];
      const daysAgo = y * 365 + Math.floor(rnd() * 360);
      const d = new Date(now - daysAgo * 86400000);
      items.push({
        title: tmpl[0].replace('{C}', company),
        source: tmpl[1],
        link: 'https://news.google.com/search?q=' + encodeURIComponent(company),
        date: d.toISOString(),
        year: d.getUTCFullYear(),
        summary: tmpl[2],
      });
    }
  }
  items.sort((a, b) => new Date(b.date) - new Date(a.date));
  return { items, source: 'mock', query: company };
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function round(n, dp = 2) {
  if (n == null || Number.isNaN(n)) return null;
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

module.exports = { chart, quoteSummary, quote, shareholding, financials, news, profileFor };
