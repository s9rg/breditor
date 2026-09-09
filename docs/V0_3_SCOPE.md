# Breditor `0.3.0` scope

Status: the `0.3.0-alpha.2` Rust-core checkpoint implements typed inline-format
editing, exact history, and property-preserving V3 operation/state/replay
codecs. Workspace manifests advance to alpha.2, but the packages remain
unpublished. Wasm ABI 3, browser construction, DOM rendering, clipboard
conversion, and toolbar input remain on the property-free surface.

`0.3.0` is the path from property-free formatting to semantic formats such as
links, mentions, text colors, and annotations. Alpha.1 defined and validated
their closed data language. Alpha.2 makes the safe paragraph-local part of
that language editable and replayable without claiming that every structural
edit or browser integration is complete.

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
  "properties": [
    { "name": "example/href", "value": "https://example.test" }
  ]
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

Three structural primitives are still property-free under a typed schema:
`ParagraphSplit`, `ParagraphJoin`, and `RootTextReplace`. Consequently typed
paragraph breaks, paragraph-boundary directional deletion, cross-paragraph
selection deletion or type-over, and multiline/root replacement fail closed.
`InsertPlainTextAction` remains on the structural root-replacement path and is
not the typed insertion boundary.

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

## Rust, Wasm, browser, and toolbar boundary

Rust provides memory safety, checked construction, exhaustive failures, compact
immutable values, and one deterministic implementation for native and future
Wasm hosts. It does not make ordinary typing automatically faster than
optimized JavaScript; its performance value is predictable validation/replay,
while small Wasm crossings still have a cost.

Alpha.2 does not widen Wasm ABI 3. The Wasm bootstrap cannot declare typed
property or set-action contracts, the browser descriptor cannot expose them,
and browser action input remains the property-free surface. Browser rendering,
copy/paste, persistence factory selection, reference Highlight integration,
and toolbar controls therefore do not yet exercise the Rust typed path.

Typed scalar validation is not sanitization. A valid link string is not
automatically a safe URL, and a valid color string is not automatically safe
CSS. URL schemes, renderer attribute allowlists, CSS grammar, HTML import, and
clipboard policy require separate browser-facing contracts.

## Remaining limitations

- Typed contracts apply only to inline formats, not elements or new node kinds.
- One text leaf can carry at most one instance of a format kind; independently
  overlapping instances of the same kind are not representable.
- Keys are closed and exact; unknown properties are not preserved.
- Typed declarations remain Boolean, JavaScript-safe integer, and bounded
  string only.
- Set replaces a complete property map; there is no property patch operation.
- Typed `ParagraphSplit`, `ParagraphJoin`, and `RootTextReplace` are not
  supported, with the action limitations described above.
- No V3 local-log/storage family exists.
- Wasm, browser projection, DOM rendering, toolbar input, HTML/clipboard
  conversion, and the reference package remain property-free.
- No migration, generation negotiation, collaboration transform, or unknown
  typed-format preservation is introduced.
- Host limits can make a portable schema uninhabitable on that host.

## Next checkpoints

The next Rust-core structural checkpoint must make paragraph split, paragraph
join, and root replacement preserve typed format instances and exact inverses
before lifting the corresponding action gates. The next durable checkpoint
must version the local-log graph around Session Checkpoint V3 rather than
placing V3 nested bytes inside a V1/V2 envelope.

Only after those Rust contracts are stable should Wasm/bootstrap descriptors,
typed browser input, safe callback-free rendering, toolbar controls, and
clipboard policy widen. Link URL policy must be explicit; it is not implied by
the scalar property contract.
