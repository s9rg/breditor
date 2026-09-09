# `@breditor/browser`

`@breditor/browser` is Breditor's framework-neutral browser editing layer.
ProseMirror, Lexical, Tiptap, and CKEditor are examples only; none of their AST,
position, command, plugin, or wire protocols is adopted here.
Version `0.1.0` freezes the supported high-level `BreditorBrowserEditor` owner
and its explicit, snapshot-correlated Document V1 and plain-text egress. The
owner boots the generated
Rust/Wasm engine, renders a validated AST projection into disposable DOM,
maps one directional selection, serializes ordinary browser intent, and owns a
strict paragraph-local composition lease plus guarded copy/cut/paste without
making the DOM or clipboard HTML an editor model. It also consumes guarded
action-state snapshots, queue-routes real document selection changes, and
renders an extensible accessible toolbar without making display state an
execution capability. It also restores and atomically autosaves complete Rust
session checkpoints through a strict slot-bound IndexedDB profile.

The owner installs the unified native-event router, action-state refresh,
optional declarative toolbar, and optional atomic IndexedDB autosave as one
all-or-nothing lifetime. A React Strict Mode reference lives in the repository's
`examples/react` workspace, but the product API remains framework-neutral.

The package root is the supported ESM entry point for the `0.1.x` base, the
`0.2.0` extension surface, and the alpha.3 typed-profile source checkpoint.
Clean npm tarballs are install-, import-, type-check-, production-bundle-, and
real-browser tested without workspace links.
Declaration maps are intentionally omitted because the corresponding
TypeScript sources are not part of the package.

The `0.2.0` implementation requires Wasm ABI 3 and an exact matching Wasm
package version before it reads the generated engine factory.
Bootstrap owns
and validates the compiled-profile generation and descriptor and checks every
observation, projection, selection, action-state, and command result against
that opaque generation. The browser can now open a compiled semantic profile,
consume Document/Session Checkpoint V2, project every admitted property-free
format, compile a callback-free render manifest, preserve those formats through
DOM selection and composition reconciliation, copy them semantically, and bind
autosave to the exact schema fingerprint. Paste remains intentionally
plain-text. Alpha.7 adds the supported synchronous no-input `executeIntent()`
API and sends `formatBold`, primary-modifier+B, and the default Bold button
through the built-in `breditor/format-strong` route. Supported toolbar controls
must exactly match descriptor-declared no-input intent/routed-state or history
contracts; direct action controls remain an advanced low-level bypass. Every
action-state snapshot is checked against the descriptor's fixed catalog before
publication.
Alpha.8 adds the separately packaged callback-free
`@breditor/reference-highlight` profile and proves its complete supported-root
path in clean tarball and Chromium/Firefox/WebKit consumers. The former bare-
factory and standalone restore seams are not accepted by the supported root
API. `0.2.0` carries the audited RC.1 surface without feature widening.

The unpublished `0.3.0-alpha.3` source package requires Wasm ABI 4 and adds an
explicit typed-profile path. Profile Bootstrap V2, compiled property
descriptors, property-bearing semantic projections, strict typed intent JSON,
and Session Checkpoint V3 IndexedDB/autosave now cross the supported browser
owner. Existing exact-base V1 and Bootstrap-V1 profile V2 paths remain
separately selected. Rendering and toolbar presentation are still narrower:
the safe wrapper recipe cannot derive DOM attributes from property values, and
the native-button toolbar cannot collect typed input. A requested close-before
history boundary and its action, intent, undo, or redo are admitted as one Rust
checkpoint publication rather than separate browser-issued mutations.

Lower-level renderer,
queue, adapter, selection, clipboard, toolbar, and persistence contracts are
available from the explicit `@breditor/browser/advanced` entry point, which is
experimental and outside the supported application compatibility promise. The
package root and documented V1 base forms remain supported; `0.2.0` adds the
exact compiled-profile V2 forms described above, not the advanced internals.

## Public runtime

This repository does not publish packages automatically. After a maintainer
publishes the release, install the matching registry packages with:

```sh
npm install @breditor/browser@0.3.0-alpha.3 @breditor/wasm@0.3.0-alpha.3
```

Initialize the matching `@breditor/wasm` package once, then pass connected,
empty editor and optional toolbar mounts to `openBreditorBrowserEditor`:

