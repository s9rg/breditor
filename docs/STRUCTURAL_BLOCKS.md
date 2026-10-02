# Structural blocks: heading and list contract

Status: experimental Rust values and private child-grammar foundation. Headings
and lists are **not yet editable features**. The paragraph-only schema, existing fingerprints,
durable formats, Wasm ABI and browser renderer are unchanged. Links already
exist as typed inline formatting and must continue to work inside future blocks.

This document records the next implementation decisions and acceptance gates.
It does not silently widen the contracts in `DATA_CONTRACT.md`, `WASM_ABI.md`
or `V0_3_SCOPE.md`.

Verification: all 1,580 Rust workspace/doc tests pass, including the six initial
value tests and fourteen child-grammar tests. Workspace Clippy and Rustdoc pass
with warnings denied; the streaming recognizer additionally passes 10,000
fixed-seed cases against an independent count/order oracle. The prior value
checkpoint is recorded in [the foundation record](qualification/2026-10-01-structural-foundation.json).
All 17 release gates pass for this child-grammar checkpoint, including 25 Wasm
tests, 162 browser cases and 39 demo cases with zero retries; see the
[current verification record](qualification/2026-10-02-structural-child-grammar.json).
This does not qualify headings/lists as public browser features.

## Values implemented first

`breditor_core::block` owns behavior-free, checked values, one concept per file:

- `HeadingLevel`: exact ranks 1 through 6, checked before numeric narrowing.
- `TextBlockKind`: paragraph or heading with a checked rank.
- `OrderedListStart`: positive ascending numbering, 1 through 2,147,483,647.
  Computing a later ordinal rejects overflow and the domain ceiling rather than
  wrapping, saturating or silently restarting numbering.
- `ListKind`: bullet or ordered with an explicit checked start.
- `BlockValueError`: bounded diagnostic identities without caller payloads.

These values contain no text, HTML, CSS, mutable state, callbacks or identity.
They provide no unchecked deserialization and no conversion to an admitted AST.
Creating one is not a schema proof or permission to edit an existing document.
The tests cover exact boundaries, narrowing/wrap hazards, numbering overflow,
and wide-arithmetic property checks.

The initial numbering domain is deliberately limited: no zero/negative starts,
reversed lists, independent item-number overrides, task lists or marker-style
attributes. Those require explicit later contracts; the UI must not advertise
them. The ceiling does not increase document/node/depth or operation budgets.

## Semantic tree, not presentation metadata

A heading is a text block with a semantic rank, not a large-font paragraph or
an inline format. A list is a container owning list-item elements, not a string
with a bullet prefix. Text continues to use the existing canonical runs and
typed inline formats, including Link and Highlight.

The first proposed grammar is:

- Document: one or more block children.
- Text block: paragraph or heading; zero or more canonical text runs.
- List: one or more list items.
- List item: one or more text blocks, followed by zero or more nested lists.
- Nested lists are admitted only under list items, never directly under text.

The private schema compiler now supports bounded alternatives and ordered child
groups. Its test-only structural fixture proves these tree shapes, including
nested lists; it is **not** a complete heading/list schema. Exact closed element-
property contracts for heading rank and ordered-list start remain required.
A generic "properties allowed" Boolean is insufficient.

The child-grammar contract is deliberately restricted:

- One to eight ordered groups per element, with one to sixteen alternatives
  per group. An alternative is text or one exact registered element kind.
- Each group has an inclusive minimum and optional inclusive maximum. Zero
  maximum is allowed only with zero minimum. Aggregate minima must fit `u32`.
- Alternatives are sorted canonically. Duplicates within a group and overlap
  between groups are rejected, so parsing never guesses or backtracks.
- Group order is semantic; alternate declaration order within a group is not.
  Required groups cannot be skipped, exhausted groups cannot resume, and an
  unknown child cannot be silently removed or repaired.
- Matching uses constant auxiliary space with at most 128 kind comparisons per
  visited child. Existing document child, depth, node and diagnostic limits
  still apply independently; grammar bounds do not widen host budgets.
- Single-kind repeats retain the exact legacy fingerprint encoding. Any
  alternative set or multi-group sequence selects compiler-contract version 3;
  both group bounds and ordering enter its fingerprint.

No public structural schema factory, manifest contribution, durable action,
Wasm export or browser feature was added. The private shape fixture deliberately
omits heading/list properties. Structural schemas fail all three existing
paragraph-only operation capability checks.

Do not open the paragraph schema to unknown elements as an interim shortcut.
Do not expose a schema that permits new blocks to an editor while its editing
operations still assume that every root child is a paragraph.

## Structural transactions and action files

Implement actions separately with descriptive files and documented inputs:
`set_text_block_kind`, `wrap_list`, `unwrap_list`, `indent_list_item`,
`outdent_list_item`, and the list-item split behavior of paragraph insertion.
These names describe planned Rust modules, not a newly frozen wire protocol.

Each action must prepare against the exact current state, validate all targets
and final budgets, and produce one atomic core transaction. There is no
browser-authored tree rewrite, intermediate observable mutation, partial range
success, or post-commit "repair" pass. The existing browser FIFO remains the
one serialization point; a queued command must be admitted against fresh state.
Composition retains its exclusive lease over structural edits too.

Initial operation scope is contiguous sibling text blocks or list items under
one admitted parent. Unsupported cross-parent/nested combinations must return
explicit disabled reasons before mutating anything. Widen that scope only with
complete selection/history tests; do not approximate it by silently dropping
unselected content or flattening nested lists.

Planned policies requiring tests before exposure:

- Changing paragraph/heading kind preserves text, inline formatting, endpoints,
  direction and affinity. At a range ending exactly at the start of the next
  block, that next block is not implicitly reformatted.
- Enter in the middle of a heading creates two same-rank headings. Enter at its
  end creates a following paragraph. Enter in an empty heading converts it to a
  paragraph. Extended selection replacement remains one transaction.
- Enter in a nonempty list item splits the item. An empty item exits one list
  level, preserving following siblings and their numbering.
- Boundary deletion and joins have explicit target-kind and numbering rules.
  Text and nested descendants cannot disappear merely because kinds differ.
- Wrapping/unwrapping preserves paragraph order and all inline formats. Partial
  ordered-list splits preserve the displayed ordinals of retained items where
  representable; overflow rejects the whole transaction.
- Indent/outdent cannot create an orphan item or list, skip depth validation,
  or bypass node/property/history budgets.
- Adjacent-list merging requires identical marker policy and a proved numbering
  continuation. Lists with different starts are not merged heuristically.

## Selection, history, replay and persistence

Keep anchor and focus separate. Selection remains snapshot-local; DOM nodes,
flattened projection indices and Rust allocation addresses are not durable IDs.
Every structural operation must supply an exact relocation map for both text
offsets and empty-element child boundaries, including backward selections.
Moving a list item must relocate descendants, not only the moved container.

Undo restores the original tree, inline formats, selection and pending formats;
Redo restores the same result. Replay checks the exact before-state guards and
derives inverse recipes. A rejected structural transaction publishes no new
document, history, revision or checkpoint. Ordinary queue bookkeeping and
independent selection observations retain their existing semantics; rejection
must not poison an otherwise live queue. New edits invalidate redo using the
existing history contract. One toolbar action is one intentional undo unit.

Introduce a separately fingerprinted structural schema/profile and explicitly
version any durable recipe whose meaning or vocabulary changes. Do not change
what `breditor/base@1` or an existing profile fingerprint means. Old codecs must
reject unsupported structural data without silently flattening it. Migration,
if added, is an explicit atomic operation with its own history policy—not an
automatic side effect of opening a saved document.

Document export/import, session checkpoints with retained redo, recovery after
a runtime fault, local-log replay, compaction and reload all belong to the same
acceptance gate. New scalar values alone do not establish durable support.

## Browser projection and extensible toolbar

Rust owns availability, uniform/mixed state and the semantic action input. The
browser renders a validated projection and dispatches a declared intent; it
does not infer block state by scanning DOM tags. Heading selection and list
controls need explicit descriptor/state contracts, not a reinterpretation of
the current inline-format setter catalog.

Projection changes must preserve generation ownership, selection mapping and
the recent reentrancy/cleanup guards. Render semantic headings and list
containers, with host-controlled visual styles and accessible control names.
Clipboard plain-text serialization needs explicit list/heading boundary rules;
rich paste remains unsupported until a separate validated import contract exists.

There are only 49 bytes of JavaScript gzip headroom in the verified demo build
(224,951 / 225,000 bytes). The Wasm binary is 1,608,592 / 1,610,000 bytes.
Structural UI work therefore needs a measured bundle plan (for example,
separately loaded optional controls) before adoption. Do not silently raise
limits or delete correctness checks to fit a new feature.

## Integration order and completion gate

1. Checked values and boundary/property tests: implemented.
2. Closed structural grammar and fingerprint parity: implemented privately;
   exact element-property contracts and public structural profile still pending.
3. Guarded block-kind replacement, exact selection relocation and inverse replay.
4. Heading action/state, durable recipes, Wasm descriptor and browser projection.
5. Heading toolbar and Enter/delete/clipboard behavior across three engines.
6. List wrapping/unwrapping, item split/merge, nesting and ordinal preservation.
7. List toolbar, keyboard interaction, persisted history and native/mobile checks.

Keep steps 2–4 off the public editor path until their full vertical slice passes.
Each action gets deterministic regressions plus property tests for replay,
rollback and limit handling. Reuse the existing Link/Highlight tests inside
headings and lists, including empty blocks, Unicode, backward ranges, adjacent
lists with different starts, maximum-depth rejection and retained redo after
reload. Full release verification and fresh size measurements precede a claim
that headings or lists are ready to use.

## Reproduce the child-grammar checkpoint

From the repository root with the pinned Rust/Node toolchains available:

1. `cargo test -p breditor-core --lib schema::compiler --locked` checks the
   legacy byte/hash vectors, structural hash vector, compiler rejection cases,
   nested trees, codec binding, resource bounds and randomized sequence laws.
2. `PROPTEST_CASES=10000 PROPTEST_RNG_SEED=20261002 cargo test -p breditor-core --lib streaming_recognizer_matches_reference_language --locked`
   runs the recognizer against an independent count/order oracle.
3. `cargo test --workspace --all-features --locked`,
   `cargo clippy --workspace --all-targets --all-features --locked -- -D warnings`,
   `RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps --locked`,
   and `cargo fmt --all -- --check` check the whole Rust workspace.
4. `npm run build`, `npm run build --workspace @breditor/example-react`, and
   `node scripts/check-size-budgets.mjs` rebuild the shipped paths and measure
   their unchanged budgets. Building artifacts is not publishing them.

`npm run verify:release` is the wider 17-gate checkpoint, including Wasm-target
tests, packed-consumer reproducibility, unchanged ABI, and browser/demo matrices.

The next implementation slice is closed, typed element properties, followed by
guarded block-kind replacement and selection/history laws. This checkpoint
does not resolve the independent WebKit numerical fault.
