# ✦ مساعد نَظْم — how the assistant actually works

What it does, where each part runs, what it costs, and what it is not allowed
to do. If a claim here is not true of the code, the code is wrong.

## The rule that shapes everything

**The assistant proposes. The customer decides. The server enforces.**

Nothing the assistant produces is written to a record on its own. Nothing a
browser claims about entitlement is believed. And no question that can be
answered by arithmetic is sent to a language model.

## What runs where

| Capability | Where | Cost |
|---|---|---|
| اسأل نَظْم — natural-language retrieval | **The device.** `src/ask.js` parses the question into a filter and runs it against the index already in memory | none |
| صحة مخزونك — the health score | **The device.** `src/health.js`, six weighted signals | none |
| Duplicate detection | **The device.** `src/duplicates.js` — barcode, SKU, then normalised name within a category | none |
| Guided cleanup | **The device.** Derived from the score | none |
| Photo reading — name, category, brand, condition,price estimate, visible text | **The server.** `functions/src/ai.js` → Anthropic | one AI credit |

The first four cover most of what a customer asks for in a day. They cost
nothing, work offline, and cannot leak: the inventory never leaves the device
to answer "وش القطع اللي ما لها صور؟".

## Why retrieval is not a model call

Sending an inventory to a language model to answer a lookup would be slower,
more expensive, less accurate, and a privacy problem the customer did not ask
for. `tests/browser/assistant.test.mjs` watches the network while questions are
asked and fails if any backend call is made.

The parser handles: records without photos, without a category, without a
location; records not reviewed within a year; records above a value; the total
estimated value; where a named thing is; and narrowing by category or location.
Anything it cannot parse it says it cannot parse, and offers examples. It never
guesses.

## The one model call

`analyzeInventoryItem` is the only path between a browser and Anthropic.

```
browser → callable → auth → workspace membership → plan entitlement
        → per-user burst limit → image resolved from the workspace document
        → Anthropic (strict tool schema) → validation → credit consumed
```

Every step is server-side. In particular:

- **The API key never reaches a browser.** It lives in Secret Manager and is
  injected into that function's runtime only.
- **The image is resolved from the workspace's own media document**, never from
  a path the browser supplies, and its Storage prefix is checked again.
- **The answer is validated before it is returned** — enum values, numeric
  ranges, string lengths. Schema conformance is not the same as sanity.
- **A suggested category must be one of the workspace's own**; anything else is
  dropped rather than created.
- **The credit is consumed server-side**, so a client cannot spend zero.

## Model routing

Simple work does not go to a large model, and most work is not model work at
all:

| Task | Handled by |
|---|---|
| Retrieval, scoring, duplicates, cleanup | Deterministic code on the device |
| Reading an object from a photo | `claude-opus-5`, `effort: medium`, with server-side fallbacks |

`ANALYSIS_MODEL` is an environment variable, so routing can change without a
code change. The one call uses a strict tool schema — `record_analysis` — so
the answer arrives as data rather than prose to be parsed.

## Limits and abuse

Three layers, all server-side:

1. **Plan credits.** Free: 10 actions a month. Paid plans: fair use, shown to
   the customer as "مشمول" rather than a countdown.
2. **A per-user burst limit** of 12 calls in 10 minutes, on top of the plan, so
   a compromised account cannot spend a month's allowance in a minute.
3. **Usage counters** written by triggers, never by a client.

## What the assistant is not allowed to say

- It is **not** authentication, certification or a professional appraisal, and
  the words are never used. Every estimate carries: *هذا التقدير مبني على الصور
  والمعلومات المتاحة، ولا يُعد توثيقاً احترافياً ولا تقييماً معتمداً.*
- It does **not** name the model. It is ✦ مساعد نَظْم, everywhere, and a test
  fails if any other name appears in the interface.
- When it cannot read something, it **asks for the photo that would settle it**
  rather than inventing a reference number.

## Privacy

- Inventory content is never sent to product analytics. Events carry counts and
  plan ids, never names, photos or values.
- Customer inventory is not used to train models.
- Images sent for analysis are read by the function from the workspace's own
  Storage and are not retained elsewhere.

## Where to look

| File | What it holds |
|---|---|
| `src/ask.js` | the question parser and the local executor |
| `src/health.js` | the score, its weights, the cleanup tasks |
| `src/duplicates.js` | grouping and why each group exists |
| `src/ai.js` | the client for the one server call |
| `functions/src/ai.js` | auth, entitlement, the tool schema, validation |
| `src/views/assistant.js` | the assistant tab |
| `src/views/item-form.js` | photo auto-fill and the suggestion review |
