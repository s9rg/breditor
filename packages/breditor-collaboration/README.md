# Breditor collaboration application candidate

Optional shared editing for the original Breditor rich editor. This private
`0.3.0-alpha.22` package contains the browser coordinators and their matching
application-only Rust/Wasm module. It has no dependency on the experimental
probe package and does not require a relay for local editing.

Use `@breditor/editor/collaboration` for lazy initialization and the default
standard profile, or use this lower-level package with an explicitly selected
original shared V1 configuration or the separate structural V2 factories below.
Install the exact matching candidate archives;
there is no registry release or V1 API freeze yet.

```js
import init, * as wasm from '@breditor/collaboration/wasm';
import {compileStandardSharedProfileV1} from '@breditor/collaboration';

await init();
const profile = compileStandardSharedProfileV1(wasm, {
  format: 'breditor/shared-rich-profile', formatVersion: 1,
  schema: {name: 'example/shared-editor', version: 1}, extensions: []
});
// Acquire the exclusive writer lease before using profile.create/join_frame/restore.
// Transfer each returned writer to SharedRichEditor or SharedPersistentSession.
// Free the profile after those callbacks finish; writers retain their codec.
```

Use a bundler that supports generated `new URL` Wasm assets. Node consumers may
initialize with bytes from the `./wasm-binary` export. Ordinary package-root
types compile with `ES2022,DOM`; advanced generated-binding types additionally
use `ESNext.Disposable`.

## Ownership and host responsibilities

The generated module exposes configured `SharedRichProfile` factories,
`SharedEditorOwner`, opaque `SharedObservation` values and initialization only.
Its generated types have no public constructors for those classes. Fixed-schema
probe constructors, exercise functions, raw engine import/export and unguarded
research authoring methods are excluded from the application build. Use the
factories rather than manually constructing generated objects.

The root exports `SharedRichEditor`, `SharedPersistentSession`, DOM/toolbar
coordinators, relay sync, presence and asset providers. `view()` is a detached
publication; mutations use the owner's current opaque Rust observation. An
optional exact revision rejects asynchronous work prepared from an older view.
Remote publications can be held across input/composition and remain bounded.
Callback failures cannot rewind content already committed by Rust.
`insertSharedImageFiles` snapshots the bounded file list and insertion position,
then holds remote publications across asynchronous ingestion. Its original exact
revision still rejects local UI/history changes; bytes remain available after a
failed insertion, and success or failure releases the remote hold.

`SharedRichEditor.hardBreak(revision?)` replaces the current text selection with
one LF in one author-local history group, retaining logical-start formats and
peer changes. Shift+Enter invokes it without splitting a paragraph. Explicit
`beforeinput` replacement targets are honored separately. The additive guarded
Wasm method uses the existing text protocol, not a new shared operation. A
compatible older binding falls back to its equivalent guarded plain-text call.

Original shared V1 configuration declares a schema name/version, an extension
array and optional tightened document limits. Extensions declare exact IDs,
dependencies, conflicts and typed inline formats. Properties have required or
optional presence and bounded Boolean, integer or UTF-8 string domains. Rust
computes the complete fingerprint; a caller-provided fingerprint is not a schema
declaration. Typed inline extension support does not admit arbitrary block kinds,
callbacks, HTML or CSS. The explicit standard V1 factory adds the same bounded
twelve-format manifest as the local owner, without changing ordinary factories.

`core.supportsInlinePropertyPatches()` reports the additive guarded Rust planner.
`core.patchInlineFormatProperties({format, properties, targets}, revision)` patches
named fields of an existing format on every selected character. `format` is a
complete typed template; `properties` lists only the fields to copy. Targets use
`{block, offset, length}` with scalar-aligned UTF-16 boundaries. Missing formats,
duplicate targets/fields and stale revisions reject without publication. Matching
standard Link controls use this path when one form field is left blank. Other
observed fields and unrelated formats survive. The planner coalesces equal
results and keeps the existing 64-command group ceiling; oversized requests fail
atomically. Persisted operations remain ordinary complete-format annotations,
with the original whole-format concurrent conflict policy and author-local Undo.
There is no silent fallback for older owners lacking this capability.
Configured factories prove schema admission; they do not authenticate a user,
lease a writer or persist data automatically. A host still supplies identity,
durability, asset-byte storage and optional transport.

