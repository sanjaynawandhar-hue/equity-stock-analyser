# ShabdSafar — A Safar to Genius

A gamified, bilingual (English + हिंदी) vocabulary journey for Indian English learners, by **@professorSK**.
Shabd = word, Safar = journey: measure how many of the 60,000 words a top-tier English speaker knows, then climb from **Beginner** to **Genius**.

## Run it

Any static file server works (needed so the bundled word data can load):

```bash
cd shabdsafar
python3 -m http.server 8642
# open http://localhost:8642
```

No build step, no login, no backend. All progress lives in `localStorage` (`shabdsafar_state`); rich word cards are cached in IndexedDB.

## What's inside

- **50-word placement test**, calibrated across 7 frequency bands (each band ≈ 8,572 of the 60,000-word universe). Band-weighted scoring estimates your total vocabulary; an honest "I don't know" option keeps it accurate. Optional 15s/word timer.
- **7 levels** — Beginner → Learner → Explorer → Achiever → Expert → Master → Genius — with original SVG shield badges (stars, padlocks, glow) on a winding **Safar to Genius** trail.
- **Daily 100 words** (goal adjustable 25/50/100/200): ~60% from your personal frequency frontier + ~40% themed to your chosen interests, served as 10 decks of 10 with bilingual flashcards (English meaning, Devanagari Hindi meaning, IPA + 🔊 TTS, two usage examples — one personalized to your interests/favourites, synonyms & antonym).
- **Word credit rule**: a word counts toward your vocabulary only when answered correctly in its deck quiz. Missed words enter the **Tricky Words** spaced-repetition deck (1 → 3 → 7 days).
- **Weekly 50-word re-rating**: 30 fresh calibrated words (never repeated) + 20 retention checks on recently learned words; slipped words lose credit and return to revision. Week-over-week growth line chart climbing toward the 60,000 Genius line, consistency streak, shareable cards (1:1 and 9:16 story).
- Dark/light themes, confetti level-ups, Hinglish transliteration toggle, offline-first (18k bilingual cards bundled), optional Claude API fallback for rare words.

## Data & licenses (see also About & Credits in-app)

| File | Source | License |
|---|---|---|
| `data/word-index.json` (~102k words) | hermitdave/FrequencyWords (OpenSubtitles 2018) | CC BY-SA 4.0 |
| `data/seed-cards.json` (2,600 full cards) + `data/lite-cards.json` (15,376 cards) | FreeDict eng-hin 1.6 + Princeton WordNet + Webster's Unabridged + ipa-dict | GPL / WordNet / public domain / MIT |
| `data/test-pool.json` (5,600 banded test words) | WordNet + Webster's | WordNet / public domain |
| Live enrichment | Free Dictionary API (dictionaryapi.dev), optional Anthropic API | — |

`data/build.js.txt` is the pipeline script that produced these files from the raw datasets.
