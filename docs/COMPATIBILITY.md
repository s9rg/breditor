# Breditor compatibility policy

Status: active for the supported `0.1.x` base and `0.2.x` extension surfaces;
`0.3.0-alpha.1` adds an explicitly experimental Rust-only contract

This policy defines the deliberately narrow compatibility promise made by
supported Breditor releases. It is a source and runtime contract, not a claim
that a package has been published to npm or crates.io.

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

An incompatible application API change requires a new incompatible application
version. An incompatible wire change requires a new format name or
`formatVersion`. An incompatible generated Wasm transport requires a new ABI
number. A change crossing more than one of these boundaries must carry every
applicable signal; silently changing meaning under the same application
version, wire version, or ABI is not allowed.

## `0.2.0` profile boundary

The supported `0.2.0` package-root addition is the complete, immutable,
callback-free property-free inline-format path documented below: exact official
browser/Wasm pairing, compiled-profile bootstrap, V2 document or session input,
complete declarative rendering, no-input semantic intents, checked toggle-button
toolbar contributions, profile-bound persistence, and the reference Highlight
package. Removing or changing the meaning of that documented path requires a
later incompatible application version. The lower-level Rust and advanced
browser surfaces remain outside that package-root promise as stated below.

The Rust core now has separate fingerprint-bearing V2 codecs for Document,
Operation, Transaction Request, Editor State, Commit, Session Checkpoint, Local
Log Entry, Local Log Checkpoint, Local Log Frame, Storage Root, and Storage
Generation, plus binding-aware recovery, tail, compaction, selected-storage, and
prepared schema-admission paths. These contracts are additive research surfaces
outside the stable `0.1.x` promise. Existing V1 codecs remain exact-base-only;
neither generation auto-detects, upgrades, or silently nests the other.

Alpha.3 additionally exposes manifest-owned `InlineFormatSpecV1` declarations,
independent persisted type revisions, and a sealed base-text compiler under a
caller-owned non-`breditor/*` schema selector. Its compiler-minted schemas keep
the exact built-in document/paragraph/text shape and may add only property-free
inline formats. Existing primitive operations, exact inverses, history, and V2
checkpoint replay preserve those formats; `ToggleInlineFormatAction` is the
public Rust-owned generic planner.

Alpha.4 adds a manifest-owned immutable toggle declaration for one
same-manifest format kind and its action, no-input intent, binding, and
action-state IDs. Compilation admits at most 255 per manifest and profile,
rejects duplicate typed identities and all extension semantic IDs under
`breditor/*`, and creates the existing generic toggle action, a tracked intent,
one priority-0 blocking binding, and routed state. `CompiledEditorProfile`
co-owns the extension set, schema, generated registry, router, and catalog under
a fresh opaque Rust-local generation. These semantic declarations do not change
the schema fingerprint. Custom actions, inputs, callbacks, cross-extension
targets, shared/fallback routes, rendering, and toolbar UI are not included;
native component APIs remain advanced bypasses.

Alpha.5 carries the opaque process-local profile generation through
profile-created Rust contexts, engines, observations, intent outcomes, and
action-state caches. `CompiledProfileDescriptor` owns the durable schema
binding, admitted format revisions, intent input/state contracts, and complete
direct/routed/history action-state sources. Guarded intent execution consumes
one routed preparation synchronously and returns committed, blocked, or
unhandled provenance without rerunning the handler. The legacy checkpointed
engine constructor explicitly retains Session Checkpoint V1; the separate V2
constructor retains fingerprint-bearing V2 through every atomic candidate.

Wasm ABI 3 adds strict bounded ABI-local profile bootstrap, reusable fresh and
restore factories over Document V2 and Session Checkpoint V2, no-input intent
execution, and opaque generation checks throughout the owned handle graph. The
generation has no numeric, string, pointer, JSON, or persistent form. Legacy
exact-base V1 Wasm factories remain available as an advanced compatibility
path, but now also create internally profile-correlated engines.