Keep the writer lease while a failed local flush is retried. A session close
permanently retires publication before awaiting storage: failed closure retains
checkpoint reads and the lease for retry or explicit discard, not further editing.
`discardAndClose()` now returns a promise that waits for an already-started
transaction and writer release. A database version change unblocks storage but
retains the retired native journal rather than silently discarding unsaved work.

The private editor SDK supplies `openSharedEditor` and the separate
`@breditor/editor/collaboration/react` lifecycle. It borrows the DOM owner from
the durable session, serializes React replacement and requires a failed-close
recovery handoff. Low-level DOM mounts still transfer core ownership by default;
`coreOwnership: 'borrow'` is explicit for a session-managed core. Server
acknowledgement and uploaded assets are not the local journal save state.

## Natural shared typing history

`SharedPersistentSession.open({history: 'typing-v1', ...})` selects native grouped
typing for either language. Omitted history remains explicit. A requested mode
requires the exact native capability; it never falls back to JavaScript history.
Use `core.typeUser(text, clockMs)` or `core.deleteUserRange(selection, direction,
clockMs)` only for user input, with canonical decimal u64 clock strings. Ordinary
`type`, paste, composition and dispatch keep explicit boundaries. `closeTypingGroup`
is an observed intent fence, not a content edit.

`core.checkpointJson()` selects the separate grouped family only after native
admission. Restore it with `restoreSharedTypingEditor(profile, room, checkpoint)`;
the original profile factory rejects that family. A persistent session's history
policy is immutable. Its restore callback receives the declared stored policy as
its second argument; select the matching native factory, not an AST import.

Explicit storage keeps legacy exact strings. Grouped storage uses a versioned
record, and default openings reject it without overwriting it. An explicit opt-in
can atomically upgrade a legacy journal while retaining old units and Redo; failed
saves leave the original durable record intact. The 16 MiB journal bound and
exclusive writer lease are unchanged. See `docs/RICH_TYPING_HISTORY.md` for the
record contract, false-result Undo publications and timing/qualification limits.

## General range input bridge

The source-level bridge requires a matching runtime with
`core.supportsGeneralRanges() === true`. Call `core.enableGeneralRanges()`
explicitly before `replaceGeneralRangeText(selection, runs, prefix)`,
`replaceGeneralRangePlainText(selection, text, prefix)` or
`replaceGeneralRangeTypingText(selection, text, prefix, clockMs)`. Optional
revision arguments retain exact publication guards. Rich runs use
`{text, formatsJson}`; first-key input also requires native natural history.
Rust decides styles, structural coverage and fresh paragraph allocation.
Reserve a new namespace prefix for every request, including failed/undone work.

The new mode preserves actual before-UI and selects separate general ordinary
or natural save families. `core.checkpointJson()` chooses the native getter;
`restoreSharedGeneralEditor(profile, room, checkpoint, history)` requires the
explicit matching recovery capability. There is no original-factory or
JavaScript command fallback. `SharedPersistentSession.open` accepts explicit
`rangeEditing: 'general-v1'` independently from `history` and `richLanguage`.
General records declare those policies outside opaque native JSON; legacy
records keep their exact shapes. An explicit reopen can upgrade an original
journal transactionally; a live session cannot switch behind its storage guard.
General stored records require matching opt-in and language on every reopening.
Use the restore callback's optional third range-policy argument to choose
`restoreSharedGeneralEditor`; original records still invoke the callback with
exactly two arguments. Failed upgrades retain the old durable value; failed
closes retain the exact retired owner and lease for retry.

Shared DOM plain typing, replacement, selected deletion, Shift+Enter and plain
paste follow the observed general mode. Cross-cell browser text ranges retain
partial endpoints; cell-picker grids remain explicit. Native general rich Copy,
inline/flow paste and cross-range paragraph Enter are implemented with separate
capability checks. Caption/code flow/grid paste uses separately declared native
text conversion with an explicit formatting-loss notice; structured paste never
silently falls back. Whole-document Select All remains required. A general
session must not bypass a relay's journal or digest guard. See the
[native contract](../../docs/RICH_GENERAL_RANGES.md).

### Caption/code paste losses

`supportsClipboardTextPolicy()` requires the exact native V1 policy and its
guarded read. `projectClipboardText(selection, clipboardJson, revision)` returns
a native text/loss report for caption/code starts, or null for prose. It is a
pure read, including in read-only mode; mutation still requires the matching
publication and write policy. The controller performs one explicit plain edit,
then shows the loss notice and calls `onPasteLoss(report)`. It never uses a failed
structured paste to select conversion. Empty or oversized projected text rejects
without deleting selection. See the [functional checkpoint](../../docs/qualification/2026-10-16-caption-code-text-paste-functional.json).

