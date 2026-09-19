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

## Known gaps

Stated plainly, because a checklist that hides these is worse than useless.

1. **App Check is not enforced.** The integration is written and disabled
   behind a null site key. Until you complete `DEPLOYMENT.md` §5, the backend
   is protected by auth and rules but not by attestation.
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
