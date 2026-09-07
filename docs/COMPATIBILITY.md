# Breditor compatibility policy

Status: active for the `0.1.x` line

This policy defines the deliberately narrow compatibility promise made by the
first Breditor release. It is a source and runtime contract, not a claim that a
package has been published to npm or crates.io.

## Supported `0.1.x` surface

The supported application API is the `@breditor/browser` package root. It
includes:

- `openBreditorBrowserEditor`, `BreditorBrowserEditor.open`, and their
  documented option and all-or-nothing result records;
- the returned `BreditorBrowserEditor` methods and property: `element`,
  `getStatus`, `getSnapshot`, `exportContent`, `subscribe`,
  `flushPersistence`, `retryPersistence`, `focus`, and idempotent `dispose`;
- the root-exported keyboard policy, initialized official Wasm module shape,
  ABI and bootstrap constants, read-only editor/action/persistence snapshots,
  content-export records, and documented limits;
- `createToolbarManifest`, the root-exported toolbar declaration types and
  constants, and the Bold/Undo/Redo default manifest; and
- the documented high-level styling hooks `data-breditor-editor-root`,
  `data-breditor-toolbar-root`, `data-breditor-state-id`, and
  `data-breditor-group`, including their described meaning but not the complete
  internal DOM topology.

Those four styling hooks have the following exact `0.1.x` meaning:

- the application-provided editing host carries
  `data-breditor-editor-root=""` for the successful owner lifetime, including
  a faulted phase, until disposal;
- the runtime appends one owned toolbar `<div>` carrying
  `data-breditor-toolbar-root=""` inside the application-provided toolbar host;
- each generated toolbar `<button>` carries `data-breditor-state-id` whose
  value is that control declaration's exact `stateId`; and
- a generated button carries `data-breditor-group` only when its declaration
  has `group`, with the exact declared string as its value.

Disposal removes the owned toolbar root and restores or removes attributes it
installed on the editing host. No ancestor relationship, sibling order beyond
manifest control order, generated class name, or other DOM topology is stable.

The root manifest boundary is also fixed. `controls` is a dense array of 1
through 64 own data elements. Toolbar and control labels contain valid Unicode,
at least one non-whitespace character, no ASCII control or DEL character, at
most 128 UTF-16 code units, and at most 512 UTF-8 bytes. `stateId` and
`actionId` are at most 128 ASCII characters and match
`[a-z][a-z0-9._-]*/[a-z][a-z0-9._-]*`; state IDs are unique. An optional
`group` is valid Unicode, already trimmed, nonempty, free of ASCII control and
DEL characters, at most 64 UTF-16 code units, and at most 256 UTF-8 bytes. A
string action input is nonempty valid Unicode and is at most 65,536 UTF-16 code
units and 65,536 UTF-8 bytes. The corresponding bounds are root-exported
constants.

High-level `persistence.autosave.delayMs` and `maxLatencyMs` are integer
milliseconds from 0 through 60,000 inclusive, with `maxLatencyMs >= delayMs`.
They default to 250 and 2,000 respectively; all three values are root-exported
constants. A supplied scheduler follows the synchronous, non-reentrant contract
documented by `SessionCheckpointAutosaveScheduler`.

One editor retains at most 1,024 concurrent `flushPersistence()` and
`retryPersistence()` waiters. The package-root
`MAX_SESSION_CHECKPOINT_AUTOSAVE_FLUSH_WAITERS` constant exposes that ceiling;
an additional call returns the stable rejected/capacity result.

The editor's accessible `label` is retained verbatim and must be well-formed
UTF-16 containing at least one non-whitespace character and 1 through 256
UTF-16 code units. One editor retains at most 64 distinct subscriber functions;
both limits are exposed by root constants.

The editing host is a connected, empty HTML `article`, `aside`, `div`,
`footer`, `header`, `main`, `nav`, or `section`. This closed flow-container
allowlist prevents a successful owner from being installed on void, phrasing,
or form-control elements that cannot provide the required paragraph editing
surface.

The optional toolbar host is a distinct, connected, empty HTML `article`,
`aside`, `div`, `footer`, `header`, `main`, `nav`, or `section`. It has no
`tabindex` attribute, is outside an effective editable region, and either has
no `role` or uses only case-insensitive whitespace-separated tokens from:
`banner`, `complementary`, `contentinfo`, `form`, `generic`, `group`, `main`,
`navigation`, `none`, `presentation`, `region`, or `search`. An empty role is
also accepted.

Within `0.1.x`, a patch release will not intentionally remove or rename those
exports, add a required caller-supplied field, change an existing method's
meaning, or turn a documented successful use into an unsupported one. Fixing
acceptance of malformed, stale, foreign, oversized, or otherwise invalid input
is not a compatibility break.

