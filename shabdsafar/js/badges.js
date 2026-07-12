/* ShabdSafar — reusable SVG level badges + journey trail. All artwork original. */
'use strict';

const LEVELS = [
  { n: 1, name: 'Beginner', min: 0,     max: 8000,  color: '#8b93a7', dark: '#5a6070', icon: 'spark',   milestone: 'FIRST STEPS' },
  { n: 2, name: 'Learner',  min: 8001,  max: 16000, color: '#34c07c', dark: '#1d7a4c', icon: 'book',    milestone: '8K+ WORDS' },
  { n: 3, name: 'Explorer', min: 16001, max: 25000, color: '#3f8cff', dark: '#2457a8', icon: 'compass', milestone: '16K+ WORDS' },
  { n: 4, name: 'Achiever', min: 25001, max: 34000, color: '#a05ce6', dark: '#663a96', icon: 'arrow',   milestone: '25K+ WORDS' },
  { n: 5, name: 'Expert',   min: 34001, max: 43000, color: '#ff8c2e', dark: '#b25a12', icon: 'flame',   milestone: '34K+ WORDS' },
  { n: 6, name: 'Master',   min: 43001, max: 52000, color: '#f0435a', dark: '#9c2536', icon: 'crown',   milestone: '43K+ WORDS' },
  { n: 7, name: 'Genius',   min: 52001, max: 60000, color: '#f5b400', dark: '#a87a00', icon: 'brain',   milestone: '52K+ WORDS' },
];

function levelForVocab(v) {
  for (let i = LEVELS.length - 1; i >= 0; i--) if (v >= LEVELS[i].min) return LEVELS[i];
  return LEVELS[0];
}

