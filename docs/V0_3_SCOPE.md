# Breditor `0.3.0` scope

Status: the `0.3.0-alpha.11` source checkpoint retains Rust-owned Clear Formatting
across the existing generic action, intent, state, Wasm, browser, history, and
replay surfaces. It retains alpha.9's independent Showcase profile and
alpha.8's exact property observation and form hydration, then adds a separate
browser-owned declarative shortcut manifest compiled through existing profile
descriptors and projected as truthful toolbar `aria-keyshortcuts`. Wasm ABI 5
remains current. Explicit Bootstrap V2 still selects
property-aware
Session/State/Commit V3; V1 and V2 paths remain separately available. The
packages remain unpublished.

`0.3.0` is the path from property-free formatting to semantic formats such as
links, mentions, text colors, and annotations. Alpha.1 defined and validated
their closed data language. Alpha.2 made its safe paragraph-local subset
editable and replayable. Alpha.3 transports that exact contract through Wasm,
browser projection, strict programmatic input, and durable browser restore
without claiming that every structural edit is complete. Alpha.4 proves one
safe Link rendering/copy slice without generalizing it into arbitrary DOM
attributes or a native typed toolbar protocol. Alpha.5 completes typed
property preservation for Breditor's existing direct-root paragraph operation
algebra without broadening that algebra into a general block model. Alpha.6
defines the multi-paragraph value, state, selection, history, and replay
semantics for the existing registration-owned typed setter. Alpha.7 adds one
closed browser input/presentation contract without making UI durable or
executable in Rust. Alpha.8 lets that control observe a complete uniform map
without turning observation or drafts into history, replay, or persisted state.
Alpha.9 proves that the same generic compiler and browser presentation can add
several visible features without format-specific mutation code.
Alpha.10 adds core-owned all-inline Clear Formatting. Alpha.11 makes the
extension shortcut presentation explicit without adding semantic or durable
authority.

This remains an original Breditor design. ProseMirror, Lexical, Tiptap, and
CKEditor are research references only. Breditor does not adopt their document,
step, transaction, selection, command, plugin, or serialization protocols.

## Alpha.1 foundation

A typed property contract is an optional adjunct to one manifest-owned
`InlineFormatSpecV1`. Absence means the format is property-free, preserving the
`0.2.x` meaning. Presence means every format instance is checked against one
closed, nonempty, canonical declaration set.

Each `InlineFormatPropertySpecV1` contains one qualified property name,
`Required` or `Optional` presence, and one scalar domain:

- `Boolean`;
- a JavaScript-safe integer with optional inclusive minimum and maximum; or
- a Unicode string with inclusive minimum and maximum UTF-8 byte lengths.

The contract excludes null, floating-point numbers, arrays, objects, unions,
enums, patterns, defaults, coercion, normalization, cross-property rules, and
executable validators. Optional means a key may be absent; it does not widen
the declared value type.

`PropertyMap::try_from_sorted` requires strict qualified-name order and rejects
duplicates. `InlineFormatPropertyContractV1::try_new` canonicalizes declaration
order, rejects duplicate or `breditor/*` property names, and accepts 1 through
32 declarations. A contract must target a same-manifest format; one manifest
and one profile each admit at most 255 property contracts.

The compiler attaches each contract to its exact format kind. Property-free
schemas retain compiler-contract version 1 and their exact fingerprint bytes.
A schema with a typed format uses compiler-contract version 2, whose canonical
bytes cover contract presence, grammar version, every sorted name, presence,
scalar type, and canonical bounds. Host resource limits restrict admission but
remain outside the portable fingerprint.

Document V2 already preserves typed format instances. Shared document
validation rejects undeclared or missing keys, wrong value kinds, out-of-range
integers, and out-of-range UTF-8 string lengths. Property-string limits apply
both per string and in aggregate. Diagnostics and validation reports are
bounded, and rejected scalar payloads are not retained in errors.

## Alpha.2 set-format contract

`SetInlineFormatAction` is a reusable Rust handler configured with one format
kind. Its action identity belongs to its `ActionRegistration`; core does not
reserve a universal set-link or set-format action ID.

Its typed `SetInlineFormatInput` contract is
`breditor/set-inline-format-input` version 1 and accepts exactly:

```json
{ "operation": "remove" }
```

or:

```json
{
  "operation": "set",
  "properties": [{ "name": "example/href", "value": "https://example.test" }]
}
```

The property list must already be strictly ordered and unique by qualified
name. A list is intentional because qualified names contain `/`, while action
object keys use a smaller grammar. `set` replaces the complete property map;
it is not a patch. `remove` removes the configured format regardless of its
current properties. Input decoding can reconstruct the deterministic property
value language, but the selected schema contract remains authoritative and the
current typed declarations admit only their declared scalar domains.

