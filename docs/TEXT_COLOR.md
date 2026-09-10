# Closed RGB24 text-color contract

Status: normative for the unpublished `0.3.0-alpha.12` source checkpoint

This decision adds one deliberately closed text-color presentation to
Breditor's existing typed inline-format architecture. It is a vertical proof
that a required integer property can travel through the generic Rust action,
selection, history, replay, Wasm, browser projection, toolbar, clipboard, and
persistence paths. It is not a general CSS or theme-token extension API.

## Exact reference profile

The additive Color Showcase is a new semantic profile rather than a mutation
of any earlier reference profile:

- schema: `example/color-showcase-editor@1`;
- compiler-emitted schema fingerprint:
  `sha256:b3d051b7a68a15ef8d47ce2a7c4f051a76d09c386f9545f7b955590d2cc7433d`;
- extension: `example/text-color-extension@1`;
- inline format: `example/text-color@1`;
- required property: `example/rgb24`;
- generated action: `example/set-text-color`;
- generated typed intent: `example/set-text-color-intent`;
- generated priority-zero blocking binding:
  `example/set-text-color-binding`; and
- generated tracked state: `example/text-color-presence`.

The profile reuses the exact Highlight, Link, and text-styles extension values
from the earlier Showcase, then appends the text-color extension. Its fixed
counts are four extension declarations, six extension-contributed inline
formats plus built-in Strong, three property declarations across Link and text
color, four generated property-free toggle bundles, two generated typed-set
bundles, and ten action-state entries including the four built-in sources. The
complete browser presentation has seven render recipes and ten toolbar
controls. The inherited shortcut manifest still has seven state declarations
and eight chords; text color has no shortcut.

These counts describe this reference profile, not new global compiler limits.
Existing Highlight, Highlight + Link, and Showcase profile identities and
fingerprints remain unchanged.

## Semantic value and Rust ownership

`example/rgb24` is exactly one required JavaScript-safe integer with inclusive
bounds `0..=16_777_215` (`0x000000..=0xffffff`). It is an opaque 24-bit sRGB
value with red in the high byte, green in the middle byte, and blue in the low
byte. CSS source text never enters the semantic document.

The generated `InlineFormatSetSpecV1` uses the existing
`breditor/set-inline-format-input@1` contract. Set and removal are exactly:

```json
{"operation":"set","properties":[{"name":"example/rgb24","value":16711935}]}
```

```json
{"operation":"remove"}
```

Set replaces the complete property map; it is not a patch. The property array
is already in canonical qualified-name order. Missing, additional, duplicated,
misordered, non-integer, negative, or greater-than-`0xffffff` values fail
closed. The browser and reference JavaScript helpers additionally reject
negative zero instead of treating it as a color alias. Rust revalidates the
typed input against the compiled property contract when the intent executes.

No text-color-specific Rust action exists. The existing generated
`SetInlineFormatAction` owns all semantics:

- at a collapsed caret, set/remove changes the effective pending typing
  `FormatSet` without rewriting document content;
- in a nonempty same-paragraph selection it emits one guarded `TextSplice`;
- across direct-root paragraphs it emits one guarded same-count
  `RootTextReplace`;
- unselected text, peer formats, empty middle paragraphs, selection direction,
  endpoint affinities, and limits remain authoritative in Rust; and
- exact set and absent-remove results remain operation-free no-ops.

The tracked state is `unset` when color is absent, `uniform` only when every
selected character has the same complete RGB24 map, and `mixed` for partial
presence or differing values. A collapsed selection observes its effective
pending/context formatting. The state value uses the same
`breditor/set-inline-format-input@1` complete-map representation, so one
uniform value can hydrate the form without conversion loss.

## History, replay, and persistence

An effective range set/remove is one Rust-owned linear undo unit. Its exact
forward and inverse operations preserve RGB24 alongside every peer format;
Undo and Redo restore the document, directional selection, pending formats,
and history cursor. Session Checkpoint V3 stores and replay-proves those same
generic typed operations, including the redo branch. Document V2 stores color
as the integer property, never as a CSS string.

A collapsed pending-color change is deliberately subtler: it is a state-only
edit with no content operation and therefore creates no standalone undo entry.
It still forms an exact history boundary, updates the adjacent history
snapshots, closes typing merge continuity, and preserves an existing redo
branch. Later content typing captures that pending color in ordinary history,
so subsequent undo/redo can restore it through the neighboring content edit.

Browser autosave continues to persist the exact fingerprint-bound Session
Checkpoint V3. The React demo uses the new lineage
`breditor-react-reference-color-showcase` and caller slot
`breditor.react-reference-color-showcase.v1`; it does not attempt to reinterpret
an alpha.11 Showcase record. A fingerprint or slot mismatch remains preserved
evidence and is never repaired, deleted, or overwritten implicitly.

## Closed browser renderer

`safeTextColorV1` is a zero-configuration browser-owned attribute policy. It
is accepted only when all of the following match exactly:

- format `example/text-color@1`;
- one required integer property `example/rgb24` bounded to
  `0..=16_777_215` and no other property;
- recipe element `span`;
- sole class `breditor-text-color`; and
- sole policy value `{ "kind": "safeTextColorV1" }`.

For a valid projected integer, the renderer synthesizes exactly one raw DOM
attribute:

```html
<span class="breditor-text-color" style="color:#rrggbb">…</span>
```