```ts
import { openBreditorBrowserEditor } from "@breditor/browser";
import initializeWasm, * as breditorWasm from "@breditor/wasm";

await initializeWasm();

const EMPTY_DOCUMENT_JSON = JSON.stringify({
  format: "breditor/document",
  formatVersion: 1,
  schema: { name: "breditor/base", version: 1 },
  root: {
    kind: "element",
    type: "breditor/document",
    entityId: null,
    properties: {},
    children: [{
      kind: "element",
      type: "breditor/paragraph",
      entityId: null,
      properties: {},
      children: [],
    }],
  },
});

const result = await openBreditorBrowserEditor({
  host: document.querySelector("#editor") as HTMLElement,
  label: "Notes",
  wasm: breditorWasm,
  initialDocument: {
    lineageId: "notes-main",
    documentJson: EMPTY_DOCUMENT_JSON,
    historyCapacity: 100,
  },
  keyboard: {
    editing: "beforeinputPrimary",
    primaryModifier: "control",
    shortcuts: "enabled",
  },
  toolbar: { host: document.querySelector("#toolbar") as HTMLElement },
  persistence: {
    indexedDB: window.indexedDB,
    crypto: window.crypto.subtle,
  },
});

if (!result.ok) throw new Error(result.error.message);
const editor = result.editor;
```

The legacy semantic-profile path adds `semanticProfile: { bootstrapJson }`, a
matching Document/Session Checkpoint V2, and an owned `rendering` value from
`createInlineFormatRenderManifest`. The typed path is explicitly
`semanticProfile: { bootstrapJson, formatVersion: 2 }`; it uses Profile
Bootstrap V2, Document V2, and Session Checkpoint V3. Omitting the semantic
profile retains exact-base V1. No form sniffs or falls back to another
generation. Rendering must cover every admitted format; current recipes contain
only a safe element, checked classes, and explicit ordering edges.

The supported `0.2.0` configuration passes the initialized, exactly
version-matched official module namespace as shown above. The root option does
not admit a bare structural factory. Lower-level structural factory types exist
only on the experimental advanced surface for adapter testing and host-side
integration; custom factory implementations and their generated handle
protocol are not a supported compatibility surface.

The editor's accessible `label` is retained verbatim and must be well-formed
UTF-16 containing at least one non-whitespace character and 1 through 256
UTF-16 code units. `MAX_BROWSER_EDITOR_LABEL_UTF16` exposes that ceiling. One
editor retains at most 64 distinct subscriber functions, exposed as
`MAX_BROWSER_EDITOR_SUBSCRIBERS`.

`initialDocument.lineageId` is 1 through 128 ASCII characters, starts with a
letter or digit, and then permits letters, digits, `.`, `_`, `:`, and `-`.
`historyCapacity` is a safe integer from 0 through 100, whose ceiling is exposed
as `MAX_WASM_BOOTSTRAP_HISTORY_CAPACITY`. Without `semanticProfile`,
`documentJson` must be a conforming exact-base `breditor/document@1` value.
With `semanticProfile`, it must be a fingerprint-matching
`breditor/document@2` value. A valid stored checkpoint at the selected slot
takes precedence over all three fresh-document fields.

The default semantic-profile persistence slot is the schema fingerprint, not
the document lineage. Same-schema documents therefore share that slot; give
each document an explicit `{ kind: "slot", name }` when they must coexist.

The keyboard policy is explicit and platform-independent.
`beforeinputPrimary` leaves Backspace, Delete, and Enter to `beforeinput`, while
`structuralFallback` may translate those three keys at `keydown`; text is never
derived from `keydown`. `primaryModifier` chooses `control` or `meta` for
shortcuts, and `shortcuts` enables or disables Breditor's shortcut translation.
When shortcuts are enabled, primary-modifier+B and native `beforeinput`
`formatBold` both invoke `breditor/format-strong`; neither hard-codes the
concrete strong action at the supported browser boundary.

The editing host is a connected, empty HTML `article`, `aside`, `div`, `footer`,
`header`, `main`, `nav`, or `section`. The distinct toolbar host uses the same
tag allowlist, has no `tabindex`, and is outside an effective editable region.
Its optional case-insensitive role tokens are limited to
`banner`, `complementary`, `contentinfo`, `form`, `generic`, `group`, `main`,
`navigation`, `none`, `presentation`, `region`, or `search` (an empty role is
also accepted). Both remain application-owned mounts with no framework-rendered
children during the editor lifetime. `spellcheck` defaults to `true`. A custom
`scheduleTask` must enqueue its callback for a later task and return `void`;
calling it inline is invalid. An optional `AbortSignal` cancels startup only and
does not dispose an editor that has already opened.

Four root-owned styling hooks are stable in `0.1.x`. The application editing
host carries `data-breditor-editor-root=""` for the successful owner lifetime,
including a faulted phase, until disposal. The runtime appends one
owned `<div data-breditor-toolbar-root="">` to the optional toolbar host. Each
generated button carries `data-breditor-state-id` equal to its declaration's
exact `stateId`, and carries `data-breditor-group` with the exact declared value
only when `group` is present. Manifest order is preserved, but no other DOM
topology or generated class name is promised. Disposal removes the owned
toolbar root and restores the editing-host attributes installed by the owner.