The action has two exact paragraph-local behaviors:

- At a collapsed selection, it replaces or removes the configured format in
  the effective pending typing set. It does not rewrite document content.
- Across a non-collapsed range in one direct-root paragraph, it emits one
  guarded `TextSplice`, rewrites only the selected fragment, canonicalizes
  adjacent equal runs, preserves selection direction, and clears pending
  formats.

Both paths validate the complete requested format through the compiled schema
and check result node, text, format, property-value, and property-string limits
before publishing a plan. Cross-paragraph ranges fail closed.

`InlineFormatSetSpecV1` is the sealed manifest declaration for this surface. It
binds one same-manifest typed format to an action ID, typed intent ID, binding
ID, and observable action-state ID. Profile compilation generates the generic
action, a priority-0 blocking route, and routed presence state. The generated
state uses a fixed remove query: it reports whether the format is present, not
the last caller-supplied properties. The declaration contains no values,
callback, label, icon, key binding, toolbar placement, or renderer authority.

Generated no-input `ToggleInlineFormatAction` remains property-free. A typed
format must use explicit set/remove input because a no-input toggle cannot
invent required properties.

## Property-aware text editing

`TextSplice` now validates, carries, applies, and inverts complete typed format
instances. This removes the old schema-wide operation ban only for paths whose
preservation laws are implemented.

The built-in actions currently support these typed-schema paths:

- `insert-text` at a collapsed caret or over a selection within one paragraph;
- exact pending typed formats on the first insertion, followed by contextual
  inheritance from the inserted/surrounding run;
- `delete-selection` within one paragraph, including ranges crossing typed run
  seams; and
- `delete-backward` and `delete-forward` for one Unicode 17 grapheme within a
  paragraph, including deletion across a typed run seam.

Insert and delete plans remain one atomic guarded splice, check exact resource
effects including duplicated property owners caused by run splitting, and
preserve the unaffected property-bearing runs. Directional deletion preserves
pending typing formats. Typing merge groups retain their existing behavior.

Alpha.5 makes the three sealed structural primitives—`ParagraphSplit`,
`ParagraphJoin`, and `RootTextReplace`—validate and retain complete typed format
instances. Their source guards, replacements, derived result fragments,
inverses, relocation, undo/redo, and V3 replay now preserve those values. This
opens typed paragraph breaks, paragraph-boundary directional deletion,
cross-paragraph selection deletion or type-over, and atomic multiline plain-
text insertion while retaining the direct-root paragraph/text shape.

## Selection relocation and exact history

Relocation now distinguishes text-preserving formatting from deletion:

- a property-only, same-text `TextSplice` preserves every interior UTF-16
  position exactly, even when canonical runs are split or merged;
- only exact UTF-8 text equality makes an interior replacement position exact;
  changed text marks interior source points deleted even when its UTF-16 length
  happens to match;
- at an insertion boundary, `Before` affinity stays before and `After`
  affinity moves after the replacement; and
- a genuinely deleted interior position remains an explicit
  `Deleted { before, after }` result for the selected relocation policy to
  resolve or reject.

Range formatting is one undo unit. Complete property replacement and removal
have exact forward and inverse operations, and undo/redo restores document,
directional selection, and pending formats while publishing fresh monotonic
revisions.

A collapsed set/remove is a state-only edit: it adds no content operation or
standalone content-history entry. The session nevertheless treats it as an
exact history boundary, updates the neighboring undo/redo editor-value
snapshots, closes merge continuity, and preserves an existing redo branch.
Later typing can therefore undo to the exact pending typed set and redo to the
exact final value. A new content edit after undo still invalidates redo.

## Property-preserving durable generations

Alpha.2 adds public, explicitly selected V3 codecs for the record families that
must carry typed operation or editor-value payloads:

- `OperationJsonCodecV3` / `OPERATION_V3_FORMAT_VERSION`;
- `EditorStateJsonCodecV3` / `EDITOR_STATE_V3_FORMAT_VERSION`;
- `TransactionJsonCodecV3` /
  `TRANSACTION_REQUEST_V3_FORMAT_VERSION`;
- `CommitJsonCodecV3` / `COMMIT_V3_FORMAT_VERSION`; and
- `SessionCheckpointJsonCodecV3` /
  `SESSION_CHECKPOINT_V3_FORMAT_VERSION`.

Each keeps its existing format string, uses `formatVersion: 3`, and retains the
V2 schema selector plus fingerprint binding. There is deliberately no Document
V3: every V3 state boundary embeds the existing property-aware Document V2.

