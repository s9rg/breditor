# Bounded block layout implementation contract

Block layout belongs to the native document, not DOM styles or a second browser
model. Implementation is in progress. The feature is complete only after its
Rust, shared, Wasm and installed-browser acceptance checks below pass.

## Profile and property decisions

Rich V1 and V2 remain exact. Rich V3 explicitly adds optional layout properties
to paragraphs, headings and code blocks while retaining the V2 structural
grammar. Its fingerprint differs even when every layout property is absent.
Existing constructors, saved schemas and default SDK options never select it.
There is no implicit migration or reinterpretation of an old document.

The local Wasm selector is an explicit bootstrap format 8 factory for
rich V3. The shared selector is explicit profile configuration format 3, causal
model 13 and journal 14. Original V1/V2 constructors keep their exact selectors.
SDK rich language 3 is available through explicit headless factories; it must
not silently change the default or map an unknown future revision to an old
profile. Integrated V3 browser openings, rendering and controls remain required.

The native values are explicit alignment (start, center, end, justify, physical
left, physical right), text
direction (left to right, right to left, automatic), indentation from 0 through
12 levels, and integer line-height percentages from 100 through 300. AST keys
are `breditor/block-align`, `breditor/block-direction`,
`breditor/block-indent` and `breditor/line-height-percent`. Alignment uses integer
codes 1 through 6 in the order above; direction uses 1 through 3. No property
accepts arbitrary CSS, a DOM attribute or executable content.

Absence means host or parent inheritance. A patch distinguishes keep, set and
explicit removal; omission must never reset another property. Reset removes a
property rather than writing an invented default. A block's indentation is
independent from list/task nesting. Tables, images, rows, cells and structural
wrappers do not receive these text-block properties.

## Editing and history decisions

Rust derives selection targets from native coverage. Every covered text block
is included, including empty boundary blocks; a caret targets its current block.
Whole-node and merged-grid selections retain their existing source domains.
Code supports block layout but still rejects inline formats. An unsupported
selection or any invalid value or budget failure refuses the complete request.

Local changes use a named guarded action with an exact inverse. Kind conversion
preserves all four layout fields. Splits retain the left values and copy them to
the new right text block, including list/task heads. Joins retain the left
block's layout and recover the exact right values on Undo. Moving or wrapping a
block retains its metadata. Plain replacement creates the explicitly requested
new block; it must not accidentally inherit removed caption or cell layout.
Fresh paragraphs created beside atoms or by code exit also start with absent
layout. They are insertions into the parent flow, not splits of the selected
atom or code block.

Shared V3 uses an explicit new causal model and journal binding, selected only
by the new compiled profile. Each layout property is an independently owned
field with the existing deterministic register ordering. Disjoint concurrent
property edits merge; same-field conflicts use that ordering. Selective Undo
removes only the author's contribution, preserving peer text and other fields.
Field removal is an authored contribution, not deletion of another writer's
history. Old models reject V3 frames and records before adoption.
The four field identities are `layout-alignment`, `layout-direction`,
`layout-indent` and `layout-line-height`. Each may set or remove only its own AST
property. A complete seed must decompose existing layout into those same fields
so later edits and selective Undo use one representation, not competing base
properties and mutable overlays.

## Implementation and acceptance sequence

1. Add the closed native values, V3 schema admission and distinct fingerprint.
   Test wrong kinds, every value boundary, unknown fields, original fingerprints
   and original-profile rejection. Add the named action and selection-level
   transaction with exact source, policy and resource guards.
2. Retain layout through kind changes, prose/list/task splits, joins, rich
   clipboard and exact explicit/natural history recovery. Test Unicode, empty
   blocks, captions and merged base-cell bodies rather than only root paragraphs.
3. Add explicit shared V3 construction, field ownership, strict protocol binding
   and guarded native lowering. Prove independent-field concurrency, same-field
   conflict, resets, selective Undo/Redo, offline convergence and exact restart.
4. Add explicit Wasm and SDK factories, native mixed-state reads, bounded
   rendering, contextual toolbar fields and alignment keyboard equivalents.
   Existing V1/V2 behavior and package-root imports must remain unchanged.
5. Clean-install candidate archives and run mixed-content layout, clipboard,
   Undo/Redo, reload, React ownership, offline/reconnect and asset tests in all
   three engines. Run native/Wasm/type/default regressions and save evidence.