The Rust AST, selection, action state, history, and checkpoint remain
authoritative. The editor exposes immutable status snapshots, bounded
subscription, focus, synchronous no-input and typed-JSON semantic-intent
execution, explicit content export, persistence flush/retry, and idempotent
disposal; it does not expose its engine, queue, observation, renderer, or
delivery tokens.
`initialDocument` is ignored when a valid stored session checkpoint exists.
Call and await `flushPersistence()` before controlled navigation when saving
matters, then call `dispose()`; disposal itself does not promise a save.

The supported imperative command boundary is deliberately semantic and
synchronous:

```ts
const outcome = editor.executeIntent("breditor/format-strong");
if (outcome.status === "blocked") {
  console.log(outcome.reasonCode, outcome.activation);
}
```

`executeIntent()` accepts only an exact declared no-input intent from the
editor's compiled profile. Invalid and unknown IDs, typed-input declarations,
and non-live editors return a frozen `rejected` result; malformed or over-limit
input is redacted to `intentId: ""`. Delivery acquires an
immediate idle-queue lease: another command, authoritative read, reentrant
call, or active composition returns `busy` instead of queuing work behind a
base that may become stale. The lease is released before the call returns.
Committed, blocked, and unhandled results always carry the authoritative
document snapshot at settlement; a blocked result also carries the stable
reason code and activation. Concrete action/binding identities and routing
fallthroughs are intentionally redacted from this package-root API and remain
visible only in the advanced adapter outcome. The historical Alpha.7 path did
not provide typed public intent input.

Alpha.3 adds `executeIntentJson(intentId, inputJson)` for a descriptor-declared
typed intent. The browser validates the qualified identity and bounded JSON
transport, preserves the exact JSON bytes for Rust's duplicate-aware strict
decoder, and rejects a no-input descriptor. It uses the same immediate lease,
selection preservation, correlated result, and public provenance redaction as
`executeIntent()`. Malformed or contract-invalid JSON rejected deterministically
by Rust returns `{ status: "rejected", reason: "invalidInput" }` without
faulting or disposing the editor. A requested history-group close and the intent
run on one private Rust candidate and publish together only after final
checkpoint admission. Rejection therefore leaves undo grouping unchanged with
one intent preparation. There remains no asynchronous intent API.

Content leaves the editor only through the synchronous, discriminated API:

```ts
const exported = editor.exportContent("documentJson");
if (exported.ok) {
  sendToServer(exported.value, exported.snapshot);
}
```

`documentJson` is the exact canonical, lossless Rust encoding selected at
bootstrap: Document V1 for the legacy exact-base path or fingerprint-bearing
Document V2 for a semantic profile. The browser independently checks the
selected version, schema binding, complete format/property catalog, AST
contents, and current property-bearing projection before returning it.
`plainText` traverses the
owned semantic projection, joins paragraphs with one LF, preserves empty
paragraphs, strips every inline format, and adds no trailing LF after the final
paragraph. Both successes are deeply frozen
`{ ok: true, format, value, utf8Bytes, snapshot }` records. Export never adds
content to `getSnapshot()`, reads mutable DOM text, or exposes an editor state,
checkpoint, history, HTML, or raw-command API.

Composition, command delivery, checkpoint/action reads, and another content
read return the stable `content_export.busy` result. Disposed editors and an
internally faulted adapter return `content_export.unavailable`. A faulted
high-level owner may still export an already validated Rust document when its
adapter remains trustworthy in `live` or `reconcile` state. Neither Document
generation carries a snapshot field of its own: the boundary passes the exact
observation to Rust, compares the returned document semantics to the current
profile-bound projection, and rechecks the adapter snapshot before returning
bytes.
High-level core rejections are deliberately collapsed to the fixed,
payload-free `content_export.core_rejected` error. Applications needing the
official granular Rust code must call the generated low-level Wasm API directly
and assume responsibility for its handles and lifecycle.

## Boundary

The Rust/Wasm adapter supplies a flattened, typed semantic projection. The
browser package consumes that view into a branded, deeply frozen
`BaseDocumentProjection`; it never parses document, editor-state, or commit
JSON. A profile-aware projection is privately bound to the exact owned
compiled-profile descriptor and opaque live generation that admitted it. The
adapter is structural and has no import-time dependency on generated Wasm
classes. Consumed Wasm projection and update handles are deterministically freed
on success and failure.

The accepted semantic shape is deliberately closed:

- either exact `breditor/base@1` or the selector and fingerprint from the
  compiled semantic profile;
- one or more direct-root `breditor/paragraph` elements;
- non-empty text leaves with canonical lexical sets of zero through 32
  descriptor-admitted formats and canonical scalar property entries; and
- exact snapshot identity with a portable lineage and canonical decimal `u64`
  revision.

Projection construction rechecks the sealed base-text shape, descriptor/schema
binding, format membership and order, property names/types/bounds, canonical
adjacent-run law, Unicode scalar validity, and the Rust default node/text and
property limits. It clones and freezes all accepted arrays and records.
`formatDetails` retains ordered Boolean, integer, and string values. Formats are
AST semantics; wrapper tags and classes are browser presentation and never
enter the projection.

