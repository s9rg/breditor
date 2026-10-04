# Structural blocks: heading and list contract

Current status: headings and flat lists have separately built experimental browser
demos. Flat lists include gated Rust structural editing, exact history/recovery,
the high-level browser owner, input routing, toolbar and visible autosave/backup
UI. They are **not yet a qualified shipping release**: physical native-input and
release gates remain open. The historical checkpoints below explain the route
to these features. The default paragraph-only schema and existing fingerprints
remain unchanged. Links remain typed inline formatting inside structural blocks.

The disposable clipboard/formatting checklist has now been observed passing in
native Safari and Chrome app control, including cross-item text, heading/list
conversion and Link history. This is one agent-operated run per browser, not
physical human-input, OS IME or screen-reader certification. See the
[native desktop record](qualification/2026-10-04-list-native-desktop.json);
release qualification and the earlier intermittent faults remain open.

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

That is the longer-term grammar, not the flat-list beta admission rule. The
implemented beta grammar at the end of this document restricts each list item
to exactly one paragraph or heading, without nested lists.

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
history. Commit V5 now also supports the heading edit language (see below);
the local-log format has not advanced.

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
and does not enable the shipping browser profile. The subsequent opt-in Wasm
bridge adds Commit V5 below; local-log formats remain unchanged.

### Commit V5 and the opt-in Wasm bridge

`CommitJsonCodecV5` uses the explicit `breditor/commit` version 5 envelope,
Editor State V3 for the before-state, and the same closed V5 forward-operation
language. It replay-proves the transaction, rejects noncanonical forward recipes,
and derives inverses and relocation maps instead of trusting them on the wire.
It preserves final selection, pending formats and metadata, including state-only
commits. Decode enforces byte and operation-count limits before materializing
operations; encode requires the exact runtime context and the same byte budget.
V1–V3 Commit codecs remain closed. There is no Commit V4 or local-log upgrade.

The Wasm crate's `experimental-text-blocks` feature is off by default. It adds
`BreditorCompiledProfile.fromBootstrapJsonV3`, which retains the closed typed
extension declaration shape of bootstrap V2 but explicitly compiles the heading
profile. Neither bootstrap entry point accepts the other's version.
`createEngineFromDocumentJsonV5` takes Document V2; and
`createEngineFromSessionCheckpointJsonV5` replay-proves Session V5. Engine
mutations retain checkpoint-before-publication semantics. These engines export
Document V2, Editor State V3, Session V5, and Commit V5—these formats intentionally
do not share a single version number. Heading string actions require their exact
registered input contracts; paragraph-only action IDs are not aliases.

This is an opt-in developer boundary, not an addition to the default npm package.
Generated bindings can be checked with
`node scripts/check-experimental-heading-wasm.mjs <wasm-bindgen-output-dir>`.
That check exercises actual Wasm under Node, not browser DOM/native-input behavior.
The public optional package/startup contract, browser toolbar/input, and desktop
qualification remain separate work. Projection/rendering are covered below.

Reproduce the complete developer heading check from the repository root with the
locked Rust toolchain, wasm-bindgen CLI 0.2.127 and installed Playwright engines.
Build the regular packages first so the browser modules and shipping comparison
artifacts are current:

```sh
npm run build
npm run test:headings:experimental
```

The second command compiles only in `target/heading-cargo`, never the default
Cargo output tree. It generates a fresh `target/heading-candidate-*`, minifies
the glue with pinned Rolldown, checks the exact additive declaration delta and
TypeScript consumer expectations, checks path remapping, and runs Node/jsdom and
three-browser scenarios. It verifies that every shipping Wasm and browser dist
file remained unchanged. Only a completely passing run writes qualification.json,
including content hashes and measured size; failed candidates remain inspectable.
No candidate is a publishable npm package or default release-size baseline.

### Experimental heading browser projection

`BreditorProjection.headingLevel` is feature-gated with the heading Wasm build.
It reports only checked heading ranks and uses explicit JS values rather than
optional-number sentinel transport. The browser's separately selected
`consumeTextBlockSemanticProjection` consumes that view under an exact owned
profile descriptor/generation. The legacy consumer remains paragraph-only.
Updates inherit the initial projection's experimental factory and cannot mix
legacy/experimental projection modes. All child handles retain existing
single-consumption, cleanup and reentrancy checks.

For this direct-root text-block slice, the existing projection collection name
`paragraphs` remains an adapter compatibility name, not a claim that headings
are paragraphs. Optional immutable `headingLevel` metadata controls semantic
`h1`–`h6` rendering. Rank changes participate in equality, DOM drift checks,
incremental replacement and composition structure checks. Native DOM selection
points keep the same AST paths and scalar-aligned UTF-16 rules.

The aggregate command includes both following checks. To inspect an existing
candidate separately, substitute its printed directory for `<candidate>`:

```sh
node scripts/check-experimental-heading-dom.mjs <candidate>
node scripts/check-experimental-heading-browsers.mjs <candidate>
```

The first check uses jsdom. The second serves a local harness and runs five
fresh editor owners each under Playwright Chromium, Firefox and WebKit. Both
exercise the same real-Wasm scenario, including restore/undo/redo; neither
asserts native keyboard, clipboard, IME, Safari-app or mobile qualification.
The ordinary demo has not switched to the heading profile.

### Browser V5 persistence and command delivery

`WasmDurableJsonContract` and the command adapter accept explicit `v5`. This
selects Session V5 with State V3 and Document V2; it is not inferred from JSON.
Document checks admit only direct-root paragraphs and checked `breditor/heading`
ranks 1–6, including empty blocks, and count ranks in the property-value budget.
Projection correlation includes exact rank. Legacy modes remain paragraph-only.

Session preflight admits the three new guarded text-block payloads plus the
inherited payload language, enforcing canonical keys, full synthetic-root guards,
typed fragments, static spans and resource ceilings. Source text/selection
validity and complete retained-result accounting remain Rust restore's job.
Passing preflight alone does not prove that a recipe applies to its live source.

The shared real-Wasm scenario uses both direct engine commands and the regular
browser adapter. The latter owns the exact generation already bound to the
projection, not an interchangeable clone. It exercises normal selection writes,
validated save reads, typing, kind intent, undo and save/restore/redo; after redo
the document, selection and pending formats must match the saved editing state.
The test harness supplies native Selection/Range constructors under jsdom.
Public startup and native event/toolbar wiring remain separate acceptance gates.

### Normalized plain-text paste

The experimental `InsertTextBlockPlainTextAction` accepts the existing bounded
plain-text input contract, not rich HTML. It represents the complete selected
range replacement with one `TextBlockReplace` and independent history. Single
lines retain the spatial start kind. Multiple lines retain the start kind on
the first block, use paragraphs for middle lines, and keep the end kind only
when a suffix of that source block survives on the final line. Otherwise the
last line is a paragraph. Empty lines are not discarded.

Formatting inheritance follows typing: pending formats/focus affinity at a
caret, first spatially selected text for ranges, then left/right surviving
seams for text-empty structural ranges. All inserted lines use that complete
format set. Prefix/suffix text retains its own properties. Undo restores every
source kind, directional point and pending format exactly, including after V5
session reload. Default profile registration and browser routing remain unchanged.

## Flat-list beta document admission

`CompiledSchema::try_compile_flat_list_profile` is now available only behind
`experimental-structural-properties`. It composes existing inline extensions
with this sealed grammar:

- Document: one or more paragraphs, headings, bullet lists or ordered lists.
- Bullet/ordered list: one or more list items.
- List item: exactly one paragraph or heading. No second block or nested list.
- Paragraph/heading: the existing canonical text runs and typed inline values.
- Heading: exactly `breditor/level` in 1–6. Ordered list: exactly `breditor/start`
  in 1–2147483647, with every displayed ordinal inside that range too.
