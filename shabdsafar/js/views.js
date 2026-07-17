/* ShabdSafar — all screens & overlays. */
'use strict';

const $app = () => document.getElementById('app');
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2200);
}
function fmt(n) { return n.toLocaleString('en-IN'); }

/* progress ring */
function ringSVG(pct, size, label, sub) {
  const r = size / 2 - 8, c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, pct)));
  const uid = 'rg' + Math.floor(Math.random() * 1e6);
  return `<div class="ringwrap">
    <svg width="${size}" height="${size}">
      <defs><linearGradient id="${uid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent2)"/>
      </linearGradient></defs>
      <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="10"/>
      <circle class="ring-val" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="10"
        stroke="url(#${uid})" stroke-dasharray="${c}" stroke-dashoffset="${off}"/>
    </svg>
    <div class="ringlabel">${label}${sub ? `<div class="tiny">${sub}</div>` : ''}</div>
  </div>`;
}

function topbar(showTheme = true) {
  return `<div class="topbar">
    <div class="brand"><span class="logo">Shabd<em>Safar</em></span><span class="tag">A Safar to Genius</span></div>
    ${showTheme ? `<button class="iconbtn" onclick="APP.toggleTheme()" aria-label="theme">${S.theme === 'dark' ? '☀️' : '🌙'}</button>` : ''}
  </div>`;
}
function footer() { return `<div class="footer">ShabdSafar — A Safar to Genius · by <b>@professorSK</b></div>`; }

function navbar(active) {
  if (!S.onboarded) return '';
  const items = [['home', '🏠', 'Home'], ['learn', '📚', 'Learn'], ['safar', '🛤️', 'Safar'], ['stats', '📊', 'Stats'], ['settings', '⚙️', 'Settings']];
  return `<nav class="nav"><div class="nav-inner">${items.map(([id, ico, lbl]) =>
    `<button class="${active === id ? 'active' : ''}" onclick="APP.go('${id}')"><span class="ico">${ico}</span>${lbl}</button>`).join('')}</div></nav>`;
}

/* =============== SPLASH / WELCOME =============== */
function viewSplash() {
  $app().innerHTML = `<div class="screen splash">
    <div class="mark">🚶‍♂️➡️🏔️</div>
    <h1>Shabd<em>Safar</em></h1>
    <div class="tagline">A Safar to Genius</div>
    <p class="muted mt14">Every genius knows ~60,000 English words.<br>How many do you know? Let's find out — then travel the rest of the way together, in English <b>and</b> हिंदी.</p>
    <div class="mt20">
      <button class="btn primary" onclick="APP.go('testIntro')">Begin My Safar 🧭</button>
    </div>
    <p class="tiny mt14">A 50-word check • ~2 minutes • no signup</p>
    ${footer()}
  </div>`;
}

/* =============== TEST INTRO =============== */
function viewTestIntro(kind = 'placement') {
  const weekly = kind === 'weekly';
  $app().innerHTML = `<div class="screen">${topbar()}
    <div class="panel center">
      <h2>${weekly ? 'Weekly Progress Test 🏆' : 'Your Vocabulary Check 🔍'}</h2>
      <p class="muted mt8">${weekly
        ? '50 words: 30 fresh words to tap "I know it" or Skip, plus 20 quick meaning checks on what you learned recently. Your rating and badge get refreshed.'
        : 'Just 50 quick words, from everyday to rare. Tap <b>I know it</b> only when you truly know the meaning — skip freely. Honesty is what makes your estimate accurate.'}</p>
      <div class="panel mt14" style="box-shadow:none">
        <label class="rowline" style="cursor:pointer">
          <span>⏱️ 15-second timer per word</span>
          <input type="checkbox" id="timerToggle" ${S.timerOn ? 'checked' : ''} onchange="S.timerOn=this.checked;saveState()">
        </label>
      </div>
      <div class="mt14"><button class="btn primary" onclick="APP.startTest('${kind}')">Start the 50-Word Test</button></div>
      ${weekly ? '' : `
      <div class="mt8"><button class="btn ghost" onclick="APP.skipPlacement()">Skip the test — start at Beginner</button></div>
      <p class="tiny mt8">You can take the test anytime from Settings to get your real rating.</p>`}
    </div>
  ${footer()}</div>`;
}

/* =============== TEST RUNNER =============== */
const TEST = { qs: [], i: 0, kind: 'placement', answers: [], timer: null, tleft: 15 };

async function startTest(kind) {
  TEST.kind = kind;
  TEST.i = 0;
  TEST.answers = [];
  $app().innerHTML = `<div class="screen center"><div class="spacer"></div><h3>Preparing your test…</h3></div>`;
  TEST.qs = kind === 'weekly' ? await buildWeeklyQuestions() : buildRatingQuestions(50);
  // never repeat fresh rating words in future tests
  for (const q of TEST.qs) if (q.kind !== 'retention') S.usedTestWords.push(q.w);
  saveState();
  renderQuestion();
}

function renderQuestion() {
  const q = TEST.qs[TEST.i];
  if (!q) return finishTest();
  clearInterval(TEST.timer);
  const n = TEST.qs.length;
  const isRet = q.kind === 'retention';
  // fresh rating words: fast self-report (know / skip);
  // retention words (weekly): real MCQ check, since they can revoke credit
  const body = isRet ? `
      <div class="tiny">Quick check — you learned this recently. What does it mean?</div>
      <div class="q-word">${esc(q.w)}
        <button class="speak" onclick="speak('${esc(q.w)}')" aria-label="pronounce">🔊</button></div>
      <div class="opts">
        ${q.options.map((o, i) => `<button class="opt ${o.dk ? 'dk' : ''}" data-i="${i}" onclick="answerQ(${i})">${esc(o.t)}</button>`).join('')}
      </div>
      <div class="feedback" id="fb"></div>` : `
      <div class="tiny center">Do you know this word?</div>
      <div class="q-word center" style="font-size:clamp(2.2rem,10vw,2.8rem)">${esc(q.w)}
        <button class="speak" onclick="speak('${esc(q.w)}')" aria-label="pronounce">🔊</button></div>
      <div class="selfrow mt20">
        <button class="btn" id="skipBtn" onclick="answerSelf(false)">Skip →</button>
        <button class="btn know" id="knowBtn" onclick="answerSelf(true)">✓ I know it</button>
      </div>
      <p class="tiny center mt14">Tap "I know it" only if you could explain its meaning.</p>`;
  $app().innerHTML = `<div class="screen">
    <div class="topbar"><span class="q-count">WORD ${TEST.i + 1} OF ${n}</span>
      <span class="tiny">${TEST.kind === 'weekly' ? 'weekly test' : TEST.kind === 'retake' ? 're-rating' : 'placement'}</span></div>
    <div class="pbar"><i style="width:${(TEST.i / n) * 100}%"></i></div>
    ${S.timerOn ? `<div class="timerbar"><i id="tbar" style="width:100%"></i></div>` : ''}
    <div class="panel mt14">${body}</div>
  </div>`;
  if (S.timerOn) {
    TEST.tleft = 15;
    TEST.timer = setInterval(() => {
      TEST.tleft--;
      const bar = document.getElementById('tbar');
      if (bar) bar.style.width = (TEST.tleft / 15 * 100) + '%';
      if (TEST.tleft <= 0) {
        clearInterval(TEST.timer);
        if (isRet) answerQ(q.options.findIndex(o => o.dk), true);
        else answerSelf(false, true);
      }
    }, 1000);
  }
}

/* self-report answer for rating words: know = counts as correct, skip = don't know */
function answerSelf(know, timedOut = false) {
  clearInterval(TEST.timer);
  const q = TEST.qs[TEST.i];
  if (!q) return;
  TEST.answers.push({ w: q.w, band: q.band, ok: know, dk: !know, kind: q.kind || 'fresh' });
  const btn = document.getElementById(know ? 'knowBtn' : 'skipBtn');
  if (btn) { btn.classList.add('picked'); btn.disabled = true; }
  const other = document.getElementById(know ? 'skipBtn' : 'knowBtn');
  if (other) other.disabled = true;
  setTimeout(() => { TEST.i++; renderQuestion(); }, timedOut ? 450 : 220);
}

