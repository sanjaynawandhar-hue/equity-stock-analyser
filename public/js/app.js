/* Equity Stock Analyser — frontend app.
   Step 5: search (autocomplete + fuzzy "did you mean") wired to the backend,
   plus a minimal report header render to prove the end-to-end pipeline. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- helpers
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  async function api(path) {
    const res = await fetch(path);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.message || res.statusText), { status: res.status, body: data });
    return data;
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function fmtNum(n, dp = 2) {
    if (n == null || Number.isNaN(n)) return '—';
    return Number(n).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  function fmtCrore(n) {
    if (n == null) return '—';
    if (n >= 1e7) return '₹' + (n / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' Cr';
    return '₹' + fmtNum(n, 0);
  }
  function fmtPct(n, dp = 2) { return n == null ? '—' : `${Number(n).toFixed(dp)}%`; }
  function fmtVol(n) {
    if (n == null || Number.isNaN(n)) return '—';
    if (n >= 1e7) return (n / 1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return (n / 1e5).toFixed(2) + ' L';
    return Number(n).toLocaleString('en-IN');
  }
  const debounce = (fn, ms) => {
    let t;
    const wrapped = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    wrapped.cancel = () => clearTimeout(t);
    return wrapped;
  };

  // ------------------------------------------------------------- animation
  function animateNumber(node, to, { prefix = '', suffix = '', dp = 2, dur = 600 } = {}) {
    const from = 0;
    const start = performance.now();
    function frame(now) {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = from + (to - from) * eased;
      node.textContent = prefix + val.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp }) + suffix;
      if (p < 1) requestAnimationFrame(frame);
    }
    if (to == null || Number.isNaN(to)) { node.textContent = '—'; return; }
    requestAnimationFrame(frame);
  }

  // ================================================================ SEARCH
  const input = $('#searchInput');
  const goBtn = $('#searchGo');
  const suggestBox = $('#suggest');
  let items = [];        // current suggestion rows
  let activeIdx = -1;
  let suggestion = null; // "did you mean"
  let searchingWeb = false; // phase-2 live search in flight

  function closeSuggest() { suggestBox.classList.remove('open'); activeIdx = -1; }

  function renderSuggest() {
    suggestBox.innerHTML = '';
    if (suggestion) {
      const dym = el('div', 'suggest__dym',
        `Did you mean <b data-sym="${esc(suggestion.symbol)}">${esc(suggestion.symbol)}</b> — ${esc(suggestion.name)}?`);
      suggestBox.appendChild(dym);
    }
    if (!items.length && !suggestion && !searchingWeb) {
      suggestBox.appendChild(el('div', 'suggest__empty', 'No matches. Press Analyse to try anyway.'));
    }
    items.forEach((m, i) => {
      const row = el('div', 'suggest__item' + (i === activeIdx ? ' active' : ''));
      row.setAttribute('role', 'option');
      row.dataset.sym = m.symbol;
      row.innerHTML =
        `<span><span class="suggest__sym">${esc(m.symbol)}</span>
           <span class="suggest__name"> · ${esc(m.name)}</span></span>
         ${m.sector ? `<span class="suggest__sector">${esc(m.sector)}</span>` : ''}`;
      suggestBox.appendChild(row);
    });
    if (searchingWeb) {
      suggestBox.appendChild(el('div', 'suggest__loading', '🔎 Searching all listed stocks…'));
    }
    suggestBox.classList.add('open');
  }

  const doSearch = debounce(async (q) => {
    if (!q.trim()) { closeSuggest(); return; }
    try {
      // Phase 1: instant curated results.
      const data = await api('/api/search?q=' + encodeURIComponent(q));
      items = data.matches || [];
      suggestion = data.suggestion || null;
      activeIdx = -1;

      // Phase 2: if curated results are sparse, augment with a live web search.
      const needWeb = q.trim().length >= 3 && items.length < 6;
      searchingWeb = needWeb;
      renderSuggest();

      if (needWeb) {
        try {
          const web = await api('/api/search?q=' + encodeURIComponent(q) + '&web=1');
          if (input.value.trim() === q.trim()) {        // ignore if query changed meanwhile
            items = web.matches || items;
            suggestion = web.suggestion || null;
            activeIdx = -1;
          }
        } catch (_) { /* keep curated results */ }
        searchingWeb = false;
        if (input.value.trim() === q.trim()) renderSuggest();
      }
    } catch (_) { searchingWeb = false; closeSuggest(); }
  }, 130);

  input.addEventListener('input', (e) => doSearch(e.target.value));
  input.addEventListener('focus', () => { if (input.value.trim()) doSearch(input.value); });

  input.addEventListener('keydown', (e) => {
    const open = suggestBox.classList.contains('open');
    if (e.key === 'ArrowDown' && open) {
      e.preventDefault(); activeIdx = Math.min(items.length - 1, activeIdx + 1); renderSuggest();
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault(); activeIdx = Math.max(-1, activeIdx - 1); renderSuggest();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && items[activeIdx]) selectSymbol(items[activeIdx].symbol);
      else if (items[0]) selectSymbol(items[0].symbol);
      else selectSymbol(input.value.trim().toUpperCase());
    } else if (e.key === 'Escape') { closeSuggest(); }
  });

  suggestBox.addEventListener('click', (e) => {
    const dym = e.target.closest('[data-sym]');
    if (dym) selectSymbol(dym.dataset.sym);
  });

  goBtn.addEventListener('click', () => {
    if (items[0]) selectSymbol(items[0].symbol);
    else if (input.value.trim()) selectSymbol(input.value.trim().toUpperCase());
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search')) closeSuggest();
  });

  function selectSymbol(sym) {
    if (!sym) return;
    doSearch.cancel();       // drop any pending autocomplete that would reopen the box
    input.value = sym;
    closeSuggest();
    loadStock(sym);
  }

  // ================================================================ REPORT
  const report = $('#report');
  const welcome = $('#welcome');
  const demoBanner = $('#demoBanner');
  // Show the demo notice while data is sample; hide it if real data ever flows.
  const setDemoMode = (isMock) => { if (demoBanner) demoBanner.style.display = isMock ? 'flex' : 'none'; };
  const loadbar = $('#loadbar');
  const showLoad = () => loadbar && loadbar.classList.add('on');
  const hideLoad = () => loadbar && loadbar.classList.remove('on');

  function skeletonHeader() {
    report.innerHTML = '';
    const card = el('div', 'card rheader');
    card.innerHTML = `
      <div class="skeleton" style="height:26px;width:280px;"></div>
      <div class="skeleton" style="height:14px;width:180px;margin-top:12px;"></div>
      <div class="skeleton" style="height:42px;width:220px;margin-top:20px;"></div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:20px;">
        <div class="skeleton" style="height:40px;"></div><div class="skeleton" style="height:40px;"></div>
        <div class="skeleton" style="height:40px;"></div><div class="skeleton" style="height:40px;"></div>
      </div>`;
    report.appendChild(card);
  }

  async function loadStock(symbol) {
    if (welcome) welcome.style.display = 'none';
    destroyChart();
    destroyCmp();
    showLoad();
    skeletonHeader();
    report.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Fetch quote + fundamentals in parallel; tolerate individual failures.
    const [quoteR, fundR] = await Promise.allSettled([
      api('/api/quote?symbol=' + encodeURIComponent(symbol)),
      api('/api/fundamentals?symbol=' + encodeURIComponent(symbol)),
    ]);
    hideLoad();

    const quote = quoteR.status === 'fulfilled' ? quoteR.value : null;
    const fund = fundR.status === 'fulfilled' ? fundR.value : null;

    if (!quote && !fund) {
      renderError(symbol, quoteR.reason || fundR.reason);
      return;
    }

    const name = (fund && fund.name) || (quote && quote.companyName) || null;
    setDemoMode((quote && quote.mock) || (fund && fund.mock));
    if (window.ESAStore) ESAStore.addRecent(symbol, name);
    renderHeader(symbol, quote, fund);
    renderPriceSection(symbol);
    renderSignals(symbol, fund);
    renderComparison(symbol);
    renderFinancials(symbol);
    renderShareholding(symbol);
    renderAnnualReports(symbol, fund);
    renderPeers(symbol);
    renderNews(symbol);
  }

  // -------------------------------------------------- annual reports (5y)
  async function renderAnnualReports(symbol, fund) {
    const bare = symbols_strip(symbol);
    const company = (fund && fund.name) || bare;
    const card = el('div', 'card section fade-in');
    card.innerHTML = `
      <div class="section__head">
        <div class="section__title">📑 Annual Reports</div>
        <span class="muted" style="font-size:12.5px">Last 5 financial years</span>
      </div>
      <div id="arBody"><div class="skeleton" style="height:120px;border-radius:12px"></div></div>`;
    report.appendChild(card);
    const body = $('#arBody', card);

    // Reuse the (cached) financials endpoint for the per-year revenue/profit snapshot.
    let fin = null;
    try { fin = await api('/api/financials?symbol=' + encodeURIComponent(symbol)); } catch (_) { /* links still work */ }

    const annual = (fin && Array.isArray(fin.annual)) ? fin.annual.slice(-5).reverse() : [];
    const thisYear = new Date().getFullYear();
    const years = annual.length
      ? annual.map((a) => ({ period: a.period, revenue: a.revenue, profit: a.profit }))
      : [1, 2, 3, 4, 5].map((i) => ({ period: String(thisYear - i) }));

    // Only show revenue/profit figures if they're REAL — never fabricated numbers.
    const showFigures = !!(fin && !fin.mock);

    const gSearch = (y) => 'https://www.google.com/search?q=' +
      encodeURIComponent(`${company} annual report ${y} pdf`);
    const screener = 'https://www.screener.in/company/' + encodeURIComponent(bare) + '/';
    const bse = 'https://www.bseindia.com/corporates/annualReports.aspx';

    body.innerHTML = `
      <div class="ar-grid">
        ${years.map((y) => `
          <div class="arcard">
            <span class="arcard__yr">FY ${esc(y.period)}</span>
            ${showFigures && y.revenue != null ? `<span class="arcard__stat">Revenue <b>${fmtCrShort(y.revenue)}</b></span>` : ''}
            ${showFigures && y.profit != null ? `<span class="arcard__stat">Net profit <b>${fmtCrShort(y.profit)}</b></span>` : ''}
            <a class="arcard__link" href="${gSearch(y.period)}" target="_blank" rel="noopener noreferrer">📄 View report ↗</a>
          </div>`).join('')}
      </div>
      <div class="ar-actions">
        <a class="btn btn--primary" href="${screener}" target="_blank" rel="noopener noreferrer">📚 All annual reports (Screener.in) ↗</a>
        <a class="btn" href="${bse}" target="_blank" rel="noopener noreferrer">🏛️ BSE filings ↗</a>
      </div>
      <p class="ar-note">${showFigures
        ? 'Figures are from the financials feed — always verify against the official report.'
        : 'Open each year’s official report below (Screener.in aggregates the BSE-filed PDFs) for exact revenue &amp; profit figures.'}</p>`;
  }

  // ---------------------------------------------- stock vs Nifty 50 overlay
  let cmpHandle = null;
  function destroyCmp() { if (cmpHandle) { cmpHandle.destroy(); cmpHandle = null; } }

  async function renderComparison(symbol) {
    destroyCmp();
    const card = el('div', 'card section fade-in');
    card.innerHTML = `
      <div class="section__head">
        <div class="section__title">⚖️ vs Nifty 50</div>
        <div class="section__controls">
          <div class="segmented" data-group="cmp">
            <button data-range="1">1Y</button>
            <button data-range="5">5Y</button>
            <button data-range="10" class="active">10Y</button>
          </div>
        </div>
      </div>
      <div class="cmp-legend" id="cmpLegend"></div>
      <div class="chart-host" id="cmpHost" style="min-height:320px"></div>
      <p class="muted" style="font-size:11.5px;margin-top:8px">Both lines rebased to 0% at the start of the selected period.</p>`;
    report.appendChild(card);
    const host = $('#cmpHost', card);
    host.innerHTML = '<div class="skeleton" style="height:320px;border-radius:12px"></div>';

    const [stockR, niftyR] = await Promise.allSettled([
      api('/api/history?symbol=' + encodeURIComponent(symbol) + '&range=10y&interval=1wk&events='),
      api('/api/history?symbol=' + encodeURIComponent('^NSEI') + '&range=10y&interval=1wk&events='),
    ]);
    if (stockR.status !== 'fulfilled' || niftyR.status !== 'fulfilled') {
      host.innerHTML = '<p class="muted" style="padding:24px 8px">Comparison unavailable — index data could not be loaded.</p>';
      return;
    }
    host.innerHTML = '';

    const legend = $('#cmpLegend', card);
    const updateLegend = (r) => {
      const fmtR = (v) => v == null ? '—' : `<span class="${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '+' : ''}${v.toFixed(1)}%</span>`;
      const diff = (r.a != null && r.b != null) ? r.a - r.b : null;
      legend.innerHTML = `
        <span><i class="legend-swatch" style="background:var(--accent)"></i> ${esc(symbols_strip(symbol))} ${fmtR(r.a)}</span>
        <span><i class="legend-swatch" style="background:var(--hold)"></i> Nifty 50 ${fmtR(r.b)}</span>
        ${diff != null ? `<span class="cmp-diff ${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '▲ Outperforming' : '▼ Underperforming'} by ${Math.abs(diff).toFixed(1)}%</span>` : ''}`;
    };

    cmpHandle = ESACharts.comparisonChart(host, {
      a: { name: symbols_strip(symbol), candles: stockR.value.candles },
      b: { name: 'Nifty 50', candles: niftyR.value.candles },
    }, { height: 320, onUpdate: updateLegend });

    card.querySelectorAll('[data-group="cmp"] button').forEach((b) => b.addEventListener('click', () => {
      card.querySelectorAll('[data-group="cmp"] button').forEach((x) => x.classList.toggle('active', x === b));
      cmpHandle && cmpHandle.setRange(+b.dataset.range);
    }));
  }

  // ------------------------------------------------------- news timeline
  async function renderNews(symbol) {
    const card = el('div', 'card section fade-in');
    card.innerHTML = `
      <div class="section__head">
        <div class="section__title">📰 News Timeline</div>
        <span id="newsMeta" class="muted" style="font-size:12.5px"></span>
      </div>
      <div id="newsBody"><div class="skeleton" style="height:200px;border-radius:12px"></div></div>`;
    report.appendChild(card);
    const body = $('#newsBody', card);

    let data;
    try { data = await api('/api/news?symbol=' + encodeURIComponent(symbol)); }
    catch (_) { body.innerHTML = '<p class="muted" style="padding:18px 4px">News unavailable right now.</p>'; return; }

    const groups = data.groups || [];
    // Flatten to a single most-recent-first list and keep the top 10.
    const items = groups.flatMap((g) => g.items).slice(0, 10);
    if (!items.length) { body.innerHTML = '<p class="muted" style="padding:18px 4px">No recent news found.</p>'; return; }
    $('#newsMeta', card).textContent = data.mock
      ? `Top ${items.length} · demo headlines`
      : `Top ${items.length} · via Google News`;

    const fmtDate = (iso) => {
      if (!iso) return '';
      try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
      catch (_) { return ''; }
    };

    // Two columns on wide screens: first half on the left, rest on the right.
    body.innerHTML = `
      <div class="news-feed news-2col">
        ${items.map((it) => `
          <a class="newscard" href="${esc(it.link || '#')}" target="_blank" rel="noopener noreferrer">
            <div class="newscard__meta">
              <span class="newscard__src">${esc(it.source)}</span>
              <span class="newscard__date">· ${esc(fmtDate(it.date))}</span>
            </div>
            <div class="newscard__title">${esc(it.title)}</div>
            ${it.summary ? `<div class="newscard__summary">${esc(it.summary)}</div>` : ''}
          </a>`).join('')}
      </div>`;
  }

  // ---------------------------------------------------- peer comparison
  async function renderPeers(symbol) {
    const card = el('div', 'card section fade-in');
    card.innerHTML = `
      <div class="section__head">
        <div class="section__title">⚔️ Peer Comparison</div>
        <span id="peerSector" class="muted" style="font-size:12.5px"></span>
      </div>
      <div id="peerBody"><div class="skeleton" style="height:180px;border-radius:12px"></div></div>`;
    report.appendChild(card);
    const body = $('#peerBody', card);

    let data;
    try { data = await api('/api/peers?symbol=' + encodeURIComponent(symbol)); }
    catch (_) { body.innerHTML = '<p class="muted" style="padding:18px 4px">Peer data unavailable.</p>'; return; }

    const rows = (data.rows || []).filter((r) => !r.error || r.isSelf);
    if (rows.length < 2) { body.innerHTML = '<p class="muted" style="padding:18px 4px">No same-sector peers found for this stock.</p>'; return; }
    if (data.sector) $('#peerSector', card).textContent = data.sector;

    // Comparative metrics (P/E, market cap, 1Y return) come from the demo feed,
    // so we don't show fabricated numbers — show "—" and keep the peer list
    // (real, same-sector companies) useful for discovery.
    const metric = (r, val) => (r.mock ? '<span class="muted">—</span>' : val);
    const retCell = (v) => v == null ? '<span class="muted">—</span>'
      : `<span class="${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(1)}%</span>`;
    const anyReal = rows.some((r) => !r.mock);

    body.innerHTML = `
      <div class="peer-scroll">
        <table class="peer-table">
          <thead><tr><th>Company</th><th>P/E</th><th>Market Cap</th><th>1Y Return</th></tr></thead>
          <tbody>
            ${rows.map((r) => `
              <tr class="${r.isSelf ? 'peer-row-self' : ''}" data-sym="${esc(r.symbol)}">
                <td><span class="peer-sym">${esc(r.symbol)}</span>${r.isSelf ? '<span class="peer-self-tag">THIS</span>' : ''}
                    <div class="peer-name">${esc(r.name || '')}</div></td>
                <td>${metric(r, r.peRatio == null ? '—' : fmtNum(r.peRatio))}</td>
                <td>${metric(r, fmtCrShort(r.marketCap))}</td>
                <td>${metric(r, retCell(r.oneYearReturn))}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${anyReal ? '' : '<p class="ar-note" style="margin-top:10px">Same-sector competitors (tap any to analyse). Comparative metrics aren’t available from our free data sources.</p>'}`;

    // Row click loads that peer (except the current stock).
    body.querySelectorAll('tbody tr').forEach((tr) => tr.addEventListener('click', () => {
      const s = tr.dataset.sym;
      if (s && s !== symbols_strip(symbol)) selectSymbol(s);
    }));
  }
  const symbols_strip = (s) => String(s || '').toUpperCase().replace(/\.(NS|BO)$/, '');

  // ------------------------------------- recommendation + trend analysis
  // Build plain-English fundamental reasons from a fundamentals payload.
  function fundamentalReasons(f) {
    if (!f) return [];
    const R = [];
    const pct = (x, dp = 1) => (x * 100).toFixed(dp) + '%';

    if (f.peRatio != null) {
      if (f.peRatio > 0 && f.peRatio < 15) R.push({ good: true, text: `Attractively valued — P/E of ${f.peRatio.toFixed(1)} is on the lower side.` });
      else if (f.peRatio <= 30) R.push({ good: null, text: `Reasonable valuation — P/E of ${f.peRatio.toFixed(1)}.` });
      else if (f.peRatio > 40) R.push({ good: false, text: `Rich valuation — P/E of ${f.peRatio.toFixed(1)} is steep; priced for high growth.` });
    }
    if (f.pegRatio != null) {
      if (f.pegRatio > 0 && f.pegRatio < 1) R.push({ good: true, text: `Cheap relative to growth — PEG of ${f.pegRatio.toFixed(2)} (below 1).` });
      else if (f.pegRatio > 2) R.push({ good: false, text: `Expensive relative to growth — PEG of ${f.pegRatio.toFixed(2)}.` });
    }
    if (f.returnOnEquity != null) {
      if (f.returnOnEquity >= 0.18) R.push({ good: true, text: `Highly profitable — return on equity of ${pct(f.returnOnEquity)}.` });
      else if (f.returnOnEquity >= 0.10) R.push({ good: true, text: `Solid profitability — ROE of ${pct(f.returnOnEquity)}.` });
      else if (f.returnOnEquity < 0.05) R.push({ good: false, text: `Weak profitability — ROE of only ${pct(f.returnOnEquity)}.` });
    }
    if (f.debtToEquity != null) {
      const x = (f.debtToEquity / 100).toFixed(2);
      if (f.debtToEquity < 50) R.push({ good: true, text: `Healthy balance sheet — low debt-to-equity of ${x}x.` });
      else if (f.debtToEquity > 150) R.push({ good: false, text: `High leverage — debt-to-equity of ${x}x.` });
    }
    if (f.revenueGrowth != null) {
      if (f.revenueGrowth >= 0.10) R.push({ good: true, text: `Strong top-line growth — revenue up ${pct(f.revenueGrowth)} YoY.` });
      else if (f.revenueGrowth < 0) R.push({ good: false, text: `Revenue is shrinking — down ${pct(Math.abs(f.revenueGrowth))} YoY.` });
    }
    if (f.earningsGrowth != null && f.earningsGrowth >= 0.15) R.push({ good: true, text: `Profits growing fast — earnings up ${pct(f.earningsGrowth)} YoY.` });
    if (f.profitMargins != null && f.profitMargins >= 0.15) R.push({ good: true, text: `Healthy net margin of ${pct(f.profitMargins)}.` });
    if (f.dividendYield != null && f.dividendYield >= 0.015) R.push({ good: true, text: `Rewards holders — dividend yield of ${pct(f.dividendYield)}.` });
    return R;
  }

  async function renderSignals(symbol, fund) {
    const recoCard = el('div', 'card section fade-in col-half');
    recoCard.innerHTML = `
      <div class="section__head"><div class="section__title">🎯 Recommendation</div></div>
      <div id="recoBody"><div class="skeleton" style="height:150px;border-radius:12px"></div></div>`;
    report.appendChild(recoCard);

    const trendCard = el('div', 'card section fade-in col-half');
    trendCard.innerHTML = `
      <div class="section__head"><div class="section__title">📊 Trend Analysis</div></div>
      <div id="trendBody"><div class="skeleton" style="height:120px;border-radius:12px"></div></div>`;
    report.appendChild(trendCard);

    let history;
    try { history = await api('/api/history?symbol=' + encodeURIComponent(symbol) + '&range=10y&interval=1d&events='); }
    catch (_) {
      $('#recoBody', recoCard).innerHTML = '<p class="muted" style="padding:16px 4px">Not enough data to generate a signal.</p>';
      $('#trendBody', trendCard).innerHTML = '';
      return;
    }
    const s = ESACharts.computeSignals(history);
    if (!s) {
      $('#recoBody', recoCard).innerHTML = '<p class="muted" style="padding:16px 4px">Not enough price history for a technical signal.</p>';
      $('#trendBody', trendCard).innerHTML = '';
      return;
    }

    // --- Recommendation badge ---
    // needle position: score -3..+3 -> 0..100%
    const needlePct = ((s.score + 3) / 6) * 100;
    const icon = (good) => good === true ? '<span class="ic up">✔</span>'
      : good === false ? '<span class="ic down">✕</span>'
      : '<span class="ic muted">•</span>';
    const li = (r) => `<li>${icon(r.good)}<span>${esc(r.text)}</span></li>`;

    // Only include fundamental reasons when the fundamentals are REAL, never fabricated.
    const fReasons = (fund && !fund.mock) ? fundamentalReasons(fund) : [];
    const positives = [...s.reasons, ...fReasons].filter((r) => r.good === true).length;
    const negatives = [...s.reasons, ...fReasons].filter((r) => r.good === false).length;
    const lead = s.action === 'BUY'
      ? `The technical setup is <b class="up">bullish</b>. Here's the read on the price action:`
      : s.action === 'SELL'
        ? `The technical timing looks <b class="down">bearish</b>. Here's the read on the price action:`
        : `The technicals are <b>mixed</b>. Here's the read on the price action:`;

    $('#recoBody', recoCard).innerHTML = `
      <div class="reco">
        <div class="reco__badge ${s.action}">
          <span>${s.action}</span><small>${s.action === 'HOLD' ? 'NEUTRAL' : s.action === 'BUY' ? '🟢 BULLISH' : '🔴 BEARISH'}</small>
        </div>
        <div class="reco__body">
          <div class="reco__score">
            <span class="down" style="font-size:11px;font-weight:700">SELL</span>
            <div class="reco__meter"><div class="reco__needle" style="left:calc(${needlePct}% - 1.5px)"></div></div>
            <span class="up" style="font-size:11px;font-weight:700">BUY</span>
          </div>
          <p class="reco__lead">${lead} <span class="muted">(${positives} positive${positives === 1 ? '' : 's'}${negatives ? `, ${negatives} caution${negatives === 1 ? '' : 's'}` : ''})</span></p>

          <div class="reco__grouphdr">📈 Technicals</div>
          <ul class="reco__reasons">${s.reasons.map(li).join('')}</ul>

          ${fReasons.length ? `
            <div class="reco__grouphdr">🧾 Fundamentals</div>
            <ul class="reco__reasons">${fReasons.map(li).join('')}</ul>` : ''}

          <p class="reco__disclaimer">⚠️ Rule-based ${fReasons.length ? 'technical & fundamental' : 'technical'} signal — <b>not financial advice</b>. Data may be delayed. Consult a SEBI-registered advisor before investing.</p>
        </div>
      </div>`;

    // --- Trend Analysis ---
    const crossStatus = s.crossState === 'golden'
      ? `<span class="pill-status good">▲ Golden cross</span>`
      : s.crossState === 'death' ? `<span class="pill-status bad">▼ Death cross</span>` : '—';
    const priceStatus = s.priceAbove200 === true
      ? `<span class="pill-status good">Above 200-DMA</span>`
      : s.priceAbove200 === false ? `<span class="pill-status bad">Below 200-DMA</span>` : '—';
    const rsiStatus = s.rsiZone === 'oversold' ? `<span class="pill-status good">Oversold</span>`
      : s.rsiZone === 'overbought' ? `<span class="pill-status bad">Overbought</span>`
      : `<span class="pill-status mid">Neutral</span>`;

    $('#trendBody', trendCard).innerHTML = `
      <div class="trend-grid">
        <div class="trend-item">
          <div class="trend-item__label">50-DMA vs 200-DMA</div>
          <div class="trend-item__value">${crossStatus}</div>
          <div class="trend-item__note">50D ₹${fmtNum(s.ma50)} · 200D ₹${fmtNum(s.ma200)}</div>
        </div>
        <div class="trend-item">
          <div class="trend-item__label">Price vs 200-DMA</div>
          <div class="trend-item__value">${priceStatus}</div>
          <div class="trend-item__note">Last ₹${fmtNum(s.price)}</div>
        </div>
        <div class="trend-item">
          <div class="trend-item__label">RSI (14)</div>
          <div class="trend-item__value">${s.rsi == null ? '—' : s.rsi.toFixed(1)} ${rsiStatus}</div>
          <div class="trend-item__note">${s.rsiZone === 'oversold' ? '&lt; 30 suggests oversold' : s.rsiZone === 'overbought' ? '&gt; 70 suggests overbought' : '30–70 range'}</div>
        </div>
      </div>`;
  }

  // --------------------------------------------------- revenue & profit
  const toCr = (v) => (v == null ? null : v / 1e7);
  const fmtCrShort = (v) => {
    if (v == null) return '—';
    const cr = v / 1e7;
    if (cr >= 1e5) return '₹' + (cr / 1e5).toFixed(2) + 'L Cr';
    return '₹' + cr.toLocaleString('en-IN', { maximumFractionDigits: 0 }) + ' Cr';
  };

  async function renderFinancials(symbol) {
    const card = el('div', 'card section fade-in col-half');
    card.innerHTML = `
      <div class="section__head">
        <div class="section__title">💰 Revenue & Profit</div>
        <div class="section__controls" id="finControls"></div>
      </div>
      <div class="chart-host" id="finHost" style="min-height:260px"></div>
      <div class="bars-legend" id="finLegend"></div>`;
    report.appendChild(card);
    const finHost = $('#finHost', card);
    finHost.innerHTML = '<div class="skeleton" style="height:260px;border-radius:12px"></div>';

    let data;
    try { data = await api('/api/financials?symbol=' + encodeURIComponent(symbol)); }
    catch (_) { data = null; }

    // Never show fabricated revenue/profit. If the feed is demo/unavailable,
    // show an honest note pointing to the real annual reports below.
    if (!data || data.mock || !((data.annual || []).length || (data.quarterly || []).length)) {
      finHost.style.minHeight = 'auto';
      finHost.innerHTML =
        `<div class="unavail">
           <div class="unavail__ic">🔒</div>
           <p>Detailed revenue &amp; profit history isn't available from our free data sources.</p>
           <p class="muted">See the <b>Annual Reports</b> section below for the official figures.</p>
         </div>`;
      return;
    }

    // Real data → render the controls, legend and chart.
    $('#finControls', card).innerHTML = `
      <div class="segmented" data-group="fin">
        <button data-fin="annual" class="active">Annual</button>
        <button data-fin="quarterly">Quarterly</button>
      </div>`;
    $('#finLegend', card).innerHTML = `
      <span><i class="legend-dot" style="background:var(--accent-2)"></i> Revenue</span>
      <span><i class="legend-dot" style="background:var(--buy)"></i> Net Profit</span>`;

    const t = ESACharts.themeColors();
    const draw = (mode) => {
      const rows = (data[mode] || []).slice(-10);
      if (!rows.length) { finHost.innerHTML = '<p class="muted" style="padding:24px 8px">No ' + mode + ' data.</p>'; return; }
      finHost.innerHTML = '';
      ESACharts.groupedBars(finHost, {
        categories: rows.map((r) => r.period),
        series: [
          { name: 'Revenue', color: t.accent2, values: rows.map((r) => toCr(r.revenue)) },
          { name: 'Net Profit', color: t.buy, values: rows.map((r) => toCr(r.profit)) },
        ],
        fmt: (v) => '₹' + (v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }) + ' Cr',
        height: 260,
      });
    };
    draw('annual');
    card.querySelectorAll('[data-group="fin"] button').forEach((b) => b.addEventListener('click', () => {
      card.querySelectorAll('[data-group="fin"] button').forEach((x) => x.classList.toggle('active', x === b));
      draw(b.dataset.fin);
    }));
  }

  // ------------------------------------------------- shareholding pattern
  async function renderShareholding(symbol) {
    const card = el('div', 'card section fade-in col-half');
    card.innerHTML = `
      <div class="section__head">
        <div class="section__title">🏦 Shareholding Pattern</div>
        <span id="shpTrend"></span>
      </div>
      <div id="shpCurrent"></div>
      <div class="chart-host" id="shpHost" style="min-height:240px;margin-top:6px"></div>
      <div class="bars-legend" id="shpLegend"></div>`;
    report.appendChild(card);
    const shpHost = $('#shpHost', card);
    shpHost.innerHTML = '<div class="skeleton" style="height:240px;border-radius:12px"></div>';

    let data;
    try { data = await api('/api/shareholding?symbol=' + encodeURIComponent(symbol)); }
    catch (_) { data = null; }

    // Never show fabricated shareholding %. Only display real data.
    if (!data || data.mock || data.available === false || !(data.quarters && data.quarters.length)) {
      card.querySelector('#shpCurrent').innerHTML =
        `<div class="unavail">
           <div class="unavail__ic">🔒</div>
           <p>Live shareholding data (promoter / FII / DII / public) isn't available from our free sources.</p>
           <p class="muted">Check the company's quarterly filing on <a href="https://www.screener.in/company/${esc(symbols_strip(symbol))}/" target="_blank" rel="noopener noreferrer">Screener.in</a> or NSE/BSE.</p>
         </div>`;
      shpHost.style.minHeight = 'auto';
      shpHost.innerHTML = '';
      return;
    }

    const t = ESACharts.themeColors();
    const buckets = [
      { key: 'promoter', name: 'Promoter', color: t.accent },
      { key: 'fii', name: 'FII', color: t.accent2 },
      { key: 'dii', name: 'DII', color: t.hold },
      { key: 'public', name: 'Public', color: t.buy },
    ];
    const latest = data.quarters[data.quarters.length - 1];

    // Trend flag
    const tf = data.promoterTrend || 'stable';
    const tfIcon = tf === 'rising' ? '📈' : tf === 'falling' ? '📉' : '➖';
    card.querySelector('#shpTrend').innerHTML =
      `<span class="trend-flag ${tf}">${tfIcon} Promoter ${tf}</span>`;

    // Current-quarter cells
    card.querySelector('#shpCurrent').innerHTML =
      `<div class="shp-current">` + buckets.map((b) =>
        `<div class="shp-cell"><span class="shp-cell__label"><i class="dot" style="background:${b.color}"></i>${b.name}</span>
           <span class="shp-cell__val">${(latest[b.key] ?? 0).toFixed(1)}%</span></div>`).join('') + `</div>`;

    // Legend
    card.querySelector('#shpLegend').innerHTML = buckets.map((b) =>
      `<span><i class="legend-dot" style="background:${b.color}"></i> ${b.name}</span>`).join('');

    shpHost.innerHTML = '';
    ESACharts.stackedBars(shpHost, {
      categories: data.quarters.map((q) => q.quarter),
      series: buckets.map((b) => ({ name: b.name, color: b.color, values: data.quarters.map((q) => q[b.key] || 0) })),
      height: 240,
    });
  }

  // ------------------------------------------------------ 10-year price chart
  let chartHandle = null;

  function destroyChart() { if (chartHandle) { chartHandle.destroy(); chartHandle = null; } }

  async function renderPriceSection(symbol) {
    destroyChart();
    const t = window.ESACharts ? ESACharts.themeColors() : {};
    const card = el('div', 'card section fade-in');
    card.innerHTML = `
      <div class="section__head">
        <div class="section__title">📈 10-Year Price</div>
        <div class="section__controls">
          <div class="segmented" data-group="type">
            <button data-type="candle" class="active">Candle</button>
            <button data-type="line">Line</button>
          </div>
          <div class="segmented" data-group="range">
            <button data-range="1">1Y</button>
            <button data-range="5">5Y</button>
            <button data-range="10" class="active">10Y</button>
          </div>
        </div>
      </div>
      <div class="chart-host" id="priceHost"></div>
      <div class="chart-legend">
        <span><i class="legend-swatch" style="background:var(--accent-2)"></i> 50-day MA</span>
        <span><i class="legend-swatch" style="background:var(--hold)"></i> 200-day MA</span>
        <span>🟡 Dividend · 🔻 Split/Bonus</span>
      </div>

      <div class="rsi-block">
        <div class="rsi-head">
          <span class="rsi-title">RSI (14)</span>
          <span class="rsi-readout" id="rsiReadout">—</span>
        </div>
        <div class="chart-host" id="rsiHost" style="min-height:130px"></div>
      </div>`;
    report.appendChild(card);

    const host = $('#priceHost', card);
    host.innerHTML = '<div class="skeleton" style="height:380px;border-radius:12px;"></div>';

    let history;
    try {
      history = await api('/api/history?symbol=' + encodeURIComponent(symbol) + '&range=10y&interval=1d&events=div,splits');
    } catch (err) {
      host.innerHTML = `<p class="muted" style="padding:24px 8px">Price history unavailable${err.status === 429 ? ' (rate-limited)' : ''}.</p>`;
      return;
    }
    host.innerHTML = '';
    const rsiHost = $('#rsiHost', card);
    chartHandle = ESACharts.priceChart(host, history, {
      height: 380, hold: t.hold, accent2: t.accent2,
      rsiContainer: rsiHost, rsiHeight: 130,
    });

    // RSI readout with overbought/oversold labelling.
    const rv = chartHandle.latestRsi;
    const readout = $('#rsiReadout', card);
    if (rv == null) { readout.textContent = 'n/a'; }
    else {
      const zone = rv >= 70 ? ['Overbought', 'down'] : rv <= 30 ? ['Oversold', 'up'] : ['Neutral', 'dim'];
      readout.innerHTML = `<b class="mono">${rv.toFixed(1)}</b> <span class="${zone[1]}">${zone[0]}</span>`;
    }

    // Wire the segmented controls.
    card.querySelectorAll('[data-group="type"] button').forEach((b) => {
      b.addEventListener('click', () => {
        card.querySelectorAll('[data-group="type"] button').forEach((x) => x.classList.toggle('active', x === b));
        chartHandle && chartHandle.setType(b.dataset.type);
      });
    });
    card.querySelectorAll('[data-group="range"] button').forEach((b) => {
      b.addEventListener('click', () => {
        card.querySelectorAll('[data-group="range"] button').forEach((x) => x.classList.toggle('active', x === b));
        chartHandle && chartHandle.setRange(+b.dataset.range);
      });
    });
  }

  // Restyle chart(s) when the theme changes.
  window.addEventListener('esa:themechange', () => {
    if (chartHandle) chartHandle.applyTheme();
    if (cmpHandle) cmpHandle.applyTheme();
  });

  function renderError(symbol, err) {
    const rl = err && err.status === 429;
    report.innerHTML = '';
    const card = el('div', 'card error-card fade-in');
    card.innerHTML = `
      <h3>Couldn't load ${esc(symbol)}</h3>
      <p class="dim">${rl
        ? 'Upstream data source is rate-limiting requests right now. Please try again shortly.'
        : 'We couldn\'t fetch data for this ticker. Check the symbol and try again.'}</p>`;
    report.appendChild(card);
  }

  function renderHeader(symbol, quote, fund) {
    const name = (fund && fund.name) || (quote && quote.companyName) || symbol;
    const price = (quote && quote.lastPrice) ?? (fund && fund.price);
    const chg = (quote && quote.change) ?? (fund && fund.change);
    const chgPct = (quote && quote.changePercent) ?? (fund && fund.changePercent != null ? fund.changePercent * 100 : null);
    const up = (chg ?? 0) >= 0;
    const priceMock = quote ? !!quote.mock : !!(fund && fund.mock); // is the PRICE demo?
    const sector = fund && fund.sector;
    const industry = (fund && fund.industry) || (quote && quote.industry);
    const asOf = (quote && quote.asOf) || (fund && fund.asOf);

    report.innerHTML = '';
    const card = el('div', 'card rheader fade-in');
    card.innerHTML = `
      <div class="rheader__top">
        <div class="rheader__name">
          <div class="rheader__company">${esc(name)}</div>
          <div class="rheader__meta">
            <span class="tag">${esc(symbol)}</span>
            ${sector ? `<span class="tag">${esc(sector)}</span>` : ''}
            ${industry ? `<span>${esc(industry)}</span>` : ''}
          </div>
        </div>
        <div class="rheader__actions">
          <button class="iconbtn" id="expPdf" title="Download as PDF">⬇️ PDF</button>
          <button class="iconbtn" id="expImg" title="Save as image">🖼️ Image</button>
          <button class="star" title="Add to watchlist" aria-label="Add to watchlist">☆</button>
        </div>

      </div>

      <div class="rheader__price">
        <span class="price-big" id="priceBig">—</span>
        <span class="price-chg ${up ? 'up' : 'down'}">
          ${up ? '▲' : '▼'} ${chg == null ? '—' : fmtNum(Math.abs(chg))}
          (${chgPct == null ? '—' : fmtPct(Math.abs(chgPct))})
        </span>
      </div>

      <div class="rheader__stats stagger">
        <div class="stat"><span class="stat__label">Prev Close</span><span class="stat__value">₹${fmtNum(quote && quote.previousClose)}</span></div>
        <div class="stat"><span class="stat__label">Day Range</span><span class="stat__value">${quote && quote.dayLow != null ? fmtNum(quote.dayLow) + '–' + fmtNum(quote.dayHigh) : '—'}</span></div>
        <div class="stat"><span class="stat__label">Volume</span><span class="stat__value">${fmtVol(quote && quote.volume)}</span></div>
        <div class="stat"><span class="stat__label">52W High</span><span class="stat__value">${fmtNum((quote && quote.yearHigh) ?? (fund && fund.fiftyTwoWeekHigh))}</span></div>
        <div class="stat"><span class="stat__label">52W Low</span><span class="stat__value">${fmtNum((quote && quote.yearLow) ?? (fund && fund.fiftyTwoWeekLow))}</span></div>
      </div>

      <div class="freshness">
        <span class="dot"></span>
        as of ${asOf ? new Date(asOf).toLocaleString('en-IN') : 'just now'}
        ${priceMock
          ? '<span class="badge-demo">DEMO PRICE</span>'
          : '<span class="badge-live">🟢 LIVE · delayed</span>'}
      </div>`;
    report.appendChild(card);

    const priceNode = $('#priceBig', card);
    animateNumber(priceNode, price, { prefix: '₹', dp: 2 });

    // Watchlist star — backed by the persistent store.
    const star = $('.star', card);
    const paint = (on) => {
      star.classList.toggle('on', on);
      star.textContent = on ? '★' : '☆';
      star.title = on ? 'Remove from watchlist' : 'Add to watchlist';
      star.setAttribute('aria-label', star.title);
    };
    if (window.ESAStore) {
      paint(ESAStore.isWatched(symbol));
      star.addEventListener('click', () => paint(ESAStore.toggleWatch(symbol, name)));
    }

    // Export controls.
    const pdfBtn = $('#expPdf', card), imgBtn = $('#expImg', card);
    if (pdfBtn) pdfBtn.addEventListener('click', () => window.ESAExport && ESAExport.toPDF());
    if (imgBtn) imgBtn.addEventListener('click', () => window.ESAExport && ESAExport.toImage(imgBtn));
  }

  // ================================================================ VIEWS
  const navtabs = $('#navtabs');

  function switchView(name) {
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
    document.querySelectorAll('.navtab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
    if (name === 'watchlist') renderWatchlist(ESAStore.getWatchlist());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  navtabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.navtab');
    if (tab) switchView(tab.dataset.view);
  });

  function goHomeAndLoad(sym) { switchView('home'); selectSymbol(sym); }

  // ---------------------------------------------------------- recents chips
  const recentsBox = $('#recents');
  const recentsRow = $('#recentsRow');
  $('#recentsClear').addEventListener('click', () => ESAStore.clearRecents());

  function renderRecents(list) {
    recentsRow.innerHTML = '';
    if (!list.length) { recentsBox.hidden = true; return; }
    recentsBox.hidden = false;
    list.forEach((r) => {
      const chip = el('button', 'chip rchip', `<span>🕘</span> ${esc(r.symbol)}`);
      chip.type = 'button';
      chip.addEventListener('click', () => selectSymbol(r.symbol));
      recentsRow.appendChild(chip);
    });
  }

  // ---------------------------------------------------- watchlist nav count
  const wlCount = $('#wlCount');
  function renderCount(list) {
    const n = list.length;
    wlCount.textContent = n;
    wlCount.classList.remove('bump');
    void wlCount.offsetWidth; // restart animation
    wlCount.classList.add('bump');
  }

  // -------------------------------------------------------- watchlist cards
  const wlBody = $('#wlBody');
  const quoteCache = new Map();
  const sparkCache = new Map();

  function renderWatchlist(list) {
    wlBody.innerHTML = '';
    if (!list.length) {
      wlBody.innerHTML = `
        <div class="card wl-empty fade-in">
          <div class="wl-empty__art">🌟</div>
          <h3>Your watchlist is empty</h3>
          <p>Star a stock to track it here. Search any NSE ticker and tap the ☆ on its report.</p>
        </div>`;
      return;
    }
    const grid = el('div', 'wl-grid');
    list.forEach((w) => grid.appendChild(watchCard(w)));
    wlBody.appendChild(grid);
  }

  function watchCard(w) {
    const card = el('div', 'card wlcard fade-in');
    card.innerHTML = `
      <div class="wlcard__top">
        <div>
          <div class="wlcard__sym">${esc(w.symbol)}</div>
          <div class="wlcard__name">${esc(w.name || '')}</div>
        </div>
        <button class="wlcard__remove" title="Remove" aria-label="Remove from watchlist">✕</button>
      </div>
      <div class="wlcard__price"><span class="skeleton" style="display:inline-block;height:22px;width:110px;vertical-align:middle"></span></div>
      <div class="wlcard__chg"><span class="skeleton" style="display:inline-block;height:13px;width:80px"></span></div>
      <div class="wlcard__spark wlcard__spark--ph skeleton"></div>`;

    // Navigate on card click (but not when hitting the remove button).
    card.addEventListener('click', (e) => {
      if (e.target.closest('.wlcard__remove')) return;
      goHomeAndLoad(w.symbol);
    });
    $('.wlcard__remove', card).addEventListener('click', () => ESAStore.removeWatch(w.symbol));

    hydrateCard(card, w.symbol);
    return card;
  }

  async function hydrateCard(card, symbol) {
    const sp = $('.wlcard__spark', card);
    try {
      let q = quoteCache.get(symbol);
      if (!q) { q = await api('/api/quote?symbol=' + encodeURIComponent(symbol)); quoteCache.set(symbol, q); }
      const up = (q.change ?? 0) >= 0;
      $('.wlcard__price', card).textContent = '₹' + fmtNum(q.lastPrice);
      const chg = $('.wlcard__chg', card);
      chg.className = 'wlcard__chg ' + (up ? 'up' : 'down');
      chg.innerHTML = `${up ? '▲' : '▼'} ${fmtNum(Math.abs(q.change ?? 0))} (${fmtPct(Math.abs(q.changePercent ?? 0))})`;

      // Mini sparkline — 6 months of weekly closes, coloured by trend.
      try {
        let h = sparkCache.get(symbol);
        if (!h) { h = await api('/api/history?symbol=' + encodeURIComponent(symbol) + '&range=6mo&interval=1wk&events='); sparkCache.set(symbol, h); }
        const closes = (h.candles || []).map((c) => c.close);
        sp.classList.remove('skeleton', 'wlcard__spark--ph');
        const trendUp = closes.length > 1 ? closes[closes.length - 1] >= closes[0] : up;
        const css = getComputedStyle(document.documentElement);
        ESACharts.sparkline(sp, closes, { color: (css.getPropertyValue(trendUp ? '--up' : '--down') || '').trim() || undefined });
      } catch (_) { sp.classList.remove('skeleton'); sp.style.opacity = '0'; }
    } catch (_) {
      $('.wlcard__chg', card).textContent = 'Data unavailable';
      if (sp) { sp.classList.remove('skeleton'); sp.style.opacity = '0'; }
    }
  }

  // Subscribe to store changes so UI stays in sync (incl. cross-tab).
  ESAStore.on('recents', renderRecents);
  ESAStore.on('watchlist', (list) => {
    renderCount(list);
    quoteCache.clear();
    sparkCache.clear();
    if ($('#view-watchlist').classList.contains('active')) renderWatchlist(list);
  });

  // Initial paint from persisted state.
  renderRecents(ESAStore.getRecents());
  wlCount.textContent = ESAStore.watchCount();

  // Expose for later steps / debugging.
  window.ESA = { loadStock, api, switchView };

  // Backend health (dev signal in console).
  api('/api/health').then((h) => console.log('backend:', h.ok ? 'ok' : 'down')).catch(() => {});
})();
