# Closed Text Size preset contract

Status: normative for the unpublished `0.3.0-alpha.13` source checkpoint

This decision adds one exhaustive integer-preset selector to Breditor's
existing property-aware inline-format architecture. It proves that the same
Rust-owned scalar, action, selection, history, replay, and persistence path can
drive a native `<select>` and an inert tokenized renderer without adding
feature-specific mutation code. It is not a font-size value language, arbitrary
CSS surface, string enum, or custom-widget protocol.

## Exact reference profile

The additive Size Showcase is a new semantic profile rather than a mutation of
the Color Showcase or any older durable identity:

- schema: `example/size-showcase-editor@1`;
- compiler-emitted schema fingerprint:
  `sha256:ec554b29919bd84ec013ea2af4d0248e1a3fabdcb1514bb642035871a49189d5`;
- extension: `example/text-size-extension@1`;
- inline format: `example/text-size@1`;
- required property: `example/text-size-step`;
- generated action: `example/set-text-size`;
- generated typed intent: `example/set-text-size-intent`;
- generated priority-zero blocking binding:
  `example/set-text-size-binding`; and
- generated tracked state: `example/text-size-presence`.

The profile reuses the exact four Color Showcase extension declarations and
appends the Text Size extension. Its fixed totals are five extensions, seven
extension-contributed formats plus built-in Strong, four property declarations,
four property-free toggle bundles, three typed-set bundles, nine intents, and
eleven action states including the four built-in sources. Browser presentation
has eight render recipes and eleven toolbar controls. The inherited shortcut
manifest remains unchanged; typed Text Size has no shortcut.

Existing Highlight, Formatting, Showcase, and Color Showcase profile values and
fingerprints remain byte-identical.

## Semantic integer and preset meanings

`example/text-size-step` is exactly one required JavaScript-safe integer with
inclusive bounds `0..=2`:

- `0` means the Small preset;
- `1` means the Large preset; and
- `2` means the Huge preset.

These three meanings are exhaustive for this reference format. Normal text is
represented by absence of `example/text-size`, not by a fourth integer alias.
The human labels, browser data tokens, and actual CSS ratios are presentation;
they do not enter the semantic property map or schema fingerprint.

The generated setter keeps the existing
`breditor/set-inline-format-input@1` complete-map shapes:

```json
{"operation":"set","properties":[{"name":"example/text-size-step","value":1}]}
```

```json
{"operation":"remove"}
```

The property list is already in strict qualified-name order. Missing,
additional, duplicated, misordered, non-integer, negative, or greater-than-two
values fail closed. JavaScript boundaries additionally reject negative zero.
There is no coercion from numeric strings, floating-point rounding, or fallback
to a nearby preset.

No Text Size-specific Rust action exists. Generic `SetInlineFormatAction`
continues to own the behavior:

- a collapsed caret updates the effective pending `FormatSet` without a
  document rewrite;
- a same-paragraph range uses one guarded `TextSplice`;
- a cross-paragraph range uses one guarded same-count `RootTextReplace`;
- peer formats, unselected text, empty middle paragraphs, direction, endpoint
  affinities, and resource limits are preserved; and
- exact set and absent-remove results are operation-free no-ops.

Uniform state carries the same exact integer property map. Partial presence or
different steps report `mixed`; absence reports `unset`. Presentation never
invents a fieldwise value for a mixed selection.

## Exhaustive safe integer-token rendering

`safeIntegerTokenV1` is a reusable callback-free browser policy with this closed
shape:

```ts
{
  kind: "safeIntegerTokenV1",
  propertyName: "example/text-size-step",
  tokens: [
    { value: 0, token: "small" },
    { value: 1, token: "large" },
    { value: 2, token: "huge" },
  ],
}
```

Policy admission requires an exact own-data graph. The token array is dense,
detached, frozen, and bounded to 32 entries. Values are safe integers other
than negative zero, strictly increasing, contiguous, and unique. Tokens are
unique bounded lowercase ASCII identifiers. The matching semantic format must
have exactly the named required integer property, explicit minimum and maximum
equal to the first and last values, and no second property. Consequently the
list exhausts every value the schema can admit.

The policy may appear only on a `span` recipe with exactly one static safe
class. It emits only the fixed attribute name
`data-breditor-integer-token`; neither the attribute name nor arbitrary DOM or
CSS text is supplied by a document:

```html
<span
  class="breditor-text-size"
  data-breditor-integer-token="large"
>…</span>
```

A missing, duplicated, additional, ill-typed, or unlisted projected value emits
no dynamic attribute. Canonical-DOM validation, native composition
reconciliation, semantic copy, and clipboard admission use the same inverse
policy predicate. An undeclared token, extra attribute, reordered or malformed
policy graph, accessor, proxy fault, or widened semantic property contract is
rejected rather than normalized.

