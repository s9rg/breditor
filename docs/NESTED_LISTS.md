# Nested lists: experimental implementation contract

Status: first Rust admission checkpoint. Not enabled in the browser or current
opt-in flat-list package. This work does not resolve the intermittent WebKit fault.

## Document shape

A list contains one or more items. Each item contains exactly one leading
paragraph or heading, followed by zero or more child lists. Child lists may use
different marker families and explicit ordered starts. Empty lists, items without
a leading block, and blocks interleaved after child lists are invalid. Existing
document depth, node, child-count and ordinal limits apply at every level.

The experimental nested schema has a different fingerprint. Flat-list admission
and editing capabilities remain unchanged; flat operations must reject nested
schemas. Document JSON admission does not imply session/history compatibility.
No silent migration or fallback to flat traversal is permitted.

## Next checkpoints

1. Add a nesting-aware item-path and selection resolver. Test mixed marker types,
   heading items, empty blocks, emoji, backward ranges and end-exclusive ranges.
2. Implement `indent_list_items.rs`: move a contiguous sibling run beneath its
   preceding sibling, carrying all descendants. Disable for the first item,
   incompatible selection scopes, or depth-budget overflow. Preserve source
   marker family/start; merge only when numbering and family are compatible.
3. Implement `outdent_list_items.rs`: lift a contiguous sibling run one level.
   Preserve following-sibling order by attaching the trailing run beneath the
   last lifted item. At root level disable outdent; Remove list remains explicit.
4. Each structural edit is atomic and has exact inverse, selection mapping and
   replay coverage. Preserve inline formats, heading ranks, descendants and
   explicit ordered starts. Rejected edits leave state/history untouched.
5. Qualify nested text insertion/deletion, Enter, Backspace, formatting, plain-text
   clipboard, projection, rendering, recovery and codecs before browser exposure.
6. Add expandable-toolbar Indent/Outdent actions. Handle Tab/Shift+Tab only inside
   an editable list when the action is enabled; otherwise retain focus navigation.
   Verify physical keyboard and accessibility behavior separately.

Each action belongs in its own named, documented file. Every checkpoint requires
focused failure cases and regression tests; no shipping bundle rebuild or release
claim until end-to-end support is qualified.

## Implemented

- Feature-gated `CompiledSchema::try_compile_nested_list_profile` for admission.
- Separate grammar module and tests for recursive admission, invalid shapes,
  document round-trip, resource limits, distinct fingerprints and rejection by
  existing flat-operation capability checks.
- Snapshot-local sibling selection resolver, including backward/end-exclusive
  ranges, empty items and scalar-boundary validation. It grants no editing
  authority and rejects cross-container selections.
- Experimental `NestedListReframe` primitive with complete root-subtree guards,
  exact depth-first block preservation, schema/limit validation, inverse and
  point relocation. It is not yet a session operation or durable codec variant;
  undo/redo/replay integration remains required before action exposure.

## Release gate

The goal is fully tested end-to-end nested lists, not schema admission alone.
All six checkpoints above must be completed before a release-ready claim.
Require atomic failure tests, inverse/replay and selection mapping properties,
existing flat/default regression suites, packed-consumer tests, all three browser
engines, recovery compatibility checks, and native keyboard/input/accessibility
qualification. The unresolved intermittent WebKit fault remains an explicit risk;
green bounded reruns alone do not close it. No push or publication is authorized.

## Deferred

Task lists, arbitrary multi-block items, tables, rich HTML paste and collaboration.
Migration of existing flat sessions requires an explicit, separately tested path.
