# Breditor compatibility policy

Status: active for the supported `0.1.x` base and `0.2.x` extension surfaces;
the unpublished `0.3.0-alpha.13` source checkpoint retains the explicitly
selected typed-profile, browser command, Session-V3, and closed safe-Link paths,
uses process-local ABI 5, retains exact current-property observation and
pristine hydration and the multi-extension Showcase profile, and adds the
core-owned Clear Formatting route plus descriptor-compiled declarative
shortcuts and the closed RGB24 text-color presentation, then adds one
exhaustive integer-token/native-select Text Size presentation described below.

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
rejects duplicate identities within each typed namespace and all extension
semantic IDs under `breditor/*`, and creates the existing generic toggle action, a tracked intent,
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

## Historical `0.3.0-alpha.1` and `alpha.2` Rust boundary

Those prereleases added an experimental Rust-only typed inline-format property
contract. It was not yet part of the supported browser package-root surface.
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

The alpha.2 Rust-core checkpoint adds the first property-preserving
mutation boundary. `SetInlineFormatAction` accepts a closed typed set/remove
input and replaces one complete format property map at a caret or across a
same-paragraph selection. `InlineFormatSetSpecV1` can compile one same-manifest
typed format into that action, a typed intent, a priority-0 blocking route, and
an observable presence state. Paragraph-local insert/type-over, selection
deletion, and backward/forward grapheme deletion now use a property-aware
`TextSplice`; exact relocation and undo/redo preserve typed document, selection,
and pending-format values.

Operation, Editor State, Transaction Request, Commit, and Session Checkpoint V3
are separate public Rust codec families selected explicitly by callers. They
retain the selector/fingerprint binding, preserve operation and pending-format
properties, and embed Document V2 rather than introducing Document V3. V1/V2
golden bytes remain unchanged. Their frozen primitive-operation payloads fail
closed for every operation under a typed-contract schema—even an optional-only
contract with an empty property instance—rather than silently projecting it as
property-free. V1 pending-format shapes similarly cannot carry typed instances.
A V2 state or empty-history checkpoint can still carry a property-aware
Document V2 when it contains no typed pending value or operation recipe.

At the alpha.2 checkpoint, preservation remained deliberately incomplete.
`ParagraphSplit`, `ParagraphJoin`, and `RootTextReplace` were not enabled for
typed schemas, so typed paragraph breaks, paragraph-boundary deletion, cross-
paragraph replacement, and structural plain-text insertion failed closed.
Alpha.5 supersedes that operation restriction for the sealed paragraph shape.
There is still no V3 local-log, frame, root, or storage-generation family, and
no automatic codec generation detection, upgrade, downgrade, or mixed nesting.

At alpha.2, Wasm ABI 3 was unchanged. Its bootstrap and browser descriptor could
not declare or expose typed contracts, and the package-root profile path
remained property-free. Typed validation proved only scalar shape and ranges;
URL schemes, CSS safety, and renderer sanitization remained separate contracts.

## `0.3.0-alpha.3` ABI 4 and browser boundary

Alpha.3 adds, without replacing the older paths:

- explicit `BreditorCompiledProfile.fromBootstrapJsonV2()` compilation of
  typed format-property contracts and same-manifest set declarations;
- canonical property contract getters on the profile descriptor and canonical
  scalar property-value getters on semantic projections;
- strict bounded `executeTypedActionJson()` and `executeTypedIntentJson()` Wasm
  commands whose registered contract identity cannot be supplied by JavaScript;
- Rust-atomic `closeHistoryGroupBefore` action, intent, undo, and redo execution,
  with `historyGroupClosedBefore` reporting the effective boundary and any
  command/checkpoint error publishing neither logical result;
- explicit `createEngineFromDocumentJsonV3()` and
  `createEngineFromSessionCheckpointJsonV3()` factories selecting Session,
  Editor State, and Commit V3 around Document V2; and
- browser `{ bootstrapJson, formatVersion: 2 }` startup, complete typed
  descriptor/projection validation, high-level `executeIntentJson()`, and
  defensive Session Checkpoint V3 structural preflight plus IndexedDB
  restore/autosave. Rust decode, aggregate retained-state limits, canonicality,
  and replay remain authoritative for checkpoint acceptance.

