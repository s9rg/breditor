# Structural blocks: heading and list contract

Status: experimental Rust values, private child grammar, opt-in closed
integer element-property contracts, and a guarded Rust paragraph/heading-kind
operation. Headings and lists are **not yet browser editing features**.
The default paragraph-only schema, existing fingerprints,
durable formats, Wasm ABI and browser renderer are unchanged. Links already
exist as typed inline formatting and must continue to work inside future blocks.

This document records the next implementation decisions and acceptance gates.
The active [feature-expansion beta plan](FEATURE_EXPANSION_BETA.md) prioritizes
end-to-end headings and flat lists; nested lists and additional local-log work
are deferred from that beta unless required by its selected persistence path.
It does not silently widen the contracts in `DATA_CONTRACT.md`, `WASM_ABI.md`
or `V0_3_SCOPE.md`.

Prior child-grammar verification: all 1,580 Rust workspace/doc tests passed, including the six initial
value tests and fourteen child-grammar tests. Workspace Clippy and Rustdoc pass
with warnings denied; the streaming recognizer additionally passes 10,000
fixed-seed cases against an independent count/order oracle. The prior value
checkpoint is recorded in [the foundation record](qualification/2026-10-01-structural-foundation.json).
That earlier checkpoint passed all 17 release gates, including 25 Wasm
tests, 162 browser cases and 39 demo cases with zero retries; see the
[child-grammar verification record](qualification/2026-10-02-structural-child-grammar.json).
This does not qualify headings/lists as public browser features.

The subsequent element-property slice passes all 1,593 Rust workspace/doc tests,
44 feature-enabled schema tests, 31 default-feature schema tests, and two
10,000-case seeded property checks. Its first release run passed gates 1–14 but
failed the browser gate: one WebKit formatted-clipboard lifecycle case faulted
with `queueUncertain`; 161 other browser cases passed. Ten fresh focused reruns
passed. This is **not** an all-green release or evidence that the WebKit fault
is fixed. The original trace is retained, and no browser workaround is applied.
One separately recorded full recheck passed 162/162, followed by 39/39 demo
cases, all with zero retries. See the
[element-property verification record](qualification/2026-10-02-structural-element-properties.json)
for commands, hashes, the preserved failure and the limits of these results.

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
property contracts for heading rank and ordered-list start are implemented
behind `experimental-structural-properties`. Only the experimental text-block
profile described below admits headings; there is no public list profile.
A generic "properties allowed" Boolean is insufficient for those blocks.

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

That child-grammar checkpoint added no public structural schema factory,
manifest contribution, durable action, Wasm export or browser feature. The
later experimental text-block factory is described below. The shape fixture deliberately
omits heading/list properties. Structural schemas fail all three existing
paragraph-only operation capability checks.

### Closed integer element properties (experimental)

The opt-in Cargo feature `experimental-structural-properties` builds the private
compiler and validation support for one required bounded integer property per
element. It is a development/testing feature, **not** a switch that enables
heading/list editing. The default Wasm package does not enable it; adding this
unfinished code to that package exceeded its existing size budget.

The separate property fixture assigns `breditor/level` in `1..=6` to headings
and `breditor/start` in `1..=2147483647` to ordered lists. These internal fixture
names are not a frozen public structural document profile. Contracts are closed:
the named property is required, every other property is rejected, and strings,
Booleans, null, arrays and objects are not coerced into integers. No missing
value is defaulted to level/start one. Shared property-resource budgets remain
in force before publication. Duplicate JSON keys, fractions and unsafe integers
are rejected by the existing codec boundary.

The compiler rejects reversed bounds and a required contract on an element
that forbids properties. Bounds themselves use checked JavaScript-safe integers.
The first contract intentionally has no optional/defaulted properties, multiple
fields, string/Boolean element properties or extension manifest surface.
Diagnostics identify the element path, property name, expected/actual type or
range direction, without retaining the rejected payload value.

Compiler-contract version 4 binds the property name and inclusive signed bounds
alongside the existing complete grammar and inline-format contracts. Schemas
without element contracts retain version 1–3 bytes exactly, with the Cargo
feature enabled or disabled. Both configurations are checked separately.