The documented literal discriminants are part of this promise. That includes
`ok`, `phase`, `status`, `kind`, `format`, availability and activation values,
and the closed payload-redacted `code` and `reason` literal unions explicitly
enumerated in root declarations. Open string fields such as nested `causeCode`
and action `reasonCode` are not closed enumerations. Existing variants will not
be removed, renamed, reclassified, or assigned a different meaning in `0.1.x`;
a patch will not add a required branch that makes an exhaustive consumer switch
incomplete. Human-readable `message` text is diagnostic prose: callers must
branch on `kind`, `code`, `reason`, or another documented discriminant instead.
Object identity, property enumeration order, stack traces, and timing below a
documented scheduling boundary are also not compatibility identifiers.

Additive optional fields or exports may be introduced in a patch only when an
existing conforming consumer can safely ignore them. New editor capabilities
that require a new mandatory option, union branch, wire meaning, or lifecycle
obligation wait for `0.2.0`.

## Stable versioned data

Three data contracts are supported across the `0.1.x` line:

- **Document V1:** `format: "breditor/document"`, `formatVersion: 1`, using the
  documented `breditor/base@1` paragraph/text/strong subset. A conforming
  Document V1 value emitted by one `0.1.x` release remains readable by later
  `0.1.x` releases.
- **Session Checkpoint V1:** `format: "breditor/session-checkpoint"`,
  `formatVersion: 1`. A conforming checkpoint emitted by one `0.1.x` release
  remains restorable by later `0.1.x` releases. It restores document,
  selection, pending formats, linear history, history position/capacity, and
  merge continuity; it is not a portable collaboration or trust proof.
- **IndexedDB Session Checkpoint Profile V1:** profile
  `breditor/indexeddb-session-checkpoint`, version `1`, stored in the exact
  `breditor-session-checkpoint-v1` database shape documented in
  [`SESSION_CHECKPOINT_STORAGE.md`](SESSION_CHECKPOINT_STORAGE.md). Later
  `0.1.x` releases continue to read an earlier conforming record rather than
  silently replacing, repairing, or deleting incompatible evidence. The
  profile's decimal generation is its one-slot compare-and-swap counter, not a
  promise for the separate local-log storage-generation design.

The official `0.1.0` module establishes a no-shrink checkpoint acceptance floor
for every later official `0.1.x` module. The complete compact UTF-8 JSON
envelope is 16 MiB. Each retained state admits root-relative node/path depth
64, 100,000 total nodes, 10,000 children per element, 1 MiB in one text leaf,
8 MiB total text, 32 formats per text leaf, 128 top-level properties per
element or format owner, nested property depth 32, and 10,000 total property
values. One transaction admits 1,024 operations. The checkpoint admits history
capacity 100, 16,384 aggregate forward operations, 1,000,000 retained logical
nodes, 64 MiB retained logical text, and 100,000 retained property values.
Later `0.1.x` releases may raise these ceilings but must not use a lower
resource policy to reject an unmodified checkpoint successfully emitted by an
earlier supported official `0.1.x` path. Host-tightened Rust codec policies and
experimental custom Wasm factories remain host-authoritative and outside this
promise.

Canonical encodings remain strict: an unknown format name or version, extra or
missing required fields, noncanonical numbers, invalid schema content,
corruption, or a resource-limit violation can fail closed. A compatible reader
need not accept bytes that were never conforming to the relevant V1 contract.

An incompatible application API change requires `0.2.0`. An incompatible wire
change requires a new format name or `formatVersion`. An incompatible generated
Wasm transport requires a new ABI number. A change crossing more than one of
these boundaries must carry every applicable signal; silently changing meaning
under the same application version, wire version, or ABI is not allowed.

## Experimental `0.2.0-alpha.2` Rust boundary

The Rust core now has separate fingerprint-bearing V2 codecs for Document,
Operation, Transaction Request, Editor State, Commit, Session Checkpoint, Local
Log Entry, Local Log Checkpoint, Local Log Frame, Storage Root, and Storage
Generation, plus binding-aware recovery, tail, compaction, selected-storage, and
prepared schema-admission paths. These contracts are additive research surfaces
outside the stable `0.1.x` promise. Existing V1 codecs remain exact-base-only;
neither generation auto-detects, upgrades, or silently nests the other.

The alpha.2 npm version does not widen the browser product. Wasm ABI 2,
`@breditor/browser`, browser validation and export, autosave, and the IndexedDB
Session Checkpoint Profile continue to consume and emit V1 only. The Rust V2
families are not accepted in the V1 IndexedDB slot, and a mismatch must not be
replaced with fresh content. Profile-aware Wasm and browser persistence require
their later explicit checkpoints and ABI generation.

## Browser and Wasm pairing

The supported official configuration uses exactly matching versions of
`@breditor/browser` and `@breditor/wasm`. For `0.1.0`, the Wasm module reports
transport ABI `2`. The browser checks the module's ABI before constructing an
editor, and the generated module exposes its embedded Breditor version for
diagnostics. ABI compatibility does not by itself make mismatched official
package versions a supported pair.