Operation V3 uses the additive `OperationRecordV2` payload generation. Every
format occurrence carries its canonical `properties` map. Transaction V3 uses
that operation sequence together with the property-preserving V2 pending-format
record; its base snapshot, selection relocation/update, and metadata shapes
remain V1. Editor State V3 changes only pending-format payloads while retaining
the V2 envelope, Document V2, snapshot, and selection shapes. Commit V3 embeds
Editor State V3 and property-aware forward operations/result pending formats.
Session Checkpoint V3 embeds Editor State V3 and replays property-aware history
entries in both directions before publishing a session.

V3 preflight checks property name grammar and canonical order, numeric form,
nesting, operation count, property-value count, and string budgets before owned
deserialization. Errors expose stable codec codes and bounded/redacted
diagnostics. Decode remains atomic: mismatch, invalid replay, noncanonical
payloads, or limit excess publishes no partial state.

Codec generation is always a caller choice. V1/V2 bytes and golden fixtures
are unchanged; no codec sniffs, upgrades, downgrades, or silently mixes nested
generations. The frozen V1/V2 primitive-operation payload cannot represent
properties, so every actual V1/V2 operation encode/decode under a schema with
any typed property contract fails closed—even for an optional-only contract or
an instance whose property map is empty. V1 pending-format records likewise
reject property-bearing instances. Document V2 itself remains property-aware,
so a V2 state/checkpoint with no typed pending value and no property-bearing
operation may still be valid; callers must select V3 whenever those values or
replay recipes need preservation.

Local-log entry, checkpoint, frame, storage-root, and storage-generation V3
codecs do not exist yet. A property-bearing Session Checkpoint V3 therefore
cannot be inserted into the current V1/V2 local-log durable graph without a
future explicitly versioned local-log contract.

## Alpha.3 Wasm ABI 4 and browser durable bridge

Wasm ABI 4 adds the explicitly selected
`BreditorCompiledProfile.fromBootstrapJsonV2()` configuration envelope.
Bootstrap V2 retains the strict bounded graph of extensions and inline formats,
adds closed typed property contracts, and adds manifest-owned set declarations
with their action, typed intent, binding, and state identities. Boolean,
integer, and string domains carry their exact presence and bounds. Unknown,
duplicate, missing, malformed, noncanonical, or over-limit input fails closed;
the envelope remains ABI-local configuration rather than a durable extension
manifest protocol. `fromBootstrapJson()` continues to mean Bootstrap V1.

`BreditorCompiledProfileDescriptor` exposes canonical per-format property
names, presence, scalar kind, and integer/string bounds. `BreditorProjection`
exposes every format occurrence's canonical scalar property values. Browser
adapters validate these getters completely, deep-freeze the descriptor and
projection, and correlate both with the same opaque process-local profile
generation.

`BreditorEngine.executeTypedActionJson()` and
`executeTypedIntentJson()` preserve exact caller JSON bytes until Rust performs
strict bounded decoding. The registered action or intent supplies its value
contract name and version; JavaScript cannot substitute one. Duplicate object
keys, non-integral or unsafe numbers, invalid shape, excessive depth/count/text,
and contract mismatches are rejected with bounded, payload-redacted errors.
The high-level browser owner exposes the semantic path as synchronous
`executeIntentJson(intentId, inputJson)`, using the same immediate queue lease,
selection preservation, result correlation, and public provenance redaction as
the no-input `executeIntent()` path.

ABI-4 action, intent, undo, and redo calls also accept one
`closeHistoryGroupBefore` choice. Rust evaluates that requested boundary and the
command on one private checkpointed candidate, encodes the final session once,
and publishes both or neither. Results expose `historyGroupClosedBefore` so the
browser can report an effective boundary without inferring it. Invalid typed
input therefore cannot split undo grouping, and action preparation remains
single-pass. Selection synchronization remains a distinct publication before
this combined step.

Two explicit profile factories select V3 engine egress:
`createEngineFromDocumentJsonV3()` consumes Document V2 and starts a fresh
Session V3, while `createEngineFromSessionCheckpointJsonV3()` strictly restores
Session Checkpoint V3. Those engines emit Session Checkpoint V3, Editor State
V3, and Commit V3; Document egress remains V2. Existing profile factory names
retain Session V2, and static exact-base factories retain V1.

At the browser package root, only
`semanticProfile: { bootstrapJson, formatVersion: 2 }` selects Bootstrap V2 and
durable mode V3. `{ bootstrapJson }` continues to select Bootstrap V1 and
durable mode V2; an omitted profile selects exact-base V1. Startup, canonical
Document validation, Session Checkpoint validation, IndexedDB binding and
restore, and autosave capture all use that explicit mode. They compare the
schema selector, fingerprint, property catalog, and checkpoint generation
before passing retained bytes to the selected Rust restore factory. Browser
preflight checks bounded wire structure but does not replay history or exactly
account for the core codec's aggregate retained-state ceilings. Rust decode,
replay, canonicality, and resource-limit enforcement remain authoritative; a
browser-admissible checkpoint can still be rejected there. No path sniffs,
retries, upgrades, or falls back to another generation.