This proves a start value, not the last displayed ordinal of a whole list.
`start + item_count - 1` overflow/ceiling validation, nested-list editing laws,
selection relocation and exact inverse recipes remain required before lists
can be admitted publicly.

Do not open the paragraph schema to unknown elements as an interim shortcut.
Do not expose a schema that permits new blocks to an editor while its editing
operations still assume that every root child is a paragraph.

## Experimental block-kind operation

The `experimental-structural-properties` feature now exposes
`CompiledSchema::try_compile_text_block_profile`, a separate sealed direct-root
paragraph/heading schema with extension-owned inline formats. Its complete
grammar, closed heading rank and ordinary canonicality laws are checked before
the compiler grants the block-kind capability. Existing paragraph-only
operations still reject this schema; the feature does not enable a usable
heading editor or change the shipped Wasm/browser profile.

`operation/text_block_kind_change.rs` owns `TextBlockKindChange`. A nonempty
contiguous root-child span carries complete expected source nodes and one
checked destination kind per block. The operation changes kind/rank while
retaining the exact text children, including typed Link properties. Source
guards, document proof, bounds and complete result budgets are checked before
publication. The inverse keeps each original kind/rank independently. Paths,
text offsets, child-boundary points, direction, affinity and pending formats
are preserved. Full result validation is intentionally linear in the bounded
document; no incremental structural proof is claimed.

`action/builtins/set_text_block_kind.rs` owns `SetTextBlockKindAction`. Each
registration has a fixed checked target and takes no input. Spatially ordered
selection endpoints determine the root span; an end at the next block's start
excludes that block. The action reports active/mixed/inactive state even when
resource limits disable it. An already-uniform target is disabled without a
revision or history entry; a changing action produces one transaction and undo
unit. Stale preparations and late failures leave the session and redo branch
unchanged.

Runtime undo/redo and reconstruction from already-proved in-memory checkpoint
parts are covered. Document V2 can retain these schema-validated element
properties. **Durable heading history is deferred:** operation, transaction,
commit and session codecs V1–V3 reject the new operation on either history
branch. They are not widened with a new tag. Separate durable recipes and
replay/size limits precede storage or Wasm/browser exposure. These now include
the experimental singular
[operation V4 codec](OPERATION_V4.md). The separate [transaction V4
codec](TRANSACTION_V4.md) supports atomic request persistence, and
[Session Checkpoint V4](SESSION_CHECKPOINT_V4.md) preserves the retained undo/redo
history. Commit and local-log formats have not yet advanced.

## Structural transactions and action files

Implement actions separately with descriptive files and documented inputs.
`set_text_block_kind` is implemented experimentally. Planned modules include
`wrap_list`, `unwrap_list`, `indent_list_item`, `outdent_list_item`, and the
list-item split behavior of paragraph insertion. These names do not establish
a newly frozen wire protocol.

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

The October 3 block-kind checkpoint has only 47 bytes of JavaScript gzip
headroom in the demo build (224,953 / 225,000 bytes). The default Wasm binary
is 1,609,363 / 1,610,000 bytes. The experimental feature is still excluded;
shared compiler/codec refactoring can affect generated default-build bytes.
Structural UI work therefore needs a measured bundle plan (for example,
separately loaded optional controls) before adoption. Do not silently raise
limits or delete correctness checks to fit a new feature.

## Integration order and completion gate

1. Checked values and boundary/property tests: implemented.
2. Closed structural grammar and fingerprint parity: implemented privately;
   required integer element properties are opt-in and tested. A complete public
   structural profile and cross-child numbering laws are still pending.
3. Guarded block-kind replacement, exact selection relocation and inverse replay:
   implemented behind the experimental feature, including the configured action.
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

For the new property slice, use
`cargo test -p breditor-core --lib --features experimental-structural-properties schema::compiler --locked`.
Prefix it with `PROPTEST_CASES=10000 PROPTEST_RNG_SEED=20261002` to run the grammar
and integer-admission property checks at the larger fixed-seed count. Run the same schema
filter with `--no-default-features` to check the shipped configuration separately.

Experimental V4 preserves heading-kind changes; V5 below adds heading text-edit
operations, atomic requests and retained session history. Wasm projection and UI
remain pending. Commit/local-log expansion is not required by the beta plan.
List-wide numbering validation remains required before lists. WebKit evidence
is tracked separately in `WEBKIT_CLIPBOARD_INVESTIGATION.md`.

