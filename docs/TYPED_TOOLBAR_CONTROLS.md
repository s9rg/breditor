# Typed toolbar controls

Status: normative `0.3.0-alpha.7` architecture and compatibility decision

Alpha.7 adds one deliberately closed native typed-control protocol for
property-aware inline-format set/remove intents. It does not make toolbar UI a
Rust extension object, add executable callbacks, or change the document and
history languages. The first supported instance is the reference Link form.

This document is normative for the Alpha.7 set-surface descriptor, browser
manifest, DOM, dispatch, ownership, and compatibility boundaries. The general
toolbar rules remain in [`TOOLBAR.md`](TOOLBAR.md), and the underlying typed
format/action contract remains in [`DATA_CONTRACT.md`](DATA_CONTRACT.md).

## Decision summary

The feature is split across three data-only layers:

1. Rust derives a canonical set-surface identity from every admitted
   `InlineFormatSetSpecV1`.
2. Wasm ABI 5 exposes that identity as a format/intent/action-state triple.
3. A browser-only `inlineFormatForm` declaration supplies labels and a closed
   field presentation. Runtime draft values never enter the declaration.

Rust remains authoritative for the target format, typed property contract,
selection, applicability, transaction, history, and replay. The browser owns
labels, field widgets, focus, draft values, canonical JSON construction, and
safe DOM presentation.

## Rust set-surface descriptor

`CompiledProfileDescriptor` owns a bounded canonical
`CompiledProfileInlineFormatSetDescriptor` for each successfully compiled
inline-format set declaration. Each descriptor contains exactly:

- `formatKind`: the property-aware inline-format kind;
- `intentId`: the generated typed semantic intent; and
- `actionStateId`: the generated routed format-presence state.

Rows are strictly ordered by `formatKind`, and the successful compiler contract
makes the format, intent, and action-state identities unique. Lookup by format
uses that same order. The descriptor deliberately omits the generated action
and binding identities: callers invoke the semantic intent, while routing and
the concrete action remain Rust-owned.

The set-surface list is process-local compiled-profile metadata. It is not
serialized into documents, checkpoints, schema fingerprints, or a public
extension-manifest wire format. It contains no label, field, URL, property
value, callback, DOM data, or rendering policy.

## Wasm ABI 5

ABI 5 adds only the following compiled-profile descriptor surface:

- `inlineFormatSetCount`;
- `inlineFormatSetFormatKind(index)`;
- `inlineFormatSetIntentId(index)`; and
- `inlineFormatSetActionStateId(index)`.

The browser copies these indexed scalar reads into deeply frozen, handle-free
metadata. Admission requires a bounded count, strict format order, unique
intent and state identities, an existing property-bearing format, the exact
`breditor/set-inline-format-input@1` typed intent, tracked activation with no
value contract, and a routed tracked/value-free state sourced from that same
intent. The first out-of-range index must return `undefined`. Generated owners
are released on success and every failure path.

The ABI number advances because the reviewed generated Wasm method set changes.
An ABI-4 browser and ABI-5 Wasm module are not a supported mixed pair and fail
the startup version check. This ABI change does not change Profile Bootstrap
V2 or any durable payload.

## Browser declaration

`createToolbarManifest` admits one additional control discriminant:
`kind: "inlineFormatForm"`. Its exact data is:

- unique `stateId`, plus `formatKind` and `intentId` matching one compiled
  set-surface triple;
- launcher `label`, optional presentation `group`, and `applyLabel`,
  `removeLabel`, and `closeLabel`;
- one through 32 fields, with at most 64 form fields across one toolbar
  manifest; and
- at least one required URL-presented string field.

The Alpha.7 field vocabulary is closed:

- a required string field has `kind: "string"`, a qualified `propertyName`, a
  label, `presentation: "url"`, `autocomplete: "url" | "off"`, inclusive
  `minimumUtf8Bytes` and `maximumUtf8Bytes`, and an optional placeholder; or
- a required Boolean field has `kind: "boolean"`, a qualified `propertyName`,
  a label, and the only admitted initial `defaultValue: false`.

String minimums are positive, maximums are at most 65,536 UTF-8 bytes, and
every field name is unique within its form. Startup requires the fields to
cover the target format's complete property contract exactly: every property
must be required, kinds must agree, and string bounds must match. Declaration
order controls visual order; command JSON always sorts properties by qualified
name.

