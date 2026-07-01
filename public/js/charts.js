/* Charting helpers built on TradingView Lightweight Charts (window.LightweightCharts).
   window.ESACharts exposes builders that return a handle: { destroy, applyTheme }. */
(function () {
  'use strict';

  const LWC = window.LightweightCharts;

  // Read themed colors from CSS custom properties so charts match the app.
  function themeColors() {
    const s = getComputedStyle(document.documentElement);
    const v = (n, f) => (s.getPropertyValue(n).trim() || f);
    return {
      text: v('--text-dim', '#a7b0c4'),
      grid: v('--border', '#232b3d'),
      up: v('--up', '#16f5a3'),
      down: v('--down', '#ff4d6d'),
      accent: v('--accent', '#7c5cff'),
      accent2: v('--accent-2', '#22d3ee'),
      hold: v('--hold', '#ffb020'),
      buy: v('--buy', '#16f5a3'),
    };
  }

  const toDate = (ts) => new Date(ts * 1000).toISOString().slice(0, 10); // 'YYYY-MM-DD'

  // Simple moving average aligned to the source series (nulls until warmed up).
  function sma(closes, period) {
    const out = new Array(closes.length).fill(null);
    let sum = 0;
    for (let i = 0; i < closes.length; i++) {
      sum += closes[i];
      if (i >= period) sum -= closes[i - period];
      if (i >= period - 1) out[i] = +(sum / period).toFixed(2);
    }
    return out;
  }

  // Relative Strength Index (Wilder's smoothing), aligned to the close series.
  function rsi(closes, period = 14) {
    const out = new Array(closes.length).fill(null);
    if (closes.length <= period) return out;
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) {
      const d = closes[i] - closes[i - 1];
      if (d >= 0) gain += d; else loss -= d;
    }
    let avgGain = gain / period, avgLoss = loss / period;
    out[period] = 100 - 100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss));
    for (let i = period + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      const g = d > 0 ? d : 0, l = d < 0 ? -d : 0;
      avgGain = (avgGain * (period - 1) + g) / period;
      avgLoss = (avgLoss * (period - 1) + l) / period;
      const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
      out[i] = +(100 - 100 / (1 + rs)).toFixed(2);
    }
    return out;
  }

  /**
   * Mount the price chart into `container` from a /api/history payload.
   * Renders candlesticks (+ a close line toggle), 50/200-day MAs and
   * dividend/split markers. Returns a handle with destroy() + applyTheme().
   */
  function priceChart(container, history, opts = {}) {
    if (!LWC) { container.innerHTML = '<p class="muted" style="padding:20px">Chart library failed to load.</p>'; return { destroy() {}, applyTheme() {} }; }

    const candlesAll = (history.candles || []).slice().sort((a, b) => a.time - b.time);
    if (!candlesAll.length) { container.innerHTML = '<p class="muted" style="padding:20px">No price history available.</p>'; return { destroy() {}, applyTheme() {} }; }

    const closes = candlesAll.map((c) => c.close);
    const ma50All = sma(closes, 50);
    const ma200All = sma(closes, 200);
    const rsiAll = rsi(closes, 14);

    // Precompute per-point series with date-string time.
    const rows = candlesAll.map((c, i) => ({
      time: toDate(c.time),
      candle: { time: toDate(c.time), open: c.open, high: c.high, low: c.low, close: c.close },
      line: { time: toDate(c.time), value: c.close },
      ma50: ma50All[i] == null ? null : { time: toDate(c.time), value: ma50All[i] },
      ma200: ma200All[i] == null ? null : { time: toDate(c.time), value: ma200All[i] },
      rsi: rsiAll[i] == null ? null : { time: toDate(c.time), value: rsiAll[i] },
      ts: c.time,
    }));

    // Latest RSI reading (for the header readout / trend analysis).
    const latestRsi = (() => { for (let i = rsiAll.length - 1; i >= 0; i--) if (rsiAll[i] != null) return rsiAll[i]; return null; })();

    // Markers for corporate actions.
    const events = [];
    (history.dividends || []).forEach((d) => events.push({
      time: toDate(d.time), position: 'belowBar', color: opts.hold, shape: 'circle',
      text: 'Div ₹' + d.amount, kind: 'div', ts: d.time,
    }));
    (history.splits || []).forEach((sp) => events.push({
      time: toDate(sp.time), position: 'aboveBar', color: opts.accent2, shape: 'arrowDown',
      text: 'Split ' + sp.ratio, kind: 'split', ts: sp.time,
    }));

    let chart, candleSeries, lineSeries, ma50Series, ma200Series, ro;
    let rsiCh, rsiSeries, rsiRo, syncUnsub;
    let mode = opts.type || 'candle';      // 'candle' | 'line'
    let rangeYears = opts.rangeYears || 10;

    function build() {
      const t = themeColors();
      chart = LWC.createChart(container, {
        autoSize: false,
        width: container.clientWidth,
        height: opts.height || 380,
        layout: { background: { type: 'solid', color: 'transparent' }, textColor: t.text, fontFamily: 'Inter, system-ui, sans-serif' },
        grid: { vertLines: { color: 'transparent' }, horzLines: { color: t.grid } },
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false, rightOffset: 6, fixLeftEdge: true, minBarSpacing: 0.05 },
        crosshair: { mode: LWC.CrosshairMode ? LWC.CrosshairMode.Normal : 0 },
        handleScale: { axisPressedMouseMove: true },
        localization: { priceFormatter: (p) => '₹' + p.toLocaleString('en-IN', { maximumFractionDigits: 2 }) },
      });

      candleSeries = chart.addCandlestickSeries({
        upColor: t.up, downColor: t.down, borderUpColor: t.up, borderDownColor: t.down,
        wickUpColor: t.up, wickDownColor: t.down,
      });
      lineSeries = chart.addLineSeries({ color: t.accent, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: true });
      ma50Series = chart.addLineSeries({ color: t.accent2, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      ma200Series = chart.addLineSeries({ color: t.hold, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });

      applyData();
      applyMode();

      ro = new ResizeObserver(() => { if (chart) chart.applyOptions({ width: container.clientWidth }); });
      ro.observe(container);

      if (opts.rsiContainer) buildRsi(opts.rsiContainer);
    }

    function buildRsi(rc) {
      const t = themeColors();
      rsiCh = LWC.createChart(rc, {
        width: rc.clientWidth, height: opts.rsiHeight || 130,
        layout: { background: { type: 'solid', color: 'transparent' }, textColor: t.text, fontFamily: 'Inter, system-ui, sans-serif' },
        grid: { vertLines: { color: 'transparent' }, horzLines: { color: 'transparent' } },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } },
        timeScale: { borderVisible: false, visible: false, minBarSpacing: 0.05 },
        crosshair: { mode: LWC.CrosshairMode ? LWC.CrosshairMode.Normal : 0 },
        handleScroll: false, handleScale: false, // pure follower of the price chart
      });
      rsiSeries = rsiCh.addLineSeries({
        color: t.accent, lineWidth: 2, priceLineVisible: false, lastValueVisible: true,
        autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
      });
      // Overbought / oversold reference lines.
      rsiSeries.createPriceLine({ price: 70, color: t.down, lineStyle: 2, lineWidth: 1, axisLabelVisible: true, title: '70' });
      rsiSeries.createPriceLine({ price: 30, color: t.up, lineStyle: 2, lineWidth: 1, axisLabelVisible: true, title: '30' });
      rsiSeries.createPriceLine({ price: 50, color: t.grid, lineStyle: 3, lineWidth: 1, axisLabelVisible: false });

      applyRsiData();

      // Keep the RSI panel horizontally aligned with the price chart.
      const onRange = (r) => { if (r && rsiCh) rsiCh.timeScale().setVisibleLogicalRange(r); };
      chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
      syncUnsub = () => chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      rsiRo = new ResizeObserver(() => { if (rsiCh) rsiCh.applyOptions({ width: rc.clientWidth }); });
      rsiRo.observe(rc);
    }

    function applyRsiData() {
      if (!rsiSeries) return;
      rsiSeries.setData(visibleRows().filter((r) => r.rsi).map((r) => r.rsi));
      const lr = chart.timeScale().getVisibleLogicalRange();
      if (lr) rsiCh.timeScale().setVisibleLogicalRange(lr);
    }

    function visibleRows() {
      if (rangeYears >= 10) return rows;
      const cutoff = (rows[rows.length - 1].ts) - rangeYears * 365 * 86400;
      return rows.filter((r) => r.ts >= cutoff);
    }

    function applyData() {
      const vr = visibleRows();
      candleSeries.setData(vr.map((r) => r.candle));
      lineSeries.setData(vr.map((r) => r.line));
      ma50Series.setData(vr.filter((r) => r.ma50).map((r) => r.ma50));
      ma200Series.setData(vr.filter((r) => r.ma200).map((r) => r.ma200));
      const from = vr[0] && vr[0].time;
      const seen = new Set(vr.map((r) => r.time));
      const marks = events.filter((e) => e.time >= (from || '')).map(({ kind, ts, ...m }) => m)
        .sort((a, b) => (a.time < b.time ? -1 : 1));
      // Attach markers to whichever series is visible.
      (mode === 'candle' ? candleSeries : lineSeries).setMarkers(marks);
      (mode === 'candle' ? lineSeries : candleSeries).setMarkers([]);
      chart.timeScale().fitContent();
      applyRsiData();
    }

    function applyMode() {
      candleSeries.applyOptions({ visible: mode === 'candle' });
      lineSeries.applyOptions({ visible: mode === 'line' });
      applyData(); // re-attach markers to the visible series
    }

    function applyTheme() {
      if (!chart) return;
      const t = themeColors();
      chart.applyOptions({ layout: { textColor: t.text }, grid: { horzLines: { color: t.grid } } });
      candleSeries.applyOptions({ upColor: t.up, downColor: t.down, borderUpColor: t.up, borderDownColor: t.down, wickUpColor: t.up, wickDownColor: t.down });
      lineSeries.applyOptions({ color: t.accent });
      ma50Series.applyOptions({ color: t.accent2 });
      ma200Series.applyOptions({ color: t.hold });
      if (rsiCh) { rsiCh.applyOptions({ layout: { textColor: t.text } }); rsiSeries.applyOptions({ color: t.accent }); }
    }

    build();

    return {
      setType(next) { mode = next; applyMode(); },
      setRange(years) { rangeYears = years; applyData(); },
      latestRsi,
      applyTheme,
      destroy() {
        try {
          if (syncUnsub) syncUnsub();
          if (ro) ro.disconnect();
          if (rsiRo) rsiRo.disconnect();
          if (rsiCh) rsiCh.remove();
          if (chart) chart.remove();
        } catch (_) {}
        chart = null; rsiCh = null;
      },
    };
  }

  // ------------------------------------------------------ SVG bar charts
  const SVGNS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => {
    const n = document.createElementNS(SVGNS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };

  /**
   * Grouped bar chart (e.g. Revenue vs Profit per period).
   * data = { categories:[..], series:[{name,color,values:[..]}], fmt?, unit? }
   */
  function groupedBars(container, data) {
    container.innerHTML = '';
    const cats = data.categories;
    const series = data.series;
    const W = container.clientWidth || 600, H = data.height || 260;
    const pad = { l: 8, r: 8, t: 10, b: 26 };
    const t = themeColors();
    const fmt = data.fmt || ((v) => v);

    const max = Math.max(1, ...series.flatMap((s) => s.values.map((v) => v || 0)));
    const svg = svgEl('svg', { width: '100%', height: H, viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'svg-fade' });
    const plotH = H - pad.t - pad.b, plotW = W - pad.l - pad.r;
    const groupW = plotW / cats.length;
    const barW = Math.max(3, (groupW * 0.62) / series.length);

    // Zero baseline
    svg.appendChild(svgEl('line', { x1: pad.l, y1: pad.t + plotH, x2: W - pad.r, y2: pad.t + plotH, stroke: t.grid, 'stroke-width': 1 }));

    const tip = tooltip(container);
    cats.forEach((cat, ci) => {
      const gx = pad.l + ci * groupW + groupW * 0.19;
      series.forEach((s, si) => {
        const v = s.values[ci] || 0;
        const h = (Math.abs(v) / max) * plotH;
        const x = gx + si * barW;
        const y = pad.t + plotH - h;
        const rect = svgEl('rect', { x, y, width: barW - 1, height: h, rx: 2, fill: s.color, opacity: 0.92 });
        svg.appendChild(rect);
        rect.addEventListener('mousemove', (e) => showTip(tip, container, e, `${cat}<br><b style="color:${s.color}">${s.name}:</b> ${fmt(v)}`));
        rect.addEventListener('mouseleave', () => hideTip(tip));
      });
      // x label
      const lbl = svgEl('text', { x: pad.l + ci * groupW + groupW / 2, y: H - 8, 'text-anchor': 'middle', 'font-size': 10.5, fill: t.text });
      lbl.textContent = cat;
      svg.appendChild(lbl);
    });
    container.appendChild(svg);
  }

  /**
   * 100%-stacked bar chart (e.g. shareholding by quarter).
   * data = { categories:[..], series:[{name,color,values:[..]}] } values are % (0-100)
   */
  function stackedBars(container, data) {
    container.innerHTML = '';
    const cats = data.categories, series = data.series;
    const W = container.clientWidth || 600, H = data.height || 240;
    const pad = { l: 8, r: 8, t: 10, b: 26 };
    const t = themeColors();
    const plotH = H - pad.t - pad.b, plotW = W - pad.l - pad.r;
    const groupW = plotW / cats.length;
    const barW = Math.min(64, groupW * 0.5);
    const svg = svgEl('svg', { width: '100%', height: H, viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'svg-fade' });
    const tip = tooltip(container);

    cats.forEach((cat, ci) => {
      const total = series.reduce((a, s) => a + (s.values[ci] || 0), 0) || 100;
      const x = pad.l + ci * groupW + (groupW - barW) / 2;
      let acc = 0;
      series.forEach((s) => {
        const v = s.values[ci] || 0;
        const h = (v / total) * plotH;
        const y = pad.t + plotH - acc - h;
        const rect = svgEl('rect', { x, y, width: barW, height: h, fill: s.color, opacity: 0.92 });
        svg.appendChild(rect);
        rect.addEventListener('mousemove', (e) => showTip(tip, container, e, `${cat}<br><b style="color:${s.color}">${s.name}:</b> ${v.toFixed(1)}%`));
        rect.addEventListener('mouseleave', () => hideTip(tip));
        acc += h;
      });
      const lbl = svgEl('text', { x: x + barW / 2, y: H - 8, 'text-anchor': 'middle', 'font-size': 10.5, fill: t.text });
      lbl.textContent = cat;
      svg.appendChild(lbl);
    });
    container.appendChild(svg);
  }

  /** Minimal sparkline: a filled line from a values array. No axes. */
  function sparkline(container, values, opts = {}) {
    container.innerHTML = '';
    const vals = (values || []).filter((v) => v != null && !Number.isNaN(v));
    if (vals.length < 2) return;
    const W = container.clientWidth || 140, H = opts.height || 34, pad = 2;
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = max - min || 1;
    const x = (i) => pad + (i / (vals.length - 1)) * (W - pad * 2);
    const y = (v) => pad + (1 - (v - min) / span) * (H - pad * 2);
    const color = opts.color || themeColors().accent;

    const line = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const area = `${line} L${x(vals.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
    const gid = 'sg' + Math.random().toString(36).slice(2, 8);

    const svg = svgEl('svg', { width: '100%', height: H, viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'svg-fade' });
    const defs = svgEl('defs', {});
    const grad = svgEl('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' });
    grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': '0.28' }));
    grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': '0' }));
    defs.appendChild(grad); svg.appendChild(defs);
    svg.appendChild(svgEl('path', { d: area, fill: `url(#${gid})`, stroke: 'none' }));
    svg.appendChild(svgEl('path', { d: line, fill: 'none', stroke: color, 'stroke-width': 1.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    container.appendChild(svg);
  }

  // Shared tiny tooltip.
  function tooltip(container) {
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.style.display = 'none';
    container.appendChild(tip);
    return tip;
  }
  function showTip(tip, container, e, html) {
    const r = container.getBoundingClientRect();
    tip.innerHTML = html;
    tip.style.display = 'block';
    tip.style.left = Math.min(r.width - 120, Math.max(0, e.clientX - r.left + 8)) + 'px';
    tip.style.top = (e.clientY - r.top - 40) + 'px';
  }
  function hideTip(tip) { tip.style.display = 'none'; }

  /**
   * Normalized comparison chart: two series rebased to 0% at the start of the
   * visible range (e.g. stock vs Nifty 50). Returns handle with setRange,
   * applyTheme, destroy, and the latest normalized returns.
   */
  function comparisonChart(container, data, opts = {}) {
    if (!LWC) { container.innerHTML = '<p class="muted" style="padding:20px">Chart library failed to load.</p>'; return { destroy() {}, applyTheme() {}, setRange() {}, returns: {} }; }
    const prep = (candles) => (candles || []).slice().sort((a, b) => a.time - b.time)
      .filter((c) => c.close != null)
      .map((c) => ({ ts: c.time, time: toDate(c.time), close: c.close }));
    const A = prep(data.a.candles), B = prep(data.b.candles);
    if (!A.length || !B.length) { container.innerHTML = '<p class="muted" style="padding:20px">Comparison data unavailable.</p>'; return { destroy() {}, applyTheme() {}, setRange() {}, returns: {} }; }

    let chart, aSer, bSer, ro, rangeYears = opts.rangeYears || 10;
    const latest = {};

    function norm(rows, cutoff) {
      const vis = rows.filter((r) => r.ts >= cutoff);
      if (!vis.length) return { points: [], last: null };
      const base = vis[0].close;
      const points = vis.map((r) => ({ time: r.time, value: +(((r.close / base) - 1) * 100).toFixed(2) }));
      return { points, last: points[points.length - 1].value };
    }

    function build() {
      const t = themeColors();
      chart = LWC.createChart(container, {
        width: container.clientWidth, height: opts.height || 320,
        layout: { background: { type: 'solid', color: 'transparent' }, textColor: t.text, fontFamily: 'Inter, system-ui, sans-serif' },
        grid: { vertLines: { color: 'transparent' }, horzLines: { color: t.grid } },
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false, minBarSpacing: 0.05, fixLeftEdge: true },
        crosshair: { mode: LWC.CrosshairMode ? LWC.CrosshairMode.Normal : 0 },
        localization: { priceFormatter: (p) => (p >= 0 ? '+' : '') + p.toFixed(1) + '%' },
      });
      aSer = chart.addLineSeries({ color: t.accent, lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
      bSer = chart.addLineSeries({ color: t.hold, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, lineStyle: 0 });
      applyData();
      ro = new ResizeObserver(() => { if (chart) chart.applyOptions({ width: container.clientWidth }); });
      ro.observe(container);
    }

    function applyData() {
      const now = A[A.length - 1].ts;
      const cutoff = rangeYears >= 10 ? 0 : now - rangeYears * 365 * 86400;
      const na = norm(A, cutoff), nb = norm(B, cutoff);
      aSer.setData(na.points); bSer.setData(nb.points);
      latest.a = na.last; latest.b = nb.last;
      chart.timeScale().fitContent();
      if (opts.onUpdate) opts.onUpdate(latest);
    }

    function applyTheme() {
      if (!chart) return;
      const t = themeColors();
      chart.applyOptions({ layout: { textColor: t.text }, grid: { horzLines: { color: t.grid } } });
      aSer.applyOptions({ color: t.accent });
      bSer.applyOptions({ color: t.hold });
    }

    build();
    return {
      setRange(y) { rangeYears = y; applyData(); },
      get returns() { return latest; },
      applyTheme,
      destroy() { try { if (ro) ro.disconnect(); if (chart) chart.remove(); } catch (_) {} chart = null; },
    };
  }

  // ------------------------------------------- Buy/Sell/Hold rule engine
  const lastNonNull = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i]; return null; };

  /**
   * Rule-based technical signal from price history. Combines the 50/200-day MA
   * crossover, price vs the 200-day MA, and RSI(14) into a score → BUY/HOLD/SELL
   * with human-readable reasons. Not financial advice.
   */
  function computeSignals(history) {
    const candles = (history.candles || []).slice().sort((a, b) => a.time - b.time);
    const closes = candles.map((c) => c.close);
    if (closes.length < 30) return null;

    const ma50arr = sma(closes, 50);
    const ma200arr = sma(closes, 200);
    const rsiArr = rsi(closes, 14);

    const price = closes[closes.length - 1];
    const ma50 = lastNonNull(ma50arr);
    const ma200 = lastNonNull(ma200arr);
    const rsiVal = lastNonNull(rsiArr);

    // Crossover state + recency (scan where sign of ma50-ma200 last flipped).
    let crossState = null, crossAgo = null;
    if (ma50 != null && ma200 != null) {
      crossState = ma50 >= ma200 ? 'golden' : 'death';
      const diff = ma50arr.map((v, i) => (v != null && ma200arr[i] != null ? v - ma200arr[i] : null));
      for (let i = diff.length - 1; i > 0; i--) {
        if (diff[i] == null || diff[i - 1] == null) continue;
        if (Math.sign(diff[i]) !== Math.sign(diff[i - 1]) && diff[i - 1] !== 0) { crossAgo = diff.length - 1 - i; break; }
      }
    }

    const priceAbove200 = ma200 != null ? price > ma200 : null;
    const rsiZone = rsiVal == null ? null : rsiVal <= 30 ? 'oversold' : rsiVal >= 70 ? 'overbought' : 'neutral';

    // Score in [-3, +3].
    let score = 0;
    const reasons = [];
    if (crossState === 'golden') { score += 1; reasons.push({ good: true, text: `Golden cross — 50-DMA is above the 200-DMA (bullish trend)${crossAgo != null && crossAgo < 25 ? `, formed recently` : ''}.` }); }
    else if (crossState === 'death') { score -= 1; reasons.push({ good: false, text: `Death cross — 50-DMA is below the 200-DMA (bearish trend).` }); }

    if (priceAbove200 === true) { score += 1; reasons.push({ good: true, text: `Price is trading above the 200-DMA (long-term uptrend).` }); }
    else if (priceAbove200 === false) { score -= 1; reasons.push({ good: false, text: `Price is below the 200-DMA (long-term downtrend).` }); }

    if (rsiZone === 'oversold') { score += 1; reasons.push({ good: true, text: `RSI is ${rsiVal.toFixed(0)} (oversold) — momentum may be due for a bounce.` }); }
    else if (rsiZone === 'overbought') { score -= 1; reasons.push({ good: false, text: `RSI is ${rsiVal.toFixed(0)} (overbought) — the rally may be stretched.` }); }
    else if (rsiZone === 'neutral') { reasons.push({ good: null, text: `RSI is ${rsiVal.toFixed(0)} (neutral).` }); }

    const action = score >= 2 ? 'BUY' : score <= -2 ? 'SELL' : 'HOLD';

    return {
      price, ma50, ma200, rsi: rsiVal, rsiZone,
      crossState, crossAgo, priceAbove200,
      score, action, reasons,
    };
  }

  window.ESACharts = { priceChart, comparisonChart, groupedBars, stackedBars, sparkline, computeSignals, sma, rsi, themeColors };
})();
