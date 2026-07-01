/**
 * Curated dictionary of popular NSE-listed companies for autocomplete and
 * fuzzy "did you mean" matching. Not exhaustive — covers the large-caps most
 * people search. `symbol` is the NSE ticker (no suffix); the app appends .NS.
 */
'use strict';

const SYMBOLS = [
  ['RELIANCE', 'Reliance Industries', 'Energy'],
  ['TCS', 'Tata Consultancy Services', 'Technology'],
  ['HDFCBANK', 'HDFC Bank', 'Financial Services'],
  ['INFY', 'Infosys', 'Technology'],
  ['ICICIBANK', 'ICICI Bank', 'Financial Services'],
  ['HINDUNILVR', 'Hindustan Unilever', 'Consumer Defensive'],
  ['SBIN', 'State Bank of India', 'Financial Services'],
  ['BHARTIARTL', 'Bharti Airtel', 'Communication Services'],
  ['ITC', 'ITC', 'Consumer Defensive'],
  ['KOTAKBANK', 'Kotak Mahindra Bank', 'Financial Services'],
  ['LT', 'Larsen & Toubro', 'Industrials'],
  ['AXISBANK', 'Axis Bank', 'Financial Services'],
  ['HCLTECH', 'HCL Technologies', 'Technology'],
  ['ASIANPAINT', 'Asian Paints', 'Basic Materials'],
  ['MARUTI', 'Maruti Suzuki India', 'Consumer Cyclical'],
  ['SUNPHARMA', 'Sun Pharmaceutical', 'Healthcare'],
  ['TITAN', 'Titan Company', 'Consumer Cyclical'],
  ['BAJFINANCE', 'Bajaj Finance', 'Financial Services'],
  ['NESTLEIND', 'Nestle India', 'Consumer Defensive'],
  ['WIPRO', 'Wipro', 'Technology'],
  ['ULTRACEMCO', 'UltraTech Cement', 'Basic Materials'],
  ['ONGC', 'Oil & Natural Gas Corporation', 'Energy'],
  ['NTPC', 'NTPC', 'Utilities'],
  ['POWERGRID', 'Power Grid Corporation', 'Utilities'],
  ['M&M', 'Mahindra & Mahindra', 'Consumer Cyclical'],
  ['TATAMOTORS', 'Tata Motors', 'Consumer Cyclical'],
  ['TATASTEEL', 'Tata Steel', 'Basic Materials'],
  ['JSWSTEEL', 'JSW Steel', 'Basic Materials'],
  ['ADANIENT', 'Adani Enterprises', 'Energy'],
  ['ADANIPORTS', 'Adani Ports & SEZ', 'Industrials'],
  ['COALINDIA', 'Coal India', 'Energy'],
  ['BAJAJFINSV', 'Bajaj Finserv', 'Financial Services'],
  ['HDFCLIFE', 'HDFC Life Insurance', 'Financial Services'],
  ['SBILIFE', 'SBI Life Insurance', 'Financial Services'],
  ['GRASIM', 'Grasim Industries', 'Basic Materials'],
  ['TECHM', 'Tech Mahindra', 'Technology'],
  ['INDUSINDBK', 'IndusInd Bank', 'Financial Services'],
  ['DRREDDY', "Dr. Reddy's Laboratories", 'Healthcare'],
  ['CIPLA', 'Cipla', 'Healthcare'],
  ['DIVISLAB', "Divi's Laboratories", 'Healthcare'],
  ['APOLLOHOSP', 'Apollo Hospitals', 'Healthcare'],
  ['BRITANNIA', 'Britannia Industries', 'Consumer Defensive'],
  ['EICHERMOT', 'Eicher Motors', 'Consumer Cyclical'],
  ['HEROMOTOCO', 'Hero MotoCorp', 'Consumer Cyclical'],
  ['BAJAJ-AUTO', 'Bajaj Auto', 'Consumer Cyclical'],
  ['HINDALCO', 'Hindalco Industries', 'Basic Materials'],
  ['BPCL', 'Bharat Petroleum', 'Energy'],
  ['IOC', 'Indian Oil Corporation', 'Energy'],
  ['SHRIRAMFIN', 'Shriram Finance', 'Financial Services'],
  ['TATACONSUM', 'Tata Consumer Products', 'Consumer Defensive'],
  ['PIDILITIND', 'Pidilite Industries', 'Basic Materials'],
  ['DABUR', 'Dabur India', 'Consumer Defensive'],
  ['GODREJCP', 'Godrej Consumer Products', 'Consumer Defensive'],
  ['DMART', 'Avenue Supermarts (DMart)', 'Consumer Defensive'],
  ['VEDL', 'Vedanta', 'Basic Materials'],
  ['DLF', 'DLF', 'Real Estate'],
  ['SIEMENS', 'Siemens', 'Industrials'],
  ['PNB', 'Punjab National Bank', 'Financial Services'],
  ['BANKBARODA', 'Bank of Baroda', 'Financial Services'],
  ['CANBK', 'Canara Bank', 'Financial Services'],
  ['GAIL', 'GAIL India', 'Utilities'],
  ['HAVELLS', 'Havells India', 'Consumer Cyclical'],
  ['AMBUJACEM', 'Ambuja Cements', 'Basic Materials'],
  ['SHREECEM', 'Shree Cement', 'Basic Materials'],
  ['ZOMATO', 'Zomato (Eternal)', 'Consumer Cyclical'],
  ['PAYTM', 'One97 (Paytm)', 'Technology'],
  ['NYKAA', 'FSN E-Commerce (Nykaa)', 'Consumer Cyclical'],
  ['POLICYBZR', 'PB Fintech (Policybazaar)', 'Financial Services'],
  ['IRCTC', 'Indian Railway Catering & Tourism', 'Consumer Cyclical'],
  ['LTIM', 'LTIMindtree', 'Technology'],
  ['ADANIGREEN', 'Adani Green Energy', 'Utilities'],
  ['ADANIPOWER', 'Adani Power', 'Utilities'],
  ['JIOFIN', 'Jio Financial Services', 'Financial Services'],
  ['IDFCFIRSTB', 'IDFC First Bank', 'Financial Services'],
  ['BANDHANBNK', 'Bandhan Bank', 'Financial Services'],
  ['FEDERALBNK', 'Federal Bank', 'Financial Services'],
  ['MUTHOOTFIN', 'Muthoot Finance', 'Financial Services'],
  ['CHOLAFIN', 'Cholamandalam Investment', 'Financial Services'],
  ['NAUKRI', 'Info Edge (Naukri)', 'Technology'],
  ['PERSISTENT', 'Persistent Systems', 'Technology'],
  ['COFORGE', 'Coforge', 'Technology'],
  ['MPHASIS', 'Mphasis', 'Technology'],
  ['TVSMOTOR', 'TVS Motor Company', 'Consumer Cyclical'],
  ['MOTHERSON', 'Samvardhana Motherson', 'Consumer Cyclical'],
  ['BOSCHLTD', 'Bosch', 'Consumer Cyclical'],
  ['TRENT', 'Trent', 'Consumer Cyclical'],
  ['PAGEIND', 'Page Industries', 'Consumer Cyclical'],
  ['BERGEPAINT', 'Berger Paints', 'Basic Materials'],
  ['MARICO', 'Marico', 'Consumer Defensive'],
  ['COLPAL', 'Colgate-Palmolive India', 'Consumer Defensive'],
  ['UBL', 'United Breweries', 'Consumer Defensive'],
  ['MCDOWELL-N', 'United Spirits', 'Consumer Defensive'],
  ['INDIGO', 'InterGlobe Aviation (IndiGo)', 'Industrials'],
  ['LICI', 'Life Insurance Corporation', 'Financial Services'],
  ['ICICIPRULI', 'ICICI Prudential Life', 'Financial Services'],
  ['ICICIGI', 'ICICI Lombard General Insurance', 'Financial Services'],
  ['SRF', 'SRF', 'Basic Materials'],
  ['UPL', 'UPL', 'Basic Materials'],
  ['PIIND', 'PI Industries', 'Basic Materials'],
  ['AUROPHARMA', 'Aurobindo Pharma', 'Healthcare'],
  ['LUPIN', 'Lupin', 'Healthcare'],
  ['BIOCON', 'Biocon', 'Healthcare'],
  ['TORNTPHARM', 'Torrent Pharmaceuticals', 'Healthcare'],
  ['ZYDUSLIFE', 'Zydus Lifesciences', 'Healthcare'],
  ['MAXHEALTH', 'Max Healthcare', 'Healthcare'],
  ['BEL', 'Bharat Electronics', 'Industrials'],
  ['HAL', 'Hindustan Aeronautics', 'Industrials'],
  ['BHEL', 'Bharat Heavy Electricals', 'Industrials'],
  ['IRFC', 'Indian Railway Finance Corporation', 'Financial Services'],
  ['RECLTD', 'REC', 'Financial Services'],
  ['PFC', 'Power Finance Corporation', 'Financial Services'],
  ['SAIL', 'Steel Authority of India', 'Basic Materials'],
  ['NMDC', 'NMDC', 'Basic Materials'],
  ['JINDALSTEL', 'Jindal Steel & Power', 'Basic Materials'],
  ['TATAPOWER', 'Tata Power', 'Utilities'],
  ['TATACOMM', 'Tata Communications', 'Communication Services'],
  ['IDEA', 'Vodafone Idea', 'Communication Services'],
  ['YESBANK', 'Yes Bank', 'Financial Services'],
];

