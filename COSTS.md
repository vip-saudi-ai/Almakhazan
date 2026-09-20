# Costs

What a customer costs to serve, and which decisions in the code exist because
of it. Figures are list prices at the time of writing and need re-checking
before they are used commercially. **[YOU]**

## The shape of the problem

Three things cost money: storage, reads, and model calls. Of those, **reads are
the one a badly built inventory app dies of** — a realtime listener over
20,000 records re-reads the collection on every change, for every open tab.

## Per plan, at the limit

| | مجاني | شخصي | احترافي | أعمال |
|---|---|---|---|---|
| Price (SAR/mo) | 0 | 69 | 159 | 279 |
| Records | 50 | 1,000 | 5,000 | 20,000 |
| Storage | 1 GB | 5 GB | 25 GB | 100 GB |
| Seats | 1 | 1 | 3 | 10 |
| Assistant credits | 10 | 300 | 1,500 | 6,000 |

### Storage

Cloud Storage is roughly $0.026/GB/month, plus egress. A plan at its storage
limit:

| Plan | At limit | ≈ USD/month |
|---|---|---|
| مجاني | 1 GB | 0.03 |
| شخصي | 5 GB | 0.13 |
| احترافي | 25 GB | 0.65 |
| أعمال | 100 GB | 2.60 |

Storage is not what threatens the margin. Two decisions keep it that way: a
display-size copy is what the grid loads, and the original is fetched only when
someone opens the record; and media is reference-counted, so duplicating a
record does not duplicate its bytes.

### The assistant

A photo analysis is one image plus a short prompt and a small structured
answer. Budget conservatively at **$0.02–0.05 per call** and re-measure against
real traffic. **[YOU]**

| Plan | Credits | Worst case USD |
|---|---|---|
| مجاني | 10 | 0.50 |
| شخصي | 300 | 15.00 |
| احترافي | 1,500 | 75.00 |

**A customer who spends every credit on the Personal plan costs more than the
plan charges.** Three things keep that theoretical:

1. Most assistant work is not a model call at all — retrieval, the health
   score, duplicate detection and cleanup all run on the device for nothing.
2. Analysis runs once per new record, not per view, and only when the name is
   still empty.
3. The credits are a ceiling, and real use sits far below it. That has to be
   watched: `usage/current.aiCreditsUsed` per workspace is the number to alert
   on. **[YOU]** Set an alert at 70% of plan credits across the fleet.

If the shape changes, the lever is routing, not the price: cheaper models for
easy identification, the large model reserved for ambiguity and valuation.

### Firestore

Free tier: 50k reads, 20k writes a day. Beyond it, roughly $0.06 per 100k
reads and $0.18 per 100k writes.

A record write is one document plus counter updates. A page of inventory is
one page of documents — **not** the collection. That is the single most
important cost decision in the product:

| Approach | Reads to open a 20,000-record workspace | Monthly cost of one active Business workspace |
|---|---|---|
| Realtime listener over the collection | 20,000, every session, every tab | unbounded |
| A window of the newest records | 200, and only more when asked for | cents |

This is what the app does. `ITEM_WINDOW` in `src/repository.js` is 200: opening
a workspace of any size costs 200 reads. The rest is read once per session, by
cursor pages, and only when something needs all of it.

What still needs all of it, honestly: a search, a filter, a sort, entering a
folder, the Overview / assistant / Settings tabs, an export, a backup and a
restore. Browsing the newest records — which is most of what most sessions do
— does not. The saving is not "the inventory is never read"; it is "the
inventory is read when it is used, not to draw a screen".

### Functions

Cloud Functions v2 at 512 MiB. Analysis calls are seconds long and bounded by
credits. Triggers (usage counters, media reference counting) are tiny and
frequent. Both stay inside the free tier for a long time and scale linearly
after that.

## Where the money is saved, in code

| Decision | File | What it avoids |
|---|---|---|
| Retrieval, scoring, duplicates run locally | `src/ask.js`, `src/health.js`, `src/duplicates.js` | a model call per question |
| Usage counters maintained by triggers | `functions/src/usage.js` | counting a collection to check a quota |
| Media reference counting | `src/media.js` | storing the same bytes twice |
| Display copy for the grid | `src/storage.js` | egress on full-resolution photos |
| Per-user burst limit | `functions/src/ai.js` | one compromised account spending a month |
| A QR encoder written out | `src/qr.js` | a dependency, and a build step |
| A window of the newest records, not the collection | `src/repository.js`, `src/inventory-load.js` | reading 20,000 documents to draw one screen |

## What is not yet done

**Free-text search has no server-side answer.** Firestore does not do it, so a
search loads the inventory and runs on the device. For a 20,000-record
workspace that is one expensive read of the collection per session in which
someone searches — bounded and once, but real. A search index (Typesense,
Algolia, or Firestore-plus-token-array) is the fix, and it is not built. Until
it is, the honest expectation for a heavy Business workspace is: cheap to
open, one full read the first time its owner searches.

**Aggregates are not maintained beyond the record count.** The home screen can
show a true total because a trigger keeps `usage/current.items`. It cannot show
"% documented" or total quantity the same way, so it leaves them blank until
the inventory loads. Extending the trigger to keep those two aggregates would
remove the last reason a browsing session ever needs every record.

## Numbers to watch

| Metric | Where | Alert at |
|---|---|---|
| AI credits used per workspace | `usage/current.aiCreditsUsed` | 70% of the plan |
| Storage per workspace | `usage/current.storageBytes` | 80% of the plan |
| Firestore reads per day | Cloud Monitoring | any sustained rise not matched by sign-ups |
| Function errors | Cloud Logging | any sustained rate |