The reference Link declaration uses:

- `example/href`, required string with exact `1..=2048` UTF-8 bounds and URL
  presentation; and
- `example/open-in-new-window`, required Boolean with default `false`.

The declaration is copied and deeply frozen. It accepts no callback, DOM node,
CSS, HTML, mutable plugin object, current property value, or dispatch function.
Presentation fields do not enter the schema fingerprint.

## Input construction

The runtime snapshots an exact plain own-data-property record keyed by the
declared property names. Missing, extra, duplicate, inherited, accessor-backed,
wrongly typed, malformed-Unicode, and out-of-bound values fail before dispatch.
String length is bounded before UTF-8 measurement; rejected values are not
included in errors.

Apply produces compact canonical `breditor/set-inline-format-input@1` JSON:

```json
{"operation":"set","properties":[{"name":"example/href","value":"https://example.test"},{"name":"example/open-in-new-window","value":false}]}
```

Remove always produces:

```json
{"operation":"remove"}
```

`set` replaces the format's complete property map. It is never a partial patch,
merge, normalization request, or URL-policy request. Rust revalidates the exact
input and selected profile at execution even after browser admission.

## Toolbar and nonmodal form DOM

The WAI-ARIA Authoring Practices toolbar remains a horizontal native-button
toolbar with one roving `tabindex="0"`. Bold, toggle controls, history controls,
and typed-form launchers are buttons inside `role="toolbar"`; Arrow keys,
Home, and End move among those buttons.

The interactive `<form>` is a sibling of the toolbar root under the caller's
toolbar mount, not a descendant of `role="toolbar"`. This is intentional:

- text-field arrow keys retain their native editing meaning;
- the form is nonmodal and creates no dialog or focus trap;
- the launcher owns `aria-controls` and `aria-expanded`;
- opening focuses the first field;
- Escape or the explicit Close button clears the draft, closes the form, and
  restores launcher focus; and
- opening one form closes and clears any other open typed form.

While an input-method composition is active, submit and Escape are delegated
to the platform. The runtime waits for `compositionend` before either action
can apply or close the form, even if an intervening key event reports an
inconsistent `isComposing` flag.

Required strings carry the native `required` accessibility semantic, while the
form carries native `novalidate`: `presentation: "url"` supplies input semantics
and autocomplete only, never a browser-owned admission policy that can suppress
Rust dispatch. Boolean fields must retain `indeterminate=false`; the runtime
resets that non-reflected state and faults on drift.

The toolbar mount may live in a Document or an open or closed ShadowRoot. ID
and focus proof are scoped to its exact tree root. The separate editor mount is
still intentionally light-DOM-only because the supported engines do not expose
one interoperable shadow-selection endpoint contract.

The panel exposes selection status and a polite atomic status region. The
runtime revalidates the complete generated DOM shape and faults the toolbar
closed on drift. Disposing removes panels, listeners, values, and the toolbar
root while preserving the caller-owned mount.

## Selection, state, queue, and history

Moving focus to the toolbar or sibling form does not replace the editor's
semantic selection. Apply and Remove use `selection: "preserve"`, so the
bounded serial command queue acts on the Rust-owned selection rather than
trying to reconstruct a DOM range from focused form controls.

The generated action state is a fixed Remove/presence query, not a query using
the current draft properties. Its activation reports whether the target format
is present across the semantic selection:

- `active`: present on all selected text;
- `mixed`: present on only part of the selected text;
- `inactive`: absent; and
- unavailable: no applicable selected text or another structural restriction.

Apply may be offered for a fresh enabled state, and also for the exact
inactive `breditor/inline-format-unchanged` presence result because absence is
valid input to Set. Remove is offered only for enabled active or mixed state.
The runtime refreshes state immediately before dispatch, but displayed state is
evidence, never authority; Rust reroutes and prepares against the current
observation.

Both operations invoke the descriptor-correlated typed intent through the
existing synchronous queue with `history: "closeBefore"`. A committed content
change therefore begins outside the previous typing merge group and records
the same independent history unit as programmatic typed-intent execution.
Busy, stale, malformed, asynchronous, forged, or uncertain dispatch fails
closed. The current toolbar result is deliberately coarse: `completed` means
the requested target finished, while `rejected` means the target was not
applied and retains the draft. A blocked or unhandled target can still publish
an effective requested `closeBefore` boundary; a deterministic input-decoder
rejection cannot. The subsequent authoritative document/action-state snapshot
determines whether semantic content changed.