Alpha.6 extends the supported browser owner to compiled semantic profiles. It
accepts explicit Document and Session Checkpoint V2 only when a semantic
profile is supplied, consumes the exact descriptor/generation, requires a
callback-free safe render manifest with complete format coverage, and carries
property-free formats through DOM rendering, point mapping, composition, copy,
plain-text paste, and canonical export. Profile-aware IndexedDB selects an
exact fingerprint or caller slot before payload validation and never replaces
mismatched evidence. Omitted profile and scope retain the unprofiled base V1
projection, export, legacy `"current"` record, and `<strong>`/`<b>` HTML paste
compatibility. That Alpha.6 checkpoint did not yet expose intent toolbar
execution.

Alpha.7 completes that narrow browser intent path without changing ABI 3 or a
durable format. Every compiled base profile now declares the tracked no-input
`breditor/format-strong` intent and blocking route to
`breditor/toggle-strong`; Bold state observes the route. Native Bold input,
keyboard Bold, the default toolbar, and synchronous public `executeIntent()`
share it. High-level toolbar startup admits only descriptor-matched no-input
intent/routed-state or exact history controls, and every action-state snapshot
must repeat the descriptor's fixed ordered catalog and activation/value
contracts. Direct action controls and full binding/action route provenance
remain advanced; public results are provenance-redacted and immediate-only.
There is no typed public intent input, custom control kind, extension keymap, or
custom `beforeinput` registration.

Alpha.8 added `@breditor/reference-highlight` as the package proof for that
narrow boundary. Its supported surface is the package root only. It
exports frozen IDs, ABI-local profile bootstrap data, the exact durable schema
fingerprint, bounded fingerprint-bearing Document V2 helpers/fixtures, and
browser-created render and toolbar manifests. Internal `dist/*` files are not
separate compatibility entry points.

The fixed reference contract uses schema `example/editor@1`, extension
`example/highlight-extension@1`, property-free format
`example/highlight@7`, action `example/toggle-highlight`, no-input intent
`example/toggle-highlight-intent`, binding
`example/toggle-highlight-binding`, state `example/highlight-control`, and
fingerprint
`sha256:374d5f058129ab8916d052866e37f3b3540dbb754ba560e55086415a3c58f741`.
The bootstrap value is configuration for ABI 3, not a stable general extension
manifest wire protocol. The package's callback-free data prevents a browser
callback from becoming Rust mutation authority; importing the package still
executes trusted same-realm JavaScript and is not a sandbox or provenance proof.

## `0.3.0-alpha.1` Rust boundary

This prerelease adds an experimental Rust-only typed inline-format property
contract. It is not yet part of the supported browser package-root surface.
One manifest-owned format may have one closed contract of 1 through 32 unique
qualified keys. Each key is required or optional and accepts Boolean, a
JavaScript-safe integer with optional inclusive bounds, or a string with
inclusive UTF-8 byte bounds. Null, floats, arrays, objects, unions, enums,
patterns, defaults, coercion, normalization, and cross-property rules are not
contract types.

The contract is compiled into document validation and durable schema identity.
Property-free schemas retain exact compiler-contract version-1 fingerprint
bytes. Any property-bearing format selects compiler-contract version 2 and
encodes its sorted property names, presence, types, and bounds. Document V2 can
admit valid typed instances against the exact Rust schema and fingerprint.
Document and checkpoint limits now separately bound property-string bytes, and
validation reports have a fixed 1,024-issue ceiling including a truncation
marker.

The alpha fails closed where preservation semantics do not yet exist. Any typed
format globally disables all four content operation variants for its schema;
property-bearing formats cannot enter V1 pending typing state or generated
no-input toggles. Valid typed documents, ordinary selections without typed
pending state, and empty-history Session Checkpoint V2 state can still be
represented. This does not claim property-changing undo, redo, or replay.

Wasm ABI 3 is unchanged. Its bootstrap and browser descriptor cannot declare or
expose typed contracts, and the browser cannot construct, render, edit, copy,
paste, or add toolbar controls for them. The package-root profile path therefore
remains property-free even when the matching workspace packages carry a
`0.3.0-alpha.1` version. Typed validation proves only scalar shape and ranges;
URL schemes, CSS safety, and renderer sanitization remain separate future
contracts. See [`V0_3_SCOPE.md`](V0_3_SCOPE.md).

## Official package pairing