No readiness row advances for declarations or a native-only foundation. General
selection replacement, external interchange and the broader first-two-workstream
goal remain separate required work; final native accessibility and performance
qualification remain later release work.

## Native foundation checkpoint

The [native qualification](qualification/2026-10-16-block-layout-native.json)
covers the explicit V3 compiler, closed values, named action, native selection
transaction, strict intent decoder and independent mixed-state read. Local
conversion, splits, joins, captions, merged source cells, rich clipboard and
explicit/natural history recovery are exercised by 16 integration tests and an
internal schema-capability test. The complete native run passes 2,435 workspace
tests; existing shared V1/V2 regression passes 303. Strict native and release-Wasm
lint, Rustdoc and default JavaScript regressions pass. V1/V2 fingerprint constants
come from the previous actual Wasm runtime, not a new expected-value generator.

That foundation did not implement or qualify the planned V3 shared owner,
Wasm/SDK construction, rendering or browser controls. No V3 installed archives
or browser results belong to that checkpoint.

## Shared native checkpoint

Explicit V3 profile constructors now select causal model 13 and journal 14.
Their descriptors declare rich language 3 and block layout version 1; original
V1/V2 constructors, descriptors, frames and journals keep their meanings. There
is no automatic migration.

Genesis, new blocks, splits, clipboard paste and subsequent edits use the same
four independently owned fields. Layout never competes with immutable defaults
or identity properties. Only requested fields change, and explicit removal
restores inheritance. Native selection coverage and a complete native preview
precede shared publication; the original 64-command ceiling still applies.

Every retained V3 layout contribution is checked before projection cache reuse
or adoption, including hidden blocks and currently losing values. Each field may
set or remove only its own bounded property. Foreign fields, nontext owners and
layout in immutable identity/default metadata are refused atomically. Old
profiles do not acquire these semantics.

Eighteen shared integration contracts cover caret/code/empty/node/grid targets,
mixed values, pending formats, seed/reset, text/list/task splits, kind conversion,
join, fresh births, image-caption clipboard, independent offline edits, same-field
conflicts, selective history, exact explicit/natural restart, writer groups and
atomic policy/resource/import refusal. The research compatibility manifest runs
the same test source, not a second implementation.

The [shared native qualification](qualification/2026-10-16-block-layout-shared-native.json)
passes all 321 canonical shared tests, all 2,436 native workspace tests, the 18
same-source compatibility contracts, strict native/optimized-Wasm lint, Rustdoc
and default JavaScript regressions. It retains the failed attempts separately
from the final passing checks.

That native checkpoint preceded the Wasm/SDK bridge below. Complete visual
rendering, controls and integrated browser acceptance still belong to steps 4
and 5; neither checkpoint completes either V1 workstream.

## Wasm and headless SDK checkpoint

Bootstrap V8 and shared configuration 3 now have explicit Wasm factories, named
layout intent and native mixed-state reads. Owners advertise layout capability
only when V3 is selected. Old profiles retain their fingerprints and strict
selectors; wrappers reject missing capabilities or mismatched protocol pairs
before returning a V3 owner.

The package-root entry points are `createLayoutLocalProfileV3` from
`@breditor/editor` and `createLayoutSharedProfileV3` from
`@breditor/editor/collaboration`. Both use the same standard inline declarations
and V3 schema. Local `changeSelectionLayout` commands and shared
`changeSelectionLayout` calls contain only native layout intent, not caller
targets. `blockLayoutState` preserves independent mixed and inherited values.
Lower-level durable shared sessions explicitly select `richLanguage: 3` and
retain model 13 in both history families.

The [bridge qualification](qualification/2026-10-16-block-layout-wasm-sdk.json)
passes 135 native Wasm-boundary tests, 90 SDK units, 19 actual-Wasm package-root
scenarios and 60 clean-installed browser cases. Fifteen new cases cover V3
headless editing, offline shared fields, exact restart and durable storage in
Chromium, Firefox and WebKit. The other 45 protect existing selection and React
workflows. Actual older-runtime recovery passes 48 cross-version restores and
144 future-history comparisons; the default browser archive is unchanged.

The high-level vanilla/React openings still select only V1/V2. Bounded visual
layout, contextual fields, keyboard equivalents and integrated V3
vanilla/React/relay/asset tests are next. Headless API and storage results do not
qualify those unfinished workflows or the historical WebKit fault.