- Other elements have no properties. All structural elements forbid entity IDs.

For example, an ordered list starting at 2147483647 may contain one item but
not two. A valid start is insufficient: the validator checks the final ordinal
using checked wide arithmetic before document publication. This extra rule is
bound into compiler-contract fingerprint version 5, independently of operation
and session codec version numbers. Existing version 1–4 fingerprint bytes remain
unchanged, including the heading schema. No existing history codec gained a
new operation tag.

Document V2 can round-trip this schema's tree through explicit fingerprint
binding. List containers and items count toward ordinary node/depth/child
budgets; heading ranks and ordered starts count toward property budgets.
Range selections reach text or text-block child boundaries inside list items,
including empty paragraphs, with existing scalar checks and direction/affinity.
List/container boundaries are not admitted as range-selection endpoints.

This is **not an editable profile yet**. Existing paragraph and
heading operations deliberately do not gain a list-schema capability. There
is no compiled list action profile, Wasm bootstrap, projection, toolbar, or list-history
wire route at this checkpoint. The running heading demo still uses the prior
qualified heading-only artifact.

### Next operation and action contracts

The first list-aware operation, `FlatListReframe`, now reframes a guarded nonempty
root-child span without changing the sequence or values of its contained text
blocks. It supports wrapping, unwrapping, retyping, restarting and regrouping list
containers while preserving all paragraph/heading ranks, text runs and typed
format properties. Complete expected roots guard both content and numbering.
Both standalone fragments and the complete resulting document must pass the
same context's validation. No-op recipes still check their source guards.

Its inverse exchanges source and replacement roots. Selection endpoints retain
their leaf/child-boundary representation, UTF-16 offset and affinity through a
block-prefix path map; untouched following roots shift by the root-count delta.
Generic list/item/root-interior boundary points canonicalize to the same gap's
affinity-owned adjacent text-block boundary. They are never reported as deleted;
their removed wrapper provenance is not promised to round-trip. These structural
points remain invalid as range-selection endpoints. Runtime history restores
exact document, directional selection and pending formats, including composed
reframes. A failed later operation publishes nothing and preserves redo.

Only a separately proved exact flat-list schema grants this operation. The
capability matches canonical grammar alternatives, including the required
final-ordinal rule; changing that rule does not grant editing permission.
Operation codecs V1–V5 reject this new runtime kind, and Session V5 refuses
history containing it. This checkpoint adds no durable list tag or browser route.

Separate `wrap_list` and `unwrap_list` action files now prepare those edits
against the exact current state and publish one atomic history event. The
selection's spatial span, not anchor direction, chooses targets; an end at the
next text block's start excludes that block. Partial list-item spans retain
unselected prefixes/suffixes rather than flattening the whole list.

Splitting an ordered container during unwrap or empty-item exit must preserve
the original ordinals of surviving following items by explicitly setting the
suffix start. Inserting/removing an item within a retained contiguous ordered
list uses normal ascending renumbering, with overflow checked before commit.
Merging adjacent containers must not silently discard an explicit start.
Mixed root/list ranges, boundary deletion, pending formats and stale-preparation
behavior require explicit tests before UI exposure. Nested lists, multi-block
items, reversed numbering and per-item number overrides remain deferred.

See [schema qualification](qualification/2026-10-03-flat-list-schema.json).
Runtime operation evidence is recorded separately in
[reframing qualification](qualification/2026-10-03-flat-list-reframe.json).

### Selection-driven wrap/unwrap actions

`WrapListAction::new(ListKind)` and `UnwrapListAction` are public, no-input Rust
actions behind the experimental feature. Hosts explicitly register them under
their chosen action identities; neither the default nor heading profile adds
them automatically. Their tracked state exposes active/mixed/inactive selection
coverage and declares selection-dependent reads and selection-changing writes.

- Wrapping selects whole touched text blocks without changing their content or
  kind. A collapsed empty-block caret selects that block. Only a later block's
  logical start is excluded, not a later text run's offset zero.
- Consecutive selected bare blocks become one list. Existing source containers
  remain distinct. A partially converted list keeps its unselected prefix and
  suffix in the original marker family and with original ordinal starts.
- Wrapping is a **set-marker action, not a toggle or restart**. Already matching
  containers remain whole, even when only part is selected. The numbered target's
  explicit start applies only to newly created sections; already-numbered lists
  retain their individual starts. Adjacent containers are not automatically
  coalesced, so explicit restarts are not silently lost.
- Unwrap lifts only selected items into bare paragraph/heading blocks. Bare
  blocks stay untouched; numbered suffixes retain their old first ordinal.
- The same marker on every touched block is active/disabled for wrap. No list
  item in the selection is inactive/disabled for unwrap. Mixed coverage remains
  observable even when an operation or result budget prevents execution.
- One enabled action emits one guarded reframe/history event, relocates selection
  strictly and preserves pending formats. Disabled execution rejects without
  changing state, revision or redo. A stale prepared action cannot overwrite a
  later marker choice. Full-tree result limits and final ordinals are previewed
  before offering an enabled command.

This milestone does not implement a numbered-list restart action, Enter/exit,
list typing/deletion/formatting, durable history or browser controls. See
[action qualification](qualification/2026-10-03-flat-list-actions.json).

### Single-block list text edits and typing

`FlatListTextSplice` edits aggregate scalar-aligned UTF-16 coordinates in a bare
paragraph/heading (`[root]`) or a flat-list item's block (`[root, item, 0]`). Its
guard is the **complete containing root child**, including numbering and sibling
items. This conservative contract rejects even a disjoint edit in that list;
other root siblings are not guarded. It does not change list structure, heading
kind/rank or numbering. Static admission validates source/result root fragments
with their actual list/item depth, and final publication validates the complete
document including untouched roots.

The operation reuses established text slicing, canonical run merging and
relocation. Deleted interior points use the existing explicit deletion-policy
contract; same-text formatting changes preserve aggregate positions. Inverse
recipes restore the complete prior root and exact history boundary values.
Wrap then splice composes and replays in one transaction. No existing splice's
path language, wire tag or schema capability was widened.

`InsertFlatListTextAction` exposes explicit, opt-in single-block typing with the
existing bounded `InsertTextInput` contract. Collapsed typing uses pending
formats or focus affinity; type-over uses the first spatially selected run.
The action consumes pending formats, places a Before-affinity caret after the
inserted text and offers the established typing history group. Coordinate
normalization has a separate flat-list scope; old direct-root callers still
reject nested block paths.

At the initial single-block checkpoint, cross-block typing returned
`breditor/list-cross-block-edit-not-supported`; the later cross-block action
integration is described below. Enter and empty-item exit are also separately
qualified below, as are the subsequent deletion actions. List-aware formatting
remains separate work. Operation V1–V5 and history containing the new splice in
Session V5 reject it. This is not a browser or session-reload qualification.

See [text/typing qualification](qualification/2026-10-04-flat-list-text.json).

### Structural flat-list text replacement

`FlatListTextReplace` is the experimental Rust primitive for splitting an item,
joining/replacing text across flat blocks, or exiting an empty item. It does not
itself choose Enter, deletion, marker-merging or numbering-continuation policy.
Those policies belong to separately named actions; the operation requires an
explicit result layout and explicit ordered starts.

- `FlatListTextRange` uses actual block paths (`[root]` or `[root, item, 0]`) and
  scalar-aligned aggregate UTF-16 offsets. Flattened indexes are private slicing
  machinery, never public document coordinates or a synthetic document.