const LIST = SYMBOLS.map(([symbol, name, sector]) => ({ symbol, name, sector }));
const BY_SYMBOL = new Map(LIST.map((s) => [s.symbol, s]));

// Levenshtein distance (capped small strings, fine for ticker matching).
function levenshtein(a, b) {
  a = a.toUpperCase(); b = b.toUpperCase();
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Search the dictionary. Returns { matches, suggestion } where matches are
 * ranked autocomplete hits and suggestion is a "did you mean" for near-misses.
 */
function search(query, limit = 8) {
  const q = String(query || '').trim().toUpperCase();
  if (!q) return { matches: [], suggestion: null };

  const scored = [];
  for (const s of LIST) {
    const sym = s.symbol.toUpperCase();
    const name = s.name.toUpperCase();
    let score = -1;
    if (sym === q) score = 100;
    else if (sym.startsWith(q)) score = 90 - (sym.length - q.length) * 0.5;
    else if (name.startsWith(q)) score = 80 - (name.length - q.length) * 0.2;
    else if (q.length >= 4 && q.startsWith(name)) score = 72; // typed full name + typo
    else if (sym.includes(q)) score = 65;
    else if (name.includes(q)) score = 60;
    else {
      // Fuzzy fallback against the symbol and the collapsed name.
      const dSym = levenshtein(q, sym);
      const nameKey = name.replace(/[^A-Z0-9]/g, '');
      const dName = q.length >= 4 ? levenshtein(q, nameKey) : Infinity;
      const d = Math.min(dSym, dName);
      const tol = Math.max(1, Math.floor(Math.max(sym.length, q.length) * 0.4));
      if (d <= tol) score = 45 - d * 4;
    }
    if (score >= 0) scored.push({ ...s, score });
  }

  scored.sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
  const matches = scored.slice(0, limit).map(({ score, ...rest }) => rest);

  // "Did you mean" — only when there is no reasonably strong hit, so we don't
  // nag when the user already has a solid prefix/name match.
  let suggestion = null;
  const best = scored[0];
  if (!best || best.score < 70) {
    let bestDist = Infinity, cand = null;
    for (const s of LIST) {
      const nameKey = s.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const d = Math.min(levenshtein(q, s.symbol), levenshtein(q, nameKey));
      if (d < bestDist) { bestDist = d; cand = s; }
    }
    if (cand && bestDist > 0 && bestDist <= 3 && (!best || best.symbol !== cand.symbol)) {
      suggestion = { symbol: cand.symbol, name: cand.name, distance: bestDist };
    }
  }

  return { matches, suggestion };
}

const stripSuffix = (s) => String(s || '').trim().toUpperCase().replace(/\.(NS|BO)$/, '');

function sectorOf(symbol) {
  const e = BY_SYMBOL.get(stripSuffix(symbol));
  return e ? e.sector : null;
}

/** Same-sector peers (excluding self). `sector` overrides dictionary lookup. */
function peers(symbol, limit = 4, sector = null) {
  const self = stripSuffix(symbol);
  const sec = sector || sectorOf(self);
  if (!sec) return [];
  return LIST.filter((s) => s.sector === sec && s.symbol !== self).slice(0, limit);
}

module.exports = { LIST, BY_SYMBOL, search, levenshtein, sectorOf, peers, stripSuffix };