function answerQ(idx, timedOut = false) {
  clearInterval(TEST.timer);
  const q = TEST.qs[TEST.i];
  const chosen = q.options[idx];
  if (!chosen) return;
  document.querySelectorAll('.opt').forEach(b => b.disabled = true);
  const btn = document.querySelector(`.opt[data-i="${idx}"]`);
  const ok = !!chosen.ok;
  TEST.answers.push({ w: q.w, band: q.band, ok, dk: !!chosen.dk || timedOut, kind: q.kind || 'fresh' });
  const fb = document.getElementById('fb');
  if (ok) {
    btn.classList.add('correct');
    fb.textContent = ['Nice! 🔥', 'Sahi jawab! ✨', 'You knew it! 💪', 'Perfect! 🌟'][Math.floor(Math.random() * 4)];
    fb.className = 'feedback good';
  } else {
    if (btn) btn.classList.add('wrong');
    const rightIdx = q.options.findIndex(o => o.ok);
    const rb = document.querySelector(`.opt[data-i="${rightIdx}"]`);
    if (rb) rb.classList.add('reveal');
    fb.textContent = timedOut ? "⏱️ Time's up — marked as don't know" : (chosen.dk ? 'Honest answer — that helps! 👍' : `It means: ${q.correctText}`);
    fb.className = 'feedback bad';
  }
  setTimeout(() => { TEST.i++; renderQuestion(); }, ok ? 700 : 1600);
}

function finishTest() {
  const bands = Array.from({ length: 7 }, () => [0, 0]);
  let dk = 0, correct = 0;
  for (const a of TEST.answers.filter(a => a.kind !== 'retention')) {
    bands[a.band][1]++;
    if (a.ok) { bands[a.band][0]++; correct++; }
    if (a.dk) { dk++; S.dontKnowWords.push(a.w); }
  }
  if (TEST.kind === 'placement' || TEST.kind === 'retake') {
    const est = estimateVocab(bands);
    S.bandStats = bands;
    S.vocab = est;
    S.highestLevel = Math.max(S.highestLevel, levelForVocab(est).n);
    S.testHistory.push({ date: Date.now(), estimate: est, bands, correct, dontKnow: dk, kind: TEST.kind });
    saveState();
    APP.go(TEST.kind === 'placement' ? 'testResult' : 'retakeResult');
  } else {
    finishWeekly(bands, correct, dk);
  }
}

function finishWeekly(freshBands, correct, dk) {
  const prevVocab = S.vocab;
  const prevLevel = displayLevel();
  // retention: wrong learned words lose their credit
  let lost = 0, kept = 0;
  for (const a of TEST.answers.filter(a => a.kind === 'retention')) {
    if (a.ok) { kept++; if (S.tricky[a.w]) trickyPromote(a.w); }
    else if (revokeWord(a.w)) { lost++; S.vocab = Math.max(0, S.vocab - 1); }
  }
  // re-rate: blend fresh band estimate with post-revocation counter for stability
  const freshEst = estimateVocab(freshBands);
  const newVocab = Math.round((S.vocab + freshEst) / 2 / 10) * 10;
  S.bandStats = freshBands;
  S.vocab = Math.min(UNIVERSE, newVocab);
  S.highestLevel = Math.max(S.highestLevel, levelForVocab(S.vocab).n);
  S.weeklyStreak += 1;
  S.testHistory.push({ date: Date.now(), estimate: S.vocab, bands: freshBands, correct, dontKnow: dk, kind: 'weekly', lost, kept, prevVocab });
  saveState();
  APP.go('weeklyResult');
}