- Complete guarded roots form a contiguous span starting at `guard_start`.
  `capture` uses the minimum intersected root span; `try_new` can guard a wider
  span. The range must resolve inside that span. Stale guards reject even no-ops.
- A nonempty sequence of inserted paragraph/heading fragments carries result
  block kinds. Source prefix text joins the first fragment and suffix text joins
  the last. Blocks outside the edited range remain exactly equal and in order.
- `FlatListRootShape` partitions all resulting blocks in the guarded span into
  bare roots or flat lists, consuming every block exactly once. Empty lists,
  missing/extra consumption and final-ordinal overflow reject the recipe.
- The same-type inverse restores original blocks, runs, ranks, list boundaries
  and starts. Guard scope is independent of text scope: undoing an empty-item
  exit may guard both adjacent lists as well as the intervening paragraph.
- Relocation preserves surviving offsets and affinities, reports deleted
  interiors explicitly and canonically maps removed wrapper gaps. Untouched
  blocks retain their point representation under reparenting. Same-text edits
  preserve logical positions even when formatting or wrappers change.
- Admission checks the exact flat-list schema/proof, source/result fragments
  with their real wrappers, and the complete resulting document including
  untouched roots. Root limits are never relaxed for a flattened intermediate.

Tests cover split seams, empty-item exits, cross-root replacements, mixed typed
format runs, all paragraph/heading ranks, exact selection/pending-format history,
all valid text and structural points in representative forward/inverse edits,
stale-batch rollback, resource limits and independent Unicode/layout oracles.

This primitive checkpoint alone does not enable Enter or cross-block typing.
Their separately qualified action integrations are described below.
Operation V1–V5 and Session V5 history remain closed to the new operation.
Durable list admission, Wasm/browser controls, reload/recovery and native testing
remain separate gates. Nested lists are deferred by the user's explicit choice.

See [structural text qualification](qualification/2026-10-04-flat-list-replace.json).

### Flat-list Enter action

`InsertFlatListBreakAction` is a separately named, no-input Rust action with the
opt-in identity `breditor/insert-flat-list-break`. It uses one guarded structural
replacement with full-result preview, explicit resulting caret, preserved pending
formats and a record-history intent. Its state dependencies include document,
selection, pending formats, context and snapshot. Existing/default registrations
are unchanged.

- A nonempty item splits within its current list. The left block keeps its kind;
  the right keeps its endpoint kind when suffix text survives, otherwise becomes
  a paragraph. This matches the existing bare-heading Enter policy.
- A collapsed empty item exits as a bare paragraph, including an empty heading
  item. Unselected prefix/suffix items stay in their original marker family.
  Numbered suffixes keep their original first displayed ordinal. First, middle,
  last and only-item exit are supported; no empty list container is retained.
- Bare paragraphs split. A collapsed empty bare heading becomes one paragraph.
  Nonempty bare headings split at the start/middle and create a following
  paragraph at the end, matching the heading-only profile.
- Extended ranges replace the exact selected text and structural breaks. Within
  one list, its original start remains and subsequent ordinals follow the changed
  item count. Across containers, the left and right endpoint families remain
  separate, middle roots are removed, and the right ordered container begins at
  the original endpoint item's ordinal. Surviving prefix/suffix blocks remain
  intact. Adjacent lists are not automatically merged or restarted.
- The caret becomes an After-affinity child boundary at the right block start,
  or at the exited/converted paragraph. A document-changing Enter records one
  undo event with exact original direction, affinities and pending formats.
  Replacing only an existing break without changing the document moves selection
  without adding an undo entry, following the established history contract.
- Node/item/root budgets are checked on the final atomic result. Disabled edits
  preserve state and existing redo; stale prepared Enter actions reject.
  Numbering overflow has the explicit `breditor/list-ordinal-overflow` reason.

This action is not yet exposed through Wasm/browser keyboard controls or durable
list sessions. Cross-block typing and deletion are qualified below. Inline
formatting and native qualification remain next work; nested lists/indent-outdent
remain deferred.
See [Enter qualification](qualification/2026-10-04-flat-list-enter.json).

### Cross-block flat-list typing

`InsertFlatListTextAction` now replaces selections across items, bare blocks and
mixed list/root families. The bounded input contract and action registration do
not change. Same-block typing still uses `FlatListTextSplice`; cross-block typing
uses one `FlatListTextReplace`, without a transient delete/insert document.

- The spatial start block kind/rank and container family win. Its surviving
  prefix, inserted text and the endpoint suffix become one block. Selection
  direction does not change this policy or the typed-format choice.
- Within one list, its original start remains and subsequent item ordinals
  adjust to the resulting count. Across roots, all fully selected middle roots
  disappear; unselected start-prefix items remain in their original container.
  Unselected items following the endpoint in another list remain in a separate
  container with the original first surviving ordinal. No implicit adjacent-list
  merge, list restart or marker conversion is performed.
- The first spatially selected text run supplies the inserted format set,
  including typed inline properties. Empty endpoint fragments do not conceal
  selected text in middle items or roots. If only breaks/empty blocks are selected,
  formatting comes from the surviving left seam, then right seam, then plain text.
  Unselected items outside the range never contribute a format.
- The final caret has Before affinity after the insertion, pending formats are
  consumed, and adjacent subsequent typing can join the existing typing-history
  group. Undo restores the exact prior directional selection and all removed
  roots/items/ranks/formats; redo restores the joined result.
- Operation-budget, full-document and per-leaf limits are previewed before an
  enabled decision. Invalid/stale preparations and disabled typing leave state
  and existing redo untouched. At exact resource budgets, selected content is
  replaced atomically rather than requiring temporary duplicate nodes/text.

Shared list-text capture remains a separate explicit scope; direct-root-only
callers are not widened. Existing operation/session wires and browser registries
are unchanged. List-aware deletion is qualified below; formatting, durable sessions, browser controls
and native qualification remain outstanding.
See [cross-block typing qualification](qualification/2026-10-04-flat-list-cross-typing.json).

### Flat-list deletion actions

Three separately named Rust actions are available for explicit experimental
registration: `DeleteFlatListBackwardAction`, `DeleteFlatListForwardAction` and
`DeleteFlatListSelectionAction`. Their identities are respectively
`breditor/delete-flat-list-backward`, `breditor/delete-flat-list-forward` and
`breditor/delete-flat-list-selection`. They retain the existing deletion state
dependencies and do not change default/browser registrations or durable wires.

- Within a text block, directional deletion removes one extended grapheme
  cluster using the existing pinned Unicode segmentation implementation, across
  formatting-run seams. A caller-supplied caret inside a cluster is explicitly
  disabled. If deletion creates a new cluster across the seam, backward deletion
  snaps the caret forward and forward deletion snaps it backward.
- Backspace at the logical start of the **first item** lifts that item into a
  bare block, even at document start or after a preceding bare block. Its text,
  inline properties and paragraph/heading kind are unchanged. An ordered suffix
  retains its original next ordinal. This is a separate record-history event.
  A second Backspace may then join the lifted block to its predecessor.
- Backspace at a later item's start joins the previous item. Backspace at a bare
  block's start joins the preceding bare block or previous list's last item.
  At a bare document start it is disabled.
- Delete at a block's end joins the next item, next bare block or next list's
  first item. At document end it is disabled. Joins keep the spatial left block
  kind and container family. Unselected suffix items in a different list remain
  separate with their original numbering; adjacent lists are not auto-merged.
- An extended selection uses identical exact scalar-aligned deletion for all
  three actions, regardless of direction. It keeps the spatial start kind and
  family, removes selected middle roots/items and retains untouched suffix
  numbering. Explicit selections do not snap to grapheme boundaries. A collapsed
  selection is disabled for `DeleteFlatListSelectionAction`.
