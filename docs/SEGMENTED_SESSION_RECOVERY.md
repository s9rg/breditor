# Store native history across generations

`SharedSegmentedPersistentSession` is the explicit optional SDK storage family
for the [native generation contract](SEGMENTED_NATIVE_HISTORY.md). It retains
the original root and sealed files, the current active segment, and an optional
complete comment journal and named-version catalog. Sealing a document
generation preserves current Undo, Redo and pending causal inputs; it does not
replace the document with its visible AST.

This is local document and paired-comment storage. For document/comment sockets
with atomic delivery progress, select the separately named
[relay generation session](SEGMENTED_RELAY_RECOVERY.md). Existing adapters,
operational participant recovery and room-wide activation do not infer or admit
the local family. Do not fall back to an old checkpoint getter. The remaining
outbox/catalog integrations, independent comment-journal rollover and full
approved cross-generation room handoff remain V1 work.

## Open the dedicated family

Choose every original grammar, range, selection, typing, reviewed-ownership and
search policy explicitly. The native core pins those choices at the original
root; later generation boundaries cannot change them. Use a dedicated database
name. An existing old-format or unknown schema refuses without migration,
clearing records or calling the native creation callback.

A host can adopt an existing original document journal in a **new** segmented
database. Quiesce the original session, flush it, capture its exact checkpoint,
and close it. Use the same room, writer, grammar, and history policies. Supply
the original native restore through the new session's `create` callback so the
first generation retains the original checkpoint as its root. Keep the
original database available for recovery. The new active segment can be sealed
after it receives its first journal entry.

The [installed Chrome rollover drill](qualification/2026-11-23-installed-chrome-shared-journal-rollover.json)
reopens both generation archives, delivers the second writer's offline edit,
and checks Undo and Redo across the original generation boundary. The
storage-lifecycle gate still requires coordinated room and relay cutover,
backup restoration, and asset retention under the release operating limits.

Rebuild the installed SDK fixture with the optional rollover page, then run
the drill with Chrome installed on the host.

```sh
BREDITOR_EDITOR_ROLLOVER=1 node scripts/check-editor-package.mjs
BREDITOR_EDITOR_CONSUMER="$(node -p 'require("./target/editor-installed-consumer.json").consumer')" \
  npx playwright test --config experiments/editor-browser-rollover/playwright.config.mjs
```

```ts
import {
  SharedSegmentedPersistentSession,
  restoreSharedSegmentedEditor,
  type SharedSegmentedSessionOptions,
} from '@breditor/collaboration';

const options = {
  database: 'document-generations-1',
  room, writer,
  richLanguage: 3,
  history: 'typing-v1',
  rangeEditing: 'general-v1',
  selectionEditing: 'document-v1',
  searchHistory: 'search-v1',
  reviewedHistory: null,
  readOnly: currentDocumentReadOnly,
  review: { actor: commentWriter, principal, access: currentCommentAccess },
  initialGenerations: {
    root: crypto.randomUUID(),
    active: crypto.randomUUID(),
  },
  create: () => profile.create(initialDocumentJson, writer),
  restoreSegmented: checkpoint =>
    restoreSharedSegmentedEditor(profile, room, checkpoint),
} satisfies SharedSegmentedSessionOptions<'document-v1'>;

const session = await SharedSegmentedPersistentSession.open(options);
// Use existing session.core commands. After at least one accepted journal entry:
await session.sealGeneration(crypto.randomUUID());
```

The seal requires a nonempty active segment. `initialGenerations` and the
creation callback apply only to an absent head. Cold open never uses them to
reset stored history. The separately named restore callback must return the
actual matching segmented native owner; no AST or original-family fallback is
accepted. Old SDK constructors also require the explicit `segmented-v1` policy
when adopting such a recovered owner.

Both the document writer and, when paired, comment writer are leased before
reading or restoring. Locks are shared with the existing session families and
are independent of database name. They coordinate cooperating same-origin
owners only. The host still must authenticate the current account and fence the
exact writers across devices and deployments.

`readOnly` and the optional comment policy are current host inputs, not grants
read from storage. A recovered owner receives initial document policy before
its first facade observation, preserving its exact checkpoint. A fresh source
is configured privately and receives policy before it can be returned. Reviewed
effect ownership requires the matching explicitly paired review account. An
initial comment file can be supplied through `initialReviewCheckpoint`; otherwise
a fresh paired source creates a new empty comment lane.

## Commit complete cuts without overwriting files

