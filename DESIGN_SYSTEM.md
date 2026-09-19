# NAZM Design System

What the interface is made of. The source of truth is `styles/tokens.css`;
this file explains it and states the rules a change has to keep.

## The three layers

```
brand primitives  →  semantic tokens  →  components
--nazm-blue          --brand             .btn-p
```

A component never reaches past the middle layer. `background: #2563FF` inside a
component rule is a defect: it cannot follow dark mode and it cannot be changed
in one place. Only `tokens.css` names a hex.

## Colour

Primitives: `--nazm-navy`, `--nazm-blue`, `--nazm-indigo`, `--nazm-sky`,
`--nazm-mist`, `--nazm-cloud` (see `BRAND.md` for what each one means).

Semantic tokens:

| Group | Tokens |
|---|---|
| Surface | `--surface`, `--surface-sunken`, `--app-bg` |
| Text | `--text`, `--text-secondary`, `--text-tertiary`, `--text-on-brand` |
| Brand | `--brand`, `--brand-strong`, `--brand-soft` |
| Intelligence | `--intelligence`, `--intelligence-soft` |
| Lines | `--border`, `--border-strong`, `--border-quiet`, `--divider` |
| States | `--state-hover`, `--state-pressed`, `--state-selected`, `--focus-ring` |
| Status | `--success`, `--warning`, `--danger`, and each one's `-soft` |

`--intelligence` is the assistant's colour and is not used for ordinary
actions; `--brand` is the action colour and is not used to signal AI. Keeping
those apart is what lets a customer tell, at a glance, what the product did and
what the assistant suggested.

## The NAZM glass system

Five tiers. Nothing invents its own blur.

| Tier | Class | Background | Use |
|---|---|---|---|
| Primary | `.gl` | `--glass-primary` | cards, bars, the main chrome |
| Secondary | `.gls` | `--glass-secondary` | quiet fills inside a card |
| Elevated | `.gl-s` | `--glass-elevated` | KPI cards, rows that must read |
| Modal | `.gl-modal` | `--glass-modal` | sheets over content |
| Dark | `.gl-dark` | `--glass-dark` | over imagery, toasts |

Shared values: `--glass-blur: 20px`, `--glass-saturate: 180%`, and three
shadows (`--glass-shadow`, `--glass-shadow-soft`, `--glass-shadow-high`).
Modal glass blurs 30px because it sits over live content.

## Typography

One family — Tajawal — with a system stack behind it. The scale:

| Token | Use |
|---|---|
| `--type-display` | 34/1.15 · hero |
| `--type-h1` | 30/1.2 · screen title |
| `--type-h2` | 22/1.3 · section |
| `--type-h3` | 17/1.35 · card title |
| `--type-body` | 15/1.6 |
| `--type-body-strong` | 15/1.6, 600 |
| `--type-small` | 13/1.5 |
| `--type-caption` | 11/1.4, 600 |
| `--type-kpi` | 28/1, 800 |

Numbers carry weight in this product — quantities, valuations, limits, storage,
prices — so KPI figures and usage counters use tabular figures and Latin
digits inside Arabic copy, which is how Saudi interfaces actually read prices.

Arabic input is normalised (Arabic-Indic and Persian digits fold to Latin)
before it is stored or searched.

## Shape and motion

Radii: `--r-sm 10`, `--r 14`, `--r-lg 20`, `--r-xl 26`, `--rp 100` (pills).
The symbol's container uses 26 in a 96 box — the same ratio as `--r-xl` on a
card, which is why the mark sits comfortably beside one.

Motion: `--motion-fast 140ms`, `--motion 240ms`, `--motion-slow 420ms`, all on
`--ease`. Under `prefers-reduced-motion` every duration collapses to 0 — the
tokens do it once, so no component has to remember.

## Dark mode

Not an inversion. Navy deepens into `#060E22`, glass turns dark, and the brand
blue lifts to `#5B8CFF` so it keeps its contrast against it. Dark values live
under `@media (prefers-color-scheme: dark)` guarded by
`:root:not([data-theme="light"])`, so an explicit light preference still wins.

## Components

| Component | Class | Notes |
|---|---|---|
| Item card | `.icard` | image first, name second, everything else a footnote |
| KPI card | `.sc` | number, label, one supporting figure |
| Sheet | `.sh` | focus-trapped, dismissible, labelled |
| Quota banner | `.quota-banner` | notice / warn / full |
| Usage bar | `.usage-row` | neutral under 70%, then notice, warn, full |
| Plan card | `.plan-card` | one emphasised plan per screen |
| Suggestions | `.suggest` | what the assistant proposes, never applied on its own |
| Brand mark | `.nazm-mark` | inherits `currentColor` |

## Rules a change has to keep

1. RTL first. Use `inset-inline-*`, never `left`/`right`, for anything that
   mirrors.
2. No `innerHTML` with data. Views build DOM with `el()`; the brand mark builds
   SVG with `createElementNS` for the same reason.
3. Touch targets ≥ 44px. Focus states visible — `--focus-ring`, not `outline:
   none`.
4. Zoom stays available: no `maximum-scale`, no `user-scalable=no`.
5. One emphasised action per screen.
6. Colour is never the only signal — a quota state also says what it means.