## DOM contract

`BreditorDomRenderer` receives an application-owned HTML host. Below that host
it creates only:

- one `<p>` for each direct-root paragraph;
- zero or more exactly ordered recipe wrappers around a formatted text leaf;
- one `<br>` placeholder inside an empty paragraph; and
- DOM text nodes created with `createTextNode`.

A compiled presentation requires exactly one recipe for every descriptor format
and rejects missing, extra, cyclic, self-referential, duplicate-signature, or
generation-mismatched input. Each wrapper is one inert element from `code`,
`em`, `mark`, `s`, `span`, `strong`, `sub`, `sup`, or `u`, with only its exact
canonical class-token set. `before` and `after` edges determine
outer-to-inner nesting; unconstrained ties use lexical format identity, never
extension installation or object iteration order. The renderer preflights the
complete DOM amplification bound before mutating the host.

The renderer never calls `innerHTML`, installs untrusted markup, or stores AST
paths in `data-*` attributes. It does not modify the host's own attributes.
Host, paragraph, and text nodes are the exact AST-backed mappings. Formatting
wrappers and empty-paragraph placeholders are projection artifacts and are not
reported as AST nodes. Wrapper tag, class, order, arity, or unknown-node drift
invalidates the canonical DOM just like text or paragraph drift.

Each successful render returns an opaque `RenderedProjection` with a renderer
generation and two private indexes: `WeakMap<Node, AstPath>` for DOM-to-AST
lookups and `Map<AstPathKey, Node>` for AST-to-DOM lookups. Paths are meaningful
only for that handle's exact snapshot. A handle returns `null` after another
renderer generation owns the host, after `release`, or after a mutation observer
detects out-of-band projection changes.

## Incremental invalidation

`BaseProjectionUpdate.create` accepts branded base/result projections only. It
requires the same lineage and the exact non-overflowing `u64` successor
revision. It then verifies the claimed semantic impact before the renderer can
reuse any DOM:

- `none` proves every paragraph equal and advances the generation without
  replacing its DOM;
- `textContainers` proves every unnamed paragraph equal, retains every
  paragraph `<p>` identity, and refreshes only the named paragraphs' contents;
- `rootSplice` proves exact unchanged prefix and suffix ranges, retains those
  paragraph elements, and rebinds shifted suffix paths; and
- `root`, `multipleOperations`, and `untrusted` deliberately perform a full
  safe projection.

A false narrow-impact claim is rejected before mutation. If a paragraph marked
for retention no longer has the exact DOM shape previously rendered, the
renderer discards the fast path and installs a full projection. This makes the
incremental hints an optimization, never a correctness requirement.

## Post-publication recovery

The semantic projection view is intentionally separate from bounded JSON
encoding. After Rust has published a command, an oversized state/checkpoint
JSON result must not leave the browser unable to render that state. The adapter
must request the result's typed semantic projection directly. If an incremental
update is missing, consumed, malformed, or conservatively classified, the host
can obtain a complete typed projection and call `render`.

## Selection contract

`BaseRangeSelection` owns a deeply frozen anchor/focus pair tied to one exact
`BaseDocumentProjection`. Text offsets are UTF-16 code units shared with DOM
Range and Rust points, but a boundary inside a surrogate pair is rejected.
Children points address only paragraph boundaries. Direction is derived without
sorting the stored endpoints, and before/after affinity remains explicit even
though DOM has no native affinity field.

`consumeSemanticSelection` consumes and frees the one-shot Wasm view, verifies
its snapshot, preorder node kinds/indexes, offsets, affinities, and duplicated
range order, then produces a branded browser selection or explicit semantic
absence. `semanticRangeSelectionScalars` performs the inverse path-to-preorder
conversion for the guarded Wasm set command. The adapter has no import-time
dependency on generated Wasm classes.

`BreditorDomSelectionBridge` synchronously validates the complete canonical DOM
before every read and write. It maps exact text and paragraph nodes, normalizes
canonical recipe-wrapper boundaries plus empty `<br>` artifacts, and maps only
the host's two exterior select-all boundaries. A wrapper offset normalizes
through its sole-child chain to semantic text start or end; wrappers receive no
AST path. Direction and the fixed affinity policy remain explicit.

A programmatic write records one renderer-generation-bound spatial signature;
exactly one matching `selectionchange` echo can reuse the original semantic
affinities. Focus is observed separately. The bridge never calls `focus()` or
`blur()`, and clearing semantic selection does not erase a DOM selection wholly
outside this host.

## Event and command contract

`BreditorBrowserEventController` snapshots `beforeinput`, `keydown`, and `input`
fields synchronously. It accepts only events owned by
the exact connected light-DOM host, maps the current DOM selection through the
same bridge used by the command adapter, normalizes at most one target range,
and discards every native object before queue admission.