Bootstrap V1 retains its compiled-profile Session V2 behavior, and an omitted
profile retains exact-base Session V1. No selector sniffs or retries another
generation. The browser data and programmatic command paths now preserve typed
properties; current DOM recipes, copy HTML, plain-text paste, and native-button
toolbar remain property-insensitive. Safe property-driven DOM recipes and typed
toolbar controls are the next compatibility boundary. See
[`V0_3_SCOPE.md`](V0_3_SCOPE.md).

## `0.3.0-alpha.4` safe-Link boundary

Alpha.4 retains every explicit alpha.3 generation and adds only the
browser-owned `safeLinkV1` attribute policy. It is admitted for an exact two-property
Link descriptor and emits only an inert anchor, canonical HTTP(S) `href`, or
that href plus fixed protected-new-window attributes. Malformed authority,
credentials, non-visible-ASCII or percent-escaped raw authority, unsafe schemes,
controls, whitespace, and over-limit values stay inert. Internationalized host
names use explicit `xn--` ASCII spelling. Composition and copy enforce the same
closed shapes; paste remains plain text. React-owned typed controls use
`executeIntentJson()`, while the supported toolbar remains a no-input button
protocol.

Alpha.4 also corrects property-free toggle capability routing: collapsed and
same-paragraph Bold/extension toggles preserve property-bearing peer formats
through `TextSplice`, including exact property-budget checks. Typed structural
paragraph and cross-paragraph operations remain closed.

## `0.3.0-alpha.5` typed paragraph-structure boundary

Alpha.5 admits complete schema-valid typed format instances through the
existing `ParagraphSplit`, `ParagraphJoin`, and `RootTextReplace` operations.
It preserves their canonical properties in guards, replacements, derived
results, inverses, relocation, undo/redo, and V3 replay. Each complete fragment
slice is checked against aggregate property-value and property-string-byte
limits; a split may duplicate one typed owner and fail a property ceiling,
while an exactly equal join seam may merge owners.

The new paragraph-structure capability still proves only the fixed compiler-
minted document/paragraph/text grammar. The older property-free base-text
capability remains the sentinel for frozen Operation V1/V2 codecs and older
property-free local proofs. A typed operation never enters those payload
generations, even when the particular format instance has an empty map.

The lifted behavior includes typed Enter, multiline plain-text insertion,
cross-paragraph type-over and deletion, paragraph-boundary backward/forward
joins, and cross-paragraph no-input toggles whose target remains property-free.
All preserve unaffected typed peers. `SetInlineFormatAction` remains same-
paragraph only with
`breditor/cross-paragraph-inline-format-unsupported`. Paste continues to
discard source formatting and properties; its plain text may inherit one
complete typed format set from the destination and applies it uniformly to
non-empty inserted lines.

Alpha.5 does not change Wasm ABI 4, Profile Bootstrap V2, schema fingerprint
bytes, Document V2, or the Operation/State/Transaction/Commit/Session V3 format
numbers. Alpha.5 restores conforming alpha.4 Session Checkpoint V3 values.
Downgrade is not generally safe: alpha.4 rejects an alpha.5 V3 checkpoint when
its retained undo or redo history contains a typed structural operation. The
shared envelope number does not authorize an older prerelease to discard or
reinterpret that history.

## `0.3.0-alpha.6` cross-paragraph typed setter

Alpha.6 extends the existing registration-owned `SetInlineFormatAction` across
selected text in multiple direct-root paragraphs. Set replaces the target
format's complete property map on every selected character; remove strips only
that target kind. One guarded, same-paragraph-count `RootTextReplace` preserves
unselected edges, empty middle paragraphs, paragraph boundaries, and all peer
formats. Structural-only ranges are disabled as `breditor/no-selected-text`;
exact set and absent-remove no-ops remain operation-free.

The action globally derives inactive/active/mixed state, while the generated
fixed-remove presence query reports none/all/partial target presence as
inactive/active/mixed. Planning checks operation, format, text leaf and total,
child/node, property-value, and property-string budgets before publication.
Successful plans explicitly rebuild the directional selection and affinities,
clear pending formats, and record one exact history entry. Session Checkpoint
V3 retains the typed root replacement on both history branches and replay-
proves undo/redo without rerunning the action.

