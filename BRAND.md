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

Direction 04: a rounded container holding an N that climbs left to right —
containment, structure, forward movement. The N is negative space, so the mark
survives being scaled to a favicon.

Geometry, in a 96×96 box:

| | |
|---|---|
| Container | `x=2 y=2 w=92 h=92 rx=26` |
| N path | `M34 67V29l28 38V29` |
| Stroke | 11, round caps, round joins |
| Small-size variant | stroke 13, `rx=22`, full bleed |

Below ~24px use `nazm-symbol-small.svg` (or `symbolNode()` with a size under
26, which switches weight automatically): the production stroke loses its
counter at that size.

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

**Arabic** — outlined from Tajawal ExtraBold (SIL OFL, modification permitted),
with the fatha and sukun enlarged 8% and lifted so they hold at small sizes,
then frozen as vectors.

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