Controller construction also requires the opaque `deliveryAuthority` exposed
by that adapter. The package exports `EditorDeliveryToken` only as an opaque
type, not as a constructible value. Foreign, stale, forged, or spent tokens are
rejected before cancellation and cannot consume keyboard or clipboard receipts.

The recognized non-composition set covers text and multiline text insertion,
paragraph insertion, backward/forward/selection deletion, strong formatting
through `breditor/format-strong`, undo, and redo. Unknown edit intents are
blocked instead of approximated.
Keyboard input never supplies text; an explicit host policy selects
`beforeinput`-primary behavior or the narrow Backspace/Delete/Enter fallback.
AltGraph, dead keys, key code 229, and active composition are delegated to the
separate composition controller.

`BreditorCommandQueue` is a bounded synchronous, non-recursive FIFO. Reentrant
delivery appends. An executor or observer throw permanently quarantines the
queue because the head may already have published; no item is retried.
Generation-bound one-use receipts suppress matching keydown and clipboard event
echoes, while `input` is only a postcondition and never executes a second
command. A composition can reserve a completely idle queue for one
never-queued settlement. Ordinary event, toolbar, API, observer, and reentrant
submissions reject while the exact lease remains active.
The package-root `executeIntent()` and `executeIntentJson()` methods use a
separate immediate queue lease: they succeed only when the queue and adapter can
complete the full request synchronously now. They never append behind an active
delivery, and a reentrant call observes `busy` rather than recursive execution.

`BreditorWasmCommandAdapter` owns the exact observation, browser projection,
renderer handle, selection bridge, and private one-use delivery epoch. One
engine request synchronizes its already captured semantic selection, then
passes its optional close-before requirement into one action, intent, undo, or
redo call. Rust runs the boundary and command on one private checkpointed
candidate and publishes both or neither; the result reports an effective
boundary through `historyGroupClosedBefore`. The adapter validates the exact
successor and projection update, updates the DOM, restores the resulting core
selection, and frees all generated handles before returning a handle-free
outcome. A valid semantic successor whose DOM publication fails is retained for
explicit full-render recovery; malformed or stale results fault the adapter.
Generated cleanup methods are captured with their original receivers before
any other untrusted handle property is inspected, so later getter-driven
mutation cannot redirect or suppress cleanup. The adapter does not own the
generated engine; its enclosing runtime must free that engine after disposing
the adapter.

## Composition contract

`BreditorCompositionController` owns one native IME interval independently of
the ordinary event controller. It requires a queue constructed with the exact
stable `adapter.commandExecutor`; a forwarding wrapper is rejected. At start it
captures one canonical light-DOM range, reserves the idle queue, and moves the
adapter into an exact session/selection/render-bound composition state. Normal
delivery tokens and direct adapter execution are unavailable until settlement
or recovery closes that state.

The first composition `beforeinput` maps exactly one target range while the DOM
is still canonical. It may refine the captured range once, requires both
endpoints in one paragraph, and only then opens renderer-owned native DOM
mutation. The old render becomes non-current and its mappings are unavailable,
but the renderer retains the opaque ownership needed to restore it. Native
events, target-range objects, DOM `Selection` objects, and event-derived DOM
nodes do not enter the state machine or queue.

The controller accepts explicit start, update-before-beforeinput, implicit
start from composition `beforeinput`, reconversion deletion, and terminal
composition event/input orders. Standard composition input types are joined by
three bounded active-composition aliases: `insertText`,
`deleteContentBackward`, and `deleteContentForward`. These aliases do not claim
general mobile-browser support.

Settlement is scheduled after the native event task. A custom scheduler must
synchronously enqueue and return `void`, but must not invoke the callback
inline; commands themselves remain synchronous. Reconciliation accepts one
target paragraph which is empty, contains only text and exact known recipe
wrappers in canonical nesting, or uses one sole empty `<br>` placeholder, while
every other paragraph and all outside text must still match the projection.
Unknown tags, classes, attributes, wrapper order, or branching fail closed.
Temporary wrappers are stripped to replacement text and never become AST state.

The adapter full-renders the authoritative base and restores the captured
selection before one leased Rust submission. Insert and delete use
`closeBefore`; cancellation explicitly closes the history group too. Strict
settlement requires the exact token and renderer lease. If that proof is lost,
deferred exact-token recovery discards native DOM and restores the retained
authoritative projection without calling Rust. Recovery failure keeps both the
controller and queue quarantined. A successful settlement may suppress one
exact late terminal `input` echo.

## Clipboard contract