## Alpha.4 closed `safeLinkV1` browser policy

Alpha.4 does not change Wasm ABI 4, Profile Bootstrap V2, the schema
fingerprint algorithm, or any durable record. It corrects Rust's generic
property-free toggle gate to use the existing paragraph-local `TextSplice`
capability for collapsed and same-paragraph selections; structural
cross-paragraph toggles remain closed. It extends the callback-free browser
render recipe with exactly one optional attribute policy:

```json
{
  "kind": "safeLinkV1",
  "hrefProperty": "example/href",
  "openInNewWindowProperty": "example/open-in-new-window"
}
```

The policy is admitted only on `<a class="breditor-link">`. The format
descriptor must contain exactly the two distinct named properties, both
required. The href property must have the exact string domain of 1 through
2048 UTF-8 bytes; the open-in-new-window property must be Boolean. This exact
coverage prevents a Link recipe from silently discarding another semantic
property.

The browser rejects navigation for a value containing a control or
Unicode-whitespace scalar, relative or malformed URL, non-HTTP(S) scheme,
credentials, empty host, or a source/normalized URL over 2048 UTF-8 bytes.
The raw spelling must have a nonempty authority immediately after exactly two
scheme slashes. That authority is restricted to visible ASCII and may contain
no percent escape, backslash, or raw `@`; internationalized host names use
their explicit `xn--` spelling. Repairing parser behavior therefore cannot
erase invisible authority scalars or turn malformed authority syntax into
navigation.
Accepted values are emitted in canonical URL form. A safe same-window Link has
only `href`; a safe new-window Link also has fixed
`rel="noopener noreferrer"` and `target="_blank"`. A schema-valid value that
fails this browser policy still renders its semantic text inside an inert
`<a class="breditor-link">`; it does not fault the editor.

The recipe cannot choose arbitrary attribute names, values, schemes, styles,
callbacks, raw HTML, `rel`, or target behavior. Rust validates the declared
string and Boolean shapes and bounds, not URL semantics. URL normalization and
navigation admission are presentation-layer decisions.

Full/incremental DOM rendering and drift checks compare the exact resolved
attributes. A native-composition target admits only the inert, href-only, or
canonical href/rel/target Link shapes and still becomes plain text before one
Rust command. Transient composition attributes share a 1 MiB aggregate UTF-8
work budget that is charged before URL parsing. Copy/cut derives HTML from the
semantic projection and escapes the same attributes. HTML paste may admit those exact shapes, but every paste
is flattened to plain text and reconstructs no source formats or properties.

The additive Highlight + Link reference profile preserves all existing
Highlight-only exports. Its URL field, new-window checkbox, and Apply/Remove
buttons are React-owned application controls that call `executeIntentJson()`
with exact set/remove input. The supported toolbar manifest remains a closed
native-button protocol for no-input intent/history commands.

## Alpha.5 property-preserving paragraph structure

Alpha.5 changes no data declaration or transport generation. Wasm ABI remains
4; Profile Bootstrap remains V2; schema fingerprints and compiler-contract
bytes are unchanged; Document remains V2; and typed Operation, Editor State,
Transaction Request, Commit, and Session Checkpoint remain V3. The existing
V3 payloads already represent complete format properties in structural guards
and replacements, so this is stricter execution and validation of those
records rather than a new protocol.

The compiler now distinguishes two private capabilities. The paragraph-
structure capability proves the exact sealed root-to-paragraph-to-text grammar
while allowing schema-declared typed inline formats. The older base-text
capability remains property-free and continues to be the sentinel for frozen
V1/V2 operation payloads and property-free-only local proof paths. Alpha.5 does
not let a typed schema enter a codec that cannot represent its properties.

`ParagraphSplit`, `ParagraphJoin`, and `RootTextReplace` now validate every
format instance against the compiled contract. Validation aggregates property-
value and property-string-byte usage across each complete source, replacement,
and derived-result slice before mutation. A split inside one typed run creates
two property owners and can therefore exceed a configured property budget; an
equal-format join may merge owners. Exact whole-paragraph guards, canonical
seam merging, reciprocal split/join inverses, the same-type root-replacement
inverse, authoritative final-document validation, and all-or-nothing
transaction publication remain unchanged.

The lifted built-in paths are:

- collapsed, same-paragraph extended, and cross-paragraph Enter;
- multiline `insert-plain-text`, including paste, with one inherited complete
  target format set applied to each non-empty inserted paragraph;
- cross-paragraph `insert-text` type-over and selection deletion;
- backward/forward deletion at paragraph boundaries through typed joins; and
- cross-paragraph Strong or extension no-input toggles whose target format is
  property-free, while preserving all typed peer formats.

