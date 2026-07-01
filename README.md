# 📈 Equity Stock Analyser

A single-page web app to analyse Indian stocks (NSE/BSE) — 10-year price charts,
fundamentals, RSI & moving-average signals, a Buy/Sell/Hold recommendation,
revenue & shareholding trends, peer comparison, a Google-News timeline, and a
Nifty-50 comparison. Dark/light themes, a localStorage watchlist, and PDF/image
export included.

**Built by Sanjay Navandar · [@professorSK](https://instagram.com/professorSK)**

> ⚠️ **Not financial advice.** Data may be delayed. Consult a SEBI-registered
> advisor before investing.

## Tech
- **Backend:** Node.js + Express proxy (avoids CORS, spoofs headers, caches responses).
- **Frontend:** HTML + CSS + vanilla JS, TradingView Lightweight Charts, html2canvas.
- **Data:** Yahoo Finance + NSE India + Google News RSS, with a deterministic
  **demo-data fallback** so the app always works even if a source is blocked.

## Run locally
```bash
npm install      # also copies chart libs into public/vendor (postinstall)
npm start        # → http://localhost:3000
```
Node 18+ required.

## Deploy (free, on Render.com)
1. Push this repo to GitHub.
2. On [render.com](https://render.com): **New + → Web Service → connect this repo**.
3. Render auto-detects Node — Build: `npm install`, Start: `npm start`. Click **Create**.
4. You get a public `https://<name>.onrender.com` URL to share. 🎉

(The included `render.yaml` also lets you deploy via **New + → Blueprint**.)

## Config
| Env var    | Values                | Default | Meaning |
|------------|-----------------------|---------|---------|
| `PORT`     | number                | 3000    | Set automatically by the host. |
| `ESA_MOCK` | `auto` \| `on` \| `off` | `auto`  | `auto` = live first, demo-data fallback. |