- Deleting all selected content retains one empty start-kind block and its start
  container, rather than resetting the entire document to a plain paragraph.
  Empty list items can subsequently exit through Enter or first-item Backspace.
- Pending formats survive. Directional deletion and joins use the established
  backward/forward history groups; selected-range deletion and first-item lifting
  use independent records. Undo restores exact directional selections, ranks,
  typed formats, containers and ordinal starts.
- Every edit previews the complete atomic result. Lifting may need an extra root
  slot; joining can exceed a text-leaf budget even though total text decreases.
  These cases disable before publication and leave state/redo untouched. Stale
  prepared actions reject. No transient split/delete intermediate is required.

This is Rust action/session qualification, not a browser or durable-list release.
List-aware formatting is qualified below. Multiline plain-text insertion,
explicit durable list admission, browser controls and native/recovery tests
remain outstanding. Heading-only actions do not automatically gain flat-list
capability.
See [deletion qualification](qualification/2026-10-04-flat-list-deletion.json).

### Flat-list formatting actions

Four separately named actions are available for explicit experimental Rust
registration: `ToggleFlatListInlineFormatAction`, `SetFlatListInlineFormatAction`,
`ClearFlatListInlineFormatsAction` and `SetFlatListBlockKindAction`. Toggle and
block-kind targets are fixed at registration; set/remove accepts the existing
typed inline-format input contract. Clear uses the identity
`breditor/clear-flat-list-inline-formats`. Existing default/heading-only actions
and durable formats remain unchanged.

- Inline formatting spans real bare-block and list-item paths, in either
  selection direction. Text, paragraph/heading kinds, list boundaries and
  numbered starts remain unchanged. Unselected prefix/suffix items are guarded
  but preserved. Empty blocks and a later endpoint at offset zero do not
  contribute selected inline text.
- Mixed toggles add the property-free format everywhere; uniformly active
  toggles remove it. Typed set replaces one format's complete property map and
  retains peer formats; removal removes only that format. Toolbar indicators
  report active/mixed/inactive and typed uniform/mixed/unset values. Invalid
  requested properties disable with inactive activation while retaining the
  observed value. Text-empty structural ranges and exact no-ops disable.
- Carets use pending formats first, otherwise the focus affinity at a format
  seam. They change pending formats only, even at empty items and with a zero
  document-operation budget. They add no document undo event. Subsequent typing
  consumes the override; undo restores the exact pre-typing pending formats.
- Extended inline edits are one atomic history record. Their logical offsets,
  direction and affinities survive run splitting/merging; leaf/gap encodings may
  canonicalize. Undo restores the exact original encoding, and redo the result.
- Block-kind conversion supports paragraphs and headings 1–6, inside or outside
  lists. A later endpoint at its logical start is excluded; an empty collapsed
  item is included. Text runs, numbering, exact selection encoding and pending
  formats survive. The action reports active/mixed/inactive and disables when
  all touched blocks already match. This action explicitly keeps the original
  selection because kind-only edits do not change any paths or text runs.
- Both extended inline and block-kind edits preview the complete result,
  including resource use outside guarded roots. There is no transient per-item
  intermediate: a split in one item may be balanced by a merge in another.
  Merged-leaf byte limits, node/property limits and operation budgets disable
  before publication. Disabled or stale preparations preserve state and redo.

The implementation shares the established pure inline-format policy, with a
separate flat-list capture/planning scope. It reuses guarded structural replacement
rather than inventing a new persistence tag. This is Rust-only qualification:
multiline input is qualified below; durable lists, Wasm/browser controls and native/recovery
qualification remain ahead. No list browser or performance claim follows from
these tests.
See [formatting qualification](qualification/2026-10-04-flat-list-formatting.json).

### Flat-list plain-text insertion

`InsertFlatListPlainTextAction`, explicitly registered as
`breditor/insert-flat-list-plain-text`, accepts the existing bounded
`InsertPlainTextInput`. It replaces same-block or cross-item/root selections with
one guarded structural operation and requests independent history. Existing
heading/default actions and durable wires remain unchanged.

- CRLF, CR and LF become structural boundaries. Other Unicode scalars, including
  U+2028, remain text. Leading, trailing and consecutive blank lines are retained.
- All inserted lines inherit the spatial start container: bare blocks if the
  start is bare, otherwise items in that list. Within one list its original start
  remains and subsequent ordinals follow the new count. When a range crosses
  roots, untouched suffix items of the endpoint list stay separate, with their
  original first surviving ordinal. Adjacent lists are not implicitly merged.
- A one-line replacement retains the start block's kind. For multiline input,
  the first block retains the start kind, interior blocks are paragraphs, and
  the last retains the end kind only when original suffix text survives.
  Otherwise it is a paragraph. Container inheritance does not override this
  explicit heading policy.
- Pasting a blank line into an empty item creates empty items; it does not invoke
  Enter's empty-item exit. Pasting across container families follows start-family
  replacement policy, unlike Enter's two-sided container retention.
- Carets use pending formats, then focus-affinity context. Extended selections
  use the first selected text run, including intervening items/roots. Text-empty
  ranges fall back to surviving left text, then right text, then plain text.
  Every inserted nonempty line uses the inherited format set; retained prefix
  and suffix runs retain their own formats.
- Success consumes pending formats and sets a Before-affinity caret after the
  final inserted scalar, before retained suffix text. An empty resulting final
  block uses its child boundary. Undo/redo restores exact state, including
  original direction, affinities, kinds, typed formats, numbering and pending
  formats. Each document-changing paste is its own history event; exact content
  replacements can be selection-only without an undo entry or redo loss.
- Input byte/UTF-16/line bounds, schema admission, operation budget, complete
  result limits and final ordered ordinal are checked before publication.
  Ordinal overflow disables explicitly. Atomic replacement may succeed at exact
  final budgets without needing a larger intermediate document. Disabled and
  stale preparations leave the current state and redo branch untouched.

The action shares tree-neutral text/format policy with heading paste while
supplying a flat-list-specific middle-run scan and layout. Qualification is Rust
action/session only, not native clipboard or browser paste support. Durable
operation/session admission and browser integration are the next vertical slice.
See [plain-text qualification](qualification/2026-10-04-flat-list-plain-text.json).

### Flat-list operation persistence (V6)

The experimental `OperationJsonCodecV6` explicitly admits all three flat-list
primitives under wire version 6. This is a singular-operation checkpoint, not
complete session persistence. Earlier envelopes and payload languages remain
unchanged; relabelling a new operation as V1–V5 does not make it admissible.

- `flatListReframe` stores `start`, a synthetic-root `expected` tree and a
  synthetic-root `replacement` tree. Checked reconstruction proves that the
  contained block sequence is unchanged before a record can be replayed.
- `flatListTextSplice` stores the actual `block` path, aggregate UTF-16 `start`
  and `end`, a synthetic-root `expected` tree containing exactly one complete
  guarded root, and a typed text-fragment `replacement`.
- `flatListTextReplace` stores `guardStart`, `start`/`end` boundaries (each with
  actual `block` path and UTF-16 `offset`), synthetic-root `expected` and
  `inserted` trees, and explicit result `layout`. Layout entries are `block`,
  `bullet` with `items`, or `ordered` with `start` and `items`. Wider inverse
  guards retain the exact source container boundaries, including around exited
  items; no flattened coordinate or implicit numbering policy is serialized.
- Path decoding admits only `[root]` or `[root, item, 0]`, allocating at most
  three indices. Layout decoding is bounded by the context's root-child limit.
  Raw trees and typed fragments are allocation-preflighted before owned record
  reconstruction. Empty/mismatched layouts, impossible counts, ordinal overflow,
  scalar splits, invalid properties, unknown/duplicate fields and invalid numeric
  representations reject. Full source/result static validation still applies.