`SetInlineFormatAction` deliberately remains paragraph-local. A typed set or
remove over a cross-paragraph range is still disabled as
`breditor/cross-paragraph-inline-format-unsupported`; alpha.5 does not define
how one caller-supplied property map should rewrite multiple blocks. Clipboard
paste also remains formatting-stripping: source HTML wrappers and Link
properties are discarded. The resulting plain text can inherit the complete
typed format set at the destination, but that is target-context formatting,
not rich-fragment reconstruction. An empty replacement fragment introduces no
formatted run itself. A retained prefix or suffix can make the first or last
result paragraph non-empty, and separating typed retained text across result
paragraphs can still increase the complete property-owner count.

Every lifted edit records the same exact guarded operation recipes used for
undo, redo, and V3 replay. Session Checkpoint V3 retains both history branches,
so a browser autosave after undo can reload the exact typed document,
directional selection, pending formats, undo cursor, and redo branch before
redo reapplies the preserved structural operation.

This is a prerelease semantic widening under existing V3 record numbers.
Alpha.5 restores conforming alpha.4 V3 checkpoints. Alpha.4 cannot in general
restore an alpha.5 Session Checkpoint V3 whose retained undo or redo history
contains a typed `ParagraphSplit`, `ParagraphJoin`, or `RootTextReplace`, even
though its envelope version is still 3. Exact package pairing and one-way
downgrade caution remain required; no reader sniffs, rewrites, or drops the
unsupported history.

## Alpha.6 cross-paragraph typed set/remove

Alpha.6 extends `SetInlineFormatAction` across a non-collapsed selection
spanning two or more paragraphs in the compiler-minted base-text structure.
`Set` replaces the target format's complete property map on every selected
character; `Remove` strips that format kind regardless of prior properties.
Unselected prefix and suffix text, paragraph count and boundaries, empty middle
paragraphs, and every non-target typed or property-free format remain exact.

The plan contains one guarded, same-paragraph-count `RootTextReplace`. A range
that crosses paragraph structure but selects no characters is disabled as
`breditor/no-selected-text`. If every selected character already has the exact
requested instance, or none has the format being removed, the action stays
disabled as `breditor/inline-format-unchanged` and publishes no operation.

For a requested set, activation is active only when all selected characters
already carry that exact instance, mixed when only some do, and inactive when
none do. The manifest-generated presence state uses its fixed remove query:
all-present is active, partial presence is mixed, absent is inactive, and a
structural-only range is unavailable/inactive. Empty paragraphs contribute no
format owner and no activation sample.

Canonical folding can split or merge text leaves and property owners, so
planning validates the requested format and complete derived result against
the transaction operation ceiling, formats per leaf, leaf and aggregate text,
children and nodes, property values, and property-string bytes. A successful
plan explicitly rebuilds anchor and focus against the result fragments,
preserves direction and endpoint affinities, clears pending formats, and
records one independent history entry. Undo/redo restores the exact state, and
a new edit after undo clears the redo suffix.

Session Checkpoint V3 stores the resulting typed `RootTextReplace` on either
side of its history cursor and replay-proves it without reevaluating the action.
Alpha.6 restores conforming alpha.5 checkpoints. Alpha.5 also restores and
replays alpha.6 checkpoints containing this action because its V3 codec and
reducer already understand the identical property-preserving root replacement.
Wasm ABI 4, Profile Bootstrap V2, descriptor/projection shapes, the schema
fingerprint, Document V2, and every V3 record number remain exact.

## Alpha.7 closed native typed control

Alpha.7 advances the process-local Wasm transport to ABI 5 and adds exactly one
Rust descriptor shape: the canonical format-kind, intent-ID, action-state-ID
triple for every admitted `InlineFormatSetSpecV1`. Action and binding identity,
labels, fields, drafts, focus, and rendering do not enter Rust, Profile
Bootstrap V2, the schema fingerprint, or a durable record.

The browser admits one callback-free `inlineFormatForm` only when its triple
matches the descriptor and its fields exactly cover the format's required
properties. Fields are limited to URL-presented strings carrying the exact
profile UTF-8 bounds and Booleans with a false default. Apply constructs the
existing canonical complete-map set input; Remove constructs the existing
canonical remove input. There is no optional field, integer field, coercion,
partial patch, arbitrary widget, or captured callback.

The launcher is a native button in the APG roving toolbar. The nonmodal form is
a sibling under the toolbar mount so editing controls do not conflict with
toolbar Arrow-key navigation. Opening focuses the first field; Escape and Close
clear the draft and restore the launcher. Apply/Remove preserve the semantic
editor selection, enter the existing synchronous queue, use fresh action state,
and request the existing close-before history boundary. Replay and undo/redo
consume the committed `TextSplice` or `RootTextReplace`, never the form.

