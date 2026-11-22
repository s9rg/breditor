# Live read only editing policy

Local and shared rich owners can reject authoring while keeping selection,
copying, remote updates and retained history available. Read-only is a live host
policy. It is neither a document property nor a server authorization rule.

## Host API

Pass `readOnly: true` to `openLocalEditor` or `openSharedEditor` to apply policy
before exposing the mounted editor. Both default to editable. Change the live
owner with `editor.setReadOnly(boolean, expectedRevision?)`; the return value
indicates whether policy changed. Invalid Boolean values, unsupported older
owners and stale revisions reject rather than falling back to DOM-only locking.

Both React components have a live `readOnly` prop and an imperative
`setReadOnly` handle. Changing the prop keeps the same native owner and history.
`initialOptions.readOnly` remains initial configuration per `sessionKey`; use
the top-level prop for subsequent changes. Removing the prop leaves the current
policy intact, rather than silently enabling editing.

Local raw Wasm advertises `readOnlyVersion() === "1"` and accepts
`setReadOnly(observation, boolean)`. Shared Wasm exposes
`read_only_version() === "1"` and `set_read_only(observation, boolean)`.
The SDK facades expose `supportsReadOnly()`. Requests still require the exact
native observation; a serialized decimal revision is not mutation authority.

## Publications and retained history

A genuine policy change advances the original publication revision and opaque
observation without changing content, selection, pending formats, Undo/Redo,
writer clocks or replicated operations. Repeating the same value is a true
no-op. Locking and unlocking invalidate work prepared before either transition.
Local policy changes do not invent a content-command outcome or call the local
content `onChange` callback. Shared changes use the existing local publication
subscription, so durability and presence coordinators see the new publication.

The detached view includes `readOnly: true` only while locked. After a policy
change, `readOnlyRevision` records that transition's decimal revision even when
the owner is editable again. This separate live guard lets local asynchronous
image insertion retain its stable-target behavior across unrelated edits while
rejecting a lock/unlock cycle during ingestion. Shared image insertion retains
its stricter exact-publication guard.

Only the ordinary publication counter is durable. Neither policy field is saved
in a checkpoint, and restored owners start editable. Hosts must reapply their
current policy before exposing recovered owners. Older matching runtimes can
restore the unchanged document/journal format but cannot enforce this additive
policy capability. Remote peers never inherit another host's editing mode.

## Allowed and rejected work

Rust rejects content, formatting, structural changes, pending typing formats,
Undo and Redo while locked. Empty authoring requests do not bypass the guard.
Selection changes, grid navigation, semantic clipboard reads, asset reads,
authorized incoming updates and persistence remain available. Staged shared
admission preserves the current host policy instead of replaying a journal into
an accidentally editable replacement.

The surface and every image caption become non-editable, with `aria-readonly`
and keyboard focus retained. Task checkboxes and authoring toolbar controls are
disabled. Keyboard and `beforeinput` editing, paste, drop and file callbacks do
not author content. Copy remains available; Cut deliberately copies without
deleting. Unexpected late DOM input is reconciled from the native document.

A policy change cancels provisional composition and queued edits. Delayed
composition completion cannot resurrect them after unlocking. Shared composition
holds are released so incoming updates can proceed. Asynchronous image admission
rejects before storage when already locked; a policy change during storage
prevents document insertion without deleting independently stored bytes.

Custom toolbar controls may declare `readOnlySafe: true` for selection or other
non-authoring actions. This flag never exempts a native mutation from the policy.
Call setters outside publication callbacks; reentrant publication rejects.

## Security and restricted regions

Read-only is cooperative application behavior, not a security boundary against
the host itself. A host that owns the editor can enable editing. Relay Reader
roles and server permissions must still be checked independently. Permanent
`retire()`/`close()` stops future local and remote publication; it is not a
temporary read-only session.

Editable-region restrictions are a separate native capability: see
[RESTRICTED_EDITING.md](RESTRICTED_EDITING.md). Its block-region policy shares
this policy's publication and `readOnlyRevision` fencing; read-only takes
precedence. Nested `contenteditable` islands or toolbar flags are not that contract.

## Reproducible checks

Run native `rich_read_only`, Wasm `rich_editor` and canonical shared
`read_only_contracts` tests. The research facade executes the same shared test
through its shim. SDK tests cover policy capabilities, React lifetime cleanup
and asynchronous file fences.

`node scripts/check-editor-browser.mjs` clean-installs the packages and executes
every discovered editing spec in bounded batches, then the real-relay network
spec. Every invocation retains all three engines, the original 60-second case
and 300-second process deadlines, one worker and zero retries. The read-only
matrix covers both rich languages and local/shared owners, exact recovery,
React and composition cancellation. Its clipboard/composition events are
event-path checks, not physical IME or OS clipboard certification.

`scripts/probe-read-only-compatibility.mjs` accepts pre-policy local/shared and
current local/shared runtime directories. It checks eight cross-version restores
and twenty exact future history comparisons across both languages. Default
editable V1 behavior is separately compared with
`scripts/compare-shared-v1-runtime.mjs`.