Alpha.6 changes no Wasm ABI 4 method, Profile Bootstrap V2 shape, descriptor or
projection shape, schema fingerprint, Document V2 byte contract, or V3 record
number. Alpha.6 restores conforming alpha.5 checkpoints. Alpha.5 also restores
and replays conforming alpha.6 cross-set history because it already implements
the identical property-aware `RootTextReplace` V3 contract.

## `0.3.0-alpha.7` ABI-5 typed-control boundary

Alpha.7 adds one canonical set-surface triple to the compiled-profile
descriptor and exposes its count plus format-kind, intent-ID, and
action-state-ID indexed getters through Wasm ABI 5. The triple is process-local
observation data. It does not change Profile Bootstrap V2, fingerprint bytes,
Document V2, or any Session/State/Commit V3 byte.

The browser manifest union additively gains callback-free
`inlineFormatForm`. A form is admitted only against an exact set-surface triple
and exact required property contract. Its closed fields are URL-presented
bounded strings and Boolean-default-false. Apply remains complete-map
replacement; Remove remains the existing canonical remove request. Existing
button-only manifests retain their meaning, but exhaustive TypeScript switches
over the prerelease declaration union must handle the new discriminant.

The launcher remains a native APG-toolbar button and its interactive nonmodal
form is a sibling. Drafts are not hydrated or persisted. URL presentation does
not grant navigation safety; `safeLinkV1` owns that policy. Same-realm
JavaScript is trusted rather than sandboxed. The normative contract is
[`TYPED_TOOLBAR_CONTROLS.md`](TYPED_TOOLBAR_CONTROLS.md).

## `0.3.0-alpha.8` exact typed-state boundary

Alpha.8 changes each generated property-aware set state from value-free to the
exact independently typed `breditor/set-inline-format-input@1` output contract.
The serialized name and version intentionally match the input contract because
a uniform output is its canonical round-trippable `set` branch. Rust still
models input and output versions with distinct types.

Activation remains input-relative to the fixed Remove query. Value `unset`
means absence; `uniform` means all relevant runs carry the same complete map;
and `mixed` means partial presence or differing complete maps. Therefore active
may pair with uniform or mixed, while activation mixed necessarily has value
mixed. A collapsed selection observes effective pending/context formatting.
This is exact whole-map comparison, not a fieldwise merge protocol.

The browser admits only the descriptor-correlated contract and exact canonical
map. It hydrates pristine fields from uniform state, uses defaults for unset or
mixed, preserves dirty drafts across refresh and rejection, and discards them
on completion or close before hydrating again from authoritative state. Rust
and Wasm preserve URL strings exactly and inertly. The browser form does so for
CR/LF-free single-line strings; a current value containing CR or LF makes the
whole form, including its Remove command, unavailable because native text
controls cannot round-trip it exactly. Programmatic removal remains possible.
Only `safeLinkV1` owns parsing, normalization, and navigation policy.

This process-local observation is not serialized, undoable, replayed, or
persisted, and form drafts remain equally ephemeral. Profile compilation proves
per generated setter that every schema-valid map fits the action-value envelope
and proves the canonical generated-setter catalog's collective worst case fits
the state-batch value-count and text-byte budgets. The first canonical
declaration that crosses a bound is rejected. Alpha.8 adds no Wasm member or
durable field, so ABI 5, Bootstrap V2, fingerprints, Document V2, and Session/
State/Commit V3 remain unchanged.

## `0.3.0-alpha.9` additive Showcase profile

Alpha.9 adds a second, additive package-root reference profile under schema
`example/showcase-editor@1`. It composes the existing Highlight and Link
extensions without changing their identities or existing exported values, then
adds `example/text-styles-extension@1` with independent property-free Emphasis,
Strikethrough, and Code formats. The three new features use the already
compiled generic toggle action, no-input intent, route, state observation,
renderer recipe, and button declaration paths. They add no Rust action kind,
browser command protocol, Wasm member, bootstrap field, or durable record.

The Showcase renderer has complete coverage and fixes total outer-to-inner
format nesting as Link, Strong, Emphasis, Highlight, Strikethrough, then Code.
Its manifest-owned toolbar order is Bold, Italic, Strikethrough, Code,
Highlight, Link, Undo, and Redo. This proves that one compiled profile can
compose several declarative extensions and controls; it is not a runtime plugin
or callback protocol. The schema has its own fingerprint, while Document V2,
Session/State/Commit V3, Profile Bootstrap V2, and Wasm ABI 5 remain unchanged.