### Explicit writer transport V2

`supportsWriterTransportV2()`, `writerGroupsV2(after)` and `writerClockV2(writer)`
use the native packing-independent atom-lineage contract. Original reads keep
their original digest meanings. Registration explicitly requires
`writerTransport: 'atomic-v2'`; persist that field with the returned identity and
pass the unchanged identity to `SharedRelaySync`. The matching native room must
have been created with `Room::create_atomic_transport_v2`. Neither side upgrades,
sniffs frame versions, or falls back to original digests. Wrong-mode handshakes
reject before writer allocation. Range and natural-history policies remain
independent and require their matching native recovery factories.

The [functional checkpoint](../../docs/qualification/2026-10-16-writer-transport-v2-functional.json)
exercises real release Wasm and a temporary native host, including two offline
authors, host restart, exact journals and selective Undo/Redo. It is not browser,
public deployment or final release qualification.

## Source and compatibility

Rust source is canonical in `crates/breditor-collaboration`; browser source is
canonical in this package. The legacy feasibility manifest and experimental npm
package compile the same source with their original research surface. They are
compatibility/testing paths, not dependencies of this application package.

Configuration V1, ABI 1, model 11, journal 12, deterministic engine tag and
existing serialized meanings are unchanged. A local rich checkpoint is not a
shared journal. The default editor/Wasm graph remains independent of replication.
The native core's explicit rich-language V2 structural schema is not admitted by
model 11; profile creation rejects it before seed parsing or engine import.

## Explicit layout V3 candidate

`compileLayoutSharedProfileV3` and `compileStandardLayoutSharedProfileV3` select
configuration 3/model 13/journal 14. `SharedPersistentSession.open` must also
explicitly select `richLanguage: 3`. Defaults and V2 entry points remain strict.
`createLayoutSharedToolbarV3` composes structural and independent layout controls
for that owner. `core.changeSelectionLayout(patch, revision?)` lets Rust derive
targets; `core.blockLayoutState()` reports independent mixed/inherited fields.
The low-level `set_block_layout` command retains strict raw `patch_json`, including
duplicate keys for native rejection. It is not admitted by old models.

The reference relay has separate `create_layout_v3` and
`create_standard_layout_v3` factories with a new `seedLayoutV3` durable record.
They never reinterpret existing logs. See `docs/RICH_BLOCK_LAYOUT.md` for bounds,
independent concurrent registers, selective history and browser qualification.

## Explicit structural V2 candidate

`compileStructuralSharedProfileV2(wasm, configuration)` compiles bounded format 2
configuration without extra inline formats. `compileStandardStructuralSharedProfileV2`
also composes the original standard inline V1 manifest. Their generated native
factories are `from_configuration_json_v2` and
`from_standard_configuration_json_v2`; neither original factory changes.
V2 descriptors require the exact language 2/model 12/journal 13 tuple. V1 keeps
its original tuple and descriptor shape. A mismatched or older module rejects
before creating a writer; schemas and histories do not migrate automatically.

Transfer the resulting owner to `SharedRichEditor`, or explicitly select
`richLanguage: 2` in `SharedPersistentSession.open`. Storage defaults remain V1
and reject crossed journals without overwriting them. For a managed vanilla or
React host, use the same explicit option through `@breditor/editor/collaboration`.
`createStructuralSharedToolbarV2` binds standard and structural controls to that
exact V2 core. Named native commands own task completion, wrapping, split/join,
indent/outdent/empty exit, quote wrapping, code conversion/language and rules.
The command shape remains Breditor's own closed shared protocol, not the local
command DTO or another editor's protocol.

Reference relay creation is explicit too: `Room::create_structural_v2` or
`create_standard_structural_v2` writes a distinct V2 seed record. The CLI equivalents
are `init-v2` and `init-standard-v2`. Reopening follows the recorded seed policy;
original seeds and original `create`/`init` remain V1-only. Clients verify the
language/model/history binding before importing authenticated catchup. This
candidate still needs the retained reliability and broader V1 release gates.

Run `node scripts/check-editor-package.mjs` for clean local-only, shared-only and React SDK installs
and production Vite pages. The application-network browser matrix uses the same
strict assertions as the legacy installed matrix, but with this package's own
runtime and coordinators. Native IME, accessibility, historical WebKit fault,
performance budgets and public deployment remain separate qualification gates.