- The envelope binds both schema identity and semantic fingerprint. Binding is
  checked before payload reconstruction. Deterministic output is counted against
  the same JSON byte limit used by decoding; exact-boundary output roundtrips.
  Earlier operation payloads retain their existing bytes and admission rules
  beneath the new envelope version.
- Decoding does not authorize an edit against an arbitrary live document.
  Applying a decoded operation still checks complete source guards and full
  document limits. Tests replay decoded recipes and locally derived inverses,
  preserve exact logical selection behavior, and admit a matching independently
  compiled context. No-op recipes roundtrip without creating document history.

V5 transactions and V5 sessions still reject list operation history. Editor State
V3 can already preserve the flat-list document/selection snapshot when bound to
its explicit schema; session admission must additionally prove chronological
forward and inverse history. V6 session qualification follows below. Browser
reload/recovery and Wasm integration remain outstanding. No existing shipping
format is widened.
See [operation V6 qualification](qualification/2026-10-04-flat-list-operation-v6.json).

### Complete flat-list sessions (V6)

`SessionCheckpointJsonCodecV6` stores complete bounded list histories under an
explicit outer version 6. It retains Editor State V3, Document V2 and typed
editor-value records, admitting Operation V6 payloads through a separate bounded
sequence. V1–V5 session behavior is unchanged; V5 still rejects histories with
list operations, even when a V6 file's outer version is relabelled.

- The checkpoint stores a normalized revision-zero history base, chronological
  forward recipes, each boundary's result selection and pending formats, the
  current revision, cursor, history capacity and optional open merge group.
  Serialized inverse recipes are not accepted. Each inverse is derived locally.
- Decode checks binding, capacity/cursor/group topology, entry and aggregate
  operation counts, and editor-value preflight before owned history replay.
  It reconstructs every forward boundary, including the future redo branch,
  derives and applies each inverse, and verifies exact semantic restoration.
  A stale guard, invalid future selection/format, noncanonical no-op event or
  failed inverse rejects the entire checkpoint before a session is returned.
- Retained-node, text, property-value and property-string budgets cover all
  reconstructed boundaries, not merely the current document. Per-entry operation
  limits, JSON bytes, whole-document limits, bounded initial reservations and
  maximum revisions retain the existing explicit failure contracts.
- A matching independently compiled context can restore exact document,
  directional selection, affinities, pending formats, snapshot lineage/revision,
  history capacity and both history branches. Runtime preparation stamps remain
  intentionally nonportable. Encoding requires the exact installed runtime
  context; it does not silently adopt another host policy.
- Open typing groups continue after reload. Editing after undo replaces the redo
  branch. State-only selection/pending-format updates preserve the nearest redo
  boundary. Capacity eviction preserves the correct oldest retained base, and
  zero-capacity/empty-item sessions restore without inventing history.
- Deterministic re-encoding preserves the accepted checkpoint bytes. Existing
  heading/paragraph payloads retain their semantics under explicit V6 sessions;
  old codecs do not implicitly migrate or reinterpret V6 records.

Qualification uses actual list actions across every cursor: typing, ordered/bullet
wrapping, Enter, multiline paste, backward/forward and selection deletion,
paragraph/heading conversion, inline clear/set/toggle, unwrapping and first-item
lifting. Randomized mixed-list histories and the general session admission matrix
exercise complete undo/redo after reload. These are in-memory Rust codec tests,
not browser autosave, native clipboard, host backup-file recovery or release
qualification. Request/commit V6 qualification follows below; the Wasm/browser
bridge remains next.
See [session V6 qualification](qualification/2026-10-04-flat-list-session-v6.json).

### Flat-list transaction and commit boundaries (V6)

`TransactionJsonCodecV6` and `CommitJsonCodecV6` explicitly admit Operation V6
recipes. Both retain the existing schema identity/fingerprint binding, typed
editor values and strict bounded JSON records. The commit embeds Editor State
V3 and Document V2. No older wire format changes its accepted language.

- A transaction request targets an exact base snapshot under the codec's exact
  process-local context. Static decoding checks the binding, snapshot, operation
  count and each indexed payload. Applying it separately proves consecutive live
  source guards and full-document result limits, atomically across all operations.
- A durable commit stores its before-state, canonical forward recipe, result
  selection/pending formats and metadata. Decode reapplies the recipe; the result
  document, successor snapshot, inverse operations, relocation maps and change
  summary are derived, never accepted from the wire. This proves internal
  consistency, not authenticity, authorization or exactly-once delivery.
- Requests may contain valid no-ops. Commits must describe a real state change
  and carry the canonical forward recipe; redundant no-op operations reject.
  Selection-only commits remain valid without inventing document operations.
- A matching independently compiled context can replay a saved request when
  supplied its restored exact base snapshot. Wrong local contexts reject at
  encode/decode; stale snapshots reject before operation payload admission.
- Exact JSON byte budgets apply to both encoding and decoding. Count checks
  precede materializing operations; commit counts precede decoding the embedded
  document. Malformed operations retain their index and typed cause.
- Multi-step list reframe/splice/replace requests preserve exact selections,
  pending formats and undo/redo as one history event. A later stale guard or
  full-document budget failure leaves state and the retained redo branch intact.
  Previously admissible heading payload bytes are unchanged apart from the new
  outer version. V5 refuses list operations, including relabelled envelopes.

Qualification covers Unicode request/commit/inverse replay, independent contexts,
typed formats, state-only commits, malformed records, budget boundaries and
complete-session interoperability. This closes the Rust wire layer for flat
lists; it does not expose those lists through the shipping Wasm/browser profile.
See [request/commit V6 qualification](qualification/2026-10-04-flat-list-transaction-v6.json).

### Compiled flat-list profile and checkpointed owner

`CompiledEditorProfile::try_compile_flat_list_profile` now builds the sealed
list schema, list-aware action registry, intent graph, observable control catalog
and process-local profile generation as one immutable unit. This remains opt-in;
the paragraph and heading profile factories are unchanged.

- The base graph contains 18 actions, 12 priority-zero blocking intent routes and
  14 observable controls. It includes list-aware typing, normalized plain-text
  insertion, Enter, backward/forward/selection deletion, Bold, Clear, seven
  paragraph/heading targets and three list controls. Each action implementation
  remains in its own named file. The typing identity is
  `breditor/insert-flat-list-text`.
- `breditor/format-bullet-list` routes to `breditor/wrap-bullet-list`;
  `breditor/format-ordered-list` routes to `breditor/wrap-ordered-list` with start
  one for newly created numbered sections. `breditor/remove-list` routes to
  `breditor/unwrap-list`. Their bindings append `-binding` to the intent name;
  controls are `breditor/control-bullet-list`, `breditor/control-ordered-list`
  and `breditor/control-remove-list`.
- These are explicit set/remove commands, not second-click toggles. Matching
  list families are active but blocked as unchanged; numbering an existing
  ordered list preserves its explicit start. Partial conversions preserve
  unselected numbered prefixes/suffixes and their ordinals. A selection ending
  at the next block's start excludes that block.
- Existing Bold, Clear and block-kind intent/control identities remain stable,
  but this profile routes them to flat-list-capable handlers. Extension toggles
  and typed setters use the same declaration contracts, ownership checks and
  reserved namespaces, now operating within items as well as bare blocks.
  Uniform/mixed/unset formatting values remain Rust-derived. The unchanged
  255-extension-format limit permits at most 269 total controls; the catalog
  ceiling is not increased.
