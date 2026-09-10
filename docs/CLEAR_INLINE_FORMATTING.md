# Clear inline formatting

Status: implemented normative contract for the unpublished `0.3.0-alpha.10`
checkpoint

This decision adds one core-owned semantic command that removes all inline
format instances from the current text selection or from future typing at a
collapsed caret. It is built from Breditor's existing AST, selection,
transaction, operation, history, replay, Wasm, and toolbar contracts. It does
not adopt another editor's command, step, mark, or plugin protocol.

## Decision

The complete built-in identity bundle is:

- action `breditor/clear-inline-formats`;
- semantic intent `breditor/clear-inline-formatting`;
- binding `breditor/clear-inline-formatting-binding`, priority zero, disabled routing
  `Block`; and
- action-state entry `breditor/control-clear-inline-formatting`.

The action and intent accept no input. The state contract is stateless: Clear
Formatting is a command, not an on/off format, so its toolbar button never
publishes `aria-pressed`. Its availability is still derived by Rust. It is
enabled only when execution would remove at least one effective inline format
and disabled otherwise.

The action is built into every compiled Breditor base-text profile. A host may
omit its toolbar presentation, but cannot redefine or impersonate any of the
reserved identities above. A toolbar contribution names the semantic intent
and matching state entry; it never names a Rust handler or carries a callback.

## Selection semantics

Only a normalizable Breditor range selection inside the direct-root
document/paragraph/text grammar is supported. An absent, node, foreign,
unresolvable, or unsupported selection is rejected through the existing stable
selection reasons. No selection is inferred from DOM focus.

### Collapsed caret

Rust derives the effective typing formats exactly as the existing toggle and
typed-set actions do:

1. an explicit pending format set wins, including an explicitly empty set;
2. otherwise the caret's semantic text context and affinity determine the
   effective set.

If that set is nonempty, Clear Formatting leaves the document and selection
unchanged and sets pending formats to an explicit empty `FormatSet`. This
prevents following text from inheriting a format from adjacent content. The
state-only change uses `HistoryIntent::Record`. Under the existing session
contract, an operation-free state change does not create a standalone undo
entry. It closes merge continuity, updates the neighboring history snapshots,
and preserves an existing redo branch so subsequent undo/redo and typing retain
the exact state boundary.

If the effective set is already empty, the action is disabled with
`breditor/inline-format-unchanged`; it does not create a revision, history
entry, or redo-branch change.

### Extended range

For every selected text scalar, the complete `FormatSet` becomes empty.
Unselected prefix and suffix text retain their exact format instances and
property maps. Text bytes, Unicode scalar values, paragraph order, empty middle
paragraphs, selection direction, endpoint affinities, and spatial UTF-16
positions are preserved. Node paths and run-local offsets may canonicalize when
adjacent runs merge.

The range may cross any number of direct-root paragraphs supported by the
active limits. A range containing paragraph structure but no text is disabled
with `breditor/no-selected-text`. A nonempty range whose selected text is
already entirely plain is disabled with `breditor/inline-format-unchanged`.

After a successful extended-range command, pending formats become `None`,
matching the existing range-formatting actions. A later caret context is
therefore derived from the resulting document rather than from stale explicit
typing state.

## Mutation and replay contract

No new operation variant is introduced:

- a same-paragraph range produces one guarded `TextSplice`;
- a cross-paragraph range produces one same-count guarded `RootTextReplace`;
  and
- a collapsed caret produces no content operation and only the exact editor-
  state transition described above.

Each extended replacement is canonicalized. Adjacent plain runs merge inside
one paragraph, but text never merges across a paragraph boundary. The operation
guard contains the complete formatted source and its inverse contains enough
information to restore every removed kind and property map exactly.

Every successful command has `HistoryIntent::Record`. An extended-range command
forms one undo unit; the collapsed operation-free case follows the boundary
semantics above. Toolbar and `beforeinput` delivery request `closeBefore`,
separating the command from an open typing merge group. Undo and redo run
existing stored operations/state snapshots; neither reevaluates the action or
consults current JavaScript configuration. Session Checkpoint V3 therefore
persists and replay-proves this feature without a new codec or record
discriminant.

## Resource and failure contract

The selected replacement introduces no format or property value. Splitting a
formatted boundary run can still duplicate its retained property map across
the unselected prefix and suffix, so the action uses the same checked planning
discipline as every mutation:

