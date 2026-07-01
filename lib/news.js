/**
 * Google News RSS client. Free, no key. We fetch the RSS search feed for a
 * company, parse the XML (dependency-free regex parser — the feed is simple and
 * well-formed) and normalise items into { title, source, link, date, year,
 * summary }. Callers group by year for the timeline.
 *
 * Note: Google News RSS mostly returns recent items, so deep 10-year history is
 * best-effort; the mock generator fills a spread of years for demo mode.
 */
'use strict';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function decodeEntities(s) {
  if (!s) return '';
  let out = String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  // Two passes to handle double-encoded entities (e.g. "&amp;nbsp;").
  for (let i = 0; i < 2; i++) {
    out = out
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
      .replace(/&amp;/g, '&');
  }
  return out;
}
const stripTags = (s) => decodeEntities(String(s || '')).replace(/<[^>]+>/g, '').trim();
const tag = (block, name) => {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return m ? m[1] : '';
};

async function fetchGoogleNews(query, { limit = 40 } = {}) {
  const url = 'https://news.google.com/rss/search?q=' +
    encodeURIComponent(query) + '&hl=en-IN&gl=IN&ceid=IN:en';
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' } });
  if (!res.ok) throw new Error(`Google News ${res.status}`);
  const xml = await res.text();
  return parseRss(xml).slice(0, limit);
}

function parseRss(xml) {
  const items = [];
  const blocks = xml.split(/<item>/i).slice(1);
  for (const raw of blocks) {
    const block = raw.split(/<\/item>/i)[0];
    let title = stripTags(tag(block, 'title'));
    const link = stripTags(tag(block, 'link'));
    const pub = stripTags(tag(block, 'pubDate'));
    let source = stripTags(tag(block, 'source'));

    // Google titles are "Headline - Source"; strip the trailing source.
    const idx = title.lastIndexOf(' - ');
    if (idx > 0) {
      const trailing = title.slice(idx + 3).trim();
      if (!source) source = trailing;
      if (source && trailing.toLowerCase() === source.toLowerCase()) title = title.slice(0, idx).trim();
      else if (!source) title = title.slice(0, idx).trim();
    }

    const d = pub ? new Date(pub) : null;
    const valid = d && !Number.isNaN(d.getTime());
    items.push({
      title: title || '(untitled)',
      source: source || 'Google News',
      link,
      date: valid ? d.toISOString() : null,
      year: valid ? d.getUTCFullYear() : null,
      // Google News descriptions just echo the headline + source list, so we
      // omit them for real feeds; mock supplies genuine summaries.
      summary: '',
    });
  }
  return items.filter((i) => i.title && i.title !== '(untitled)');
}

/** Group a flat item list into [{ year, items }] sorted newest-first. */
function groupByYear(items) {
  const map = new Map();
  for (const it of items) {
    const y = it.year || 'Undated';
    if (!map.has(y)) map.set(y, []);
    map.get(y).push(it);
  }
  return [...map.entries()]
    .sort((a, b) => (b[0] === 'Undated' ? -1 : a[0] === 'Undated' ? 1 : b[0] - a[0]))
    .map(([year, items]) => ({ year, items }));
}

module.exports = { fetchGoogleNews, parseRss, groupByYear };