- `CheckpointedEditorEngine::try_new_v6` selects complete Session V6 admission.
  Each command runs on a private candidate; its complete checkpoint must encode
  before publishing the state or event. Resource rejection preserves exact
  state, observation, cached bytes and redo. Older owners never upgrade based
  on schema shape: a V5 owner rejects an otherwise valid list edit before
  publication.
- Fresh matching profile compilation can restore V6 history with exact selection
  and formatting. Prior runtime observations and state caches reject against the
  newly compiled generation. Undo/redo advances revisions; equal saved bytes are
  expected only at equal histories, cursors and revisions.

Tests exercise the compiled graph, controls/cache updates, real list item edits,
typed extensions, partial numbered conversion, exact recovery, maximum extension
counts and failed checkpoint admission. These are Rust profile/engine tests, not
Wasm factories, browser list rendering, native input or a shipping-profile change.
See [profile qualification](qualification/2026-10-04-flat-list-profile.json).

### Opt-in flat-list Wasm bridge

The `breditor-wasm` feature `experimental-flat-lists` adds the list boundary while
retaining the heading APIs. It includes `experimental-text-blocks`, but neither
is enabled by default. A heading-only build does not gain the new list APIs.

- `BreditorCompiledProfile.fromBootstrapJsonV4` uses the same bounded, closed
  typed extension declarations as V2/V3, selecting the compiled flat-list profile
  explicitly. Older bootstrap entry points reject V4. This is configuration,
  not an implicit migration of persisted data.
- `createEngineFromDocumentJsonV6` admits matching Document V2 with empty selection
  and history; `createEngineFromSessionCheckpointJsonV6` proves complete Session
  V6, including redo. Both return existing one-shot engine/error result handles.
  Invalid configuration, lineage, capacity, schema, nested items or checkpoints
  return errors without consuming the profile or an existing engine.
- V6 engines export Document V2, Editor State V3, Session V6 and Commit V6.
  Commands still require an exact observation; restored owners reject observations
  from a previous owner. Old owner versions never upgrade implicitly.
- String input explicitly admits only the flat-list typing/plain-text IDs with
  their exact existing input contracts. Other action IDs and mismatched contracts
  remain rejected. No browser-provided operation planner is added.
- `projection.listKind(index)` returns `"bullet"`, `"ordered"` or `undefined`.
  `projection.orderedListStart(index)` returns an ordered container's checked
  positive start or `undefined`. Neither exposes an item override. Both use
  explicit JavaScript values rather than optional-number sentinel transport.
  Held projections remain immutable, with snapshot-local preorder coordinates.
- Structural list edits use the existing proved `rootSplice` impact where possible.
  List-item typing currently falls back to a full-root update. The old
  `textContainers` record carries direct-root indices and is not reinterpreted as
  nested coordinates. Browser incremental rendering remains a later integration
  concern; this checkpoint makes no DOM identity or composition guarantee.

Run `node scripts/build-experimental-flat-list.mjs` with the pinned Cargo,
wasm-bindgen and rolldown tools. The harness keeps a separate Cargo cache and
retained candidate directory beneath `target`, compares the exact additive ABI
against the shipping declaration, checks TypeScript including negative cases,
checks host-path remapping, runs Node and five raw-Wasm scenarios in each of
Chromium/Firefox/WebKit, and hashes shipping Wasm/browser artifacts before/after.
It never writes package dist. All owned scenario handles are released.

The qualified candidate is 2,044,484 raw Wasm bytes / 568,550 gzip-9 bytes; this is
not approval of a new release budget. Browser DOM/selection integration, real
keyboard/clipboard/composition, autosave/backup recovery and size/performance
gates remain outstanding. The raw-WebKit pass does not prove all historical
WebKit faults resolved. See [Wasm qualification](qualification/2026-10-04-flat-list-wasm.json).

### Hierarchical flat-list browser projection

The experimental source-level `FlatListDocumentProjection` is a distinct owned
value, not a subtype of the old direct-paragraph projection. Its `blocks` retain
bare text blocks, bullet lists, and ordered lists with explicit starts. Every item
contains exactly one paragraph or heading. Its `textBlocks` directory stores real
AST block paths (`[root]` or `[root, item, 0]`), never synthetic paragraph indices.
Text runs and typed inline properties reuse the existing immutable validation.

`consumeFlatListSemanticProjection` explicitly consumes a list-capable Wasm view.
It shares the existing synchronous getter capture, reentrancy protection,
generation binding and exactly-once cleanup machinery. A structural preorder pass
proves all list/item edges, rejects aliases, gaps, unreachable nodes, nesting and
multi-block items; the common text reader then validates the text blocks. List
metadata must match the container type and be absent on other nodes. Cleanup
failure or generation retirement prevents admission of the result.

The shared text validator temporarily owns flattened text internally; that proof
is not returned as a renderable paragraph document. The resulting list projection
is deeply immutable and runtime-branded, with a private construction token. The
whole-document node/property budgets include list wrappers, item wrappers,
ordered starts and heading levels. The 10,000-child ceiling applies separately
to root/list/text-block containers, not to total flattened text blocks; the
100,000-node and existing UTF-8/property budgets still apply globally.

This checkpoint adds no public package entry-point export and does not widen the
old renderer, incremental update or selection contracts. The next integration
must explicitly render `ul`/`ol`/`li` and map actual paths; passing list-root
coordinates to the old paragraph update API is not supported.

Reproduce the source-to-real-Wasm checks with
`node scripts/check-experimental-flat-list-browsers.mjs <candidate-directory> --browser-projection`.
This runs the existing raw-Wasm scenario and five projection/edit/recovery
scenarios in each browser. It does not exercise editor DOM, native selection,
clipboard or IME. See [projection qualification](qualification/2026-10-04-flat-list-browser-projection.json).

### Flat-list DOM and selection coordinates

The source-level renderer has explicit `renderFlatList`, `ownsFlatList` and
`releaseFlatList` methods. They share the established host registry, synchronous
install guards, detached construction, rollback, mutation observation and private
mapping machinery. The existing `render`, incremental update and composition
lease entry points still reject list handles rather than reinterpreting them as
paragraph documents. Flat-list rendering currently installs a full tree.

Canonical DOM is `ul > li > p/h1..h6` or `ol[start] > li > p/h1..h6`, alongside
bare root text blocks. Ordered starts are explicit, including start 1; item value
overrides and extra list/item attributes reject. Empty text blocks retain an
unmapped `br` placeholder. Inline wrappers use the same exact-owner compiled
presentation and typed-property recipes as other text blocks. Root, list, item,
text-block and text-leaf mappings retain their real AST coordinates, with a
maximum depth of four; wrappers/placeholders are not synthetic AST nodes.

`FlatListRangeSelection` validates directional endpoints against one exact
projection. It preserves affinity and anchor/focus order, accepts child boundaries
only in actual text blocks, rejects non-scalar UTF-16 boundaries, and recognizes
equivalent text/child endpoints as spatially collapsed. It is a separately
runtime-branded selection; legacy selection APIs are not widened.

The explicit list DOM point helpers revalidate canonical DOM before mapping in
either direction. Outer root/list edges normalize to the first/last text block;
interior root/list gaps reject as ambiguous. Item edges normalize to the sole
text block, and empty-block/placeholder points normalize to child boundary zero.
DOM-derived affinities use the existing boundary policy. Exact programmatic
affinity echo, full range ownership, outside-host handling and native selection
write receipts still need integration through the editor's selection bridge;
point mapping alone does not implement that bridge.