The new styles coexist independently: there are no mutual exclusions or
priority rules beyond deterministic renderer nesting. Alpha.9 does not add
extension keyboard shortcuts, clear-format, block code, headings, lists, rich
HTML paste, runtime extension loading, or extension callbacks.

## `0.3.0-alpha.10` clear inline formatting

Alpha.10 adds one base-profile action, no-input intent, priority-zero blocking
binding, and stateless action-state source for clearing the complete inline
`FormatSet`. A same-paragraph range uses one `TextSplice`; a cross-paragraph
range uses one `RootTextReplace`; a formatted collapsed caret installs an
explicitly empty pending set without a content operation. Rust preserves exact
text, paragraph structure, unselected typed properties, selection direction,
endpoint affinities, undo/redo, and Session-V3 replay.

The command is delivered through existing ABI-5 descriptor, action-state, and
intent methods. Browser `formatRemove` and the Showcase button use that same
semantic route. The complete engine state catalog now admits 514 entries; the
toolbar manifest still admits at most 64 presented controls. This is a
monotonic reader-limit increase, not a durable schema or wire change.

Profile Bootstrap V2, schema fingerprints, Document V2, every V3 record, and
Wasm ABI 5 remain unchanged. Clear Formatting is deliberately all-inline: it
has no allowlist, ownership filter, or block-format meaning. Exact undo means
removed property values can remain in retained history/checkpoints, so this is
not a secure-erasure primitive.

## `0.3.0-alpha.11` declarative keyboard shortcuts

Alpha.11 adds the root-exported `createKeyboardShortcutManifest`, its copied and
deeply frozen data types and limits, `DEFAULT_KEYBOARD_SHORTCUT_MANIFEST`, and
the optional high-level `keyboardShortcuts` startup option. This is a browser
presentation contract: it is not added to the Rust extension manifest, Profile
Bootstrap V2, compiled descriptor ABI, schema fingerprint, or any durable
record.

One manifest contains at most 43 unique qualified state IDs, at most four chords
per state, and at most 44 unique chords total. A chord is exactly one physical
`KeyA` through `KeyZ` code with a Boolean Shift value; the host's existing keyboard policy
selects `control` or `meta`. A/C/V/X are reserved with or without Shift. The
core primary+B, primary+Y, primary+Z, and primary+Shift+Z chords can be omitted
but cannot be rebound to a different state. The complete manifest fails on
duplicate state/chord identities, malformed or extra data, accessors, sparse
arrays, or limit overflow.

At startup, each declared state must resolve through the owned compiled-profile
descriptor to either an exact routed no-input intent with the same observable
state contract or a stateless/value-free Undo/Redo direction. Unknown or direct
states, typed intents, mismatched routed-state contracts, and nonstateless or
valued history states fail before editor listeners or toolbar DOM become live.
Omitting the option filters the default
Bold/Undo/Redo declarations to states compatible with the selected profile;
an explicit manifest is exact and receives no implicit merge.

The one compiled table drives both native keyboard lookup and
`aria-keyshortcuts` on matching generated toolbar controls. A disabled shortcut
policy emits no ARIA metadata. Intent auto-repeat is suppressed and uses a
`closeBefore` history boundary; history repeat is supported. Alt/AltGraph, a
secondary primary modifier, punctuation, function keys, sequences, callbacks,
typed-input launchers, and runtime replacement are outside the contract.
Matching uses only exact physical `KeyboardEvent.code` values; generated
`KeyboardEvent.key` text does not select a binding. Codes follow US physical-key
positions, so devices without conforming exact codes may not invoke shortcuts,
and browser/operating-system reservation conflicts remain possible.

The reference package adds
`REFERENCE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST` without changing its schema or
fingerprint. It binds Bold, Italic, Strikethrough, Code, Highlight, Undo, and
Redo; Link and Clear formatting remain unbound. This presentation addition
changes no Rust action, intent, operation, transaction, selection, history,
replay, Wasm ABI 5 member, or persistence format.

## `0.3.0-alpha.12` closed RGB24 text color