Draft values are not hydrated from the current selection, saved in Session V3,
or restored after reload. URL presentation validates string shape and bounds,
not schemes or navigation safety; the closed `safeLinkV1` renderer owns that
policy. Same-realm JavaScript configuration remains trusted rather than
sandboxed. The normative decision and threat model are in
[`TYPED_TOOLBAR_CONTROLS.md`](TYPED_TOOLBAR_CONTROLS.md).

## Alpha.8 exact property observation and hydration

Alpha.8 gives every generated property-aware inline-format state the exact
output contract `breditor/set-inline-format-input@1`. The output version is a
distinct Rust action-state version type even though its serialized name and
number match the input contract. A uniform observation is therefore the
canonical, round-trippable `set` branch containing the format's complete
strictly ordered property map.

The value and activation answer different questions. Activation remains the
fixed Remove-query result: inactive means absent, active means present on all
relevant text, and mixed means partial presence. The value is `unset` when the
target is absent, `uniform` only when every relevant run has the exact same
complete map, and `mixed` for partial presence or differing maps. A collapsed
selection observes its effective pending/context formats. This is whole-map
comparison, not fieldwise mixed state or a merge algorithm.

The browser accepts the value only after exact descriptor, state ID, activation,
contract, schema, and canonical property-order correlation. A pristine form
hydrates a form-admissible uniform map exactly; unset or mixed uses declared
empty/default values. The URL field is a text input with a URL keyboard hint,
so surrounding whitespace remains exact. CR/LF-bearing state makes this
single-line form, including UI Remove, unavailable rather than being normalized;
programmatic typed-intent removal remains possible. State refreshes do not overwrite a dirty draft. Rejected dispatch
retains it; completed dispatch clears it and hydrates from the authoritative
post-command state. Close, Escape, another form opening, and disposal clear
the draft, so reopening starts from the latest fresh state.

The stored URL scalar remains the exact inert string supplied to Rust and Wasm.
The state transport does not trim, parse, normalize, or grant navigation
authority. The narrower browser form rejects CR/LF on input and refuses to
present stored CR/LF instead of mutating it. Only the separate browser
`safeLinkV1` presentation policy may derive a safe
canonical `href`, `rel`, and `target`; a schema-valid rejected URL remains an
inert Link wrapper.

This checkpoint adds no operation, durable field, or Wasm method and therefore
does not bump ABI 5. Action-state values and form drafts are ephemeral: neither
enters undo/redo, replay, Document V2, Session Checkpoint V3, or IndexedDB.
Profile compilation rejects a generated setter if the worst-case schema-valid
complete map cannot fit the fixed action-value envelope. It also admits the
canonical generated-setter list only when the collective worst case fits the
action-state batch value-count and text-byte budgets, rejecting the first
canonical declaration that would cross a bound. Runtime limits remain defense
in depth, not an unresolved generated-setter overflow case.

## Alpha.9 additive Showcase profile

Alpha.9 adds a third, independent reference profile rather than changing the
existing Highlight-only or Highlight + Link values. The
`example/showcase-editor@1` schema reuses those two extension manifests and
adds `example/text-styles-extension@1`. That manifest owns property-free
Emphasis, Strikethrough, and Code formats plus one opt-in toggle declaration
for each. Rust profile compilation therefore generates their action, semantic
intent, priority-zero blocking route, and tracked action-state source exactly
as it already does for Highlight.

The browser declaration is equally data-only. Its toolbar orders Bold, Italic,
Strikethrough, Code, Highlight, Link, Undo, and Redo. Its render graph fixes one
total outer-to-inner order: Link, Strong, Emphasis, Highlight,
Strikethrough, Code. The wrappers are from the already closed element
vocabulary; only Link uses properties or `safeLinkV1`. No extension callback,
action table, dynamic import, Wasm shim, or renderer function is added.

The React example moves to a new Showcase lineage and IndexedDB slot. This is a
separate durable schema fingerprint, so alpha.8 data remains in its prior slot
instead of being treated as Showcase content. The initial sample retains its
Highlight + safe Link values and leaves the new toggles inactive. Browser and
consumer gates then stack the formats, observe active and mixed state, cross a
paragraph boundary, undo/redo, and restore a checkpoint through the ordinary
generic paths.

Alpha.9 changes neither Profile Bootstrap V2 nor Document V2 or any V3 durable
record. Wasm ABI stays 5. The formats freely coexist; this checkpoint does not
introduce exclusions, extension keyboard shortcuts, clear formatting, block
code, headings, lists, rich paste, or runtime-loaded plugins.

## Alpha.10 clear inline formatting

