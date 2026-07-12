/* ShabdSafar — bootstrap & router. */
'use strict';

const APP = {
  _cur: 'home',
  go(view) {
    speechSynthesis && speechSynthesis.cancel();
    APP._cur = view;
    switch (view) {
      case 'splash': return viewSplash();
      case 'testIntro': return viewTestIntro('placement');
      case 'retakeIntro': return viewTestIntro('retake');
      case 'weeklyIntro': return viewTestIntro('weekly');
      case 'testResult': return viewTestResult();
      case 'retakeResult': return viewRetakeResult();
      case 'weeklyResult': return viewWeeklyResult();
      case 'interests': return viewInterests();
      case 'home': return viewHome();
      case 'learn': return viewLearn();
      case 'safar': return viewSafar();
      case 'stats': return viewStats();
      case 'settings': return viewSettings();
      case 'tricky': return openDeck(0, true);
      default: return S.onboarded ? viewHome() : viewSplash();
    }
  },
  startTest(kind) { startTest(kind); },
  openDeck(i) { openDeck(i, false); },
  startDeckQuiz() { startDeckQuiz(); },
  flashNext() { if (DECK.i < DECK.cards.length - 1) { DECK.i++; renderFlash(); } },
  flashPrev() { if (DECK.i > 0) { DECK.i--; renderFlash(); } },

  setVoice(pref) {
    S.voicePref = pref;
    VOICE = null; // re-pick with the new preference
    saveState();
    speak('Welcome to ShabdSafar');
    toast(pref === 'male' ? 'Male voice selected 👨' : 'Female voice selected 👩');
  },
  toggleTheme() {
    S.theme = S.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = S.theme;
    saveState();
    // theme toggle only exists on stable (non-flow) screens, safe to re-render
    if (['home', 'learn', 'safar', 'stats', 'settings', 'interests', 'splash'].includes(APP._cur)) APP.go(APP._cur);
  },
  toggleInterest(btn) {
    const k = btn.dataset.k;
    const i = S.interests.indexOf(k);
    if (i >= 0) S.interests.splice(i, 1);
    else if (S.interests.length < 5) S.interests.push(k);
    else return toast('Max 5 interests — deselect one first');
    btn.classList.toggle('on', S.interests.includes(k));
    const go = document.getElementById('intGo');
    const hint = document.getElementById('intHint');
    if (go) go.disabled = S.interests.length < 3;
    if (hint) hint.textContent = S.interests.length < 3 ? 'Pick at least 3 topics' : '';
    saveState();
  },
  saveInterests() {
    S.favMovie = (document.getElementById('favMovie') || {}).value?.trim() || S.favMovie;
    S.favBook = (document.getElementById('favBook') || {}).value?.trim() || S.favBook;
    const firstTime = !S.onboarded;
    S.onboarded = true;
    S.daily = null; // rebuild feed with new interests
    saveState();
    if (firstTime) toast('Your Safar begins! 🚩');
    APP.go('home');
  },
  resetAll() {
    if (!confirm('Delete ALL progress on this device? This cannot be undone.')) return;
    localStorage.removeItem(STATE_KEY);
    try { indexedDB.deleteDatabase('shabdsafar'); } catch (e) {}
    location.reload();
  },
};

window.answerQ = answerQ;
window.answerSelf = answerSelf;
window.answerDeckQ = answerDeckQ;

(async function init() {
  loadState();
  document.documentElement.dataset.theme = S.theme;
  const app = document.getElementById('app');
  app.innerHTML = `<div class="screen splash">
    <div class="mark">🚶‍♂️➡️🏔️</div>
    <h1>Shabd<em>Safar</em></h1>
    <div class="tagline">A Safar to Genius</div>
    <p class="muted mt14" id="loadmsg">Packing your word bags…</p>
  </div>`;
  try {
    await loadData(msg => { const el = document.getElementById('loadmsg'); if (el) el.textContent = msg; });
  } catch (e) {
    app.innerHTML = `<div class="screen center"><div class="spacer"></div>
      <h2>Couldn't load word data 😔</h2>
      <p class="muted mt8">Serve the app over http (not file://) so the word index can load.<br><code>python3 -m http.server</code> in the app folder, then open localhost.</p></div>`;
    return;
  }
  // preload voices for TTS
  speechSynthesis && speechSynthesis.getVoices();
  APP.go(S.onboarded ? 'home' : 'splash');
})();
