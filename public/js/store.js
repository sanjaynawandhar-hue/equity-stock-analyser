/* Client-side persistence layer (localStorage) for recent searches and the
   watchlist. No backend accounts — everything lives in the browser.

   Exposes window.ESAStore with a tiny pub/sub so UI components re-render on
   change, including changes from other tabs (via the 'storage' event). */
(function () {
  'use strict';

  const KEYS = { recents: 'esa:recents', watchlist: 'esa:watchlist' };
  const MAX_RECENTS = 8;

  // ------------------------------------------------------------ pub/sub
  const listeners = { recents: new Set(), watchlist: new Set() };
  function emit(topic) {
    const payload = topic === 'recents' ? getRecents() : getWatchlist();
    listeners[topic].forEach((fn) => { try { fn(payload); } catch (_) {} });
  }
  function on(topic, fn) {
    if (!listeners[topic]) return () => {};
    listeners[topic].add(fn);
    return () => listeners[topic].delete(fn);
  }

  // ------------------------------------------------------------ helpers
  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch (_) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }
  const norm = (s) => String(s || '').trim().toUpperCase();

  // ------------------------------------------------------------ recents
  function getRecents() { return read(KEYS.recents, []); }

  function addRecent(symbol, name) {
    const sym = norm(symbol);
    if (!sym) return;
    const list = getRecents().filter((r) => r.symbol !== sym);
    list.unshift({ symbol: sym, name: name || null, ts: Date.now() });
    write(KEYS.recents, list.slice(0, MAX_RECENTS));
    emit('recents');
  }
  function clearRecents() { write(KEYS.recents, []); emit('recents'); }

  // ---------------------------------------------------------- watchlist
  function getWatchlist() { return read(KEYS.watchlist, []); }
  function isWatched(symbol) {
    const sym = norm(symbol);
    return getWatchlist().some((w) => w.symbol === sym);
  }
  function addWatch(symbol, name) {
    const sym = norm(symbol);
    if (!sym || isWatched(sym)) return;
    const list = getWatchlist();
    list.unshift({ symbol: sym, name: name || null, addedTs: Date.now() });
    write(KEYS.watchlist, list);
    emit('watchlist');
  }
  function removeWatch(symbol) {
    const sym = norm(symbol);
    const list = getWatchlist().filter((w) => w.symbol !== sym);
    write(KEYS.watchlist, list);
    emit('watchlist');
  }
  function toggleWatch(symbol, name) {
    const sym = norm(symbol);
    if (isWatched(sym)) { removeWatch(sym); return false; }
    addWatch(sym, name); return true;
  }
  function watchCount() { return getWatchlist().length; }

  // ------------------------------------------- cross-tab synchronisation
  window.addEventListener('storage', (e) => {
    if (e.key === KEYS.recents) emit('recents');
    else if (e.key === KEYS.watchlist) emit('watchlist');
  });

  window.ESAStore = {
    on,
    getRecents, addRecent, clearRecents,
    getWatchlist, isWatched, addWatch, removeWatch, toggleWatch, watchCount,
    MAX_RECENTS,
  };
})();