The Size Showcase's unique outer-to-inner wrapper order is Link, Strong,
Emphasis, Highlight, Strikethrough, Code, Text Size, then Text Color. Keeping
Text Color innermost preserves its alpha.12 ancestor-color protection. Semantic
`FormatSet` order remains lexical and independent from DOM nesting.

The reference application stylesheet maps only the three exact class/token
pairs: Small is `0.875em`, Large is `1.25em`, and Huge is `1.5em`. A different
host may deliberately choose different ratios for the same semantic presets;
CSS is browser/application presentation, not durable schema meaning.

## Native integer select

The toolbar adds a second exact integer-field presentation while preserving
the RGB24 field unchanged:

```ts
{
  kind: "integer",
  propertyName: "example/text-size-step",
  label: "Text size",
  presentation: "select",
  minimum: 0,
  maximum: 2,
  defaultValue: 1,
  options: [
    { value: 0, label: "Small" },
    { value: 1, label: "Large" },
    { value: 2, label: "Huge" },
  ],
}
```

One select has 1 through 32 dense option entries. Values must be safe integers,
strictly increasing, contiguous, and exhaustive from `minimum` through
`maximum`; every label uses the existing bounded toolbar-label measurement and
the default must name one option. Sparse enums, disabled options, optgroups,
placeholders, editable/custom values, callbacks, and application DOM nodes are
not admitted.

The runtime creates a native single-select element and exact option topology.
It reads and writes only canonical decimal strings produced from admitted
integers. The browser retains native focus and arrow-key behavior; the existing
form Escape handling only closes the panel. Apply emits the complete typed-set
JSON through the preserved-selection queue. Reset emits format removal.

Pristine form hydration follows authoritative Rust state. A uniform step
selects its exact option. Unset or mixed state selects the declared Large
default without claiming semantic uniformity. A dirty draft retains the
existing refresh/rejection behavior and is cleared after completion or explicit
close/reset. Form selection and draft values are not documents, operations,
history entries, replay inputs, or persisted data.

The Size Showcase toolbar order is Bold, Italic, Strikethrough, Code,
Highlight, Text size, Text color, Link, Clear formatting, Undo, Redo. Apply is
labelled `Apply size`; removal is `Reset size`. Text Size has no shortcut because
the existing shortcut grammar intentionally executes no-input commands only.

## History, replay, clipboard, and persistence

Range set/remove remains one Rust-owned linear undo unit. Its forward and
inverse operations retain the exact integer alongside every peer format.
Undo/Redo restore document, directional selection, pending formats, and history
cursor without rerunning browser code. Document V2 stores only the integer;
Operation, Editor State, Transaction Request, Commit, and Session Checkpoint V3
already preserve it.

A collapsed pending-size change has no standalone content-history entry. It
still closes merge continuity and updates adjacent editor-value boundaries, so
later typed content can replay the pending format through ordinary content
history. This is the same existing law as Link and Text Color.

Semantic copy emits only a declared canonical token wrapper. HTML-only paste
may validate that exact wrapper in the compiled order, but current import still
flattens every source wrapper and property to plain text. Destination-format
inheritance may apply after insertion; that is not reconstruction of the source
Text Size value.

The React demo uses lineage `breditor-react-reference-size-showcase` and caller
slot `breditor.react-reference-size-showcase.v1`. It never reinterprets or
overwrites a Color Showcase checkpoint. Autosave continues to store the exact
fingerprint-bound Session Checkpoint V3.

## Compatibility

Alpha.13 adds no Rust production type, action, operation, intent contract,
state-value contract, history law, or replay variant. It changes no Profile
Bootstrap V2 shape, schema-fingerprint algorithm, Document V2, V3 durable
record generation, IndexedDB envelope, or Wasm method. Wasm ABI 5 remains
current.

The additions are one browser renderer policy, one exact integer-select field,
and a separate reference profile/application presentation. Official prerelease
packages still require exact version pairing. Alpha.13 packages remain
unpublished; registry installation examples apply only after a maintainer
publishes them.

## Deliberate limitations

- This is an exhaustive bounded integer, not a Rust enum, string enum, sparse
  value set, arbitrary number field, or semantic CSS length.
- Normal is absence of the format. It is not a stored option.
- A host controls the visual ratios. Tokens and CSS do not enter the schema
  fingerprint, so applications that require identical rendering must version
  and coordinate their presentation separately.
- Copied HTML depends on matching consumer CSS to appear sized. Paste still
  discards source size and every other format.
- Mixed state is whole-map observation, not per-field merging.
- The control is a native single select only. There is no custom popover,
  searchable list, optgroup, icon, preview, or dynamic option provider.
- Typed values have no shortcut, and a collapsed pending change has no
  standalone undo item.
- This does not add paragraph headings, block styles, arbitrary attributes,
  arbitrary CSS, callbacks, or a dynamic plugin runtime.