`BreditorClipboardController` independently owns synchronous copy, cut, paste,
and their exact optional event echoes. It reserves the queue built from the
exact adapter executor before reading an event, clipboard capability, or DOM
selection. Copy slices the semantic projection, never DOM markup. Cut writes
both `text/plain` and escaped HTML using the compiled recipe wrappers, confirms
native cancellation, and only then submits one selection deletion. Paste gives
advertised plain text precedence; HTML is considered only when plain is absent,
then must exactly match the active recipe allowlist. It is always flattened for
one atomic plain-text insertion, so source formatting never enters the AST;
the existing target pending/context-format rules still apply.

The controller never retains an event, `DataTransfer`, clipboard payload, or
generated handle. A command failure is never retried, and clipboard/core work
cannot be rolled back as one transaction. `BreditorBrowserEditor` installs the
unified router which gives composition first refusal, then clipboard, then
ordinary input. Advanced integrations assembling the lower-level controllers
must preserve that exact precedence and route clipboard-shaped
`beforeinput`/`input` only to the clipboard controller; the ordinary controller
reports `clipboardOwns` for those input types. Clipboard limits and failure
semantics are summarized here so the packed package does not depend on a
repository-only documentation link.

Copy/cut output is bounded to 8 MiB plus 9,999 UTF-16 code units and the same
UTF-8-byte count for plain text, and to 64 MiB in both measures for escaped
HTML plus 200,000 emitted wrappers. Atomic plain-text paste accepts at most
65,536 UTF-16 code units and 65,536 UTF-8 bytes. HTML-only paste accepts at
most 2 MiB of source in each measure, then inspects at most 65,536 repaired
nodes, 10,000 paragraphs, and either legacy depth 3 or profile depth 34 before
producing the same 65,536-unit/byte plain-text result limit. Consequently a
successful large copy is not guaranteed to fit one paste.
Advertised `text/plain` always wins and a malformed, empty, throwing, or
oversized preferred value fails closed without HTML fallback. Ill-formed
Unicode fails closed. Because the operation publishes a paired HTML form,
U+0000, U+0001–U+0008, U+000B, U+000E–U+001F, U+007F–U+009F,
U+FDD0–U+FDEF, and every plane's U+nFFFE/U+nFFFF also reject the complete
copy/cut operation: safe HTML-tokenizer representation of those controls and
noncharacters cannot be guaranteed. Unsupported markup, attributes,
namespaces, structure, or resource use likewise fails closed; no clipboard
payload is included in a public error.

This low-level wiring is host-trusted: the controller structurally snapshots an
adapter-compatible JavaScript surface, and its lease excludes only submissions
through the shared queue. Forging or mutating that surface, or calling the
adapter directly during a clipboard callback, violates the integration
contract. A direct state change is detected at the next guarded base check but
cannot undo an already completed clipboard side effect. The package-root
high-level runtime encapsulates these pieces for ordinary consumers.

## Action state and toolbar

The observation-owning command adapter exposes a handle-free action-state read
port. It consumes and frees the generated result, complete snapshot, nested
value results, and cloned errors internally, while protecting the adapter's
live observation from aliasing. Before publication, Alpha.7 requires the
complete snapshot to match the owned compiled-profile descriptor's action-state
count, ordered lexical IDs, activation contracts, and value contracts exactly.
An unsupported value is accepted only for a descriptor entry with no value
contract; supported values must repeat the exact name and version. Missing,
extra, substituted, reordered, duplicate, or contract-drifted catalogs fail
closed. `BreditorActionStateStore` publishes only
validated complete snapshots, keeps the last good value on failure, and offers
synchronous ordered subscriptions suitable for a command-queue observer. Each
store compares complete snapshots locally; the engine-global full/delta/cache-hit
relation is never mistaken for an individual consumer's baseline.

`BreditorToolbar` is driven by a bounded immutable presentation manifest. The
default manifest contains Bold, Undo, and Redo, but visible order, labels, and
optional grouping keys are browser-owned. `createToolbarManifest` accepts a
dense array of 1 through 64 own data controls. Toolbar/control labels are valid
Unicode with non-whitespace content, no ASCII controls or DEL, at most 128
UTF-16 code units, and at most 512 UTF-8 bytes. Unique state, intent, and action IDs
are at most 128 lowercase ASCII characters in `namespace/local-name` form.
Optional groups are valid Unicode, trimmed, nonempty, control-free, and at most
64 UTF-16 code units / 256 UTF-8 bytes. Nonempty string inputs are valid Unicode
and at most 65,536 UTF-16 code units / 65,536 UTF-8 bytes. The package root
exports these bounds. Accessors and inherited fields are not executed. Shortcut descriptions
remain out of the `0.1.0` schema until the runtime can register and verify the
behavior they advertise.

The toolbar creates one isolated owned root inside a validated non-interactive
mount. Native buttons expose only fresh availability and pressed/mixed state,
implement roving focus, restore the exact keyboard button after synchronous
delivery, and submit declarative `selection: "preserve"` invocations. Dispatch
accepts only a minted synchronous outcome. The runtime converts invocations
with `toolbarCommandRequest` and sends them through the same queue; Rust
revalidates every command against the current observation. The complete
manifest contract is documented in `docs/TOOLBAR.md` in the repository.

