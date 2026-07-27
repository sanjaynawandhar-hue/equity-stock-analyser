/**
 * Screener.in client — fetches the company page DIRECTLY (a plain User-Agent
 * works; no proxy, no rate limits) and parses the HTML for REAL:
 *   - annual revenue & net profit (Profit & Loss table)
 *   - shareholding pattern over recent quarters
 *   - top ratios (market cap, P/E, ROE, ROCE, book value, dividend yield)
 *
 * Row labels are present in the HTML, so parsing anchors on them. Peers are
 * loaded by JS on Screener, so they're not available here — callers fall back
 * to the dictionary for peer names. Returns null for anything it can't confidently
 * extract; callers then show an honest "not available" state.
 */
'use strict';

const UA = 'Mozilla/5.0';

const stripTags = (s) => String(s || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8377;|₹/g, '')
  .replace(/\s+/g, ' ').trim();
const cleanNum = (s) => {
  if (s == null) return null;
  const m = /-?[\d,]+(?:\.\d+)?/.exec(String(s).replace(/,/g, (x) => x)); // keep commas for now
  if (!m) return null;
  const n = parseFloat(m[0].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};
const round = (n) => (n == null ? null : Math.round(n * 100) / 100);

// Content of <section id="X"> … </section>.
function sectionHtml(html, id) {
  const m = new RegExp(`id="${id}"[\\s\\S]*?</section>`, 'i').exec(html);
  return m ? m[0] : '';
}
// Rows of the first <table> in a chunk, each as an array of cell texts.
function tableRows(chunk) {
  const t = /<table[\s\S]*?<\/table>/i.exec(chunk);
  if (!t) return [];
  return [...t[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((r) => [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => stripTags(c[1])));
}
const isYear = (s) => /^[A-Za-z]{3}\s*\d{4}$/.test(s);

async function fetchPage(symbol) {
  const sym = String(symbol).replace(/\.(NS|BO)$/, '').toUpperCase();
  let lastErr;
  for (const suffix of ['consolidated/', '']) {
    try {
      const res = await fetch(`https://www.screener.in/company/${encodeURIComponent(sym)}/${suffix}`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) { lastErr = new Error(`screener ${res.status}`); continue; }
      const html = await res.text();
      if (/id="shareholding"/i.test(html)) return html;
      lastErr = new Error('screener: not a company page');
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('screener unavailable');
}

/** Annual revenue & net profit from the Profit & Loss table. */
function parseFinancials(html) {
  const rows = tableRows(sectionHtml(html, 'profit-loss'));
  if (!rows.length) return null;
  const header = rows.find((r) => (r[0] === '' || !r[0]) && r.slice(1).some(isYear));
  if (!header) return null;
  const findRow = (re) => rows.find((r) => re.test(r[0] || ''));
  const salesRow = findRow(/^Sales\b/i) || findRow(/^Revenue\b/i);
  const profitRow = findRow(/^Net Profit\b/i);
  if (!salesRow) return null;

  const periods = header.slice(1);
  const annual = [];
  for (let i = 0; i < periods.length; i++) {
    if (!isYear(periods[i])) continue;
    const rev = cleanNum(salesRow[i + 1]);
    const profit = profitRow ? cleanNum(profitRow[i + 1]) : null;
    const year = (periods[i].match(/(\d{4})/) || [])[1];
    if (rev != null && year) annual.push({ period: year, revenue: Math.round(rev * 1e7), profit: profit == null ? null : Math.round(profit * 1e7) });
  }
  return annual.length >= 3 ? { annual, quarterly: [], source: 'screener' } : null;
}

/** Shareholding pattern over recent quarters. */
function parseShareholding(html) {
  const rows = tableRows(sectionHtml(html, 'shareholding'));
  if (!rows.length) return null;
  const header = rows.find((r) => (r[0] === '' || !r[0]) && r.slice(1).some(isYear));
  if (!header) return null;
  const findRow = (re) => rows.find((r) => re.test(r[0] || ''));
  const prom = findRow(/^Promoter/i), fii = findRow(/^FII/i), dii = findRow(/^DII/i);
  if (!prom) return null;

  const periods = header.slice(1);
  const quarters = [];
  const N = periods.filter(isYear).length;
  const start = Math.max(0, N - 8);
  let seen = 0;
  for (let i = 0; i < periods.length; i++) {
    if (!isYear(periods[i])) continue;
    if (seen++ < start) continue;
    const p = cleanNum(prom[i + 1]) ?? 0;
    const f = fii ? (cleanNum(fii[i + 1]) ?? 0) : 0;
    const d = dii ? (cleanNum(dii[i + 1]) ?? 0) : 0;
    const pub = Math.max(0, +(100 - p - f - d).toFixed(2));
    quarters.push({ quarter: periods[i].replace(/\s+/, ' '), promoter: round(p), fii: round(f), dii: round(d), public: round(pub) });
  }
  if (!quarters.length) return null;
  const first = quarters[0].promoter, last = quarters[quarters.length - 1].promoter;
  const promoterTrend = last > first + 0.3 ? 'rising' : last < first - 0.3 ? 'falling' : 'stable';
  return { quarters, promoterTrend, source: 'screener' };
}

/** Top ratios (Market Cap, P/E, ROE, ROCE, Book Value, Dividend Yield). */
function parseRatios(html) {
  const sec = sectionHtml(html, 'top-ratios') || html;
  const items = {};
  for (const li of sec.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const nameM = /class="name"[^>]*>([\s\S]*?)<\/span>/i.exec(li[1]);
    const numM = /class="number"[^>]*>([\s\S]*?)<\/span>/i.exec(li[1]);
    if (!nameM) continue;
    const name = stripTags(nameM[1]).toLowerCase();
    const val = numM ? cleanNum(numM[1]) : null;
    if (name) items[name] = val;
  }
  const mcapCr = items['market cap'];
  const roe = items['roe'];
  const roce = items['roce'];
  return {
    marketCap: mcapCr != null ? Math.round(mcapCr * 1e7) : null,
    peRatio: items['stock p/e'] ?? null,
    returnOnEquity: roe != null ? roe / 100 : null,
    roce: roce != null ? roce / 100 : null,
    bookValue: items['book value'] ?? null,
    dividendYield: items['dividend yield'] != null ? items['dividend yield'] / 100 : null,
    faceValue: items['face value'] ?? null,
  };
}

async function company(symbol) {
  const html = await fetchPage(symbol);
  return {
    financials: parseFinancials(html),
    shareholding: parseShareholding(html),
    ratios: parseRatios(html),
    peers: null, // Screener loads peers via JS; not in the static HTML.
  };
}

module.exports = { company, fetchPage, parseFinancials, parseShareholding, parseRatios };