/* --- badge icons (original line art) --- */
function badgeIcon(kind, c) {
  switch (kind) {
    case 'spark': return `<path d="M0,-16 L4,-4 L16,0 L4,4 L0,16 L-4,4 L-16,0 L-4,-4 Z" fill="${c}"/>`;
    case 'book': return `<g fill="none" stroke="${c}" stroke-width="3" stroke-linejoin="round"><path d="M0,-10 C-6,-15 -16,-15 -18,-12 L-18,10 C-16,7 -6,7 0,12 C6,7 16,7 18,10 L18,-12 C16,-15 6,-15 0,-10 Z"/><line x1="0" y1="-10" x2="0" y2="12"/></g>`;
    case 'compass': return `<g><circle r="15" fill="none" stroke="${c}" stroke-width="3"/><path d="M6,-6 L-2,2 L-6,6 L2,-2 Z" fill="${c}"/><circle r="2.4" fill="${c}"/></g>`;
    case 'arrow': return `<g fill="none" stroke="${c}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M-14,10 L-4,0 L2,6 L14,-8"/><path d="M5,-8 L14,-8 L14,1"/></g>`;
    case 'flame': return `<path d="M0,-16 C4,-9 12,-6 12,3 C12,11 7,16 0,16 C-7,16 -12,11 -12,3 C-12,-2 -9,-5 -7,-8 C-6,-3 -3,-2 -2,-5 C-1,-9 -2,-12 0,-16 Z" fill="${c}"/>`;
    case 'crown': return `<path d="M-15,10 L-17,-7 L-8,-1 L0,-13 L8,-1 L17,-7 L15,10 Z M-15,13 L15,13 L15,16 L-15,16 Z" fill="${c}"/>`;
    case 'brain': return `<g fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"><path d="M-3,-14 C-10,-14 -13,-8 -11,-3 C-15,0 -14,8 -8,10 C-7,14 -2,16 -3,12 L-3,-14"/><path d="M3,-14 C10,-14 13,-8 11,-3 C15,0 14,8 8,10 C7,14 2,16 3,12 L3,-14"/></g><path d="M-22,2 L-16,-2 M22,2 L16,-2" stroke="${c}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    default: return '';
  }
}

/**
 * Reusable SVG badge.
 * opts: {size, locked, current, showStars(default true), id}
 */
function badgeSVG(level, opts = {}) {
  const L = level, size = opts.size || 140;
  const uid = 'bg' + L.n + (opts.id || '') + Math.floor(Math.random() * 1e5);
  const locked = !!opts.locked;
  const c = locked ? '#777f92' : L.color;
  const cd = locked ? '#4a4f5e' : L.dark;
  // stars along bottom rim
  let starEls = '';
  for (let i = 0; i < L.n; i++) {
    const spread = (L.n - 1) * 13;
    const x = 100 - spread / 2 + i * 13;
    starEls += `<path transform="translate(${x},164) scale(0.55)" d="M0,-9 L2.6,-2.8 L9,-2.4 L4.2,1.8 L5.6,8.4 L0,5 L-5.6,8.4 L-4.2,1.8 L-9,-2.4 L-2.6,-2.8 Z" fill="${locked ? '#555b6b' : '#ffd75e'}" stroke="${locked ? '#3d4250' : '#a87a00'}" stroke-width="1"/>`;
  }
  const lockEl = locked ? `
    <g transform="translate(100,86)">
      <circle r="30" fill="rgba(10,12,26,0.55)"/>
      <rect x="-13" y="-6" width="26" height="22" rx="5" fill="#aab1c4"/>
      <path d="M-8,-6 L-8,-14 A8,8 0 0 1 8,-14 L8,-6" fill="none" stroke="#aab1c4" stroke-width="5"/>
      <circle cy="4" r="3.4" fill="#3d4250"/>
    </g>` : '';
  const glow = opts.current ? `<circle cx="100" cy="92" r="86" fill="none" stroke="${c}" stroke-opacity=".5" stroke-width="3" class="badge-glow"/>` : '';
  return `
  <svg viewBox="0 0 200 200" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${L.name} badge">
    <defs>
      <linearGradient id="${uid}m" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${c}"/><stop offset=".45" stop-color="${cd}"/>
        <stop offset=".55" stop-color="${c}"/><stop offset="1" stop-color="${cd}"/>
      </linearGradient>
      <linearGradient id="${uid}s" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity=".55"/><stop offset=".4" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${glow}
    <path d="M100,12 L164,34 L164,96 C164,136 138,164 100,178 C62,164 36,136 36,96 L36,34 Z"
      fill="url(#${uid}m)" stroke="${cd}" stroke-width="4"/>
    <path d="M100,20 L156,40 L156,95 C156,131 133,157 100,170 C67,157 44,131 44,95 L44,40 Z"
      fill="none" stroke="#ffffff" stroke-opacity=".28" stroke-width="2"/>
    <path d="M100,12 L164,34 L164,60 L36,60 L36,34 Z" fill="url(#${uid}s)"/>
    <g transform="translate(100,74) scale(1.15)">${badgeIcon(L.icon, locked ? '#c2c7d4' : '#ffffff')}</g>
    <text x="100" y="118" text-anchor="middle" font-family="var(--font)" font-weight="900" font-size="19"
      fill="#ffffff" letter-spacing="1.5">${L.name.toUpperCase()}</text>
    <text x="100" y="136" text-anchor="middle" font-family="var(--font)" font-weight="700" font-size="10"
      fill="#ffffff" fill-opacity=".82" letter-spacing="1">${L.milestone}</text>
    ${starEls}
    ${lockEl}
  </svg>`;
}

/**
 * The "Safar to Genius" winding journey trail with 7 milestone badges.
 * Highlights current level; locked levels greyed with padlock.
 */
function trailSVG(vocab) {
  const cur = levelForVocab(vocab);
  // winding road: 7 stops, alternating left/right
  const stops = LEVELS.map((L, i) => ({
    L,
    x: i % 2 === 0 ? 90 : 270,
    y: 640 - i * 100,
  }));
  let path = `M ${stops[0].x} ${stops[0].y}`;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i];
    path += ` C ${a.x} ${a.y - 55}, ${b.x} ${b.y + 55}, ${b.x} ${b.y}`;
  }
  const nodes = stops.map(({ L, x, y }) => {
    const locked = vocab < L.min && L.n !== 1;
    const isCur = cur.n === L.n;
    const reached = vocab >= L.min || L.n === 1;
    const ring = isCur
      ? `<circle r="34" fill="none" stroke="${L.color}" stroke-width="3" class="badge-glow"/>`
      : '';
    const fill = reached && !locked ? L.color : 'var(--ring-track)';
    const icon = badgeIcon(L.icon, reached && !locked ? '#fff' : '#8a90a2');
    const lock = locked ? `<g transform="translate(18,-20) scale(.8)"><circle r="11" fill="#2a2f45" stroke="#555b6b"/><rect x="-5" y="-2" width="10" height="8" rx="2" fill="#aab1c4"/><path d="M-3,-2 L-3,-5 A3,3 0 0 1 3,-5 L3,-2" fill="none" stroke="#aab1c4" stroke-width="2"/></g>` : '';
    const tick = reached && !locked && !isCur ? `<g transform="translate(20,-22)"><circle r="10" fill="#1d9d5f"/><path d="M-4,0 L-1,3.5 L5,-3.5" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/></g>` : '';
    const side = x < 180 ? 1 : -1;
    return `<g class="milestone" transform="translate(${x},${y})" data-level="${L.n}">
      ${ring}
      <circle r="28" fill="${fill}" stroke="${reached && !locked ? L.dark : 'var(--line)'}" stroke-width="3"/>
      <g transform="scale(.85)">${icon}</g>
      ${lock}${tick}
      <text x="${side * 44}" y="-4" text-anchor="${side > 0 ? 'start' : 'end'}" font-weight="900" font-size="16" fill="${isCur ? L.color : 'var(--text)'}" font-family="var(--font)" opacity="${locked ? .55 : 1}">${L.name}</text>
      <text x="${side * 44}" y="14" text-anchor="${side > 0 ? 'start' : 'end'}" font-weight="600" font-size="11.5" fill="var(--dim)" font-family="var(--font)">${(L.min / 1000).toFixed(0)}k–${(L.max / 1000).toFixed(0)}k words</text>
    </g>`;
  }).join('');
  const youAreHere = (() => {
    const s = stops.find(s => s.L.n === cur.n);
    return `<g transform="translate(${s.x},${s.y - 52})" font-family="var(--font)">
      <rect x="-52" y="-16" width="104" height="24" rx="12" fill="${cur.color}"/>
      <text text-anchor="middle" y="1" font-weight="800" font-size="11" fill="#fff">YOU ARE HERE</text>
      <path d="M-5,8 L5,8 L0,15 Z" fill="${cur.color}"/>
    </g>`;
  })();
  return `<svg viewBox="0 0 360 700" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Safar to Genius journey trail">
    <path d="${path}" fill="none" stroke="var(--ring-track)" stroke-width="16" stroke-linecap="round"/>
    <path d="${path}" fill="none" stroke="var(--accent)" stroke-opacity=".35" stroke-width="4" stroke-dasharray="2 14" stroke-linecap="round"/>
    <text x="348" y="18" text-anchor="end" font-family="var(--font)" font-weight="900" font-size="15" fill="var(--lv7)">🏔️ 60,000 WORDS — GENIUS</text>
    ${nodes}
    ${youAreHere}
  </svg>`;
}