- prove the normalized range before allocation;
- require capacity for one operation on an extended range;
- bound replacement strings and checked UTF-16 arithmetic;
- check paragraph, text-run, node, total-text, property-value, and property-
  string results before publication; and
- publish no partial state when construction, validation, or execution fails.

Expected inability is a disabled result with a payload-free stable reason.
Broken invariants are redacted `ActionFault` codes. Removed text, format IDs,
property names, property values, and URLs never enter diagnostics.

Clear Formatting is not secure erasure. The forward operation guard, inverse
operation, undo history, and a V3 checkpoint can retain the removed format
instances and property values so exact undo remains possible. Applications
that need data erasure must discard or compact the relevant history under a
separate retention policy.

## Browser presentation

The Showcase toolbar adds one stateless `Clear formatting` button before Undo
and Redo. Its state ID must correlate with the built-in stateless no-input
intent in the compiled descriptor. The browser uses the existing preserved-
selection command queue, so moving focus into the toolbar cannot replace the
semantic range.

Native `beforeinput` with `inputType="formatRemove"` routes to the same semantic
intent with a close-before boundary. Breditor still blocks every unsupported
format input type. This is not a general mapping from browser editing commands
to extension IDs.

The command changes only semantic AST formatting. DOM wrappers disappear on
the next authoritative projection. No DOM subtree is edited in place, and no
HTML is parsed back into the AST.

## Compatibility

Adding the built-in route expands process-local action, intent, and state
catalogs. Those catalogs are already counted and correlated by the existing
descriptor getters, so no Wasm method or ABI generation is required. Official
browser/Wasm prerelease packages must still match exactly.

The action-state catalog, Wasm descriptor reader, browser observer, and toolbar
snapshot reader admit 514 entries. This is the complete composable envelope of
four built-in states, 255 generated property-free toggle states, and 255
generated property-aware set states. Raising the former 512-entry observation
limit is monotonic: a profile admitted by alpha.9 does not become invalid merely
because alpha.10 adds the fourth built-in state. A toolbar manifest remains
independently capped at 64 presented controls and may select a subset of the
larger engine snapshot.

This feature changes no Profile Bootstrap V2 field, schema fingerprint input,
Document V2 shape, Operation/Editor State/Transaction Request/Commit/Session
Checkpoint V3 shape, storage wrapper, or renderer recipe kind. Because forward
and inverse history use existing operation variants, durable compatibility is
governed by the existing V3 rules.

`breditor/base@1` keeps the same schema ID and fingerprint: semantic command
catalog membership is intentionally outside the content-language fingerprint.
An alpha.10 runtime can restore an alpha.9 checkpoint with the same schema.
Alpha.9 can also decode a conforming alpha.10 V3 checkpoint whose history
contains only these existing operation variants, although prerelease package
pairing remains unsupported across versions.

## Explicit limitations

Clear Formatting removes every inline format kind from selected text. It does
not support an allowlist, denylist, extension ownership filter, partial
property clearing, or per-format preservation rule. It does not remove element
types, block properties, entity identities, annotations stored outside inline
formats, or application state.

The command does not add format exclusions, a formatting precedence system,
rich-paste import, arbitrary nodes, headings, lists, block code, collaboration,
runtime plugins, extension callbacks, extension-defined shortcuts, or a
general command composition language.

## Required proof

The checkpoint is incomplete until tests demonstrate:

- exact built-in action/intent/binding/state identities and descriptor order;
- stateless state shape and truthful enabled/disabled decisions;
- collapsed contextual and explicit-pending behavior at both affinities;
- same-paragraph forward and backward selections across plain, property-free,
  and typed-property runs;
- cross-paragraph ranges with empty middle paragraphs and seam aliases;
- preservation of unselected formatted edges and exact Link property maps;
- canonical plain-run merging without cross-paragraph merging;
- structural-only and already-plain no-op rejection;
- exact selection direction, affinity, and offset retention;
- operation budget and result-limit behavior with no source mutation;
- one-step extended-range undo/redo, redo-branch invalidation, the existing
  operation-free collapsed-history boundary, and no action reevaluation during
  replay;
- Session Checkpoint V3 encode/decode and restored undo/redo;
- Wasm descriptor/action-state/intent execution through ABI 5;
- `formatRemove`, toolbar, mixed-format DOM projection, autosave reload,
  accessibility, cleanup, and clean package-root consumer behavior; and
- unchanged schema fingerprints and durable-format generations.