The supported official configuration uses exactly matching versions of
`@breditor/browser` and `@breditor/wasm`. The stable `0.1.0` pair reports Wasm
ABI `2`; every `0.2.x` pair reports ABI `3`. The `0.2.x` path checks
both the exact ABI string and exact embedded package version before reading the
generated engine factory. ABI compatibility alone never makes mismatched
official package versions a supported pair.

The current `0.3.0-alpha.1` reference configuration installs exactly
`@breditor/browser@0.3.0-alpha.1`, `@breditor/wasm@0.3.0-alpha.1`, and
`@breditor/reference-highlight@0.3.0-alpha.1`. The reference package declares
the exact browser version as a peer dependency. Its render and toolbar
manifests are branded by the `@breditor/browser` module instance that created
them, so a duplicate, nested, or mismatched browser copy is not a compatible
replacement. The clean consumer gate proves one peer instance and imports only
the three package roots.

The minimal supported browser bootstrap surface of `@breditor/wasm` is the
package-root default asynchronous initializer called once with no argument in
an HTTP(S) browser or browser bundler that resolves the adjacent generated Wasm
asset, followed by the initialized namespace import containing `BreditorEngine`,
`breditorWasmAbiVersion`, and `breditorVersion`. In other words, this documented
form remains supported throughout `0.1.x` and `0.2.x`:

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
part of the supported high-level compatibility promise.

`@breditor/wasm` is an optional peer dependency because an application may
initialize and inject the official module namespace itself. Optional does not
mean that Wasm is unnecessary, nor that arbitrary generated modules are
compatible.

Through `0.1.x`, the root option type also accepted a bare structural factory
for tests and advanced hosts. Alpha.5 removes that option arm: the supported
root configuration is now only the initialized, exactly version-matched
official module namespace. `BreditorBrowserWasmFactory` remains an advanced
descriptive type for that namespace's nested generated class; it is not a
standalone bootstrap ingress or a custom-runtime conformance promise.

## Browser support evidence

The supported automated baseline is the repository's lockfile-pinned desktop
Playwright matrix: Chromium, Firefox, and WebKit. Support applies to the latest
available `0.1.x` patch and the documented `0.2.0` product subset. The project
does not promise long-term-support branches, backports, or continuing fixes for
an older release after a newer compatible release is available.

The matrix exercises real package-built pages. ASCII typing plus Backspace and
Delete use Playwright's real keyboard input path; non-BMP Unicode insertion and
scalar deletion use programmatically dispatched `beforeinput` events.
Composition events are synthetic. Clipboard coverage constructs and dispatches
the browser's real `ClipboardEvent` with a real synchronous `DataTransfer`
capability. These tests do not prove operating-system IME behavior, mobile
virtual keyboards, browser-chrome clipboard permissions, or the async Clipboard
API. One representative Safari/macOS accessibility-tree audit provides
evidence for roles, names, values, and state transitions in that environment
only. VoiceOver
was not enabled. Neither that audit nor the axe checks are a screen-reader,
assistive-technology, mobile-browser, or WCAG conformance claim.

The `0.2.0` matrix additionally runs the actual
`@breditor/reference-highlight` package
in Chromium, Firefox, and WebKit. That path covers Document V2 startup,
Highlight intent/state/toolbar delivery, mixed Strong/Highlight nesting,
undo/redo, export/copy, formatting-stripping paste, persistence flush/reload,
restored history, and disposal. It does not broaden the desktop, synthetic-IME,
clipboard-permission, mobile, or assistive-technology claims above.

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
no supported package-root compatibility promise:

- every export from `@breditor/browser/advanced`, including renderer,
  projection, DOM-selection, command-queue, event, composition, clipboard,
  action-state adapter, and persistence assembly contracts;
- the advanced `BreditorBrowserWasmFactory` descriptive type and any custom or
  bare-factory runtime implementation; alpha.5 no longer accepts such a value
  in the root editor options, and no structural conformance protocol is
  promised for it;
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
  internal size layout, undocumented import paths, and any direct
  `@breditor/reference-highlight/dist/*` import.

In particular, the advanced local-log and storage-generation work is not the
supported IndexedDB Session Checkpoint Profile V1. Exported Rust proof types or
documented experimental bytes do not make those designs a browser durability
contract. Promoting any excluded surface requires an explicit public contract
in a later release; incompatible promotion or redesign uses a new incompatible
application version, a new format version, or a new Wasm ABI as appropriate.