A custom manifest does not register behavior. In the supported Alpha.7 editor,
startup accepts an intent button only when its state ID names a descriptor
entry routed from the same declared no-input intent, its tracked/stateless
activation matches, and neither contract exposes a value. History buttons must
name the descriptor's exact Undo or Redo source. A mismatch fails startup
before a toolbar becomes live. The same manifest parser still understands
concrete action commands for the advanced low-level toolbar, but the high-level
runtime rejects those controls as policy bypasses.

## Session checkpoint persistence

`IndexedDbSessionCheckpointStore` owns one exact database and one selected
slot. Omitted binding preserves the legacy outer-V1 `"current"` record; an
explicit binding uses an outer-V2 record carrying the slot, schema fingerprint,
and explicit checkpoint generation. Bootstrap V1 selects Checkpoint V2;
Bootstrap V2 selects Checkpoint V3. Fingerprint-derived and caller-named slots can
coexist. A load returns absence or a digest-verified checkpoint plus an opaque,
store/slot/binding-bound compare-and-swap token. A save computes
the UTF-8 byte count and SHA-256 before opening its transaction, rechecks the
complete prior record inside one `readwrite` transaction, installs one whole
replacement, and reports success only from transaction completion. Conflicts,
binding mismatch, corruption, quota, schema/version mismatch, connection loss,
generation exhaustion, and digest failure remain distinct payload-redacted
outcomes. Mismatch never deletes, repairs, falls back, or overwrites evidence.

`bootstrapWasmEngine` strictly consumes the generated construction result for
fresh/restored exact-base V1, Bootstrap-V1 profile V2, or Bootstrap-V2 profile
V3 input. With a semantic profile and persistence, the owner first compiles and
releases the profile to select its durable fingerprint and complete property
catalog before the async load, recompiles it for the live engine, and requires
both descriptors to match before restore and autosave. This deliberate double
compilation avoids retaining generated authority across IndexedDB at a bounded
startup cost. Browser checkpoint preflight validates bounded wire structure and
binding but neither replays history nor exactly reproduces the Rust codec's
aggregate retained-state accounting. The selected Rust restore factory remains
authoritative for complete decode, resource limits, canonicality, and replay;
a browser-admissible checkpoint can still fail closed there.
`BreditorSessionCheckpointAutosave` coalesces adopted core commits behind a
250 ms trailing delay and, while capture is available, starts an attempt within
2 s of continuous changes. Composition or another exclusive adapter lease can
defer capture beyond that scheduling bound without a busy loop. The coordinator
keeps at most one save active, retains exact flush epochs, and pauses on every
failure until explicit retry. One coordinator retains at most 1,024 concurrent
`flushPersistence()`/`retryPersistence()` waiters; another call while that
capacity is occupied resolves as `{ status: "rejected", reason: "capacity" }`.
`MAX_SESSION_CHECKPOINT_AUTOSAVE_FLUSH_WAITERS` exposes the exact ceiling.
High-level `persistence.autosave.delayMs` and `maxLatencyMs` accept safe integer
milliseconds from 0 through 60,000 inclusive, require maximum latency to be at
least the delay, and default to 250 and 2,000. These defaults and the maximum
are root-exported constants. An optional scheduler supplies synchronous
`now`, `schedule`, and `cancel` methods. `now()` must return a finite,
nonnegative number; a clock regression is clamped to the last observed value.
`now` and `schedule` must not throw or return thenables, and `schedule` must not
fire its callback synchronously or reenter autosave while scheduling. Those
violations pause persistence. A `cancel` throw or returned thenable is contained
after logical timer invalidation and does not become a persistence failure.
Its bounded `observeStatus()` feed delivers coalesced immutable lifecycle
snapshots on microtasks, contains listener failure, and preserves a stable
payload-free storage `causeCode` so applications can surface quota, conflict,
or connection loss instead of silently stopping autosave.
Wire it to the adapter's authoritative commit feed, not to queue completion:

```ts
const autosave = new BreditorSessionCheckpointAutosave(
  adapter.sessionCheckpointReadPort,
  checkpointStore,
  loaded.token,
);
const stopObserving = adapter.observeCoreCommits(autosave.commitObserver);
```

The high-level runtime installs this wiring automatically. Advanced integrations
must wire the feed exactly once. It fires whenever a validated Rust successor is adopted, even when
a later DOM reconciliation or multi-stage command failure prevents the queue
from reporting completion. Temporary composition/execution returns capture
backpressure; terminal adapter loss pauses autosave. See
`docs/SESSION_CHECKPOINT_STORAGE.md` in the repository.

## Current limitations