The minimal supported browser bootstrap surface of `@breditor/wasm` is the
package-root default asynchronous initializer called once with no argument in
an HTTP(S) browser or browser bundler that resolves the adjacent generated Wasm
asset, followed by the initialized namespace import containing `BreditorEngine`,
`breditorWasmAbiVersion`, and `breditorVersion`. In other words, this documented
form remains supported throughout `0.1.x`:

```ts
import initializeWasm, * as breditorWasm from "@breditor/wasm";

await initializeWasm();
```

Only the no-argument call, asynchronous success/failure settlement, and the
usable post-initialization namespace are frozen. Callers ignore the resolved
initializer value; generated `InitOutput` members are part of the excluded raw
glue rather than a public application contract.

Initializer arguments, `initSync`, the `@breditor/wasm/wasm` binary export, and
direct Node/file-URL initialization remain advanced escape hatches and are not
part of the `0.1.x` compatibility promise.

`@breditor/wasm` is an optional peer dependency because an application may
initialize and inject the official module namespace itself. Optional does not
mean that Wasm is unnecessary, nor that arbitrary generated modules are
compatible.

The root type also accepts a bare `BreditorBrowserWasmFactory` so tests and
advanced hosts can inject a structural factory. The symbol, its two constructor
calls, and the option arm remain source-compatible in `0.1.x`, but no custom
factory is a supported runtime configuration: its returned values are
deliberately `unknown`, and the complete engine/handle protocol lives under
`@breditor/browser/advanced`. The supported application configuration is the
initialized, exactly version-matched official module namespace.

## Browser support evidence

The supported automated baseline is the repository's lockfile-pinned desktop
Playwright matrix: Chromium, Firefox, and WebKit. Support applies to the latest
available `0.1.x` patch and to the documented product subset. The project does
not promise long-term-support branches, backports, or continuing fixes for an
older `0.1.x` patch after a newer patch is available.

The matrix exercises real package-built pages. ASCII typing plus Backspace and
Delete use Playwright's real keyboard input path; non-BMP Unicode insertion and
scalar deletion use programmatically dispatched `beforeinput` events.
Composition events are synthetic, and clipboard capability is an event-provided
test double. These tests do not prove operating-system IME behavior, mobile
virtual keyboards, browser-chrome clipboard permissions, or the async Clipboard
API. One representative Safari/macOS accessibility-tree audit provides
evidence for roles, names, values, and state transitions in that environment
only. VoiceOver
was not enabled. Neither that audit nor the axe checks are a screen-reader,
assistive-technology, mobile-browser, or WCAG conformance claim.

## Dependency boundary

HTML-only paste is parsed through direct dependency `parse5` `8.0.1`, then
validated against Breditor's own closed repaired-tree allowlist and flattened
to plain text. `parse5` in turn declares its `entities` dependency using a
semver range. The repository lockfile pins the exact graph used by release
tests, but a consumer package manager may select another graph permitted by
those manifests.

The compatibility promise covers Breditor's documented accepted/rejected
content behavior and resource limits, not byte identity of third-party parser
code, internal parse-tree identity, or a particular dependency layout. If a
future requirement needs byte-stable third-party implementation code, Breditor
must bundle or vendor that code and audit the resulting artifact rather than
pretending a consumer lockfile is controlled here.

## Explicitly excluded surfaces

The following are useful implementation and research surfaces, but they carry
no `0.1.x` compatibility promise:

- every export from `@breditor/browser/advanced`, including renderer,
  projection, DOM-selection, command-queue, event, composition, clipboard,
  action-state adapter, and persistence assembly contracts;
- custom or bare-factory runtime implementations passed through the
  `BreditorBrowserWasmFactory` escape hatch; only the root symbol and its
  minimal source-level call shape are frozen, not a structural conformance
  protocol for the `unknown` results;
- raw generated `@breditor/wasm` classes, methods, handles, TypeScript glue,
  synchronous initialization, binary import, and ownership details, apart from
  the no-argument default initializer and module namespace/probes needed by the
  supported high-level pairing;
- the unpublished `breditor-core` and `breditor-wasm` Rust APIs, module layout,
  trait implementations, error types, and in-memory representations;
- operation, transaction-request, editor-state, commit, local-log entry,
  local-log checkpoint, Local Log Frame, local-log recovery/tail/compaction,
  storage-root, local-log storage-generation, selected-storage normalization,
  and schema-admission formats and state machines, including their experimental
  V2 generations;
- internal renderer generations, AST/DOM map identity, engine observations,
  history stamps, delivery tokens, queue receipts, storage attempt IDs, writer
  epochs, replay tombstones, and other process-local identities; and
- the repository's React example, benchmarks, test fixtures, build scripts,
  internal size layout, and undocumented import paths.

In particular, the advanced local-log and storage-generation work is not the
supported IndexedDB Session Checkpoint Profile V1. Exported Rust proof types or
documented experimental bytes do not make those designs a browser durability
contract. Promoting any excluded surface requires an explicit public contract
in a later release; incompatible promotion or redesign uses `0.2.0`, a new
format version, or a new Wasm ABI as appropriate.
