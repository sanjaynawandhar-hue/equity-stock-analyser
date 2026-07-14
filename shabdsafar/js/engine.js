/* ShabdSafar core engine: state, data, estimation, feed, spaced repetition, APIs. */
'use strict';

const STATE_KEY = 'shabdsafar_state';
const BAND_COUNT = 7;
const UNIVERSE = 60000;
// widths sum exactly to 60000 (last band slightly smaller)
const BAND_WIDTHS = (() => {
  const w = Math.ceil(UNIVERSE / BAND_COUNT); // 8572
  const arr = Array(BAND_COUNT).fill(w);
  arr[BAND_COUNT - 1] = UNIVERSE - w * (BAND_COUNT - 1);
  return arr;
})();

const DEFAULT_STATE = () => ({
  v: 1,
  onboarded: false,
  name: '',
  interests: [],
  favMovie: '',
  favBook: '',
  theme: 'dark',
  hinglish: false,
  timerOn: false,
  voicePref: 'female',   // 'female' | 'male' pronunciation voice
  dailyGoal: 100,
  claudeKey: '',
  vocab: 0,
  highestLevel: 1,
  bandStats: null,           // [[correct,total] x7] from last rating test
  learned: {},               // word -> {t:timestamp, b:band}  (quiz-mastered => +1 credit)
  tricky: {},                // word -> {due:ts, stage:0..2, b:band}
  usedTestWords: [],         // words ever used in a rating test (never repeat)
  testHistory: [],           // {date, estimate, bands, correct, dontKnow, kind:'placement'|'weekly'}
  weeklyStreak: 0,
  streak: { current: 0, best: 0, lastDay: '' },
  daily: null,               // {date, words:[], done:{word:1}, decksDone:[bool]}
  stats: { quizCorrect: 0, quizTotal: 0, days: {} }, // days: date -> words mastered
  wodDate: '', wodWord: '',
  dontKnowWords: [],
});

let S = null;               // state singleton
let WORDS = [];             // 100k+ frequency-ranked words
let RANK = new Map();       // word -> rank
let SEED = new Map();       // word -> full card object
let LITE = new Map();       // word -> lite card
let TESTPOOL = [];          // [band][ [word,def] ]
let THEMES = {};            // interest -> [words]
let DB = null;              // IndexedDB handle