- The default toolbar contains Bold, Undo, and Redo. A compiled semantic
  profile can contribute additional property-free format toggle intents and a
  custom manifest can omit, reorder, relabel, group, or expose them as the same
  native-button control kind. Typed intents are callable through
  `executeIntentJson()`, but there are no typed toolbar controls, menus/selects,
  extension keymaps or `beforeinput` rules, dynamic
  manifest replacement, JavaScript action/catalog registration, or packaged
  React wrapper.
- Each checkpoint owner uses one best-effort local slot. Slots may coexist but
  there is no registry, append log, merge, authentication, rollback defense, or
  cross-device synchronization.
- Clipboard uses synchronous event `clipboardData`; safe profile formatting is
  copied, but every paste is plain-text. There is no async Clipboard API,
  internal MIME, files/images, or rich paste.
- Extensions may add closed typed scalar properties to inline formats in the
  sealed paragraph/text AST. Current render recipes and copy HTML do not derive
  attributes, URLs, or CSS from those values, so a safe rendered Link control is
  not yet supported. Arbitrary nodes, entities, nested blocks, callbacks, and
  extension-owned DOM renderers remain absent.
- History is local and linear; collaboration, CRDT/OT rebasing, remote
  selections, and selective undo are absent.
- Public content egress is mode-selected Document V1/V2 or semantic plain text.
  There is no HTML serializer, editor-state/session-checkpoint export, streaming export,
  controlled-value callback, or implicit content payload in subscriptions.
- DOM APIs do not provide an atomic transaction across several retained
  paragraphs. The renderer prepares and validates all replacement nodes first
  and attempts best-effort rollback if a DOM write unexpectedly throws. It then
  invalidates the old handle because the host is conservatively considered
  uncertain; the caller must perform a full render from the canonical semantic
  projection.
- Mutation observers deliver asynchronously. A synchronous consumer should not
  treat the DOM as authoritative; retained subtrees are checked again before an
  update fast path is used.
- The low-level renderer does not set host attributes. The public runtime sets
  and later restores `contenteditable`, textbox/multiline ARIA semantics,
  accessible label, and spellcheck; presentation styles remain application-owned.
- Selection mapping supports one light-DOM range only. Cross-host,
  cross-shadow-root, browser multi-range, and ambiguous internal host-boundary
  positions fail closed. DOM mapping and validation are currently linear in the
  bounded document.
- Composition additionally supports only one target range and one paragraph;
  cross-block, shadow/composed, multi-range, arbitrary-markup, and nested-editor
  composition fail closed. The public runtime front-routes composition,
  clipboard, ordinary input, blur, and document selection through one owner.
- The release suite exercises editing, selection, history, toolbar, persistence,
  and content export in Chromium, Firefox, and WebKit through Playwright. This
  desktop automation is not a broad mobile-IME or assistive-technology support
  claim; those still need dedicated device and user-agent coverage.
- Command execution is synchronous. Public `executeIntent()` and
  `executeIntentJson()` are immediate-only and return busy during composition,
  reads, active delivery, or reentrancy;
  neither enqueues a future command. Selection synchronization remains a
  separate publication and can survive a later command error. A requested
  history boundary and its action, intent, undo, or redo publish atomically in
  Rust; DOM publication still cannot participate in that transaction.

## Development

From the repository root:

```sh
npm ci
export WASM_BINDGEN_BIN=/absolute/path/to/wasm-bindgen
npx playwright install
npm run build
npm run typecheck
npm run typecheck:browser
npm test
npm run test:browser
npm run smoke:packages
```

The workspace pins TypeScript, Vitest, and jsdom exactly in
`package-lock.json`. Tests cover strict projection admission, hostile text,
mapping lifetime, text-container identity retention, shifted root-splice
rebinding, stale/foreign guards, DOM-drift fallback, broad-impact full renders,
Wasm-view consumption/disposal, directional and Unicode selection mapping,
focus separation, select-all, outside-host protection, semantic clipboard
serialization, strict HTML admission, guarded multi-representation writes,
authoritative plain-text preference, exact clipboard echoes, exact target-range
normalization, bounded command admission, non-recursive FIFO ordering,
translation policy, one-shot event-echo suppression, queue-routed selection
changes, guarded action-state ownership and store transitions, toolbar
manifest and keyboard/ARIA behavior, exact composition/queue/
renderer leases, alternate terminal event orders, strict temporary-DOM
reconciliation, cancellation history boundaries, fail-safe recovery, strict
checkpoint ownership/restore, IndexedDB schema/CAS/corruption paths, adopted-
commit notification, reentrancy-safe autosave scheduling, Wasm bootstrap,
unified router ownership, public-runtime rollback/disposal, generated-Wasm
edit/undo/redo/reload, and isolated package installation.

The package is licensed under either MIT or Apache-2.0, at your option. Both
license texts are included in its npm tarball.