## Reproduce the block-kind checkpoint

The [October 3 verification record](qualification/2026-10-03-heading-kind-operation.json)
records 20 focused tests, 10,000 seeded history cases, 1,616 workspace/doc tests,
697 default-feature unit tests, and all 17 release gates passing, including
165 browser and 39 demo cases with zero retries. This qualifies the bounded
Rust implementation and regression checks, not browser heading support.

1. `cargo test -p breditor-core --lib --all-features --locked text_block_kind`
   checks source guards, atomic failure, ranks, selection, typed inline formats,
   action state, undo/redo, in-memory reconstruction and legacy codec rejection.
2. `PROPTEST_CASES=10000 PROPTEST_RNG_SEED=20261003 cargo test -p breditor-core --lib --all-features --locked randomized_block_kind_history_restores_exact_tree_and_selection`
   checks randomized mixed ranks, Unicode and selection direction through exact
   inverse replay.
3. `cargo test -p breditor-core --lib --no-default-features --locked` and
   `cargo clippy -p breditor-core --lib --no-default-features --locked -- -D warnings`
   check the default, nonstructural configuration independently.
4. `npm run verify:release` checks the full Rust and shipped browser paths.

The [Session Checkpoint V4](SESSION_CHECKPOINT_V4.md) tests round-trip heading
changes on both undo and redo branches, replay from an independent decoded
state, reject stale source guards and malformed ranks, enforce
operation/history/byte limits, and retain old format rejection tests.
A browser toolbar is not enabled by passing these Rust-only checks.

## V5 heading text-edit persistence

The explicit Operation, Transaction Request and Session Checkpoint V5 envelopes
retain their existing format names and schema ID/fingerprint binding, but require
`formatVersion: 5`. They do not accept older outer versions. Host code may
explicitly decode an older supported format and encode its validated runtime
value as V5; changing the version number on arbitrary saved JSON is not migration.

The closed operation union retains V4's admitted payloads and adds:

- `textBlockSplice`: exactly `kind`, `block`, `start`, `end`, `expected`,
  `replacement`. `block` is a direct-root child index; `start`/`end` are ordered
  block-local UTF-16 offsets. `expected` is a synthetic document root with
  **exactly one complete source block**. `replacement` uses the established
  property-preserving text-fragment shape: `runs`, each with `text` and `formats`.
  It has no replacement kind: the primitive preserves its source kind/rank.
- `textBlockReplace`: exactly `kind`, `start`, `end`, `expected`, `replacement`.
  Each boundary has exactly `block` and `offset`. Both node sequences use the
  existing document-node language under a synthetic root. The expected sequence
  covers the whole intersected source span; the replacement sequence is nonempty
  and explicitly supplies each result block's kind/rank and inserted text.
  Surviving prefix/suffix text attaches to its first/last blocks respectively.

Block indexes use checked unsigned 32-bit integers; offsets use checked exact
safe integers and must resolve to scalar boundaries. Fractions, exponents, null,
strings, overflow, unknown/duplicate fields and noncanonical run/property data
are rejected rather than coerced. Trees/fragments pass borrowed allocation
preflight before owned reconstruction, followed by compiled-schema validation.
Outer bytes and operation counts bound requests; session admission additionally
bounds retained nodes/text/properties and aggregate forward operations.

Static decode does not prove a recipe applies to a live document: application
rechecks complete source guards and validates the full result, including retained
siblings. A late operation or final-selection failure cannot publish a partial
request. Transaction metadata, pending formats and snapshot binding keep their
existing contracts. Earlier schemas are not implicitly granted structural editing.

Session V5 embeds Editor State V3 (Document V2), saves chronological forward
recipes and result editor values, and preserves capacity, cursor, revision and
open merge group. Every retained boundary, including future redo entries, is
forward-replayed and inverse-proved before a session is returned. No serialized
inverse is trusted or accepted. Restored runtime preparation stamps are new.

Same-count formatting relocation preserves positions only when each corresponding
block retains identical logical text; changing run layout is not deletion.
This law is derived from the decoded operation, not asserted by an extra wire flag.
V1–V4 and their golden encodings remain unchanged. The V5 family is experimental
and does not add a Commit/local-log format or enable the shipping browser profile.