## Undo, redo, replay, and persistence

The form does not define an operation or replay hook. A successful Rust action
publishes the existing property-preserving `TextSplice` or `RootTextReplace`
transaction, depending on selection shape. Undo and redo retain the exact
before/after editor states, selection direction and affinity, pending formats,
and complete Link properties. Replay consumes the recorded operation; it never
reruns the form, JavaScript input builder, intent router, or action handler.

Document V2 persists committed semantic properties. Session Checkpoint V3 also
retains selection, pending formats, linear history, redo position, and the
recorded typed operations. Profile-bound IndexedDB autosave continues to store
that Session V3 value. Form-open state, focus, draft strings, checkbox state,
and feedback are presentation state and are never persisted or restored.

Alpha.7 deliberately provides no current-value hydration. Opening the form
starts from an empty required string and Boolean `false`, even when the selected
text already carries Link. Apply supplies a new complete map; Remove ignores
the stored property values and removes the target kind.

## Threat model

Rust/Wasm owns semantic mutation and validates all identifiers, contracts,
values, resource limits, observations, transactions, and checkpoints. Browser
boundary code treats supplied manifests, value records, generated Wasm views,
events, and retained DOM as hostile:

- only bounded own data is copied;
- accessors, inherited values, sparse arrays, duplicate identities, unknown
  fields, contract drift, and out-of-range sentinels fail closed;
- dynamic input and generated error details are redacted;
- browser values cannot choose a Rust value-contract identity;
- native-event and DOM intrinsics are captured and canonical DOM is rechecked;
  and
- failed or asynchronous command results cannot be retried as though no
  mutation occurred.

`presentation: "url"` selects an HTML input presentation only. It performs no
scheme, origin, credential, host, or navigation-safety decision. The separate
browser-owned `safeLinkV1` renderer is the sole authority that turns a stored
Link string into `href`, `rel`, and `target`; unsafe but schema-valid strings
remain inert.

Callback-free declarations reduce executable boundary surface but do not
sandbox JavaScript. An installed npm package, application script, or other code
running in the same realm can call public APIs, inspect application state,
replace globals before initialization, and access DOM according to ordinary
browser authority. Extensions requiring hostile-code isolation need a separate
realm/process and message protocol; Alpha.7 does not provide one.

## Compatibility consequences

- Wasm ABI advances from 4 to 5. Browser, Wasm, and reference packages must be
  installed as an exact matching prerelease set.
- Existing button-only toolbar manifests retain their runtime meaning.
  TypeScript consumers that exhaustively assumed every
  `ToolbarControlDeclaration` was a button must narrow on `kind` before reading
  `command` or `activation`.
- The combined reference formatting toolbar adds Link between Highlight and
  Undo. The original Highlight-only toolbar is unchanged.
- Profile Bootstrap V2 JSON, compiler-contract fingerprint bytes, Document V2,
  Operation/Editor State/Transaction Request/Commit/Session Checkpoint V3,
  IndexedDB envelopes, and replay meaning remain byte-compatible.
- No reader sniffs or upgrades ABI, bootstrap, document, or checkpoint
  generations. An exact version mismatch fails before editor publication.

## Explicit limitations

Alpha.7 does not add:

- current-property hydration or an edit-existing-value mode;
- optional fields, integer fields, enums, colors, selects, comboboxes, menus,
  arbitrary widgets, or host callbacks;
- partial property patches, property deletion, coercion, normalization,
  cross-field rules, or async validation;
- arbitrary URL schemes or navigation authority in the form layer;
- dynamic manifest replacement, runtime semantic registration, hot unload, or
  independently compiled Rust/Wasm plugins;
- rich paste or reconstruction of source Link properties;
- collaboration, rebasing, selective undo, or remote profile negotiation; or
- sandboxing of same-realm JavaScript.

The first protocol intentionally proves only required URL-presented bounded
strings plus required Booleans for a complete-map inline-format set/remove
intent. Any wider field language or value hydration requires a separately
reviewed, versioned compatibility decision.