The hexadecimal digits are lowercase and zero-padded to six digits. The style
contains no whitespace, trailing semicolon, alternate color function,
additional declaration, or caller-supplied text. Missing, duplicated,
additional, ill-typed, or out-of-range projected values yield no dynamic
attribute and cannot inject a different style. Canonical-DOM validation,
composition reconciliation, semantic clipboard serialization, and clipboard
admission use the same exact attribute predicate.

Semantic `FormatSet` storage remains lexically ordered as Strong, Code,
Emphasis, Highlight, Link, Strikethrough, then Text Color when all are present.
The independent renderer order graph produces the deliberate outer-to-inner
DOM chain Link, Strong, Emphasis, Highlight, Strikethrough, Code, Text Color.
Text Color is innermost so an ancestor recipe's author color cannot override
the selected inline value merely through nesting order.

## Native toolbar field

The callback-free toolbar vocabulary gains one deliberately closed required
integer field:

```ts
{
  kind: "integer",
  propertyName: "example/rgb24",
  label: "Text color",
  presentation: "rgb24",
  minimum: 0,
  maximum: 16_777_215,
  defaultValue: 0x5b21b6,
}
```

Only the exact RGB24 bounds and a valid in-range default are admitted. The
runtime presents it as a native `<input type="color">`. It converts semantic
integers to lowercase `#rrggbb`, and accepts only that canonical seven-scalar
form back from the native control before constructing the integer. Apply sends
one complete, lexically ordered typed-set JSON request through the existing
preserved-selection command queue; Remove sends the property-free removal
request. The browser does not mutate contenteditable DOM or call extension
JavaScript.

Pristine form hydration follows Rust state: uniform color populates the exact
picker value, while unset or mixed state uses the declared default without
inventing a fieldwise merge. A dirty draft survives state refresh and rejected
dispatch. Completion or close/reset discards the draft before authoritative
hydration. Form state and drafts are browser presentation only; they are not
documents, operations, history entries, replay inputs, or persisted values.

The Color Showcase toolbar order is Bold, Italic, Strikethrough, Code,
Highlight, Text color, Link, Clear formatting, Undo, Redo. The color launcher
intentionally has no keyboard shortcut because it requires a value and native
picker interaction. Existing no-input shortcut declarations remain unchanged.

## Clipboard and composition

Semantic copy may emit the exact canonical text-color span and style above.
HTML-only paste may recognize that exact wrapper in the
already checked renderer order, but the current paste action still flattens all
source wrappers and properties to plain text. Inserted text inherits one
complete destination `FormatSet` when the existing insertion rules provide
one; this is destination inheritance, not source-color preservation.

Composition remains temporary browser evidence. Its reconciliation path admits
only the exact policy-derived dynamic attribute and ultimately commits plain
replacement text through Rust, inheriting semantic destination formatting
under the existing composition contract. The DOM is never adopted as the
document AST.

## Compatibility

Alpha.12 adds no Rust type, action, operation, intent contract, state-value
contract, history law, or replay variant. It changes no Profile Bootstrap V2,
schema-fingerprint algorithm, Document V2, Operation/Editor State/Transaction
Request/Commit/Session Checkpoint V3, IndexedDB envelope, storage contract, or
Wasm method. Wasm ABI 5 remains current.

The additions are browser/reference presentation data and package-root types:
the exact `safeTextColorV1` render policy, exact RGB24 integer toolbar field,
conversion helpers, and the separate Color Showcase profile/fixtures. Official
prerelease packages still require exact version pairing. Alpha.12 packages are
unpublished; registry installation examples apply only after a maintainer
publishes them.

Alpha.13 leaves this Color Showcase contract and fingerprint byte-identical.
Its separate Size Showcase keeps Text Color innermost while adding Text Size
immediately outside it; neither policy widens the other. Alpha.13 packages are
also unpublished. See [`TEXT_SIZE_PRESETS.md`](TEXT_SIZE_PRESETS.md).

## Deliberate limitations

- The semantic value is opaque 8-bit-per-channel sRGB only. There is no alpha,
  background color, gradient, named color, CSS function, custom property,
  theme token, palette identity, wide-gamut color space, or color conversion.
- Breditor does not compute or guarantee text/background contrast. The host is
  responsible for accessible palette policy and testing.
- Rendering uses one inline `style` attribute. A deployment's Content Security
  Policy, including `style-src-attr`, may suppress it; Breditor does not add a
  nonce, hash, stylesheet rule, or CSP bypass. Forced-colors modes, user styles,
  browser settings, and extensions may also replace the visible result.
- Native `<input type="color">` UI, keyboard access, supported color-picking
  affordances, and visual appearance vary by browser and operating system.
  Breditor's semantic value remains RGB24, but this checkpoint makes no
  cross-device picker-experience claim.
- Rich paste remains intentionally formatting-losing. Even canonical Breditor
  color markup is flattened to plain text and does not carry source RGB24 into
  the inserted document.
- Text color has no shortcut. The shortcut grammar executes no-input intents
  and history commands; it does not open typed forms or invent a value.
- A color applied at a collapsed caret changes pending typing state without a
  standalone undo step. Its effect becomes traversable through later content
  history as described above.
- This is not arbitrary style admission, a general renderer callback, a theme
  system, or a dynamic plugin protocol.