The new database has only `generation_files` and `generation_heads` stores.
Original roots and sealed segments are immutable files keyed by their room,
writer and generation. Their exact UTF-8 bytes are hash-linked. A head contains
the active segment, original policy and references, plus the complete optional
comment checkpoint and immutable named versions.

One transaction compares the previously acknowledged head, checks existing
immutable files, adds missing new files and commits the next head. Existing
file bytes are never overwritten. A changed head or file refuses, even when
the visible document looks identical. Head and all referenced files are read
in one transaction on cold open; native replay then independently checks every
retained input and exact effect.

Autosave captures native state synchronously and may coalesce superseded
complete captures. It does not remove their accepted operations from the
retained native history. Native segment bodies remain exact strings in storage;
JavaScript never decodes and re-encodes their effect numbers or document
properties. This preserves native integers beyond JavaScript's safe-number
range. Metadata and file hashes are integrity checks, not native replay or
permission proofs.

`core.sealHistoryGeneration(id)` publishes native memory only.
`await session.sealGeneration(id)` additionally waits for local storage.
Neither acknowledges a server, uploads assets or activates a room. Rollover is
explicit: the host must seal before adding beyond the active segment budget.

## Recover failed writes and closes

An aborted transaction leaves the prior cut intact. An error after commit is
not evidence that nothing was written. Retry keeps the exact uncertain attempt
ahead of newer pending captures. An already-applied exact head is acknowledged
only if every immutable file is still present and unchanged. Missing files are
not silently recreated.

`close()` retires editing synchronously, then saves and flushes the final cut.
A failed close leaves native histories readable and retains both writer leases
for `retry()` or another close attempt. A version change retires the owner and
closes the obsolete database; it does not silently discard unsaved history.

`exportRecovery()` returns exact native document and optional comment inputs
plus version packets. Retain those inputs independently before choosing
`discardAndClose()`. That explicit discard abandons unsaved memory and disposes
the native owner, but deletes no stored file. A transaction already started can
still commit; leases are released only after it settles. Large captured buffers
are then released while small save-state diagnostics remain readable.

## Restore into an absent destination

Use the separate recovery API after the host reacquires and fences the writer:

```ts
const restored = await SharedSegmentedPersistentSession.restoreRecovery({
  ...recoveryOptions, // Explicit identity, current policies and native restore.
  database: 'recovered-generations-1',
  recovery: independentlyRetainedInputs,
  writerRecovery: 'host-reacquired',
});
```

The acknowledgement string declares a host obligation; it performs no external
fencing. Recovery requires an absent generation head, matching document and
comment identities, exact native replay and the original version packets. An
occupied destination refuses before calling the restore callback. It is not a
merge or replacement operation. After an ambiguous initial save, normal open
can inspect an already committed cut; recovery import does not overwrite it.

These inputs contain no image bytes, upload queue, relay outbox, account tokens
or resume credentials. Preserve the original asset stores and protected host
state separately. Native image references survive generation seals, but local
history storage is not complete provider or participant recovery.

## Functional qualification

The [qualification record](qualification/2026-10-19-segmented-session-recovery.json)
covers 45 selected checks, including 650 shared-core and 216 relay Rust tests,
385 editor tests, storage-failure contracts and fresh installed consumers. The
same 216-configuration matrix passes through the workspace and public package
archives, with 1,296 exact cold restores and 864 future document/comment
comparisons in each run. These are functional recovery checks, not room activation
or physical browser durability approval.

## Keep the bounds and remaining work explicit

The native archive retains its separate 64-generation and 64 MiB ceilings;
each original root or segment keeps its 1,000-entry and 16 MiB bounds. The
original native Undo capacity, causal-view, update and document limits are
unchanged. Reaching a limit refuses without history eviction or a new writer.

The new head has a separate 128 MiB combined budget. Comment checkpoints keep
their original 16 MiB ceiling; named versions retain the 32-packet and 4 MiB
per-packet limits. The complete comment journal is retained through document
seals, not compacted into a new comment-generation protocol. No garbage
collection or unlimited lifetime is provided.

Synthetic IndexedDB and Web Locks tests qualify functional transitions, not
browser eviction/quota, process or power-loss durability, physical clipboard,
IME, screen-reader behavior or the long-session performance envelope. Whole-room
activation, generation-aware outbox/catalog and participant bindings, independent
comment rollover, provider closure, protected credentials and deployment fencing
remain separate requirements.