Alpha.10 adds the eighth base action, `breditor/clear-inline-formats`, with a
no-input semantic intent, blocking route, and stateless observable control.
For an extended selection Rust rewrites only selected text to the empty
`FormatSet`, using one `TextSplice` inside a paragraph or one same-count
`RootTextReplace` across paragraphs. Unselected typed maps, empty middle
paragraphs, spatial endpoint positions, direction, and affinities survive. The
effective action forms one exact undo unit and replays from Session Checkpoint
V3 without reevaluating JavaScript.

At a collapsed formatted caret, Clear Formatting stores an explicitly empty
pending set so future typing is plain. This is an operation-free editor-state
change under the existing history-boundary rules: it closes merge continuity
and preserves redo but does not create a synthetic undo entry. Already-plain
ranges and structural-only ranges remain disabled.

The browser maps `beforeinput` `formatRemove` and a stateless Showcase toolbar
button to the same intent. ABI 5's existing generic methods carry the route and
result. No bootstrap, fingerprint, document, operation, checkpoint, storage,
projection, or renderer shape changes. The full state catalog/reader ceiling is
514 so four built-ins, 255 toggles, and 255 setters compose; a toolbar manifest
is still capped independently at 64 controls.

Clear Formatting means every inline format, including complete typed property
maps. It has no allowlist, denylist, extension ownership policy, or block-level
meaning. Retained exact-undo history may still contain removed values, so the
command is not a data-erasure boundary.

## Alpha.11 declarative extension shortcuts

Alpha.11 adds a root-exported browser `KeyboardShortcutManifest` and optional
high-level `keyboardShortcuts` startup option. The manifest remains separate
from the toolbar layout and Rust extension profile. One declaration names an
existing qualified action-state ID and one through four primary-modifier physical-code
chords; it does not repeat an action/intent ID, retain an event, or contain a
callback.

The complete input is own-data-only, canonicalized, deeply frozen, and bounded
to 43 unique state declarations and 44 globally unique chords. Chords contain
exactly one physical `KeyA` through `KeyZ` code and a Boolean Shift requirement; the existing
keyboard policy supplies Control or Meta. A/C/V/X are reserved with or without
Shift. Primary+B, primary+Y, primary+Z, and primary+Shift+Z may be omitted but
cannot be rebound away from their fixed Bold/Redo/Undo/Redo states. Duplicate
states, duplicate chords, malformed shapes, accessors, sparse arrays, or bounds
overflow reject the complete manifest.

Browser startup compiles each state through the owned profile descriptor. Only
a routed no-input intent with the same state contract or exact stateless/value-
free history state is admitted. Unknown IDs, direct action states, typed intents,
mismatched routed-state contracts, and nonstateless or valued history states
fail before listeners or toolbar DOM become live. When no explicit manifest is
supplied, the compatible subset of the
default Bold/Undo/Redo declarations is retained; explicit input is exact and is
not merged with defaults.

The compiled table owns both native key lookup and generated toolbar
`aria-keyshortcuts`. Intent requests preserve semantic selection, request
`closeBefore`, and suppress auto-repeat; Undo/Redo repeat is supported. Exact
primary/secondary/Alt/Shift state is required. AltGraph, dead/process/
composition events, sequences, punctuation, function keys, and typed-input form
launching are outside the grammar. Matching uses only exact physical
`KeyboardEvent.code`; generated `KeyboardEvent.key` text does not select a
binding. Codes identify US physical-key positions. Devices without conforming
exact codes may not invoke shortcuts, and browser/OS reservations can conflict.

The reference Showcase binds Bold, Italic, Strikethrough, Code, Highlight,
Undo, and Redo; Redo has both primary+Y and primary+Shift+Z aliases. The
three-engine gate executes all five format bindings, Undo, and both Redo aliases.
Link and Clear Formatting remain unbound there. When shortcuts are disabled or
a toolbar state is unbound, no `aria-keyshortcuts` attribute is emitted. No
mutation observer faults or repairs later attribute drift immediately; a
guarded toolbar interaction or explicit canonical-DOM validation detects it.
Only conventional native chord/input-type pairs arm an echo receipt, and an
unconsumed receipt expires at the end of the current task. This checkpoint
changes no Rust action, intent route, selection, operation, transaction,
history/replay law, Profile Bootstrap V2, fingerprint, Wasm ABI 5 member, or
Document/State/Commit/Checkpoint durable generation.

## Rust, Wasm, browser, and toolbar boundary

Rust provides memory safety, checked construction, exhaustive failures, compact
immutable values, and one deterministic implementation for native and future
Wasm hosts. It does not make ordinary typing automatically faster than
optimized JavaScript; its performance value is predictable validation/replay,
while small Wasm crossings still have a cost.