Run the candidate harness with `--browser-dom` for actual browser DOM and native
Selection endpoint tests, in addition to the retained raw-Wasm and projection
recovery scenarios. These checks cover backward endpoints, emoji boundaries,
empty items, replacement generations and changed numbering. They do not qualify
keyboard input, OS clipboard or IME, or resolve every historical WebKit issue.
See [DOM qualification](qualification/2026-10-04-flat-list-dom.json).

### Flat-list DOM selection bridge and Wasm coordinates

`BreditorFlatListDomSelectionBridge` now supplies read/write/focus observation and
one-use echo suppression and exact-affinity sidecars for list render handles. It shares the native
selection transaction implementation with the legacy bridge: connected light-DOM
and canonical-shape preflight, directional endpoint verification, whole-document
write exclusion, rollback, outside/cross-host handling, and the existing
same-container Range caret path used for WebKit. The public legacy bridge keeps
its old types and rejects list handles at runtime; the list bridge likewise
rejects legacy handles and mismatched projection snapshots.

A successful programmatic write retains the exact owned selection, including
affinities that native DOM does not represent. Only the next matching read on
the same render generation and exact DOM endpoint signature returns that value
as `programmaticEcho`; further exact matching reads retain its affinity with
origin `dom`. Echo suppression is consumed, not the unchanged caret's semantic
identity. Different wrapper/text aliases, another snapshot, clear,
disposal or a nonmatching read invalidate the receipt. Outside-host browser
selection remains unavailable rather than semantic None, and clearing this
editor does not clear an outside selection. No bridge operation focuses the host.

`consumeFlatListSemanticSelection` and
`flatListSemanticRangeSelectionScalars` explicitly bridge hierarchical paths to
the generated preorder selection API. Preorder counting includes list and item
wrappers, but only text leaves and actual text-block child boundaries may be
selected. The shared generated-handle consumer retains captured scalar reads,
numeric normalization, exact generation/snapshot correlation, canonical direction
checks, reentrancy exclusion, and cleanup/final-liveness checks. None requires all
range-only fields absent. Scalar serialization grants no command authority: the
caller still needs a fresh engine observation for `setRangeSelection`.

The `--browser-dom` harness now sends list selection scalars to real Wasm, consumes
the resulting selection after edits/recovery, and exercises native directional
selection reads/writes and exact affinity receipts. This remains isolated from
the browser owner/controller; incremental list update admission, toolbar/input,
composition, clipboard and the user-facing demo are later integration steps.
See [selection qualification](qualification/2026-10-04-flat-list-selection-bridge.json).

### Flat-list projection updates and subtree reuse

`FlatListProjectionUpdate` admits consecutive same-lineage snapshots from the
same exact profile owner. It owns closed copied impact records and independently
proves every unchanged root subtree, including list type/start, heading rank,
text and typed inline properties. False narrow claims reject. `none` proves all
roots unchanged; `rootSplice` proves the untouched prefix and shifted suffix.
Legacy `textContainers` coordinates remain direct-root indices and are admitted
only when every affected root is a bare text block on both sides. A list item is
never interpreted as a root paragraph. Broad impacts retain full-render plans.

`consumeFlatListSemanticProjectionUpdate` uses the shared generated update/child
consumption path. It validates the duplicate base/result identities, exact
profile binding and impact, protects outer-owner aliases, and retains the child's
consumption claim through parent cleanup. The legacy entry points remain
base-only, including their cleanup-captured return type.

`updateFlatList` checks exact renderer/base ownership before installation. Proved
unchanged roots retain complete DOM subtree identity; when a list moves, all
list/item/block/text mappings are rebuilt against its new AST paths. Affected
roots are rebuilt, not patched using paragraph indices. Selection-only updates
can retain the entire DOM. Full-root impacts and detected synchronous DOM drift
take the full checked render path. All paths share install guards, rollback and
canonical-DOM validation. This does not promise identity within changed lists;
nested typing still uses the Rust core's conservative full-root impact.

The real-browser harness now consumes generated selection, multiline insertion
and undo updates consecutively, installs each result, and restores its exact
semantic selection through the list bridge. Browser owner/controller dispatch,
composition leases and input integrations remain outstanding. See
[update qualification](qualification/2026-10-04-flat-list-updates.json).

### Flat-list browser document preflight

Explicit durable mode V6 admits the existing Document V2 envelope with flat
bullet/ordered roots and exactly one paragraph or heading per list item. Earlier
modes still reject lists. Numbering is positive and bounded through the final
item; nested/empty lists, loose or multi-block items, entities and extra wrapper
properties reject. Node counts include list/item wrappers. Child limits apply
per container, not to the flattened text-block count. Ordered starts, heading
ranks and inline values share the document property budget.

`documentJsonMatchesFlatListProjection` requires an owned hierarchical projection
and exact schema binding, then compares root grouping, family, numbering, item
order, heading rank, text and complete typed formats. It does not equate documents
merely because their flattened text matches. Existing generated string-result
ownership and cleanup apply to V6 document capture.

The document-only checkpoint kept browser Session V6 admission closed until the
separate operation preflight below was connected. Bootstrap V4 integration is
still required before this becomes the normal editor restore path.
See [document qualification](qualification/2026-10-04-flat-list-browser-document.json).

### Flat-list browser session preflight

Explicit Session V6 retains State V3 and Document V2. The browser checks the
canonical envelope, schema binding, history topology, operation counts, selections
and pending formats through the established checkpoint consumption path. Earlier
modes remain closed to list recipes. Older direct-root text-block operation tags
do not gain permission to use list roots as guards inside Session V6.

`flat_list_operation_preflight.ts` owns the three new recipe checks. Reframe
requires an unchanged complete text-block sequence. Splice resolves its actual
`[root]` or `[root, item, 0]` path against the containing-root guard and checks
aggregate UTF-16 scalar boundaries. Replace checks both guarded endpoints, bare
inserted blocks, root-span bounds and an explicit layout whose block count and
ordered numbering fit. Nested layouts and extra fields reject. These are static
checks, not a second editor engine or replay implementation.

History-base property accounting now descends into list items and includes ordered
starts and heading ranks alongside inline values. Serialized pending sets share
the retained-property lower bound. Rust still derives result documents/inverses,
checks complete retained budgets, and proves both replay directions before exposing
a restored engine. The real-browser test deliberately changes a history-base text
guard: static preflight admits its shape, but Rust rejects it without an engine.

Five runs each in Chromium, Firefox and WebKit exercise all three generated list
recipes, a saved redo branch, fresh-owner restore and exact document/selection
recovery. Controller scheduling, keyboard/clipboard/IME and the visible demo remain
outside this checkpoint. See
[session qualification](qualification/2026-10-04-flat-list-browser-session.json).

### Explicit flat-list browser bootstrap

`bootstrapFlatListWasmEngine` requires an explicit profile selector with
`formatVersion: 4`. It selects the generated V4 profile compiler and V6 document
or session factory, validates durable input before construction, and returns an
owned hierarchical initial projection. `preflightFlatListWasmSemanticProfile`
provides handle-free metadata for the eventual asynchronous persistence load.
Both reuse the existing ABI/package probes, descriptor/generation correlation,
generated-handle claims, captured methods, cleanup and final owner-liveness checks.

Success transfers exactly the engine forwarding owner, profile generation and
observation; temporary profile, result, descriptor and projection handles are
consumed. Missing/throwing/asynchronous list metadata rejects, including promises
returned where an absent optional node value would otherwise be valid. Cleanup
failure or disposal of a transferred generation during cleanup rejects success.

The legacy bootstrap entry point still rejects selector V4 and never probes list
factories or metadata methods. Successful list bootstrap results have a separate
brand check and do not satisfy the base-result brand. The new entry points remain
internal source APIs, not additions to the shipping package entry points.

