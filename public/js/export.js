/* Report export — PDF (via the browser's print-to-PDF) and PNG image
   (via html2canvas). Both carry the "@professorSK" branding. */
(function () {
  'use strict';

  const BRAND = 'Built by Sanjay Navandar · @professorSK';

  function currentSymbol() {
    const t = document.querySelector('.rheader__company');
    const s = document.querySelector('.rheader__meta .tag');
    return { name: t ? t.textContent : 'Report', sym: s ? s.textContent : 'ESA' };
  }

  // ------------------------------------------------------------- PDF (print)
  function toPDF() {
    const { name, sym } = currentSymbol();
    const prevTitle = document.title;
    document.title = `${sym} — Equity Stock Analyser`;
    // A print-only branded banner injected at the top of the report.
    ensurePrintBanner(name, sym);
    const done = () => { document.title = prevTitle; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  }

  function ensurePrintBanner(name, sym) {
    let banner = document.getElementById('printBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'printBanner';
      banner.className = 'print-only print-banner';
      const report = document.getElementById('report');
      report.parentNode.insertBefore(banner, report);
    }
    banner.innerHTML = `
      <div class="print-banner__title">📈 Equity Stock Analyser</div>
      <div class="print-banner__sub">${escapeHtml(name)} (${escapeHtml(sym)}) · generated ${new Date().toLocaleString('en-IN')}</div>
      <div class="print-banner__brand">${BRAND}</div>
      <div class="print-banner__disc">Not financial advice · Data may be delayed · Consult a SEBI-registered advisor before investing.</div>`;
  }

  // ------------------------------------------------------------- PNG (image)
  async function toImage(btn) {
    if (!window.html2canvas) { alert('Image export library failed to load.'); return; }
    const report = document.getElementById('report');
    if (!report || !report.children.length) return;
    const { sym } = currentSymbol();

    const label = btn && btn.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Rendering…'; }

    // Add a branded footer strip into the capture, then remove it after.
    const foot = document.createElement('div');
    foot.className = 'export-foot';
    foot.innerHTML = `<span>📈 Equity Stock Analyser</span><span>${BRAND}</span>`;
    report.appendChild(foot);

    const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#0a0d14';
    try {
      const canvas = await html2canvas(report, {
        backgroundColor: bg, scale: Math.min(2, window.devicePixelRatio || 1),
        useCORS: true, logging: false, windowWidth: report.scrollWidth,
      });
      const link = document.createElement('a');
      link.download = `${sym}-equity-analysis.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      alert('Could not generate image: ' + err.message);
    } finally {
      foot.remove();
      if (btn) { btn.disabled = false; btn.textContent = label; }
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  window.ESAExport = { toPDF, toImage };
})();
