/**
 * Screener.in client — fetches a company page through the reader proxy
 * (r.jina.ai renders the tables as markdown) and parses REAL:
 *   - annual revenue & net profit (from the P&L table)
 *   - shareholding pattern over recent quarters (promoter/FII/DII/public)
 *
 * Parsing is anchored on stable labels ("EPS in Rs", "## Shareholding Pattern")
 * and fixed row order, and returns null when it can't confidently extract —
 * callers then show an honest "not available" state rather than wrong numbers.
 */
'use strict';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const READER = 'https://r.jina.ai/';

const cleanNum = (s) => {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(/,/g, '').replace('%', '').trim());
  return Number.isFinite(n) ? n : null;
};
const cells = (line) => line.split('|').slice(1, -1).map((c) => c.trim());
const isRow = (line) => line.trim().startsWith('|');

async function fetchPage(symbol) {
  const sym = String(symbol).replace(/\.(NS|BO)$/, '').toUpperCase();
  let lastErr;
  for (const suffix of ['consolidated/', '']) {
    try {
      const res = await fetch(`${READER}https://www.screener.in/company/${encodeURIComponent(sym)}/${suffix}`, {
        headers: {
          'User-Agent': UA, Accept: 'text/plain',
          ...(process.env.JINA_API_KEY ? { Authorization: 'Bearer ' + process.env.JINA_API_KEY } : {}),
        },
        signal: AbortSignal.timeout(40000),
      });
      if (!res.ok) { lastErr = new Error(`screener ${res.status}`); continue; }
      const text = await res.text();
      if (text && /Shareholding Pattern|Compounded Sales Growth/i.test(text)) return text;
      lastErr = new Error('screener: not a company page');
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('screener: unavailable');
}

// A header row like: |  | Mar 2015 | Mar 2016 | ... |  — annual = all months "Mar".
function parseHeader(line) {
  const c = cells(line);
  if (!c.length || c[0] !== '') return null;
  const periods = c.slice(1);
  if (periods.length < 3) return null;
  const monthYear = /^([A-Za-z]{3}) (\d{4})$/;
  if (!periods.every((p) => monthYear.test(p))) return null;
  const allMarch = periods.every((p) => p.startsWith('Mar'));
  return { periods, annual: allMarch };
}

/** Annual revenue & net profit. */
function parseFinancials(text) {
  const lines = text.split('\n').filter(isRow);
  for (let i = 0; i < lines.length; i++) {
    const hdr = parseHeader(lines[i]);
    if (!hdr || !hdr.annual) continue;
    // Look for the P&L (only it has an "EPS in Rs" row within the block).
    let epsIdx = -1;
    for (let j = i + 1; j < Math.min(i + 16, lines.length); j++) {
      if (/^EPS in Rs/i.test(cells(lines[j])[0] || '')) { epsIdx = j; break; }
      if (parseHeader(lines[j])) break; // next table started
    }
    if (epsIdx < 0) continue;

    const salesRow = cells(lines[i + 2]);           // i+1 is the |---| separator; i+2 = Sales/Revenue
    const profitRow = cells(lines[epsIdx - 1]);      // row above EPS = Net Profit
    const periods = hdr.periods;
    const annual = [];
    for (let k = 0; k < periods.length; k++) {
      const rev = cleanNum(salesRow[k + 1]);
      const profit = cleanNum(profitRow[k + 1]);
      const year = (periods[k].match(/(\d{4})/) || [])[1];
      if (rev != null && year) annual.push({ period: year, revenue: Math.round(rev * 1e7), profit: profit == null ? null : Math.round(profit * 1e7) });
    }
    if (annual.length >= 3) return { annual, quarterly: [], source: 'screener' };
  }
  return null;
}

/** Shareholding pattern over recent quarters. */
function parseShareholding(text) {
  const all = text.split('\n');
  const shIdx = all.findIndex((l) => /##\s*Shareholding Pattern/i.test(l));
  if (shIdx < 0) return null;
  const lines = all.slice(shIdx).filter(isRow);

  // First quarterly header after the heading.
  let hi = -1, header = null;
  for (let i = 0; i < lines.length; i++) {
    const h = parseHeader(lines[i]);
    if (h) { hi = i; header = h; break; }
  }
  if (hi < 0) return null;

  // The %-rows immediately below (after the |---| separator), in Screener's
  // fixed order: Promoters, FIIs, DIIs, [Government], Public.
  const pctRows = [];
  for (let i = hi + 1; i < lines.length && pctRows.length < 6; i++) {
    const c = cells(lines[i]);
    if (c.every((x) => x === '---' || x === '')) continue; // skip separator
    if (c[0] !== '') break;                      // hit a labelled row (No. of Shareholders)
    if (!/%$/.test(c[1] || '')) break;
    pctRows.push(c.slice(1).map(cleanNum));
  }
  if (pctRows.length < 3) return null;

  const periods = header.periods;
  const N = Math.min(periods.length, pctRows[0].length);
  const quarters = [];
  for (let k = Math.max(0, N - 8); k < N; k++) {
    const promoter = pctRows[0][k] ?? 0;
    const fii = pctRows[1][k] ?? 0;
    const dii = pctRows[2][k] ?? 0;
    const publicPct = Math.max(0, +(100 - promoter - fii - dii).toFixed(2));
    quarters.push({
      quarter: periods[k],                         // e.g. "Dec 2025"
      promoter: round(promoter), fii: round(fii), dii: round(dii), public: round(publicPct),
    });
  }
  if (!quarters.length) return null;
  const first = quarters[0].promoter, last = quarters[quarters.length - 1].promoter;
  const promoterTrend = last > first + 0.3 ? 'rising' : last < first - 0.3 ? 'falling' : 'stable';
  return { quarters, promoterTrend, source: 'screener' };
}

function round(n) { return n == null ? null : Math.round(n * 100) / 100; }

/** Top ratios from the company header (Market Cap, P/E, ROE, ROCE, etc.).
 *  Reads the value from the SAME line as the label so a missing value (e.g.
 *  P/E for a loss-making company) returns null instead of bleeding into the
 *  next field's number. */
function valueOnLine(text, label) {
  for (const ln of text.split('\n')) {
    const i = ln.toLowerCase().indexOf(label.toLowerCase());
    if (i < 0) continue;
    const m = /(-?[\d,]+(?:\.\d+)?)/.exec(ln.slice(i + label.length));
    return m ? cleanNum(m[1]) : null; // label found; value may be absent
  }
  return null;
}
function parseRatios(text) {
  const marketCapCr = valueOnLine(text, 'Market Cap');
  const pe = valueOnLine(text, 'Stock P/E');
  const roe = valueOnLine(text, 'ROE');
  const roce = valueOnLine(text, 'ROCE');
  const bookValue = valueOnLine(text, 'Book Value');
  const divYield = valueOnLine(text, 'Dividend Yield');
  const faceValue = valueOnLine(text, 'Face Value');
  return {
    marketCap: marketCapCr != null ? Math.round(marketCapCr * 1e7) : null, // Cr → raw rupees
    peRatio: pe,
    returnOnEquity: roe != null ? roe / 100 : null,
    roce: roce != null ? roce / 100 : null,
    bookValue,
    dividendYield: divYield != null ? divYield / 100 : null,
    faceValue,
  };
}

/** Peer comparison table (real peers with P/E, market cap, ROCE). */
function parsePeers(text) {
  const lines = text.split('\n').filter(isRow);
  const hi = lines.findIndex((l) => /P\/E/i.test(l) && /Mar Cap/i.test(l) && /Name/i.test(l));
  if (hi < 0) return null;
  const head = cells(lines[hi]).map((h) => h.toLowerCase());
  const col = (frag) => head.findIndex((h) => h.includes(frag));
  const cName = col('name'), cPE = head.findIndex((h) => h === 'p/e' || /\bp\/e\b/.test(h));
  const cMcap = col('mar cap'), cROCE = col('roce'), cCMP = col('cmp');
  if (cName < 0 || cPE < 0) return null;

  const rows = [];
  for (let i = hi + 2; i < lines.length; i++) { // hi+1 is the |---| separator
    const c = cells(lines[i]);
    if (!/^\d+\.?$/.test(c[0] || '')) break;     // stop at "Median" / end of table
    const m = /\[([^\]]+)\]\([^)]*?\/company\/([^/)]+)/.exec(c[cName] || '');
    if (!m) continue;
    const mcapCr = cleanNum(c[cMcap]);
    const roce = cleanNum(c[cROCE]);
    rows.push({
      symbol: m[2].toUpperCase(),
      name: m[1].trim(),
      peRatio: cleanNum(c[cPE]),
      marketCap: mcapCr != null ? Math.round(mcapCr * 1e7) : null,
      roce: roce != null ? round(roce / 100) : null,
      price: cleanNum(c[cCMP]),
    });
    if (rows.length >= 8) break;
  }
  return rows.length ? rows : null;
}

// Fetch once, parse everything.
async function company(symbol) {
  const text = await fetchPage(symbol);
  return {
    financials: parseFinancials(text),
    shareholding: parseShareholding(text),
    ratios: parseRatios(text),
    peers: parsePeers(text),
  };
}

module.exports = { company, fetchPage, parseFinancials, parseShareholding, parseRatios, parsePeers };
