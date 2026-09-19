# نَظْم | NAZM — Brand

The brand, as it is actually implemented in this repository. Every value here
is used by code; nothing in this file is aspirational unless it says so.

## Name

| | |
|---|---|
| Arabic | **نَظْم** |
| Latin | **NAZM** |
| Without diacritics | نظم (only where marks would crowd small type) |

Never *Nazem*, *Nizam*, *Nadhm*, *Nadham* or *NZM*. The retired names —
المخزن, Almakhzan, ممتلك, Mumtalak — must not appear in anything a customer
can see.

They do still appear in infrastructure, on purpose: the Firebase project id,
Firestore collection names, Storage paths, the IndexedDB database, the
`almakhzan:` internal event names and the service-worker cache key. Renaming
those would migrate live customer data for a cosmetic gain. Data safety wins.

Customer-facing strings live in one module, `src/brand.js`. A rename is one
edit there, not a search across the codebase.

## Tagline and descriptor

- Tagline: **كل ما تملك، في مكانه.** — *Everything you own, in its place.*
- Descriptor: **الجرد الذكي للمقتنيات والأصول**
- Longer: منصة ذكية لتوثيق وتنظيم المقتنيات والمخزون والأصول.

The tagline belongs to brand moments: the welcome screen, the OG image, the
store listings. It is not repeated inside the app.

## The assistant

Always **✦ مساعد نَظْم** (English: *NAZM Assistant*). The model behind it is an
implementation detail and is never named in the interface — a browser test
asserts this (`tests/browser/gate.test.mjs`, check G7).

## The symbol

Direction 04, redrawn as production geometry: **a rounded frame that holds an N
whose right stem is the frame itself.** The blade leaves the apex, is cut
vertically at its foot, and opens a notch against the stem on the way down —
that notch is what stops the mark reading as a slashed box.

The brandbook's own note asked for exactly this: the approved artwork is a
visual direction, and a clean geometric vector had to be drawn before
registration and wide commercial use. This is that vector.

Geometry lives in **one** place — `src/views/symbol-geometry.js`. The asset
files are generated from it (`node tools/build-brand.mjs`) and the app draws
from it at runtime, so a file on disk and the mark on screen cannot drift.

In a 96×96 box:

| | Regular | Small (≤26px) |
|---|---|---|
| Frame stroke | 9.5 | 11 |
| Frame radius | 25 | 22 |
| Stem centre / width | 33 / 13 | 33 / 14.5 |
| Blade width | 15 | 16.5 |
| Apex | y 33.5 | y 31 |
| Blade cut | x 75 | x 76 |

`symbolNode()` picks the variant by size, so nothing has to remember.

## Files

```
public/brand/
  nazm-symbol.svg            currentColor, for any context
  nazm-symbol-gradient.svg   the branded gradient
  nazm-symbol-navy.svg       flat, deep navy
  nazm-symbol-white.svg      reversed
  nazm-symbol-black.svg      single-colour print
  nazm-symbol-small.svg      under 24px
  nazm-wordmark-ar.svg       نَظْم
  nazm-wordmark-en.svg       NAZM
  nazm-logo-ar.svg           symbol + نَظْم
  nazm-logo-en.svg           symbol + NAZM
  nazm-logo-bilingual.svg    symbol + both
  social/og-default.png      1200×630

public/icons/
  favicon.svg  favicon-32.png  apple-touch-icon.png
  pwa-192.png  pwa-512.png     maskable-512.png
```

In the application the symbol and the Arabic wordmark are drawn from code
(`src/views/mark.js`, `src/views/wordmark-ar.js`) rather than loaded as files:
they must render before any request resolves, and they must survive being
bundled into the single-file demo build.

## Wordmarks

**English** — drawn, not set. Four letters built from one stroke weight (15 in
a 100-unit cap height), round caps and one tracking value, so it belongs to the
same family as the symbol.

**Arabic** — outlined from Tajawal ExtraBold (SIL OFL, modification
permitted), with the fatha and sukun enlarged 8%, lifted, and kept on their own
path so they can carry the brand blue against navy letters — the two-tone
treatment in the brandbook. Frozen as vectors.

> **Still owed.** The Arabic mark is production-ready but it is refined type,
> not bespoke type. A type designer should still draw نَظْم from scratch:
> the ظ's bowl, the tooth rhythm and the final م terminal are where a custom
> mark would separate itself from a refined font. Until then this file is the
> official asset and nothing in the product depends on Tajawal being installed.

## Lockups and clear space

| Lockup | Arrangement |
|---|---|
| Arabic (primary) | symbol on the **right**, wordmark to its left |
| English | symbol on the left, NAZM to its right |
| Bilingual | symbol right; نَظْم over NAZM |
| Symbol only | app icon, avatars, compact headers |

Clear space on every side is at least **a quarter of the symbol's height**.
Minimum sizes: symbol 16px (small variant), Arabic lockup 96px wide, bilingual
lockup 140px wide.

## Colour

| Token | Value | Use |
|---|---|---|
| `--nazm-navy` | `#0B1F4B` | text, the flat mark, trust |
| `--nazm-blue` | `#2563FF` | action |
| `--nazm-indigo` | `#6366F1` | intelligence, the assistant |
| `--nazm-sky` | `#93C5FD` | gradient end, quiet accents |
| `--nazm-mist` | `#E2E8F0` | sunken surfaces |
| `--nazm-cloud` | `#F8FAFC` | base surface |

The gradient — royal blue → indigo → sky — is reserved: the symbol, the
assistant, the hero, onboarding, and a premium call to action. Not cards, not
buttons in general, not backgrounds.

Semantic tokens and the glass system are documented in `DESIGN_SYSTEM.md`.
Components read semantic tokens only; a raw hex inside a component rule is a
bug, because it cannot follow dark mode.

## Voice

| Not this | This |
|---|---|
| AI analysis completed. | تعرّفنا على القطعة. |
| Firestore synchronized. | تم الحفظ. |
| Permission denied. | ليس لديك صلاحية لتعديل هذه القطعة. |
| AI recommends category Watches. | نقترح تصنيفها ضمن الساعات. |

Calm, short, human. No raw technical errors. No celebration for ordinary
operations. No competitor names anywhere a customer can read.

## Restraint

The logo does not go on every card. Not every surface is blue. "NAZM" is not a
heading. The inventory screen carries one 26px mark beside the word الجرد, and
that is the whole brand presence on the main screen.