Alpha.12 adds one new reference content profile,
`example/color-showcase-editor@1`, with fingerprint
`sha256:b3d051b7a68a15ef8d47ce2a7c4f051a76d09c386f9545f7b955590d2cc7433d`.
It retains the existing Showcase declarations and adds
`example/text-color-extension@1`, typed format `example/text-color@1`, and
sole required integer property `example/rgb24` in `0..=16_777_215`. Generated
action, intent, binding, and state IDs are respectively
`example/set-text-color`, `example/set-text-color-intent`,
`example/set-text-color-binding`, and `example/text-color-presence`.

This semantic feature uses the existing `InlineFormatSetSpecV1`, typed input,
generic Rust action, state-value contract, selection mapping, history, replay,
Wasm, and Session-V3 paths. The browser adds only the exact
`safeTextColorV1` policy and an exact integer/`rgb24` native toolbar field. The
policy is inseparable from literal `example/text-color@1`, one required RGB24
property, and `<span class="breditor-text-color">`; it synthesizes only
lowercase zero-padded `style="color:#rrggbb"`. The toolbar uses native
`<input type="color">` and strict integer/simple-color conversion.

Alpha.12 does not reinterpret any earlier reference fingerprint or durable
record. Profile Bootstrap V2, the fingerprint algorithm, Document V2, every V3
record shape, storage envelopes, and Wasm ABI 5 are unchanged. Exact official
prerelease pairing remains required. Text color is opaque sRGB24 only and is
not arbitrary CSS, alpha/background/gradient support, a theme system, a
contrast guarantee, or rich-paste preservation. CSP, forced-colors, user
styles, and native picker variability remain host/browser concerns. See
[`TEXT_COLOR.md`](TEXT_COLOR.md).

## `0.3.0-alpha.13` exhaustive Text Size presets

Alpha.13 adds another new reference content profile,
`example/size-showcase-editor@1`, with compiler-emitted fingerprint
`sha256:ec554b29919bd84ec013ea2af4d0248e1a3fabdcb1514bb642035871a49189d5`.
It retains every Color Showcase declaration and adds
`example/text-size-extension@1`, typed format `example/text-size@1`, and sole
required integer property `example/text-size-step` in `0..=2`. Generated
action, intent, binding, and state IDs are `example/set-text-size`,
`example/set-text-size-intent`, `example/set-text-size-binding`, and
`example/text-size-presence`.

The semantic behavior again uses the existing generic typed-set, state,
selection, operation, history, replay, Wasm, and Session-V3 paths. The browser
adds `safeIntegerTokenV1`, whose dense contiguous table must exhaust the exact
required integer domain and can emit only one fixed
`data-breditor-integer-token` attribute. Its matching toolbar field is one
native single-select with the exhaustive Small (`0`), Large (`1`), and Huge
(`2`) options; Normal is format removal. The complete profile exposes eight
formats, nine intents, eleven action states, three typed-set surfaces, eight
render recipes, and eleven toolbar controls. Wrapper order is Link, Strong,
Emphasis, Highlight, Strikethrough, Code, Text Size, Text Color.

Alpha.13 does not reinterpret an earlier fingerprint or durable record. It
changes no Rust production contract, Profile Bootstrap V2, fingerprint
algorithm, Document V2, V3 record, storage envelope, generated Wasm member, or
ABI 5 meaning. It does not add arbitrary numeric input, sparse enums, custom
selects, CSS lengths, callbacks, or rich-paste preservation. Host CSS owns the
visible ratios, and Text Size has no shortcut. See
[`TEXT_SIZE_PRESETS.md`](TEXT_SIZE_PRESETS.md).

## Official package pairing

The supported official configuration uses exactly matching versions of
`@breditor/browser` and `@breditor/wasm`. The stable `0.1.0` pair reports Wasm
ABI `2`; every `0.2.x` pair reports ABI `3`; the alpha.4 through alpha.6 source
pairs report ABI `4`; alpha.7 through alpha.13 report ABI `5`. Startup checks both
the exact
ABI string and exact embedded package version
before reading the generated engine factory. ABI compatibility alone never
makes mismatched official package versions a supported pair.

The alpha.13 source configuration is tested as an exactly matching browser,
Wasm, and reference-package set. It has not been published; this is not a
registry-availability claim. The clean consumer gate first packs local
workspace tarballs, then installs those artifacts in an isolated consumer. The
reference package declares
the exact browser version as a peer dependency. Its render, toolbar, and
shortcut manifests are branded by the `@breditor/browser` module instance that
created them, so a duplicate, nested, or mismatched browser copy is not a
compatible replacement. The clean consumer gate proves one peer instance and
imports only the three package roots.

