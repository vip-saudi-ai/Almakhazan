# Security

Customers document jewellery, watches, art, equipment and household contents.
An inventory is a map of what someone owns and where it is. Treat it as such.

## Threat model

| Adversary | What they try | What stops them |
|---|---|---|
| A signed-in customer | Read another workspace by changing an id | Rules resolve membership from the path's own `{workspaceId}`; proven in `tests/rules/isolation.test.mjs` |
| A signed-in customer | Grant themselves a paid plan from DevTools | `plan`, `subscriptionId`, `readOnly` and `usage/*` reject every client write |
| A signed-in customer | Exceed plan limits with a patched frontend | Item, upload, invite and AI paths all pass `assertWithinLimits` server-side |
| Anyone | Guess a Storage object path | Storage rules do the same membership lookup; a path is not a capability |
| Anyone | Forge a webhook to activate a plan | Signature verification, then an idempotency claim before anything is applied |
| A malicious record | Inject script through an item name, AI output or an import | No `innerHTML` for data; every node is built with `textContent` |
| An interrupted restore | Leave a workspace with neither the old records nor the new | A verified safety backup first, incoming records written before any removal, and an abort if the backup cannot be saved; `tests/browser/restore.test.mjs` breaks the run at each point |
| A compromised account | Burn the AI budget | Monthly plan credits plus a per-user burst limit, both server-side |
| An invited email | Escalate to owner | Invitations are single-use hashed tokens with an expiry; acceptance is server-side and cannot grant owner |

## Boundaries

**Authorization is server-side, always.** `src/entitlements.js` exists to shape
the experience. It is not a control. Deleting it would change what the UI
offers and nothing about what the backend permits.

**No secret reaches the browser.** The Anthropic key lives in Secret Manager
and is read only inside `analyzeInventoryItem`. The browser has no path to
`api.anthropic.com`; the CSP does not allow it as a connect source.

**Client-supplied paths are never trusted.** `analyzeInventoryItem` takes a
`mediaId`, looks the document up inside the caller's workspace, and re-checks
that the stored path sits under that workspace's prefix before reading a byte.

**Destruction is backend-only.** Clients cannot delete Storage objects, media
documents, or workspaces. The sweeper re-verifies reference counts against the
items collection before deleting anything, and corrects drift rather than
acting on it.

## Data handling

- All inventory is private by default. There is no public read path anywhere in
  either rules file.
- Deletion is soft by default; Trash is recoverable and purge is explicit.
- Cancellation does not destroy data. The workspace becomes read-only after a
  grace window and is retained per `shared/plans.json → retention`.
- Workspace deletion requires the owner to type the workspace name, then waits
  out a grace window before the purge runs.
- Logs record identifiers, actions and error codes. They do not record the
  Anthropic key, passwords, tokens, or item descriptions.
- Invitation tokens are stored only as SHA-256 hashes and compared in constant
  time.

## Release hardening (1.0.0)

- **No secret in the client.** The only credential-like value is the Firebase
  web `apiKey` (a public project identifier) in `nazm.config.js`. The AI key
  is a Cloud Functions secret. No App Check debug token is ever written into a
  file: the debug provider asks Firebase to generate one, only in the
  development environment on localhost.
- **CSP**, generated from the configuration (`tools/security-policy.mjs`):
  enforced as a meta tag in `index.html`, as headers in `firebase.json`, and
  by script hashes in the single-file build. With cloud off, no external origin
  at all; `script-src 'self'`, no inline script, no `eval`; `object-src`,
  `frame-src`, `base-uri`, `form-action` and `frame-ancestors` closed. Cloud
  adds only its configured Firebase endpoints — never an AI provider.
  Verified by running the app under it (`tests/browser/security.test.mjs`).
- **No HTML from data.** Views build DOM with `el()` and `textContent`; there
  is no `innerHTML` in `src/`. Imported files, AI output and backend error text
  are never inserted as markup, and backend wording never reaches the screen
  (errors map to this app's messages).
- **Imports.** A JSON backup is parsed with a reviver that drops `__proto__`,
  `constructor` and `prototype`; spreadsheet taxonomy names are kept in
  prototype-less maps; sizes, row counts and field lengths are capped before
  anything is written.
- **Exports.** The Excel writer never emits a formula; text that begins with
  `=`, `+`, `-` or `@` is an inline string cell and stays exactly as typed.
  There is no CSV export.
- **Images** are checked by MIME type and size, then actually decoded (with a
  pixel cap on the fallback decoder) and re-encoded; the filename is not
  trusted.
- **Logs** carry error codes, not error objects, on the sign-in, AI and media
  paths — Firebase attaches email addresses and credentials to its errors.
- **Destructive operations** live in `src/account.js`, run one at a time,
  report success only after completion, and are enforced server-side:
  `deleteAccount` checks a sign-in within five minutes, refuses while the user
  owns a shared workspace, and is rate-limited.
- **Identity changes** (another account signing in on the device) close every
  sheet, clear the search and restart the repository, dropping the previous
  account's records and image URLs; the device inventory is untouched.

Every backend operation must verify the authenticated user, workspace
membership, role, resource ownership and the action itself, whatever the UI
shows. Rate-limit requirements: IOS-RELEASE.md §13.

## Known gaps

Stated plainly, because a checklist that hides these is worse than useless.

1. **App Check is not enforced.** The integration is written and disabled
   behind a null site key. Enforcement is one environment variable
   (`ENFORCE_APP_CHECK`) read by every callable through `callable()` in
   `functions/src/lib.js`, so there is no per-function flag to miss — but until
   you complete `DEPLOYMENT.md` §5, the backend is protected by auth and rules
   and not by attestation.
2. **Storage rules have no automated test.** Firestore rules are covered by the
   emulator suite. The Storage emulator is not part of the test run, so
   `storage.rules` is reviewed but not proven. Add
   `firebase emulators:exec --only storage` coverage before onboarding
   customers.
3. **`style-src` still allows `unsafe-inline`.** The markup carries inline
   `style` attributes from the original design. Script sources are fully
   locked: no `unsafe-eval`, no `unsafe-inline`.
4. **Billing is unproven end to end.** The webhook path is written, idempotent
   and replay-safe, but no provider adapter exists, so the full chain has never
   executed. Do not accept payment until `DEPLOYMENT.md` §6 is done and tested
   against the provider's test mode.
5. **No error-monitoring service is wired.** Failures go to `console.error` and
   Cloud Logging. There is no alerting.
6. **No penetration test.** The isolation suite covers the attacks we thought
   of, not the ones we didn't.

## Reporting

**[YOU]** Publish a contact address for vulnerability reports before launch and
put it here.