Alpha.3 widens the transport to Wasm ABI 4. Typed contracts, set-action
declarations, property descriptors, property-bearing projections, strict typed
action/intent JSON, explicit V3 engine factories, browser durable validation,
IndexedDB/autosave, and programmatic `executeIntentJson()` now exercise the
Rust typed path. Alpha.5 uses those same paths for typed structural operations;
alpha.6 routes cross-paragraph typed set/remove through them. Neither adds a
Wasm method, browser protocol, or durable generation.

Alpha.7 advances to Wasm ABI 5 solely for the canonical typed-set
format/intent/state descriptor getters. It adds no durable generation or
semantic mutation protocol.

Alpha.8 uses those existing getters plus ABI 5's existing action-state value
transport. It adds no generated Wasm member, bootstrap field, fingerprint byte,
document/checkpoint field, or semantic mutation protocol.

Alpha.10 uses the same ABI 5 catalog, state-value, and no-input-intent methods
for the built-in Clear Formatting route. It adds no generated Wasm member or
semantic wire format.

Alpha.11 is entirely browser presentation and routing policy compiled from the
existing descriptor. Rust and generated Wasm code change only their paired
package version; ABI 5 and all semantic/durable shapes remain byte-compatible.

The DOM and toolbar layers deliberately remain narrower. Render recipes select
a fixed safe wrapper element, canonical classes, and wrapper order; only the
closed `safeLinkV1` policy derives attributes from properties. Safe copy emits
those exact Link attributes and paste remains plain text. The supported toolbar
accepts the closed required URL-string/Boolean Link form, but no optional or
integer field, partial patch, menu, select, color control, or arbitrary widget.
Existing no-input toggle buttons continue to work for property-free formats.

Typed scalar validation is not sanitization. A valid Link string is not
automatically a navigable URL, and a valid color string is not automatically
safe CSS. Alpha.4 supplies the exact browser-facing URL/attribute policy above;
CSS grammar and other property presentations remain undefined.

## Remaining limitations

- Typed contracts apply only to inline formats, not elements or new node kinds.
- One text leaf can carry at most one instance of a format kind; independently
  overlapping instances of the same kind are not representable.
- Keys are closed and exact; unknown properties are not preserved.
- Typed declarations remain Boolean, JavaScript-safe integer, and bounded
  string only.
- Set replaces a complete property map; there is no property patch operation.
- Current properties are compared as whole maps. A mixed observation carries
  no fieldwise values or merge base.
- Structural editing remains limited to the compiler-minted direct-root
  document/paragraph/text grammar. Element or paragraph properties, entity
  identities, nested or heterogeneous blocks, and arbitrary structural schemas
  still require separately specified operations.
- No V3 local-log/storage family exists.
- Wasm descriptors, browser projection, strict programmatic typed intent input,
  and browser Session V3 persistence support typed properties. DOM and copy
  support only `safeLinkV1`; paste never reconstructs properties, and the native
  toolbar supports only the closed required URL-string/Boolean form.
- The additive reference Link proves one exact contract while preserving the
  property-free Highlight-only profile. It is not a general Link schema,
  renderer, URL validator, or arbitrary toolbar-control registration protocol.
- The additive Showcase proves three more property-free controls through the
  generic path. Its bounded state-addressed physical-letter shortcuts are not an
  exclusion system, callback keymap, key-sequence language, block model, or
  dynamic plugin loader.
- Declarative shortcuts cannot carry typed values, invoke direct actions, open
  toolbar forms, use Alt/punctuation/function keys, override Select All or
  clipboard families, define conditional priority handlers, or change while an
  editor is live.
- Form drafts hydrate only from a fresh, single-line-representable uniform
  state. CR/LF-bearing URL state leaves the form and its UI Remove action
  unavailable, while programmatic removal remains possible. Drafts are not
  persisted, undoable, or replayed, and same-realm JavaScript declarations are
  not sandboxed.
- No migration, generation negotiation, collaboration transform, or unknown
  typed-format preservation is introduced.
- Per-set state-value representability and the generated-setter catalog's
  aggregate worst case are compile-checked against action-value and state-batch
  limits. Profiles that cannot satisfy either proof are rejected canonically.
- Host limits can make a portable schema uninhabitable on that host.

## Next checkpoints

Future browser work may add another separately closed property presentation or
field vocabulary, but must not silently widen
`safeLinkV1`, accept arbitrary attributes/CSS, preserve source formatting on
paste, or bypass the intent router.

A later durable checkpoint must version the local-log graph around Session
Checkpoint V3 rather than placing V3 nested bytes inside a V1/V2 envelope. A
future formatting checkpoint may add a property patch language, but it must not
reinterpret alpha.6 complete-map replacement. Link URL policy is explicit
browser policy; it is not implied by the scalar property contract.