/* =============== RESULT SCREENS =============== */
function bandChartSVG(bands) {
  const w = 320, h = 150, bw = 34;
  const bars = bands.map(([c, t], i) => {
    const est = t ? (c / t) * BAND_WIDTHS[i] : 0;
    const bh = Math.max(3, (est / BAND_WIDTHS[i]) * 100);
    return `<g transform="translate(${16 + i * 42},0)">
      <rect class="bar-band" x="0" y="${118 - bh}" width="${bw}" height="${bh}" rx="5" opacity="${.45 + .55 * (1 - i / 7)}"/>
      <text class="axis-label" x="${bw / 2}" y="132" text-anchor="middle">B${i + 1}</text>
      <text class="axis-label" x="${bw / 2}" y="${112 - bh}" text-anchor="middle">${Math.round(est / 100) / 10}k</text>
    </g>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}">${bars}
    <text class="axis-label" x="16" y="148">common words</text>
    <text class="axis-label" x="${w - 16}" y="148" text-anchor="end">rare words</text></svg>`;
}

function viewTestResult() {
  const est = S.vocab;
  const L = levelForVocab(est);
  const next = LEVELS[L.n] || null;
  const gap = next ? next.min - est : 0;
  $app().innerHTML = `<div class="screen">${topbar()}
    <div class="panel center">
      <div class="tiny">YOUR VOCABULARY ESTIMATE</div>
      <div class="big-counter mt8"><span id="bigC">0</span><small> / 60,000 words</small></div>
      <div class="mt14">${ringSVG(est / UNIVERSE, 150, `<b style="font-size:1.3rem">${Math.round(est / UNIVERSE * 100)}%</b>`, 'of the universe')}</div>
      <div class="mt14">${badgeSVG(L, { size: 150, current: true })}</div>
      <h2 class="mt8">You are ${'AEIOU'.includes(L.name[0]) ? 'an' : 'a'} ${L.name.toUpperCase()}!</h2>
      <p class="muted mt8">${motivation(L)}</p>
      ${next ? `<p class="mt8"><b>Learn ~${fmt(gap)} more words</b> to become ${'AEIOU'.includes(next.name[0]) ? 'an' : 'a'} <b style="color:${next.color}">${next.name.toUpperCase()}</b>.</p>` : `<p class="mt8">🏔️ You've reached the summit. Stay sharp!</p>`}
    </div>
    <div class="panel">
      <h3>Where your words live</h3>
      <p class="tiny">Estimated words you know in each frequency band (B1 = most common → B7 = rarest)</p>
      ${bandChartSVG(S.bandStats)}
    </div>
    <div class="mt14"><button class="btn primary" onclick="APP.go('interests')">Start Learning →</button></div>
  ${footer()}</div>`;
  animateCounter('bigC', est);
}
function motivation(L) {
  return {
    1: 'Every safar begins with a single step. Your first words are waiting!',
    2: 'You have a solid base — now the journey gets exciting.',
    3: 'You explore words most people walk past. Keep moving!',
    4: 'Impressive range! The summit is closer than you think.',
    5: 'Your vocabulary would impress an editor. Push for mastery!',
    6: 'Rare words bow to you. Genius is one climb away.',
    7: 'You speak with the top 1%. Defend the summit! 🏔️',
  }[L.n];
}
function animateCounter(id, target, suffix = '') {
  const el = document.getElementById(id);
  if (!el) return;
  const dur = 1400, t0 = performance.now();
  (function tick(t) {
    const p = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = '~' + fmt(Math.round(target * eased)) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  })(t0);
}

function viewRetakeResult() {
  const hist = S.testHistory;
  const prev = hist.length > 1 ? hist[hist.length - 2].estimate : null;
  const est = S.vocab;
  $app().innerHTML = `<div class="screen">${topbar()}
    <div class="panel center">
      <h2>Fresh Rating ✅</h2>
      <div class="big-counter mt8">${fmt(est)}<small> / 60,000</small></div>
      ${prev !== null ? `<p class="muted mt8">${fmt(prev)} → ${fmt(est)} (${est >= prev ? '+' : ''}${fmt(est - prev)})</p>` : ''}
      <div class="mt14">${badgeSVG(displayLevel(), { size: 140, current: true })}</div>
    </div>
    <div class="panel"><h3>Band strength</h3>${bandChartSVG(S.bandStats)}</div>
    <div class="mt14"><button class="btn primary" onclick="APP.go('home')">Back to Dashboard</button></div>
  ${navbar('settings')}</div>`;
}

/* =============== ONBOARDING: INTERESTS =============== */
function viewInterests() {
  const sel = new Set(S.interests);
  $app().innerHTML = `<div class="screen">${topbar()}
    <h2>What do you love? ❤️</h2>
    <p class="muted">Pick 3–5 topics. Your daily words and example sentences will be flavoured with these.</p>
    <div class="chips mt14" id="chips">
      ${Object.entries(INTEREST_LABELS).map(([k, v]) =>
        `<button class="chip ${sel.has(k) ? 'on' : ''}" data-k="${k}" onclick="APP.toggleInterest(this)">${v}</button>`).join('')}
    </div>
    <div class="mt20">
      <label class="tiny">Favourite movie or series (optional — we'll use it in examples)</label>
      <input class="txt mt8" id="favMovie" placeholder="e.g., 3 Idiots" value="${esc(S.favMovie)}">
      <label class="tiny mt8" style="display:block;margin-top:12px">Favourite book (optional)</label>
      <input class="txt mt8" id="favBook" placeholder="e.g., The Alchemist" value="${esc(S.favBook)}">
    </div>
    <div class="mt20"><button class="btn primary" id="intGo" onclick="APP.saveInterests()" ${sel.size >= 3 ? '' : 'disabled'}>Build My Daily 100 →</button></div>
    <p class="tiny center mt8" id="intHint">${sel.size >= 3 ? '' : 'Pick at least 3 topics'}</p>
  </div>`;
}

/* =============== DASHBOARD =============== */
function viewHome() {
  ensureDaily();
  const L = displayLevel();
  const next = LEVELS[L.n] || null;
  const done = dailyDoneCount();
  const goal = S.daily.words.length;
  const wod = wordOfDay();
  const due = dueTricky().length;
  const weekly = weeklyDue();
  $app().innerHTML = `<div class="screen">${topbar()}
    <div class="panel brandcard">
      <div class="bc-avatar">SK</div>
      <div>
        <div class="bc-name">@<span>professorSK</span></div>
        <div class="bc-sub">Your English coach 🧭</div>
      </div>
    </div>
    <div class="spacer"></div>
    ${searchBarHTML()}
    <div class="spacer"></div>
    ${weekly ? `<button class="panel rowline" style="width:100%;cursor:pointer;border-color:var(--accent)" onclick="APP.go('weeklyIntro')">
      <span style="font-weight:800">Weekly Test Ready 🏆</span><span class="tiny">Re-rate your vocabulary →</span></button><div class="spacer"></div>` : ''}
    <div class="panel">
      <div class="rowline">
        <div>
          <div class="tiny">YOUR VOCABULARY</div>
          <div class="big-counter">${fmt(S.vocab)}<small> / 60,000</small></div>
          ${next ? `<div class="tiny mt8">${fmt(Math.max(0, next.min - S.vocab))} words to ${next.name.toUpperCase()}</div>` : `<div class="tiny mt8">Summit reached 🏔️</div>`}
          <div class="flame mt8">🔥 ${S.streak.current}-day streak</div>
        </div>
        <div onclick="APP.go('safar')" style="cursor:pointer">${badgeSVG(L, { size: 118, current: true })}</div>
      </div>
      <div class="pbar mt14"><i style="width:${S.vocab / UNIVERSE * 100}%"></i></div>
      <div class="tiny mt8 center">${Math.round(S.vocab / UNIVERSE * 100)}% of the way to GENIUS</div>
    </div>
    <div class="panel rowline">
      ${ringSVG(goal ? done / goal : 0, 110, `<b>${done}</b><div class="tiny">of ${goal}</div>`)}
      <div class="grow" style="padding-left:14px">
        <h3>Today's ${goal} Words</h3>
        <p class="tiny mt8">${done >= goal && goal > 0 ? 'All done! Bonus flame earned 🔥' : `${goal - done} to go — learn them one word at a time.`}</p>
        <button class="btn primary small mt8" onclick="APP.go('learn')">${done === 0 ? 'Start' : done >= goal ? 'Review' : 'Continue'} →</button>
        ${due ? `<button class="btn small mt8" style="margin-left:8px" onclick="APP.go('tricky')">🧩 ${due} tricky due</button>` : ''}
      </div>
    </div>
    <div class="panel wod" id="wodCard">${wodCardHTML()}</div>
    <div class="panel">
      <div class="rowline"><h3>🛤️ Safar to Genius</h3><button class="btn ghost small" onclick="APP.go('safar')">Full trail →</button></div>
      <div style="display:flex;gap:4px;justify-content:space-between;margin-top:10px">
        ${LEVELS.map(l => `<div style="flex:1;text-align:center">${badgeSVG(l, { size: 44, locked: S.vocab < l.min && l.n !== 1, current: l.n === L.n })}</div>`).join('')}
      </div>
    </div>
    ${footer()}
  ${navbar('home')}</div>`;
  loadWodBody();
}

/* =============== SEARCH =============== */
function searchBarHTML() {
  return `<div class="searchwrap">
    <span class="search-ico">🔍</span>
    <input class="txt search-input" id="searchBox" type="search" autocomplete="off"
      placeholder="Search any word…" oninput="APP.onSearch(this.value)"
      onkeydown="if(event.key==='Enter')APP.searchEnter()">
    <button class="search-clear" id="searchClear" onclick="APP.clearSearch()" style="display:none">✕</button>
    <div class="sugg" id="sugg"></div>
  </div>`;
}
let SEARCH_T = null, SUGG = [];
function onSearch(v) {
  clearTimeout(SEARCH_T);
  const clear = document.getElementById('searchClear');
  if (clear) clear.style.display = v ? 'grid' : 'none';
  SEARCH_T = setTimeout(() => renderSuggestions(v), 110);
}
function renderSuggestions(v) {
  const box = document.getElementById('sugg');
  if (!box) return;
  const q = (v || '').trim().toLowerCase();
  if (q.length < 1) { box.classList.remove('open'); box.innerHTML = ''; SUGG = []; return; }
  SUGG = searchWords(q, 8);
  if (!SUGG.length) {
    box.classList.add('open');
    box.innerHTML = `<div class="sugg-empty tiny">No word found for “${esc(q)}”</div>`;
    return;
  }
  box.classList.add('open');
  box.innerHTML = SUGG.map(w => {
    const h = wordHint(w);
    return `<button class="sugg-row" onclick="APP.openWord('${esc(w)}')">
      <div class="sugg-w">${esc(w)}</div>
      ${h.def ? `<div class="sugg-d">${esc(h.def)}</div>` : ''}
      ${h.hi ? `<div class="sugg-h hi">${esc(h.hi)}</div>` : ''}
      ${!h.def && !h.hi ? `<div class="sugg-d">tap to see the meaning</div>` : ''}
    </button>`;
  }).join('');
}
function clearSearch() {
  const i = document.getElementById('searchBox');
  if (i) { i.value = ''; i.focus(); }
  const c = document.getElementById('searchClear');
  if (c) c.style.display = 'none';
  renderSuggestions('');
}
function searchEnter() {
  if (SUGG.length) openWordDetail(SUGG[0]);
}
/* full word card for a searched word */
async function openWordDetail(w) {
  const box = document.getElementById('sugg');
  if (box) { box.classList.remove('open'); box.innerHTML = ''; }
  document.querySelectorAll('.overlay').forEach(o => o.remove());
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet" style="text-align:left;max-width:460px">
    <div class="rowline"><h2 style="text-transform:none">${esc(w)}</h2>
      <button class="iconbtn" onclick="this.closest('.overlay').remove()">✕</button></div>
    <div id="wdBody" class="center mt14"><span class="tiny">loading word…</span></div>
  </div>`;
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
  const c = await getCard(w);
  CUR_FLASH = c;
  const body = document.getElementById('wdBody');
  if (!body) return;
  body.className = '';
  body.innerHTML = `
    <div class="rowline">
      <div>${c.ipa ? `<span class="ipa">${esc(c.ipa)}</span> ` : ''}
        ${c.pos ? `<span class="pos-chip">${esc(c.pos)}</span>` : ''}</div>
      <button class="speak" onclick="speakFlash()" title="hear the word & meaning">🔊</button>
    </div>
    <div class="label">English meaning</div>
    <div class="meaning-en">${esc(c.def || '(no definition found — try another spelling)')}</div>
    <div class="label">हिंदी अर्थ</div>
    <div class="meaning-hi hi">${esc(c.hi || 'उपलब्ध नहीं')}
      ${S.hinglish && c.hi ? `<div class="tiny">${esc(hinglish(c.hi))}</div>` : ''}</div>
    ${c.def ? `<div class="label">How to use it</div>
    <div class="ex">${c.ex ? boldWord(c.ex, c.w) : boldWord(genericExample(c), c.w)}</div>
    <div class="ex">${boldWord(personalExample(c), c.w)}</div>` : ''}
    ${synsHTML(c)}
    <div class="mt14">${videoBlockHTML(c.w)}</div>`;
  mountVideo(c.w);
}

/* ---- Word of the Day card (refreshable) ---- */
function wodCardHTML() {
  const wod = wordOfDay();
  return `<div class="rowline"><div class="tiny">📅 WORD OF THE DAY</div>
      <button class="speak" style="width:34px;height:34px;font-size:1rem" onclick="APP.refreshWod()" title="show a new word">🔄</button></div>
    <div class="rowline"><h2>${esc(wod)}</h2><button class="speak" onclick="speakWod()" title="pronounce">🔊</button></div>
    <div id="wodBody" class="muted tiny">loading…</div>`;
}
function loadWodBody() {
  const wod = S.wodWord || wordOfDay();
  getCard(wod).then(c => {
    WOD_CARD = c; // cache for the 🔊 button (word + meaning)
    const el = document.getElementById('wodBody');
    if (!el) return;
    el.innerHTML = `<div class="meaning-en">${esc(c.def || '')}</div>
      <div class="meaning-hi hi">${esc(c.hi || '')}${S.hinglish && c.hi ? ` <span class="tiny">(${esc(hinglish(c.hi))})</span>` : ''}</div>`;
  });
}
function refreshWodCard() {
  rerollWod();
  WOD_CARD = null;
  const card = document.getElementById('wodCard');
  if (card) { card.innerHTML = wodCardHTML(); loadWodBody(); }
}

/* =============== LEARN (continuous 1→100, no decks) =============== */
function viewLearn() {
  ensureDaily();
  const words = S.daily.words;
  const total = words.length;
  const done = dailyDoneCount();
  const due = dueTricky();
  const nextPos = (() => {
    const i = words.findIndex(w => !S.daily.done[w]);
    return i < 0 ? total : i + 1;
  })();
  const allDone = done >= total && total > 0;
  $app().innerHTML = `<div class="screen">${topbar()}
    <div class="rowline"><h2>Today's ${total} Words</h2><span class="flame">🔥 ${S.streak.current}</span></div>
    <p class="tiny">Learn them one by one — flip, then answer. Each correct answer is +1 word on your safar.</p>
    <div class="panel mt14 center">
      ${ringSVG(total ? done / total : 0, 150, `<b style="font-size:1.5rem">${done}</b><div class="tiny">of ${total}</div>`)}
      <p class="muted mt14">${allDone
        ? 'All ' + total + ' done today — bonus flame earned! 🔥 You can revise them again.'
        : 'You’re on word <b>' + nextPos + '</b> of ' + total + '.'}</p>
      <button class="btn primary mt8" onclick="APP.startFlow()">${done === 0 ? 'Start learning →' : allDone ? 'Revise today’s words ↺' : 'Continue — word ' + nextPos + ' →'}</button>
    </div>
    ${due.length ? `<div class="panel rowline" style="cursor:pointer;border-color:var(--accent)" onclick="APP.go('tricky')">
      <div><h3>🧩 Tricky Words</h3><p class="tiny">${due.length} due for spaced-repetition revision</p></div>
      <span style="font-size:1.4rem">⏰</span></div>` : ''}
    ${footer()}
  ${navbar('learn')}</div>`;
}

/* ---- shared flashcard back face (meaning, examples, synonyms, video) ---- */
function synsHTML(c) {
  if (c.syns && c.syns.length) return `<div class="label">Synonyms ${c.ant ? '· Antonym' : ''}</div>
    <div class="syn-chips">${c.syns.map(s => `<span>${esc(s)}</span>`).join('')}${c.ant ? `<span class="ant">✗ ${esc(c.ant)}</span>` : ''}</div>`;
  if (c.ant) return `<div class="label">Antonym</div><div class="syn-chips"><span class="ant">✗ ${esc(c.ant)}</span></div>`;
  return '';
}
function backFaceHTML(c) {
  const ex2 = personalExample(c);
  return `<div class="rowline"><b style="font-size:1.2rem">${esc(c.w)}</b>
      <button class="speak" onclick="event.stopPropagation();speakFlash()" title="hear the word & meaning">🔊</button></div>
    <div class="label">English meaning</div>
    <div class="meaning-en">${esc(c.def || '(definition unavailable offline)')}</div>
    <div class="label">हिंदी अर्थ</div>
    <div class="meaning-hi hi">${esc(c.hi || 'उपलब्ध नहीं — connect online for Hindi')}
      ${S.hinglish && c.hi ? `<div class="tiny">${esc(hinglish(c.hi))}</div>` : ''}</div>
    <div class="label">How to use it</div>
    <div class="ex">${c.ex ? boldWord(c.ex, c.w) : boldWord(genericExample(c), c.w)}</div>
    <div class="ex">${boldWord(ex2, c.w)}</div>
    ${synsHTML(c)}`;
}
/* inline real-video player — cropped to just the video, auto-plays a
   short (~15s) clip of the word being used. */
let YG_WIDGET = null, YG_TIMER = null;
const YG_CLIP_MS = 15000;
function videoBlockHTML(word) {
  return `<div class="vidblock">
    <div class="label" style="margin:0 0 8px">▶ “${esc(word)}” in a real video — 15-sec clip</div>
    <div class="ygframe">
      <div id="ygflow" class="ygslot"></div>
      <div class="ygmask"></div>
      <div class="ygload" id="ygload"><span class="tiny" style="color:#fff">loading clip…</span></div>
    </div>
  </div>`;
}
function mountVideo(word) {
  const fallback = () => {
    const f = document.getElementById('ygframeWrap') || document.querySelector('.ygframe');
    if (f) f.innerHTML = `<a class="btn small" style="margin:80px auto" href="https://youglish.com/pronounce/${encodeURIComponent(word)}/english" target="_blank" rel="noopener">Open real video ↗</a>`;
  };
  clearTimeout(YG_TIMER);
  loadYouglishScript().then(() => {
    const slot = document.getElementById('ygflow');
    if (!slot) return;
    try {
      YG_WIDGET = new window.YG.Widget('ygflow', {
        width: 320,           // fixed → the crop offsets stay constant
        components: 0,        // no phonetic/caption/coach chrome
        autostart: 1,         // play as soon as the word loads
        events: {
          onFetchDone: (e) => { if (e.totalResult === 0) fallback(); },
          onVideoChange: () => {
            const l = document.getElementById('ygload'); if (l) l.style.display = 'none';
            clearTimeout(YG_TIMER);                       // play ~15s then pause
            YG_TIMER = setTimeout(() => { try { YG_WIDGET.pause(); } catch (e) {} }, YG_CLIP_MS);
          },
        },
      });
      YG_WIDGET.fetch(word, 'english');
    } catch (e) { fallback(); }
  }).catch(fallback);
}
function frontFaceHTML(c) {
  return `<div class="word-big">${esc(c.w)}</div>
    ${c.ipa ? `<div class="ipa">${esc(c.ipa)}</div>` : ''}
    <button class="speak mt14" onclick="event.stopPropagation();speakFlash()" title="hear pronunciation">🔊</button>
    <div class="mt14">${c.pos ? `<span class="pos-chip">${esc(c.pos)}</span>` : ''}</div>
    <p class="tiny mt20">tap to flip 🔄</p>`;
}

/* =============== CONTINUOUS DAILY FLOW (flashcard → quiz → next) =============== */
const FLOW = { list: [], i: 0, card: null };
function startFlow() {
  ensureDaily();
  const words = S.daily.words;
  FLOW.list = words;
  // start at first not-yet-mastered word; if all done, review from the top
  let i = words.findIndex(w => !S.daily.done[w]);
  FLOW.i = i < 0 ? 0 : i;
  FLOW.reviewing = i < 0;
  renderFlowCard();
}
async function renderFlowCard() {
  const w = FLOW.list[FLOW.i];
  if (w === undefined) return finishFlow();
  // skip words already mastered earlier this session (unless reviewing)
  if (!FLOW.reviewing && S.daily.done[w]) { FLOW.i++; return renderFlowCard(); }
  $app().innerHTML = `<div class="screen center"><div class="spacer"></div><h3>Loading word ${FLOW.i + 1}… 📖</h3></div>`;
  const c = await getCard(w);
  FLOW.card = c;
  CUR_FLASH = c;
  if (FLOW.list[FLOW.i + 1]) getCard(FLOW.list[FLOW.i + 1]); // prefetch next
  const total = FLOW.list.length;
  const done = dailyDoneCount();
  $app().innerHTML = `<div class="screen">
    <div class="topbar"><button class="iconbtn" onclick="APP.go('learn')">✕</button>
      <span class="q-count">WORD ${FLOW.i + 1} OF ${total}</span>
      <span class="tiny">${done}/${total} ✅</span></div>
    <div class="pbar"><i style="width:${((FLOW.i + 1) / total) * 100}%"></i></div>
    <div class="spacer"></div>
    ${videoBlockHTML(c.w)}
    <div class="spacer"></div>
    <div class="flash compact" id="flash" onclick="document.getElementById('flash').classList.toggle('flipped')">
      <div class="flash-inner">
        <div class="face front center" style="justify-content:center">${frontFaceHTML(c)}</div>
        <div class="face back">${backFaceHTML(c)}</div>
      </div>
    </div>
    <div class="spacer"></div>
    <div class="btnrow">
      <button class="btn" onclick="APP.flowSkip()">Skip ⏭</button>
      <button class="btn primary" onclick="APP.flowQuiz()">I've got it — quiz me →</button>
    </div>
  </div>`;
  mountVideo(c.w); // auto-start the real-video player for this word
}
/* one MCQ for the current flow word */
function flowQuiz() {
  const c = FLOW.card;
  FLOW.q = makeDeckQuestion(c, [c]); // TESTPOOL supplies distractors
  renderFlowQ();
}
function renderFlowQ() {
  const q = FLOW.q, total = FLOW.list.length;
  $app().innerHTML = `<div class="screen">
    <div class="topbar"><button class="iconbtn" onclick="APP.go('learn')">✕</button>
      <span class="q-count">WORD ${FLOW.i + 1} OF ${total}</span><span class="tiny">quick check</span></div>
    <div class="pbar"><i style="width:${((FLOW.i + 1) / total) * 100}%"></i></div>
    <div class="panel mt14">
      <div class="tiny">${q.prompt.sub}</div>
      <div class="q-word" style="${q.prompt.small ? 'font-size:1.15rem;font-weight:600' : ''}">${esc(q.prompt.title)}
        ${q.prompt.speakW ? `<button class="speak" onclick="speak('${esc(q.prompt.speakW)}')">🔊</button>` : ''}</div>
      <div class="opts">
        ${q.options.map((o, i) => `<button class="opt ${q.hiOpts ? 'hi' : ''}" data-i="${i}" onclick="answerFlowQ(${i})">${esc(o.t)}</button>`).join('')}
      </div>
      <div class="feedback" id="fb"></div>
    </div>
  </div>`;
}
function answerFlowQ(idx) {
  const q = FLOW.q;
  const chosen = q.options[idx];
  document.querySelectorAll('.opt').forEach(b => b.disabled = true);
  const btn = document.querySelector(`.opt[data-i="${idx}"]`);
  const fb = document.getElementById('fb');
  const w = q.card.w;
  S.stats.quizTotal++;
  let leveled = null;
  if (chosen.ok) {
    S.stats.quizCorrect++;
    btn.classList.add('correct');
    fb.textContent = ['Nice! 🔥', 'शाबाश! 🎉', 'You got it! 💪', 'So smooth! ✨'][Math.floor(Math.random() * 4)];
    fb.className = 'feedback good';
    if (masterWord(w)) { // WORD CREDIT RULE: +1 only on correct answer
      leveled = applyVocab(S.vocab + 1);
      S.daily.done[w] = 1;
      touchStreak();
    }
  } else {
    btn.classList.add('wrong');
    const rightIdx = q.options.findIndex(o => o.ok);
    const rb = document.querySelector(`.opt[data-i="${rightIdx}"]`);
    if (rb) rb.classList.add('reveal');
    fb.textContent = `Not quite — it's “${q.options[rightIdx].t.slice(0, 60)}”. Back for revision 🧩`;
    fb.className = 'feedback bad';
    missWord(w);
  }
  saveState();
  setTimeout(() => {
    const advance = () => { FLOW.i++; renderFlowCard(); };
    if (leveled) return showLevelUp(leveled, advance);
    advance();
  }, chosen.ok ? 750 : 1700);
}
function finishFlow() {
  const total = S.daily.words.length;
  const done = dailyDoneCount();
  const allDone = done >= total && total > 0;
  saveState();
  $app().innerHTML = `<div class="screen">${topbar()}
    <div class="panel center">
      <h2>${allDone ? 'Today’s words complete! 🎉' : 'Great session! 💪'}</h2>
      <div class="mt14">${ringSVG(total ? done / total : 0, 140, `<b style="font-size:1.4rem">${done}/${total}</b>`)}</div>
      <p class="muted mt14">${done} words mastered today.${Object.keys(S.tricky).length ? ` ${Object.keys(S.tricky).length} tricky word(s) queued for revision 🧩.` : ''}</p>
      ${allDone ? `<p class="mt8 flame">🔥 Daily ${total} complete — bonus flame!</p>` : ''}
      <div class="btnrow mt14">
        <button class="btn" onclick="APP.go('learn')">Words</button>
        <button class="btn primary" onclick="APP.go('home')">Dashboard</button>
      </div>
    </div>
  </div>`;
  if (allDone) confettiBurst(120);
}

/* =============== WORD VIDEOS (real clips via YouGlish) =============== */
let YG_LOADED = false;
function loadYouglishScript() {
  return new Promise((res, rej) => {
    if (YG_LOADED && window.YG) return res();
    const s = document.createElement('script');
    s.src = 'https://youglish.com/public/emb/widget.js';
    s.async = true;
    s.onload = () => { YG_LOADED = true; res(); };
    s.onerror = () => rej(new Error('yg'));
    document.head.appendChild(s);
    setTimeout(() => (window.YG ? res() : rej(new Error('yg timeout'))), 7000);
  });
}
function showVideos(word) {
  speechSynthesis && speechSynthesis.cancel();
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet" style="max-width:460px">
    <div class="rowline"><h3>▶ “${esc(word)}” in real videos</h3>
      <button class="iconbtn" onclick="this.closest('.overlay').remove()">✕</button></div>
    <p class="tiny">Real clips from movies, news, talks & podcasts — pronounced by native speakers. Powered by YouGlish.</p>
    <div id="ygbox" style="margin-top:12px;min-height:220px;display:grid;place-items:center">
      <span class="tiny">Loading real videos…</span></div>
  </div>`;
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
  loadYouglishScript().then(() => {
    const box = document.getElementById('ygbox');
    if (!box) return;
    box.innerHTML = '<div id="ygwidget"></div>';
    try {
      const widget = new window.YG.Widget('ygwidget', {
        width: 400,
        components: 3, // video + caption + phonetic (no speech-coach mic)
        events: { onFetchDone: (e) => { if (e.totalResult === 0) box.innerHTML = '<span class="tiny">No clips found for this word.</span>'; } },
      });
      widget.fetch(word, 'english');
    } catch (e) {
      box.innerHTML = `<a class="btn small" href="https://youglish.com/pronounce/${encodeURIComponent(word)}/english" target="_blank" rel="noopener">Open on YouGlish ↗</a>`;
    }
  }).catch(() => {
    const box = document.getElementById('ygbox');
    if (box) box.innerHTML = `<a class="btn small" href="https://youglish.com/pronounce/${encodeURIComponent(word)}/english" target="_blank" rel="noopener">Open real videos on YouGlish ↗</a>`;
  });
}

/* =============== DECK: flashcards =============== */
const DECK = { words: [], cards: [], i: 0, idx: 0, mode: 'learn', isTricky: false };

async function openDeck(idx, isTricky = false) {
  if (!isTricky) ensureDaily();
  DECK.idx = idx;
  DECK.isTricky = isTricky;
  DECK.words = isTricky ? dueTricky().slice(0, 10) : S.daily.words.slice(idx * 10, idx * 10 + 10);
  DECK.i = 0;
  DECK.mode = 'learn';
  $app().innerHTML = `<div class="screen center"><div class="spacer"></div><h3>Preparing your deck… 📚</h3><p class="tiny">fetching bilingual cards</p></div>`;
  DECK.cards = await Promise.all(DECK.words.map(getCard));
  renderFlash();
}

function renderFlash() {
  const c = DECK.cards[DECK.i];
  if (!c) return;
  CUR_FLASH = c;
  const n = DECK.cards.length;
  $app().innerHTML = `<div class="screen">
    <div class="topbar"><button class="iconbtn" onclick="APP.go('learn')">✕</button>
      <span class="q-count">CARD ${DECK.i + 1} OF ${n}</span>
      <span class="tiny">${DECK.isTricky ? '🧩 revision' : 'Deck ' + (DECK.idx + 1)}</span></div>
    <div class="pbar"><i style="width:${((DECK.i + 1) / n) * 100}%"></i></div>
    <div class="spacer"></div>
    ${videoBlockHTML(c.w)}
    <div class="spacer"></div>
    <div class="flash compact" id="flash" onclick="document.getElementById('flash').classList.toggle('flipped')">
      <div class="flash-inner">
        <div class="face front center" style="justify-content:center">${frontFaceHTML(c)}</div>
        <div class="face back">${backFaceHTML(c)}</div>
      </div>
    </div>
    <div class="spacer"></div>
    <div class="btnrow">
      <button class="btn" onclick="APP.flashPrev()" ${DECK.i === 0 ? 'disabled' : ''}>← Back</button>
      ${DECK.i < n - 1
        ? `<button class="btn primary" onclick="APP.flashNext()">Next →</button>`
        : `<button class="btn primary" onclick="APP.startDeckQuiz()">Take the Quiz 📝</button>`}
    </div>
  </div>`;
  mountVideo(c.w);
}
function boldWord(sentence, w) {
  const re = new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\w*)', 'i');
  return esc(sentence).replace(re, '<b>$1</b>');
}
function genericExample(c) {
  const t = {
    noun: `Everyone in the room noticed the ${c.w} immediately.`,
    verb: `She decided to ${c.w} before anyone could stop her.`,
    adjective: `It was a truly ${c.w} moment for the whole family.`,
    adverb: `He finished the work ${c.w}, surprising all of us.`,
  };
  return t[c.pos] || `My teacher used the word "${c.w}" in class today.`;
}

/* =============== DECK QUIZ =============== */
const DQUIZ = { qs: [], i: 0, correct: 0 };
function startDeckQuiz() {
  const cards = DECK.cards.filter(c => c.def);
  DQUIZ.qs = shuffled(cards).map(c => makeDeckQuestion(c, cards));
  DQUIZ.i = 0;
  DQUIZ.correct = 0;
  renderDeckQ();
}
function makeDeckQuestion(card, deckCards) {
  const others = deckCards.filter(c => c.w !== card.w);
  const kinds = ['en'];
  if (card.hi && others.filter(o => o.hi).length >= 3) kinds.push('hi');
  if (others.length >= 3) kinds.push('rev');
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  let prompt, options;
  if (kind === 'en') {
    const wrong = shuffled(TESTPOOL[card.band ?? 0].filter(([x, d]) => x !== card.w && d !== card.def)).slice(0, 3).map(([, d]) => d);
    while (wrong.length < 3) { const o = shuffled(others)[0]; if (!o || !o.def) break; if (!wrong.includes(o.def)) wrong.push(o.def); else break; }
    prompt = { title: card.w, sub: 'Pick the correct English meaning', speakW: card.w };
    options = shuffled([{ t: card.def, ok: true }, ...wrong.slice(0, 3).map(t => ({ t, ok: false }))]);
  } else if (kind === 'hi') {
    const wrong = shuffled(others.filter(o => o.hi && o.hi !== card.hi)).slice(0, 3).map(o => o.hi);
    prompt = { title: card.w, sub: 'सही हिंदी अर्थ चुनिए', speakW: card.w, hi: true };
    options = shuffled([{ t: card.hi, ok: true }, ...wrong.map(t => ({ t, ok: false }))]);
  } else {
    const wrong = shuffled(others).slice(0, 3).map(o => o.w);
    prompt = { title: '“' + card.def + '”', sub: 'Which word matches this meaning?', small: true };
    options = shuffled([{ t: card.w, ok: true }, ...wrong.map(t => ({ t, ok: false }))]);
  }
  return { card, prompt, options, hiOpts: kind === 'hi' };
}
function renderDeckQ() {
  const q = DQUIZ.qs[DQUIZ.i];
  if (!q) return finishDeckQuiz();
  const n = DQUIZ.qs.length;
  $app().innerHTML = `<div class="screen">
    <div class="topbar"><button class="iconbtn" onclick="APP.go('learn')">✕</button>
      <span class="q-count">QUESTION ${DQUIZ.i + 1} OF ${n}</span><span></span></div>
    <div class="pbar"><i style="width:${(DQUIZ.i / n) * 100}%"></i></div>
    <div class="panel mt14">
      <div class="tiny">${q.prompt.sub}</div>
      <div class="q-word" style="${q.prompt.small ? 'font-size:1.15rem;font-weight:600' : ''}">${esc(q.prompt.title)}
        ${q.prompt.speakW ? `<button class="speak" onclick="speak('${esc(q.prompt.speakW)}')">🔊</button>` : ''}</div>
      <div class="opts">
        ${q.options.map((o, i) => `<button class="opt ${q.hiOpts ? 'hi' : ''}" data-i="${i}" onclick="answerDeckQ(${i})">${esc(o.t)}</button>`).join('')}
      </div>
      <div class="feedback" id="fb"></div>
    </div>
  </div>`;
}
function answerDeckQ(idx) {
  const q = DQUIZ.qs[DQUIZ.i];
  const chosen = q.options[idx];
  document.querySelectorAll('.opt').forEach(b => b.disabled = true);
  const btn = document.querySelector(`.opt[data-i="${idx}"]`);
  const fb = document.getElementById('fb');
  S.stats.quizTotal++;
  const w = q.card.w;
  let leveled = null;
  if (chosen.ok) {
    S.stats.quizCorrect++;
    DQUIZ.correct++;
    btn.classList.add('correct');
    fb.textContent = ['Nice! 🔥', 'शाबाश! 🎉', 'You got it! 💪', 'So smooth! ✨'][Math.floor(Math.random() * 4)];
    fb.className = 'feedback good';
    // WORD CREDIT RULE: +1 vocabulary only on correct deck-quiz answer
    if (DECK.isTricky) { trickyPromote(w); if (!S.learned[w]) { if (masterWord(w)) leveled = applyVocab(S.vocab + 1); } }
    else if (masterWord(w)) {
      leveled = applyVocab(S.vocab + 1);
      if (S.daily.words.includes(w)) S.daily.done[w] = 1;
      touchStreak();
    }
  } else {
    btn.classList.add('wrong');
    const rightIdx = q.options.findIndex(o => o.ok);
    const rb = document.querySelector(`.opt[data-i="${rightIdx}"]`);
    if (rb) rb.classList.add('reveal');
    fb.textContent = `So close — you'll get it next time! It's "${q.options[rightIdx].t.slice(0, 60)}"`;
    fb.className = 'feedback bad';
    missWord(w);
  }
  saveState();
  setTimeout(() => {
    if (leveled) return showLevelUp(leveled, () => { DQUIZ.i++; renderDeckQ(); });
    DQUIZ.i++; renderDeckQ();
  }, chosen.ok ? 700 : 1700);
}
function finishDeckQuiz() {
  const n = DQUIZ.qs.length;
  if (!DECK.isTricky) {
    S.daily.decksDone[DECK.idx] = DQUIZ.correct === n && n > 0 ? true : S.daily.decksDone[DECK.idx];
    if (DQUIZ.correct >= Math.ceil(n * .7)) S.daily.decksDone[DECK.idx] = true;
  }
  const allDone = S.daily && dailyDoneCount() >= S.daily.words.length && S.daily.words.length > 0;
  saveState();
  const pct = n ? Math.round(DQUIZ.correct / n * 100) : 0;
  $app().innerHTML = `<div class="screen">${topbar()}
    <div class="panel center">
      <h2>${pct === 100 ? 'Perfect deck! 🏅' : pct >= 70 ? 'Deck cleared! 🎉' : 'Good effort! 💪'}</h2>
      <div class="mt14">${ringSVG(n ? DQUIZ.correct / n : 0, 130, `<b style="font-size:1.4rem">${DQUIZ.correct}/${n}</b>`)}</div>
      <p class="muted mt14">${DQUIZ.correct} words added to your vocabulary counter ✅<br>
      ${n - DQUIZ.correct > 0 ? `${n - DQUIZ.correct} moved to Tricky Words for revision 🧩` : 'Nothing tricky — flawless!'}</p>
      ${allDone ? `<p class="mt8 flame">🔥 Daily ${S.daily.words.length} complete — bonus flame!</p>` : ''}
      <div class="btnrow mt14">
        <button class="btn" onclick="APP.go('learn')">Decks</button>
        <button class="btn primary" onclick="APP.go('home')">Dashboard</button>
      </div>
    </div>
  </div>`;
  if (pct >= 70) confettiBurst(90);
}

/* =============== SAFAR TRAIL =============== */
function viewSafar() {
  const L = displayLevel();
  $app().innerHTML = `<div class="screen">${topbar()}
    <h2>🛤️ Safar to Genius</h2>
    <p class="tiny">Your journey from first words to 60,000. Tap a milestone to preview its badge.</p>
    <div class="panel trail mt14">${trailSVG(S.vocab)}</div>
    <div class="panel center">
      <div>${badgeSVG(L, { size: 150, current: true })}</div>
      <h3 class="mt8">${L.name} — Level ${L.n} of 7</h3>
      <p class="tiny">${fmt(S.vocab)} / 60,000 words</p>
      <button class="btn primary mt14" onclick="shareCard('badge')">Share my badge 📤</button>
    </div>
    ${footer()}
  ${navbar('safar')}</div>`;
  document.querySelectorAll('.milestone').forEach(m => m.addEventListener('click', () => {
    const L2 = LEVELS[+m.dataset.level - 1];
    showBadgePreview(L2);
  }));
}
function showBadgePreview(L2) {
  const locked = S.vocab < L2.min && L2.n !== 1;
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet">
    ${badgeSVG(L2, { size: 170, locked, current: displayLevel().n === L2.n })}
    <h2 class="mt8">${L2.name}</h2>
    <p class="muted">${fmt(L2.min)} – ${fmt(L2.max)} words</p>
    ${locked ? `<p class="tiny mt8">🔒 Unlocks at ${fmt(L2.min)} words — ${fmt(L2.min - S.vocab)} to go!</p>` : `<p class="tiny mt8">Unlocked ✅</p>`}
    <button class="btn mt14" onclick="this.closest('.overlay').remove()">Close</button>
  </div>`;
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
}

/* =============== LEVEL UP =============== */
function showLevelUp(L, after) {
  confettiBurst(220);
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet">
    <div class="levelup-title">LEVEL UP!</div>
    <div class="mt14">${badgeSVG(L, { size: 180, current: true })}</div>
    <h2 class="mt8">You're ${'AEIOU'.includes(L.name[0]) ? 'an' : 'a'} ${L.name.toUpperCase()} now!</h2>
    <p class="muted mt8">${fmt(S.vocab)} words and climbing. ${motivation(L)}</p>
    <div class="btnrow mt20">
      <button class="btn" id="luClose">Continue</button>
      <button class="btn primary" onclick="shareCard('badge')">Share 📤</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  ov.querySelector('#luClose').onclick = () => { ov.remove(); after && after(); };
}

/* =============== WEEKLY RESULT =============== */
function growthChartSVG(w = 340, h = 190) {
  const hist = S.testHistory.filter(t => ['placement', 'weekly', 'retake'].includes(t.kind));
  if (!hist.length) return '<p class="tiny">Take your first test to start the chart.</p>';
  const pad = 34, iw = w - pad - 12, ih = h - 44;
  const xs = hist.map((_, i) => pad + (hist.length === 1 ? iw / 2 : i / (hist.length - 1) * iw));
  const ys = hist.map(t => 14 + ih - (t.estimate / UNIVERSE) * ih);
  const pts = xs.map((x, i) => `${x},${ys[i]}`).join(' ');
  const geniusY = 14;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}">
    <line x1="${pad}" y1="${geniusY}" x2="${w - 12}" y2="${geniusY}" stroke="var(--lv7)" stroke-width="1.5" stroke-dasharray="5 5"/>
    <text class="axis-label" x="${w - 12}" y="${geniusY - 4}" text-anchor="end" fill="var(--lv7)">GENIUS — 60,000</text>
    ${[0.25, 0.5, 0.75].map(f => `<line x1="${pad}" y1="${14 + ih * f}" x2="${w - 12}" y2="${14 + ih * f}" stroke="var(--ring-track)" stroke-width="1"/>
      <text class="axis-label" x="${pad - 4}" y="${14 + ih * f + 3}" text-anchor="end">${Math.round(60 * (1 - f))}k</text>`).join('')}
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    ${xs.map((x, i) => `<circle cx="${x}" cy="${ys[i]}" r="4.5" fill="var(--accent)" stroke="var(--panel)" stroke-width="2"/>`).join('')}
    ${xs.map((x, i) => `<text class="axis-label" x="${x}" y="${h - 6}" text-anchor="${i === 0 ? 'start' : i === xs.length - 1 ? 'end' : 'middle'}">${new Date(hist[i].date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</text>`).join('')}
  </svg>`;
}

function viewWeeklyResult() {
  const t = S.testHistory[S.testHistory.length - 1];
  const prev = t.prevVocab ?? t.estimate;
  const diff = t.estimate - prev;
  const L = displayLevel();
  const slipped = diff < 0 || (t.lost || 0) > 3;
  const next = LEVELS[L.n];
  $app().innerHTML = `<div class="screen">${topbar()}
    <div class="panel center">
      <div class="tiny">THIS WEEK'S RE-RATING</div>
      <div class="big-counter mt8">${fmt(t.estimate)}<small> / 60,000</small></div>
      <p class="mt8" style="font-weight:800;color:${diff >= 0 ? 'var(--good)' : 'var(--bad)'}">
        ${fmt(prev)} → ${fmt(t.estimate)} (${diff >= 0 ? '+' : ''}${fmt(diff)} this week ${diff >= 0 ? '📈' : '📉'})</p>
      <div class="mt14">${badgeSVG(L, { size: 140, current: true })}</div>
      ${next ? `<p class="tiny mt8">${fmt(Math.max(0, next.min - S.vocab))} words to your next badge (${next.name})</p>` : ''}
      <p class="tiny mt8">Retention: ${t.kept || 0} kept ✅ ${t.lost ? `· ${t.lost} slipped back to revision 🧩` : ''}</p>
      ${slipped ? `<div class="panel mt14" style="box-shadow:none;border-color:var(--accent)">
        <p class="tiny">Your retention slipped this week — let's revise ${Math.max(t.lost * 2, 10)} words 💛</p>
        <button class="btn small mt8" onclick="APP.go('tricky')">One-tap revision deck</button></div>` : ''}
    </div>
    <div class="panel"><h3>📈 Your climb to 60,000</h3>${growthChartSVG()}</div>
    <div class="panel center">
      <p class="tiny">🗓️ Consistency streak: <b>${S.weeklyStreak} week${S.weeklyStreak === 1 ? '' : 's'}</b> of testing</p>
      <div class="btnrow mt8">
        <button class="btn" onclick="shareCard('weekly')">Share (1:1) 📤</button>
        <button class="btn primary" onclick="shareCard('weeklyStory')">Insta Story (9:16) 📱</button>
      </div>
    </div>
    <div class="mt14"><button class="btn" onclick="APP.go('home')">Back to Dashboard</button></div>
  ${navbar('home')}</div>`;
  if (diff > 0) confettiBurst(120);
}

/* =============== STATS =============== */
function viewStats() {
  const acc = S.stats.quizTotal ? Math.round(S.stats.quizCorrect / S.stats.quizTotal * 100) : 0;
  const learned = Object.keys(S.learned).length;
  const days = Object.entries(S.stats.days).sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-14);
  const maxD = Math.max(1, ...days.map(d => d[1]));
  $app().innerHTML = `<div class="screen">${topbar()}
    <h2>📊 Your Stats</h2>
    <div class="statgrid mt14">
      <div class="stat"><div class="v">${fmt(S.vocab)}</div><div class="k">est. vocabulary</div></div>
      <div class="stat"><div class="v">${fmt(learned)}</div><div class="k">words mastered here</div></div>
      <div class="stat"><div class="v">${acc}%</div><div class="k">quiz accuracy</div></div>
      <div class="stat"><div class="v">🔥 ${S.streak.current}<span class="tiny"> best ${S.streak.best}</span></div><div class="k">daily streak</div></div>
      <div class="stat"><div class="v">🗓️ ${S.weeklyStreak}</div><div class="k">weekly test streak</div></div>
      <div class="stat"><div class="v">${Object.keys(S.tricky).length}</div><div class="k">tricky words</div></div>
    </div>
    <div class="panel mt14"><h3>📈 Weekly vocabulary growth</h3>${growthChartSVG()}</div>
    <div class="panel"><h3>Band strength (last test)</h3>${S.bandStats ? bandChartSVG(S.bandStats) : '<p class="tiny">No test yet.</p>'}</div>
    <div class="panel"><h3>Last 14 active days</h3>
      <svg class="chart" viewBox="0 0 340 110">
        ${days.map(([d, v], i) => {
          const bh = v / maxD * 70;
          return `<rect class="bar-band" x="${12 + i * 23}" y="${84 - bh}" width="16" height="${Math.max(2, bh)}" rx="4"/>
          <text class="axis-label" x="${20 + i * 23}" y="${78 - bh}" text-anchor="middle">${v}</text>
          <text class="axis-label" x="${20 + i * 23}" y="100" text-anchor="middle">${d.slice(8)}</text>`;
        }).join('') || '<text class="axis-label" x="170" y="55" text-anchor="middle">Master words to see daily bars</text>'}
      </svg></div>
    <div class="panel center">
      <button class="btn primary" onclick="shareCard('badge')">Share my score card 📤</button>
    </div>
    ${footer()}
  ${navbar('stats')}</div>`;
}

/* =============== SETTINGS =============== */
function viewSettings() {
  $app().innerHTML = `<div class="screen">${topbar()}
    <h2>⚙️ Settings</h2>
    <div class="panel mt14">
      <label class="rowline" style="cursor:pointer"><span>🌗 Dark theme</span>
        <input type="checkbox" ${S.theme === 'dark' ? 'checked' : ''} onchange="APP.toggleTheme()"></label>
      <div class="spacer"></div>
      <div><span>🎨 Colour theme</span>
        <div class="swatches">
          ${[['ocean', 'Ocean'], ['sunset', 'Sunset'], ['violet', 'Violet'], ['tropical', 'Tropical']].map(([a, n]) =>
            `<button class="swatch sw-${a} ${(S.accent || 'ocean') === a ? 'on' : ''}" data-a="${a}" title="${n}" aria-label="${n}" onclick="APP.setAccent('${a}')"></button>`).join('')}
        </div>
      </div>
      <div class="spacer"></div>
      <label class="rowline" style="cursor:pointer"><span>अ Hinglish transliteration</span>
        <input type="checkbox" ${S.hinglish ? 'checked' : ''} onchange="S.hinglish=this.checked;saveState();toast('Saved')"></label>
      <div class="spacer"></div>
      <label class="rowline" style="cursor:pointer"><span>⏱️ Test timer (15s/word)</span>
        <input type="checkbox" ${S.timerOn ? 'checked' : ''} onchange="S.timerOn=this.checked;saveState();toast('Saved')"></label>
      <div class="spacer"></div>
      <div class="rowline"><span>🔊 Pronunciation voice</span>
        <select class="txt" style="width:150px" onchange="APP.setVoice(this.value)">
          <option value="female" ${S.voicePref !== 'male' ? 'selected' : ''}>👩 Female</option>
          <option value="male" ${S.voicePref === 'male' ? 'selected' : ''}>👨 Male</option>
        </select></div>
      <div class="spacer"></div>
      <div class="rowline"><span>🎯 Daily goal</span>
        <select class="txt" style="width:110px" onchange="S.dailyGoal=+this.value;S.daily=null;saveState();toast('New goal from now!')">
          ${[25, 50, 100, 200].map(g => `<option value="${g}" ${S.dailyGoal === g ? 'selected' : ''}>${g} words</option>`).join('')}
        </select></div>
    </div>
    <div class="panel">
      <h3>Interests</h3>
      <p class="tiny">${S.interests.map(i => INTEREST_LABELS[i]).join(' · ') || 'none picked'}</p>
      <button class="btn small mt8" onclick="APP.go('interests')">Edit interests</button>
    </div>
    <div class="panel">
      <h3>🤖 Claude API (optional)</h3>
      <p class="tiny">Add an Anthropic API key to auto-generate bilingual cards for very rare words. Stored only on this device.</p>
      <input class="txt mt8" id="ckey" type="password" placeholder="sk-ant-…" value="${esc(S.claudeKey)}">
      <button class="btn small mt8" onclick="S.claudeKey=document.getElementById('ckey').value.trim();saveState();toast('API key saved')">Save key</button>
    </div>
    <div class="panel">
      <h3>Re-rate my vocabulary</h3>
      <p class="tiny">Take a fresh 50-word test anytime. Fresh words every time.</p>
      <button class="btn small mt8" onclick="APP.go('retakeIntro')">Retake test</button>
    </div>
    <div class="panel">
      <h3>📜 About & Credits</h3>
      <p class="tiny">ShabdSafar — A Safar to Genius · by <b>@professorSK</b>. All progress lives in your browser; nothing is uploaded.</p>
      <p class="tiny mt8">Open word data, with gratitude:<br>
      • English↔Hindi dictionary: <b>FreeDict eng-hin</b> (freedict.org, GPL)<br>
      • Word frequencies: <b>FrequencyWords / OpenSubtitles 2018</b> (hermitdave, CC BY-SA 4.0)<br>
      • Definitions & synonyms: <b>Princeton WordNet 3.x</b> (WordNet License) & <b>Webster's Unabridged</b> (public domain)<br>
      • Pronunciations: <b>open-dict-data/ipa-dict</b> (MIT)<br>
      • Live definitions & human pronunciations: <b>Free Dictionary API</b> (dictionaryapi.dev)<br>
      • Real-video word examples: <b>YouGlish</b> (youglish.com)<br>
      Modified word data in this app is shared under the same licenses (CC BY-SA where applicable).</p>
    </div>
    <div class="panel">
      <button class="btn danger" onclick="APP.resetAll()">Reset everything 🗑️</button>
    </div>
    ${footer()}
  ${navbar('settings')}</div>`;
}

/* =============== SHARE CARDS (canvas) =============== */
async function shareCard(kind) {
  const story = kind === 'weeklyStory';
  const W = 1080, H = story ? 1920 : 1080;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const L = displayLevel();
  // follow the user's chosen colour theme
  const css = getComputedStyle(document.documentElement);
  const AC = (css.getPropertyValue('--accent') || '#2dd4bf').trim();
  const AC2 = (css.getPropertyValue('--accent2') || '#3b82f6').trim();
  // bg
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#141a3c'); g.addColorStop(1, '#0c1024');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const g2 = ctx.createRadialGradient(W * .8, H * .1, 0, W * .8, H * .1, W * .8);
  g2.addColorStop(0, AC2); g2.addColorStop(1, 'transparent');
  ctx.globalAlpha = .22;
  ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  const cx = W / 2;
  let y = story ? 300 : 130;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#eef0fb';
  ctx.font = '900 84px system-ui, sans-serif';
  ctx.fillText('ShabdSafar', cx, y);
  ctx.fillStyle = AC;
  ctx.font = '700 34px system-ui, sans-serif';
  ctx.fillText('A  S A F A R  T O  G E N I U S', cx, y + 56);
  // badge
  const img = new Image();
  const svg = badgeSVG(L, { size: 460 }).replace(/var\(--font\)/g, 'system-ui,sans-serif');
  await new Promise(res => { img.onload = res; img.onerror = res; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  const bs = story ? 560 : 440;
  ctx.drawImage(img, cx - bs / 2, y + 110, bs, bs);
  y += 110 + bs + 100;
  ctx.fillStyle = '#eef0fb';
  ctx.font = '900 66px system-ui, sans-serif';
  if (kind === 'weekly' || kind === 'weeklyStory') {
    const t = S.testHistory[S.testHistory.length - 1];
    const diff = t.estimate - (t.prevVocab ?? t.estimate);
    ctx.fillText(`I know ~${fmt(S.vocab)} of 60,000 words`, cx, y);
    ctx.fillStyle = diff >= 0 ? '#37d38a' : AC;
    ctx.font = '900 58px system-ui, sans-serif';
    ctx.fillText(`${diff >= 0 ? '+' : ''}${fmt(diff)} words this week 🔥`, cx, y + 84);
    y += 84;
  } else {
    ctx.fillText(`I know ~${fmt(S.vocab)} of 60,000 words`, cx, y);
    ctx.fillStyle = AC;
    ctx.font = '900 58px system-ui, sans-serif';
    ctx.fillText(`I'm ${'AEIOU'.includes(L.name[0]) ? 'an' : 'a'} ${L.name.toUpperCase()} — can you beat me?`, cx, y + 84);
    y += 84;
  }
  ctx.fillStyle = '#9aa3c7';
  ctx.font = '700 36px system-ui, sans-serif';
  ctx.fillText('@professorSK', cx, story ? H - 160 : H - 80);
  // download / share
  cv.toBlob(async blob => {
    const file = new File([blob], 'shabdsafar-badge.png', { type: 'image/png' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'My ShabdSafar badge' }); return; } catch (e) {}
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'shabdsafar-badge.png';
    a.click();
    toast('Share card downloaded 📤');
  });
}

/* =============== CONFETTI =============== */
function confettiBurst(count = 120) {
  let cv = document.getElementById('confetti');
  if (!cv) {
    cv = document.createElement('canvas');
    cv.id = 'confetti';
    document.body.appendChild(cv);
  }
  cv.width = innerWidth; cv.height = innerHeight;
  const ctx = cv.getContext('2d');
  const colors = ['#ffb03a', '#ff7847', '#37d38a', '#3f8cff', '#a05ce6', '#f0435a', '#f5b400'];
  const parts = Array.from({ length: count }, () => ({
    x: innerWidth / 2 + (Math.random() - .5) * 160,
    y: innerHeight * .35,
    vx: (Math.random() - .5) * 14,
    vy: -Math.random() * 13 - 4,
    s: Math.random() * 8 + 4,
    c: colors[Math.floor(Math.random() * colors.length)],
    r: Math.random() * Math.PI,
    vr: (Math.random() - .5) * .3,
  }));
  const t0 = performance.now();
  (function tick(t) {
    const el = (t - t0) / 1000;
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += .35; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6);
      ctx.restore();
    }
    if (el < 2.6) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, cv.width, cv.height);
  })(t0);
}