The minimal supported browser bootstrap surface of `@breditor/wasm` is the
package-root default asynchronous initializer called once with no argument in
an HTTP(S) browser or browser bundler that resolves the adjacent generated Wasm
asset, followed by the initialized namespace import containing `BreditorEngine`,
`breditorWasmAbiVersion`, and `breditorVersion`. In other words, this documented
form remains supported throughout `0.1.x`, `0.2.x`, and alpha.7 through
alpha.13:

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
for tests and advanced hosts. `0.2.0-alpha.5` removed that option arm: the supported
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

The alpha.3 source gates additionally cover strict Bootstrap V2 admission,
descriptor and projection property values, typed JSON action/intent rejection
and success, explicit V3 fresh/restore factories, browser V3 structural
preflight, Rust-owned restore/replay, IndexedDB/autosave correlation, and high-
level `executeIntentJson()`. They do not yet claim a property-driven Link
renderer or typed toolbar control, and no alpha.3 registry package has been
published.

The alpha.4 gates additionally cover exact safe-Link descriptor correlation,
safe/inert rendering, DOM drift, bounded composition attributes, copy HTML,
typed set/remove/undo/redo, Session-V3 reload, and a tarball-only combined
Highlight + Link consumer in Chromium. These are still source-checkpoint tests,
not a registry-publication claim.

The alpha.5 Rust gates additionally cover typed-property split/join/root-
replacement validation, source/result aggregate property budgets, exact
inverses, every lifted built-in action route, and V3 replay in both history
directions. The React demo gate exercises one existing safe Link plus Highlight
through Enter, multiline plain-text paste, boundary Backspace, undo, autosave
reload with the redo branch intact, and restored redo. It remains desktop
Chromium automation and does not widen the OS-clipboard, IME, mobile, or
assistive-technology claims.

The alpha.6 Rust gates additionally cover forward/backward multi-paragraph set
and remove, exact peer and edge preservation, structural-only and no-op cases,
operation/format/text/tree/property limits, directional selection rebuilding,
linear undo/redo branching, V3 restoration at both history cursors, and the
generated all/partial/absent presence state. The existing browser typed-intent
and demo route exercises the behavior without a new ABI or control protocol.

The alpha.11 browser gates additionally exercise the package-owned Showcase
shortcut manifest in Chromium, Firefox, and WebKit. They correlate exact
`aria-keyshortcuts` with the active Control policy and execute Bold, Italic,
Strikethrough, Code, Highlight, Undo, and both Redo aliases through genuine
Playwright keyboard events. Unit and owner tests cover manifest bounds and
canonicalization, descriptor mismatch, modifier/repeat policy, exact physical-
code matching independent of generated `key` text, disabled-policy ARIA
omission, forged-value rejection, and ARIA drift detection at guarded toolbar
interactions and explicit canonical-DOM validation. No mutation observer faults
or repairs that drift immediately. This remains desktop-browser evidence, not a
mobile, arbitrary-layout, OS-IME, screen-reader, or WCAG claim.

The alpha.12 gates additionally exercise the separate Color Showcase profile,
exact RGB24 descriptor and fingerprint, policy-derived canonical style, native
color field hydration and dispatch, ten-control toolbar, seven-wrapper order,
copy/paste policy, undo/redo, and Session-V3 reload. Hostile descriptors,
values, manifests, and noncanonical CSS spelling fail closed. These checks do
not guarantee native picker UX, contrast, CSP visibility, forced-colors
behavior, mobile, or assistive-technology conformance.

The alpha.13 gates additionally exercise the separate Size Showcase profile,
its exact integer descriptor and fingerprint, exhaustive token renderer,
native select hydration and dispatch, eleven-control toolbar, eight-wrapper
order, shared DOM/composition/clipboard inverse admission, one-step undo/redo,
and Session-V3 reload. Hostile descriptors, option/token graphs, values,
manifests, and noncanonical DOM fail closed. These checks do not guarantee
screen-reader announcements, custom-select UX, identical host typography,
mobile behavior, or assistive-technology conformance.

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
  V2 generations and the property-preserving Rust-only V3 operation/state/
  transaction/commit/session generations;
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