/* ---------------- state ---------------- */
function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) { S = Object.assign(DEFAULT_STATE(), JSON.parse(raw)); return; }
  } catch (e) { console.warn('state load failed', e); }
  S = DEFAULT_STATE();
}
function saveState() { localStorage.setItem(STATE_KEY, JSON.stringify(S)); }
function todayStr(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* ---------------- data loading ---------------- */
async function loadData(onProgress) {
  const get = async (f) => (await fetch('data/' + f)).json();
  onProgress && onProgress('Loading word index…');
  const idx = await get('word-index.json');
  WORDS = idx.words.split('\n');
  WORDS.forEach((w, i) => RANK.set(w, i));
  onProgress && onProgress('Loading word cards…');
  const seed = await get('seed-cards.json');
  for (const c of seed.cards) SEED.set(c[0], { w: c[0], pos: c[1], ipa: c[2], def: c[3], hi: c[4], ex: c[5], syns: c[6], ant: c[7], band: c[8], full: true });
  const lite = await get('lite-cards.json');
  for (const c of lite.cards) LITE.set(c[0], { w: c[0], pos: c[1], def: c[2], hi: c[3], band: c[4], ex: c[5] || '', ipa: '', syns: [], ant: '', full: false });
  onProgress && onProgress('Loading test bank…');
  TESTPOOL = (await get('test-pool.json')).bands;
  THEMES = (await get('themes.json')).themes;
  await openDB();
}

function bandOfRank(r) { return Math.min(6, Math.floor(r / Math.ceil(UNIVERSE / BAND_COUNT))); }
function bandOfWord(w) {
  const r = RANK.get(w);
  return r === undefined ? 6 : bandOfRank(Math.min(r, UNIVERSE - 1));
}

/* ---------------- IndexedDB card cache ---------------- */
function openDB() {
  return new Promise((res) => {
    const rq = indexedDB.open('shabdsafar', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('cards', { keyPath: 'w' });
    rq.onsuccess = () => { DB = rq.result; res(); };
    rq.onerror = () => { console.warn('IndexedDB unavailable'); res(); };
  });
}
function dbGet(w) {
  return new Promise((res) => {
    if (!DB) return res(null);
    const rq = DB.transaction('cards').objectStore('cards').get(w);
    rq.onsuccess = () => res(rq.result || null);
    rq.onerror = () => res(null);
  });
}
function dbPut(card) {
  if (!DB) return;
  try { DB.transaction('cards', 'readwrite').objectStore('cards').put(card); } catch (e) {}
}

/* ---------------- card resolution chain ---------------- */
/* seed -> IndexedDB cache -> lite(+API enrich) -> Free Dictionary API -> Claude API -> minimal */
async function getCard(w) {
  if (SEED.has(w)) return SEED.get(w);
  const cached = await dbGet(w);
  if (cached && cached.full) return cached;
  let card = LITE.get(w) ? { ...LITE.get(w) } : cached ? { ...cached } :
    { w, pos: '', ipa: '', def: '', hi: '', ex: '', syns: [], ant: '', band: bandOfWord(w), full: false };
  // enrich from Free Dictionary API
  try {
    const r = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(w), { signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      const j = await r.json();
      const e = j[0];
      if (e) {
        card.ipa = card.ipa || (e.phonetic || (e.phonetics || []).map(p => p.text).find(Boolean) || '');
        // human pronunciation recording (native speaker)
        if (!card.audio) {
          for (const ee of j) {
            const a = (ee.phonetics || []).map(p => p.audio).find(u => u && /^https?:\/\//.test(u));
            if (a) { card.audio = a; break; }
          }
        }
        if (card.audio) AUDIO.set(w, card.audio);
        const m = (e.meanings || [])[0];
        if (m) {
          card.pos = card.pos || m.partOfSpeech || '';
          const d = (m.definitions || [])[0];
          if (d) {
            if (!card.def) card.def = d.definition || '';
            if (!card.ex && d.example) card.ex = d.example;
          }
          if (!card.syns.length) card.syns = (m.synonyms || []).slice(0, 3);
          if (!card.ant) card.ant = ((m.antonyms || [])[0]) || '';
        }
      }
    }
  } catch (e) { /* offline — fall through */ }
  // Claude fallback for anything still missing (needs key in settings)
  if ((!card.def || !card.hi) && S.claudeKey) {
    const ai = await claudeCard(w);
    if (ai) card = { ...card, ...ai };
  }
  card.full = !!(card.def && card.hi);
  if (card.def) dbPut(card);
  return card;
}

async function claudeCard(w) {
  try {
    const interests = S.interests.join(', ') || 'daily life';
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': S.claudeKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `Create a bilingual vocabulary card for the English word "${w}" for an Indian English learner interested in ${interests}. Reply with ONLY JSON: {"pos":"...","ipa":"/.../","def":"one simple English definition","hi":"Hindi meaning in Devanagari","ex":"one everyday example sentence","ex2":"one example themed on ${interests}","syns":["s1","s2"],"ant":"antonym or empty"}`
        }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const txt = (j.content || []).map(c => c.text || '').join('');
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const o = JSON.parse(m[0]);
    return { pos: o.pos || '', ipa: o.ipa || '', def: o.def || '', hi: o.hi || '', ex: o.ex || '', ex2: o.ex2 || '', syns: o.syns || [], ant: o.ant || '' };
  } catch (e) { return null; }
}

/* ---------------- personalized example sentences ---------------- */
const INTEREST_LABELS = {
  movies: 'Movies & Web Series', books: 'Books & Reading', cricket: 'Cricket & Sports',
  business: 'Business & Finance', travel: 'Travel', food: 'Food & Cooking',
  technology: 'Technology', music: 'Music', bollywood: 'Bollywood', selfimprovement: 'Self-improvement',
};
/* Original template sentences, one per POS per interest. {w}=word, {fav}=favourite. */
const EX_TEMPLATES = {
  movies: {
    adjective: 'The last episode of that web series was so {w} that we watched it twice.',
    noun: 'Every good thriller needs a strong {w} to keep the audience hooked.',
    verb: 'Directors often {w} a scene many times before they are satisfied.',
    generic: 'While discussing {fav}, my friend used the word "{w}" and it fit perfectly.',
  },
  books: {
    adjective: 'The novel {fav} felt {w} from the very first chapter.',
    noun: 'A well-written {w} can change how you see the whole story.',
    verb: 'Great authors {w} their readers with every single page.',
    generic: 'I underlined the word "{w}" while reading {fav} last night.',
  },
  cricket: {
    adjective: 'The bowler was {w} in the final over, and it won India the match.',
    noun: 'Commentators kept talking about the {w} during the entire innings.',
    verb: 'A good captain knows exactly when to {w} under pressure.',
    generic: 'During the IPL final, the commentator said the chase looked "{w}".',
  },
  business: {
    adjective: 'Investors prefer a {w} plan over big promises.',
    noun: 'Understanding {w} is essential before you start any business.',
    verb: 'Smart founders {w} their spending in the first year.',
    generic: 'In the budget meeting, our manager used the word "{w}" three times.',
  },
  travel: {
    adjective: 'The mountain village in Himachal was calm, green and truly {w}.',
    noun: 'Pack light, but never forget your {w} when travelling abroad.',
    verb: 'Seasoned travellers {w} before booking anything online.',
    generic: 'My travel diary from Kerala has the word "{w}" written on the first page.',
  },
  food: {
    adjective: 'The biryani at that old Hyderabad place was absolutely {w}.',
    noun: 'Every family recipe has one secret {w} that makes it special.',
    verb: 'Good chefs {w} the spices slowly to build flavour.',
    generic: 'While cooking dinner, I told my mother the curry smelled "{w}".',
  },
  technology: {
    adjective: 'The new app update feels much more {w} than the old version.',
    noun: 'Every startup founder should understand what a {w} really is.',
    verb: 'Engineers {w} their code before every release.',
    generic: 'In the tech review video, the host called the phone "{w}".',
  },
  music: {
    adjective: 'The live concert last weekend was completely {w}.',
    noun: 'A soulful {w} can stay in your head for days.',
    verb: 'Talented singers {w} effortlessly between high and low notes.',
    generic: 'My playlist has a song whose lyrics use the word "{w}".',
  },
  bollywood: {
    adjective: 'Critics called the new film\'s climax {w} and unforgettable.',
    noun: 'Every 90s film had a memorable {w} that fans still discuss.',
    verb: 'Big stars {w} for months before a major film release.',
    generic: 'In an interview about {fav}, the actor described the script as "{w}".',
  },
  selfimprovement: {
    adjective: 'Waking up early made my whole routine feel more {w}.',
    noun: 'Building one small {w} every month changed my year completely.',
    verb: 'Successful people {w} a little every single day.',
    generic: 'My journal entry today includes the word "{w}" as my word of the day.',
  },
};
function personalExample(card) {
  if (card.ex2) return card.ex2; // Claude-generated themed example
  const ints = S.interests.length ? S.interests : ['selfimprovement'];
  // stable pick per word so the sentence doesn't change between views
  const pick = ints[(card.w.charCodeAt(0) + card.w.length) % ints.length];
  const set = EX_TEMPLATES[pick] || EX_TEMPLATES.selfimprovement;
  const posKey = /adjective/.test(card.pos) ? 'adjective' : /noun/.test(card.pos) ? 'noun' : /verb/.test(card.pos) ? 'verb' : 'generic';
  let t = set[posKey] || set.generic;
  const fav = pick === 'books' ? (S.favBook || 'my favourite book') : (S.favMovie || 'my favourite film');
  return t.replace(/\{w\}/g, card.w).replace(/\{fav\}/g, fav);
}

/* ---------------- hinglish (rough Devanagari -> Latin) ---------------- */
const DEV_MAP = { 'क':'k','ख':'kh','ग':'g','घ':'gh','ङ':'n','च':'ch','छ':'chh','ज':'j','झ':'jh','ञ':'n','ट':'t','ठ':'th','ड':'d','ढ':'dh','ण':'n','त':'t','थ':'th','द':'d','ध':'dh','न':'n','प':'p','फ':'ph','ब':'b','भ':'bh','म':'m','य':'y','र':'r','ल':'l','व':'v','श':'sh','ष':'sh','स':'s','ह':'h','ळ':'l','क़':'q','ख़':'kh','ग़':'g','ज़':'z','ड़':'r','ढ़':'rh','फ़':'f','अ':'a','आ':'aa','इ':'i','ई':'ee','उ':'u','ऊ':'oo','ऋ':'ri','ए':'e','ऐ':'ai','ओ':'o','औ':'au','ा':'aa','ि':'i','ी':'ee','ु':'u','ू':'oo','ृ':'ri','े':'e','ै':'ai','ो':'o','ौ':'au','ं':'n','ँ':'n','ः':'h','्':'','़':'' };
function hinglish(hi) {
  let out = '';
  for (let i = 0; i < hi.length; i++) {
    const ch = hi[i];
    if (DEV_MAP[ch] !== undefined) {
      out += DEV_MAP[ch];
      // implicit 'a' after consonant unless next is matra/virama/end-of-word
      if (/[क-हक़-य़]/.test(ch)) {
        const nx = hi[i + 1];
        if (nx && !/[ा-्ऀ-ः़]/.test(nx) && /[ऄ-हक़-य़]/.test(nx)) out += 'a';
      }
    } else out += ch;
  }
  return out;
}

/* ---------------- speech ---------------- */
/* Prefer a warm female English voice; female outranks locale so e.g.
   Samantha (en-US) beats Rishi (en-IN male) on macOS. */
const VOICE_FEMALE = /female|veena|neerja|aditi|raveena|heera|samantha|zira|kate\b|serena|karen|martha|moira|tessa|kathy|shelley|catherine|sonia|libby|natasha|nicole|emma\b|amy\b|joanna|fiona|susan|allison|ava\b|salli|kendra/i;
const VOICE_MALE = /\bmale|rishi|daniel|alex\b|fred|david|mark\b|george|thomas|james|ryan|guy\b|brian|arthur|oliver|liam|william|prabhat|ravi|aaron|albert|gordon|reed|rocko|eddy|grandpa|ralph|junior/i;
let VOICE = null;
function pickVoice() {
  const wantMale = S && S.voicePref === 'male';
  let best = null, bestScore = 0;
  for (const v of speechSynthesis.getVoices()) {
    if (!/^en[-_]/i.test(v.lang)) continue;
    let s = 1;
    const fem = VOICE_FEMALE.test(v.name);
    const male = !fem && VOICE_MALE.test(v.name);
    if (fem) s += wantMale ? -6 : 6;
    if (male) s += wantMale ? 6 : -6;
    if (/en[-_]IN/i.test(v.lang)) s += 3;
    else if (/en[-_](GB|US)/i.test(v.lang)) s += 2;
    if (/google|neural|natural|premium|enhanced/i.test(v.name)) s += 1;
    // known high-quality voices beat same-score robotic ones (e.g. Kathy, Fred)
    if (!wantMale && /samantha|veena|neerja|zira|serena|joanna|emma\b|amy\b/i.test(v.name)) s += 2;
    if (wantMale && /daniel|rishi|arthur|oliver|ryan|brian|william|guy\b|prabhat/i.test(v.name)) s += 2;
    if (s > bestScore) { bestScore = s; best = v; }
  }
  return best;
}
/* device TTS utterance (fallback + meaning sentences) */
function ttsSay(text) {
  if (!VOICE) VOICE = pickVoice();
  const u = new SpeechSynthesisUtterance(text);
  if (VOICE) { u.voice = VOICE; u.lang = VOICE.lang; }
  else u.lang = 'en-IN';
  u.rate = .9;
  u.pitch = S && S.voicePref === 'male' ? 1 : 1.12;
  speechSynthesis.speak(u);
}

/* Real human pronunciation recordings from the Free Dictionary API
   (native UK/US speakers) — far clearer than device TTS. Cached per word;
   '' means "looked up, none available". */
const AUDIO = new Map();
let curClip = null;
async function resolveAudio(word) {
  if (AUDIO.has(word)) return AUDIO.get(word);
  let url = '';
  try {
    const r = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word), { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const j = await r.json();
      for (const e of j) {
        const a = (e.phonetics || []).map(p => p.audio).find(u => u && /^https?:\/\//.test(u));
        if (a) { url = a; break; }
      }
    }
  } catch (e) { /* offline */ }
  AUDIO.set(word, url);
  return url;
}
function playClip(url) {
  return new Promise((res, rej) => {
    try {
      if (curClip) { curClip.pause(); curClip = null; }
      const a = new Audio(url);
      curClip = a;
      a.onended = () => res(true);
      a.onerror = () => rej(new Error('audio'));
      a.play().then(() => {}).catch(rej);
    } catch (e) { rej(e); }
  });
}

/* Pronounce a word (human recording first, TTS fallback), then optionally
   its English meaning via TTS. audioUrl may be supplied from a card. */
async function speak(word, meaning, audioUrl) {
  try {
    speechSynthesis.cancel();
    let saidWord = false;
    const url = audioUrl || await resolveAudio(word);
    if (url) { try { await playClip(url); saidWord = true; } catch (e) {} }
    if (!saidWord) ttsSay(word);
    if (meaning) ttsSay('It means. ' + meaning);
  } catch (e) {}
}
/* speak the flashcard currently on screen (word + English meaning).
   CUR_FLASH is set by whichever renderer is showing a card. */
let CUR_FLASH = null;
function speakFlash() {
  if (CUR_FLASH) speak(CUR_FLASH.w, CUR_FLASH.def || '', CUR_FLASH.audio);
}
/* speak the dashboard Word of the Day (card cached once fetched) */
let WOD_CARD = null;
function speakWod() {
  if (WOD_CARD) speak(WOD_CARD.w, WOD_CARD.def || '', WOD_CARD.audio);
  else speak(S.wodWord || '');
}
/* pick a fresh Word of the Day on demand (refresh button) */
function rerollWod() {
  const pool = [...SEED.keys()];
  let w = S.wodWord;
  for (let i = 0; i < 20 && (w === S.wodWord || !w); i++) w = pool[Math.floor(Math.random() * pool.length)];
  S.wodWord = w;
  S.wodDate = todayStr();
  saveState();
  return w;
}
if ('speechSynthesis' in window) {
  speechSynthesis.addEventListener?.('voiceschanged', () => { VOICE = pickVoice(); });
}

/* ---------------- vocabulary estimation ---------------- */
/* bands: [[correct,total] x7] -> estimated words known of 60,000 */
function estimateVocab(bands) {
  let sum = 0;
  for (let b = 0; b < BAND_COUNT; b++) {
    const [c, t] = bands[b];
    if (t > 0) sum += (c / t) * BAND_WIDTHS[b];
  }
  return Math.min(UNIVERSE, Math.round(sum / 10) * 10);
}

/* ---------------- rating test builder (placement & weekly-fresh) ---------------- */
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** n questions sampled evenly across 7 bands, never reusing used words. */
function buildRatingQuestions(n) {
  const used = new Set(S.usedTestWords);
  const perBand = Math.floor(n / BAND_COUNT);
  let extra = n - perBand * BAND_COUNT;
  const qs = [];
  for (let b = 0; b < BAND_COUNT; b++) {
    const want = perBand + (b === 3 && extra > 0 ? extra : 0);
    const fresh = shuffled(TESTPOOL[b].filter(([w]) => !used.has(w)));
    for (let i = 0; i < want && i < fresh.length; i++) {
      const [w, def] = fresh[i];
      qs.push(makeQuestion(w, def, b));
      used.add(w);
    }
  }
  return shuffled(qs);
}
function makeQuestion(w, def, band) {
  const wrong = shuffled(TESTPOOL[band].filter(([x, d]) => x !== w && d !== def)).slice(0, 3).map(([, d]) => d);
  const options = shuffled([{ t: def, ok: true }, ...wrong.map(t => ({ t, ok: false }))]);
  options.push({ t: "🤷 I don't know this word", ok: false, dk: true });
  return { w, band, options, correctText: def };
}
/** retention question from a learned card (quiz across en/hi/reverse handled in deck quiz; here en meaning) */
function makeCardQuestion(card) {
  const band = card.band ?? bandOfWord(card.w);
  return makeQuestion(card.w, card.def, band);
}

/* ---------------- levels ---------------- */
function applyVocab(newVocab, opts = {}) {
  const before = levelForVocab(S.vocab).n;
  S.vocab = Math.max(0, Math.min(UNIVERSE, Math.round(newVocab)));
  const after = levelForVocab(S.vocab).n;
  if (after > S.highestLevel) S.highestLevel = after;
  saveState();
  if (after > before && !opts.silent) return LEVELS[after - 1]; // caller triggers LEVEL UP moment
  return null;
}
function displayLevel() {
  // badge never demotes below highest earned level
  const byVocab = levelForVocab(S.vocab).n;
  return LEVELS[Math.max(byVocab, S.highestLevel) - 1];
}

/* ---------------- daily feed ---------------- */
function ensureDaily() {
  const today = todayStr();
  if (S.daily && S.daily.date === today && S.daily.words.length >= S.dailyGoal) return;
  if (S.daily && S.daily.date === today) return; // keep partially-done feed even if goal changed mid-day
  const goal = S.dailyGoal;
  const themedShare = Math.round(goal * .4);
  const words = [];
  const taken = new Set();
  const isNew = w => !taken.has(w) && !S.learned[w] && !S.tricky[w] && !SBlockedDaily(w);
  // 40% themed from interests
  const pool = [];
  for (const int of S.interests) for (const w of (THEMES[int] || [])) pool.push(w);
  for (const w of shuffled(pool)) {
    if (words.length >= themedShare) break;
    if (isNew(w)) { words.push(w); taken.add(w); }
  }
  // 60% (rest) from the user's frontier in the frequency index
  const start = Math.max(0, Math.min(WORDS.length - goal * 3, S.vocab));
  for (let r = start; r < WORDS.length && words.length < goal; r++) {
    const w = WORDS[r];
    if (isNew(w) && (LITE.has(w) || SEED.has(w))) { words.push(w); taken.add(w); }
  }
  // absolute fallback: any unlearned indexed word
  for (let r = 0; r < WORDS.length && words.length < goal; r++) {
    const w = WORDS[r];
    if (isNew(w)) { words.push(w); taken.add(w); }
  }
  S.daily = { date: today, words: shuffled(words), done: {}, decksDone: Array(Math.ceil(words.length / 10)).fill(false) };
  saveState();
}
function SBlockedDaily(w) { return false; }
function dailyDoneCount() { return S.daily ? Object.keys(S.daily.done).length : 0; }

/* ---------------- streaks ---------------- */
function touchStreak() {
  const today = todayStr();
  const st = S.streak;
  if (st.lastDay === today) return;
  const y = new Date(); y.setDate(y.getDate() - 1);
  st.current = st.lastDay === todayStr(y) ? st.current + 1 : 1;
  st.best = Math.max(st.best, st.current);
  st.lastDay = today;
  saveState();
}

/* ---------------- mastery / tricky ---------------- */
const SR_INTERVALS = [1, 3, 7]; // days
function masterWord(w) {
  if (S.learned[w]) return false;
  S.learned[w] = { t: Date.now(), b: bandOfWord(w) };
  delete S.tricky[w];
  const day = todayStr();
  S.stats.days[day] = (S.stats.days[day] || 0) + 1;
  return true; // caller applies +1 vocab credit
}
function missWord(w) {
  const cur = S.tricky[w];
  const stage = cur ? Math.min(cur.stage, SR_INTERVALS.length - 1) : 0;
  S.tricky[w] = { due: Date.now() + SR_INTERVALS[stage] * 864e5, stage, b: bandOfWord(w) };
}
function trickyPromote(w) {
  const cur = S.tricky[w];
  if (!cur) return;
  if (cur.stage >= SR_INTERVALS.length - 1) { delete S.tricky[w]; }
  else { cur.stage += 1; cur.due = Date.now() + SR_INTERVALS[cur.stage] * 864e5; }
}
function revokeWord(w) {
  if (!S.learned[w]) return false;
  delete S.learned[w];
  missWord(w);
  return true; // caller applies -1 vocab credit
}
function dueTricky() {
  const now = Date.now();
  return Object.keys(S.tricky).filter(w => S.tricky[w].due <= now);
}

/* ---------------- weekly test ---------------- */
function weeklyDue() {
  const last = S.testHistory.filter(t => t.kind !== 'retake-note').slice(-1)[0];
  if (!last) return false;
  return (Date.now() - last.date) >= 7 * 864e5;
}
function daysToWeekly() {
  const last = S.testHistory.slice(-1)[0];
  if (!last) return 7;
  return Math.max(0, Math.ceil(7 - (Date.now() - last.date) / 864e5));
}
/** 30 fresh banded + up to 20 retention words learned since last test */
async function buildWeeklyQuestions() {
  const fresh = buildRatingQuestions(30).map(q => ({ ...q, kind: 'fresh' }));
  const lastDate = (S.testHistory.slice(-1)[0] || { date: 0 }).date;
  const recent = shuffled(Object.keys(S.learned).filter(w => S.learned[w].t >= lastDate));
  const pickRet = recent.slice(0, 20);
  // top up with older learned words if the week was light
  if (pickRet.length < 20) {
    for (const w of shuffled(Object.keys(S.learned))) {
      if (pickRet.length >= 20) break;
      if (!pickRet.includes(w)) pickRet.push(w);
    }
  }
  const ret = [];
  for (const w of pickRet) {
    const card = await getCard(w);
    if (card.def) ret.push({ ...makeCardQuestion(card), kind: 'retention' });
  }
  return shuffled(fresh.concat(ret));
}

/* ---------------- word of the day ---------------- */
function wordOfDay() {
  const today = todayStr();
  if (S.wodDate === today && S.wodWord) return S.wodWord;
  const pool = [...SEED.keys()];
  const dayNum = Math.floor(Date.now() / 864e5);
  S.wodDate = today;
  S.wodWord = pool[dayNum % pool.length];
  saveState();
  return S.wodWord;
}