The real-browser harness now creates a fresh list engine and restores a redo
checkpoint through this bootstrap, then checks exact document and selection
recovery after redo. Normal owner/controller scheduling, toolbar and input routing
remain separate integration work. See
[bootstrap qualification](qualification/2026-10-04-flat-list-browser-bootstrap.json).

### Flat-list command capabilities

List requests now have explicit `FlatListEditorDeliveryToken`, selection-sync and
request types, with base types retained as the generic defaults. Tokens preserve
the exact hierarchical projection/render, snapshot, renderer generation and
observation epoch, plus hidden adapter-local authority. Their issuance mode is
private provenance, not inferred from equal-looking fields. Copies, foreign
selections and wrong render/epoch/authority checks reject. Visible correlation
alone does not establish current adapter liveness: the owner must validate its
current render and epoch at delivery.

`flatListCommandRequest` and `canonicalFlatListEditorCommandRequest` share the
existing command, source, requirement and Unicode-bound validation. The list
constructor snapshots own-data fields before deciding defaults, without invoking
command/selection getters. Exact owned selections preserve direction and
affinities. Actions, typed intents, selection synchronization, history and group
boundaries produce immutable requests; undo/redo require a closed history group.
Explicit list native-input IDs point to the list actions, not paragraph actions.

The legacy request/authority/queue paths remain base-only. The list requests are
not yet wired into an executing queue or the Wasm command adapter. The real-browser
harness checks native list selection capture into immutable requests and rejects
stale epoch/render tokens, alongside the existing low-level edit/recovery checks.
See [command qualification](qualification/2026-10-04-flat-list-command-contract.json).

### Shared flat-list command queue

`BreditorFlatListCommandQueue` uses the same private queue core as
`BreditorCommandQueue`, with a constructor-fixed list request validator. The
legacy facade retains base admission. Borrowing a facade's submit method does
not change its receiver's captured mode. Both paths preserve synchronous FIFO
delivery, non-recursive reentrant submissions, active-plus-pending capacity,
immutable request snapshots and terminal uncertainty after an executor/observer
throws or returns a thenable. Failed heads are never retried automatically.

The list lease port requires both the exact captured executor and the list
admission function. Cross-mode lease ports reject. Ports use private state and
cannot be replaced by public queue methods. A lease reserves the queue through
execution and observer callbacks; even a malformed settlement spends it once.
Disposal during request inspection is rechecked before retention or execution.

The queue does not guess whether a captured editor snapshot is still live. Its
executor must check current authority/render/observation epoch immediately before
mutation. Unit and browser scenarios prove that a reentrant request can be
delivered serially and rejected as stale without applying it twice. The harness
uses a queue-state executor, not a substitute production Wasm adapter. Connecting
the normal list Wasm adapter/controller remains next. See
[queue qualification](qualification/2026-10-04-flat-list-command-queue.json).

### Flat-list adapter, ordinary input and toolbar integration

The explicit list queue now executes through `BreditorFlatListWasmCommandAdapter`,
using the same private production adapter core as paragraph/heading mode. The
adapter owns exact observation/render authority, generated-handle cleanup,
projection and semantic-selection publication, action-state reads, bounded plain
text export, Document V6 reads and Session V6 checkpoints. A post-commit DOM
failure retains the authoritative Rust state for explicit render reconciliation;
it never replays the command. See the
[adapter](qualification/2026-10-04-flat-list-command-adapter.json) and
[content](qualification/2026-10-04-flat-list-adapter-content.json) checkpoints.

`BreditorFlatListBrowserEventController` shares ordinary native-event processing
with the base controller while requiring list queue, bridge, render and delivery
capabilities. Mode-specific text/break/delete actions keep list paths intact;
formatting uses named intents. Keyboard echo suppression and selection-only
history behavior remain shared. The explicit list target-range mapper validates
complete AST paths and scalar UTF-16 boundaries. See
[ordinary-event qualification](qualification/2026-10-04-flat-list-event-controller.json).

`FLAT_LIST_TOOLBAR_MANIFEST` is a separate, opt-in 14-control manifest: Bold,
Clear formatting, Paragraph, Heading 1–6, Bullet list, Numbered list, Remove list,
Undo and Redo. Structural controls target profile-owned named intents; the
manifest is checked against the compiled action-state and intent descriptor
before mounting. The existing `BreditorToolbar` and `BreditorActionStateStore`
provide native buttons, keyboard focus and current activation/availability.

`createFlatListToolbarDispatcher` binds that toolbar to an exact queue/adapter
pair. It acquires an immediate lease before snapshotting the invocation, uses
captured private capabilities rather than public overrides, and holds the lease
through observer publication. Busy delivery rejects without queueing. Malformed
invocations reject before mutation. Uncertain execution or observer failure is
terminal and never retried. Owner disposal prevents future delivery but does not
rewrite a known completed result during teardown. Toolbar commands preserve the
core's exact selection; structural intents and history close the prior group.

Real-browser checks exercise a backward emoji selection in a numbered heading:
change rank, undo/redo, unwrap one item while retaining the next ordinal, wrap as
bullets, convert to numbering, and undo back through every exact document and
selection. WebKit installs the native range during dispatch, then clears its
visible highlight when the toolbar restores keyboard focus. The check proves
native endpoints before that focus restoration, retained exact Rust selection
afterward, and native range recovery on returning to the editor. This is not a
reason to steal toolbar focus or erase semantic selection.

These APIs remain internal and do not change shipping entry points, binaries or
durable formats. The browser scenario uses synthetic clicks and native-branded
input events, not physical input. High-level list owner/router integration,
composition, supported clipboard flows, visible reload/backup, native input and
release size/accessibility qualification remain open. Flat lists come first;
nested lists and indent/outdent follow in a later feature phase. See
[toolbar qualification](qualification/2026-10-04-flat-list-toolbar.json).

### Flat-list composition ownership and strict DOM reconciliation

The list adapter now implements begin, one-time refinement, native DOM opening,
strict restoration, explicit recovery and disposal through the shared composition
state machine. `FlatListCompositionDeliveryToken` captures actual hierarchical
projection/selection identity and a private list issuance mode; old matchers do
not accept it. Separate list renderer lease entry points share the existing
ownership, detached-build, reentrancy, installation and rollback machinery.
Wrong-mode or foreign leases cannot restore or discard another host's ownership.

`reconcileFlatListCompositionDom` shares the base scanner's text/inline-policy,
Unicode, node and attribute budgets. It additionally proves every root, list
container, `li` and text-block kind, including the exact canonical ordered start.
Every non-target block remains canonical. The target may contain only admitted
text/wrappers, and its captured prefix and suffix remain exact. Empty-item child
points and backward ranges resolve to aggregate offsets in their actual block.
The returned `textBlockPath` is `[root]` or `[root, item, 0]`; no list flattening
enters the selection or mutation protocol. More than one text block rejects with
the existing `composition.dom.cross_paragraph` code.

Restoration removes provisional DOM and writes the captured exact selection
without changing Rust. An accepted replacement is subsequently delivered through
the normal list command under the still-held queue reservation. Failed DOM/text
validation is cancellation/recovery, not permission to import structure. The
adapter cannot infer whether an arbitrary native event should commit: the event
controller still owns that decision and its list-mode integration remains next.

Unit tests cover exact ownership, stale/foreign/refined tokens, hierarchy drift,
Unicode/resource refusal, empty items, strict recovery, failed restoration and
disposal. Real-browser protocol tests use scripted provisional DOM and real Wasm
commands to prove exact undo/redo and Session V6 recovery, including preserved
redo after structural cancellation. They do not establish OS IME support. See
[composition lease qualification](qualification/2026-10-04-flat-list-composition-lease.json).
