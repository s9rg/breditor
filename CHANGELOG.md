# Changelog

This file records user-visible Breditor changes. Breditor uses semantic
versions for the supported browser package surface and explicit versions for
its durable formats and Wasm transport.

## 0.3.0-alpha.12 - 2026-09-10

This unpublished source checkpoint proves one closed RGB24 text-color feature
through the existing generic typed-format architecture. Rust still owns the
semantic value, mutation, selection, undo/redo, and replay; the browser owns a
strict presentation policy and native value-entry control.

### Closed RGB24 semantic profile

- Added the separate `example/color-showcase-editor@1` reference profile and
  fingerprint
  `sha256:b3d051b7a68a15ef8d47ce2a7c4f051a76d09c386f9545f7b955590d2cc7433d`.
  It reuses the existing Showcase's three extensions and adds
  `example/text-color-extension@1` as the fourth declaration.
- Declared `example/text-color@1` with the sole required integer property
  `example/rgb24`, bounded to `0..=16_777_215`. Its generated set surface uses
  action `example/set-text-color`, intent `example/set-text-color-intent`,
  binding `example/set-text-color-binding`, and state
  `example/text-color-presence`.
- Reused `InlineFormatSetSpecV1` and `SetInlineFormatAction` unchanged. Set and
  remove therefore retain the existing complete-map, collapsed pending-format,
  same- and cross-paragraph selection, exact no-op, undo/redo, and Session-V3
  replay semantics. No color-specific Rust action or operation was added.
- Added frozen typed-input and fingerprint-bound Document V2 helpers. Semantic
  documents contain only the RGB24 integer; CSS source text never crosses the
  profile boundary.

### Safe renderer, toolbar, and demo

- Added the zero-configuration `safeTextColorV1` render policy. It admits only
  literal `example/text-color@1`, exactly one required `example/rgb24` integer
  property with the fixed bounds, and exactly
  `<span class="breditor-text-color">`. It synthesizes the sole canonical
  dynamic attribute `style="color:#rrggbb"` with lowercase zero-padded digits;
  arbitrary CSS and extra attributes remain rejected.
- Extended the closed `inlineFormatForm` vocabulary with an exact required
  integer field presented as native `<input type="color">`. Integer/color
  conversion is exact, Apply still emits the canonical complete property map,
  Remove stays property-free, and pristine hydration uses the existing
  unset/uniform/mixed Rust state contract.
- The Color Showcase has seven renderer recipes and ten toolbar controls, with
  Text color innermost in the DOM order. Semantic `FormatSet` order remains
  lexical and independent from renderer nesting. Text color has no shortcut;
  the existing no-input Showcase shortcut manifest is reused unchanged.
- Semantic copy and HTML-only paste validate the same exact canonical style.
  Paste deliberately strips the source wrapper and RGB24 value to plain text,
  as it does for every other admitted source format.
- Switched the React demo to the new fingerprint, lineage
  `breditor-react-reference-color-showcase`, and persistence slot
  `breditor.react-reference-color-showcase.v1` rather than reinterpreting an
  earlier Showcase checkpoint.

### Compatibility and limits

This checkpoint changes no Rust contract, Profile Bootstrap V2 shape,
fingerprint algorithm, Document V2 or any V3 durable record generation,
IndexedDB envelope, or Wasm method; ABI 5 remains current. The value is opaque sRGB24
only: no alpha, arbitrary CSS, background/gradient, theme token, or contrast
guarantee is implied. CSP `style-src-attr`, forced-colors modes, user styling,
and browser settings can suppress or override presentation, and native color
picker UX varies across browsers and operating systems. A collapsed set/remove
has no standalone undo entry under the existing pending-format history law.
The exact decision is in [`docs/TEXT_COLOR.md`](docs/TEXT_COLOR.md). Alpha.12
packages remain unpublished; registry install examples apply only after a
maintainer publishes them.

## 0.3.0-alpha.11 - 2026-09-10

This unpublished source checkpoint adds bounded, callback-free keyboard
shortcut declarations for compiled profiles. It treats shortcuts as browser
presentation and input policy: Rust remains authoritative for semantic routes,
selection, mutation, history, and replay.

### Exact state-addressed shortcut compilation

- Added `createKeyboardShortcutManifest()` and the optional high-level
  `keyboardShortcuts` editor option. Each declaration names an existing
  Rust-owned action-state identity and one or more physical-code/Shift aliases; it
  contains no JavaScript callback, action ID, intent ID, DOM value, or mutable
  command object.
- Browser startup compiles each declared state against the exact owned profile
  descriptor. Only an exact stateless history direction or a routed no-input
  intent with the same state contract is executable. Missing states, direct
  actions, typed intents, or contract mismatches reject the complete explicit
  manifest before editor or toolbar DOM and listeners are installed.
- When the option is omitted, the base Bold/Undo/Redo declarations are filtered
  to compatible states actually available in the selected profile and then use
  the same exact compiler. Explicit manifests are never filtered, augmented,
  or repaired.
- Added immutable indexed chord and state lookups. Declaration order is not
  priority: states and chords are canonicalized, while duplicate state or chord
  ownership fails closed.

### Closed keyboard and accessibility policy

- Limited declarations to one exact `KeyA` through `KeyZ` code plus exact
  optional Shift, under the host-selected Ctrl or Meta primary modifier. A manifest
  admits at most 43 state declarations, four aliases per state, and 44 chords
  total—the exact non-reserved letter/Shift domain.
- Reserved A, C, V, and X under both Shift states for native Select All and
  clipboard ownership. Existing unshifted B, unshifted Z, unshifted Y, and
  shifted Z chords may be omitted but can target only Bold, Undo, Redo, and
  Redo respectively.
- Matching uses only exact physical `KeyboardEvent.code` values. Generated
  `KeyboardEvent.key` text and active layout do not select a binding; codes name
  US physical-key positions. A device without a conforming exact code may not
  invoke the shortcut, and browser/operating-system reservation conflicts remain
  possible.
- Derived toolbar `aria-keyshortcuts` from the same compiled table and explicit
  Ctrl/Meta policy used for execution. Unbound controls and editors with
  shortcuts disabled advertise no shortcut. No mutation observer faults or
  repairs later attribute drift immediately; a guarded toolbar interaction or
  explicit canonical-DOM validation detects it.

### Queue, history, and Showcase proof

- Routed every admitted chord through exact semantic selection capture, native
  cancellation, the one-use delivery authority, the bounded non-recursive
  command FIFO, and guarded Rust intent/history execution. Shortcuts never
  mutate contenteditable DOM directly or call extension JavaScript.
- No-input intents request the existing close-before history boundary and
  suppress held-key repeats. Undo and Redo retain repeat so each serialized
  request can traverse one stored history unit. Composition, Dead/Process/229,
  AltGraph, Alt, and a second primary modifier never activate a shortcut.
- Conventional native `beforeinput` echo receipts expire at the end of the
  current task when the browser emits no matching echo, so a later independent
  native command cannot be swallowed.
- Added a Showcase manifest for Bold, Italic, Strikethrough, Code, Highlight,
  Undo, and Redo, with both primary+Y and primary+Shift+Z aliases for Redo. The
  browser matrix executes all five format bindings, Undo, and both Redo aliases
  alongside generated accessibility metadata; typed Link and Clear Formatting
  remain intentionally unbound.
- Documented the complete grammar, collision rules, omitted-versus-explicit
  startup policy, exact physical-code-only behavior and its input-device/layout
  limitations, event/selection/history behavior, accessibility projection,
  compatibility boundary, and limitations in
  [`docs/KEYBOARD_SHORTCUTS.md`](docs/KEYBOARD_SHORTCUTS.md).

### Compatibility

This checkpoint changes no Rust action, intent, state, operation, transaction,
selection, history, or replay contract. Profile Bootstrap V2, schema
fingerprints, Document V1/V2, all V3 records, storage envelopes, exports, and
Wasm ABI 5 remain unchanged. Shortcut manifests and compiled indexes are
process-local browser data and are not persisted, replayed, synchronized, or
fingerprinted. Exact prerelease package matching remains required, and no
alpha.11 package is published by this checkpoint.

## 0.3.0-alpha.10 - 2026-09-10

This unpublished source checkpoint adds one Rust-owned command for clearing
all inline formatting. It uses the existing generic action, intent, state,
Wasm, browser queue, toolbar, history, and replay architecture; it does not add
a JavaScript mutation callback or adopt another editor's command protocol.

### Clear inline formatting

- Added the no-input `breditor/clear-inline-formats` action, semantic intent
  `breditor/clear-inline-formatting`, priority-zero blocking binding, and
  stateless `breditor/control-clear-inline-formatting` state source to every
  compiled base-text profile.
- A same-paragraph selection emits one property-aware `TextSplice`; a
  cross-paragraph selection emits one same-count `RootTextReplace`. Both clear
  the selected characters' complete `FormatSet`, preserve unselected typed
  properties, paragraph structure, selection direction and affinity, and form
  one exact undo unit.
- At a collapsed caret, the command installs an explicitly empty pending format
  set when contextual or pending formatting is effective. The operation-free
  state change follows the existing history-boundary contract: it closes merge
  continuity and preserves redo, but does not invent a standalone undo entry.
- Added exact no-selected-text and already-plain disabled outcomes, result and
  property-budget checking, payload-redacted diagnostics, exact undo/redo, V3
  checkpoint restoration, and replay coverage. Removed property values may
  remain in history and checkpoints for exact undo; this command is not secure
  erasure.

### Generic Wasm and browser delivery

- Kept Wasm ABI 5 and used its existing descriptor, action-state, no-input
  intent, command result, projection, and Session-V3 surfaces. A boundary test
  executes, undoes, redoes, and restores the command without a feature-specific
  JavaScript API.
- Routed native `beforeinput` `formatRemove` to the semantic intent and added a
  stateless Clear formatting button before Undo and Redo in the Showcase. The
  Showcase now has nine controls and retains the same generic preserved-
  selection command queue.
- Raised the complete engine state-catalog/descriptor/observer/snapshot-reader
  capacity from 512 to 514: four built-in states plus the already admitted 255
  toggle and 255 typed-set states. The change is monotonic; the separate toolbar
  manifest limit remains 64 presented controls.
- Consolidated shared same- and cross-paragraph format-rewrite planning used by
  toggle, typed set, and clear actions. The action-specific failure vocabulary
  and exact mutation semantics remain distinct.

### Compatibility

Profile Bootstrap V2, content-language fingerprints, Document V2,
Operation/Editor State/Transaction Request/Commit/Session Checkpoint V3,
storage wrappers, renderer recipes, and Wasm ABI 5 are unchanged. The base
schema fingerprint remains stable because command-catalog membership is not
content-language identity. Official prerelease packages still require an exact
version match, and no alpha.10 package is published by this checkpoint.

## 0.3.0-alpha.9 - 2026-09-10

This unpublished source checkpoint adds a separate Showcase reference profile
that turns three inert property-free extension declarations into visible
Italic, Strikethrough, and Inline Code features. It changes no Rust action,
operation, codec, browser protocol, or Wasm method; the point is to prove that
the generic architecture can gain useful controls without special-case editor
code.

### Additive Showcase profile

- Added the `example/showcase-editor@1` profile. It reuses the unchanged
  Highlight and typed Link extensions and adds one
  `example/text-styles-extension@1` owning Emphasis, Strikethrough, and Code
  format kinds with distinct action, intent, binding, and tracked state IDs.
- Profile compilation generates all three `ToggleInlineFormatAction` routes and
  state sources from the manifest. The reference package does not supply
  callbacks, mutation handlers, Wasm shims, or browser action tables.
- Added a complete deterministic render order: Link, Strong, Emphasis,
  Highlight, Strikethrough, then Code. The fixed safe wrappers are `<a>`,
  `<strong>`, `<em>`, `<mark>`, `<s>`, and `<code>`; Link remains the only
  property-driven renderer and still uses `safeLinkV1`.
- Added an eight-control toolbar in the order Bold, Italic, Strikethrough,
  Code, Highlight, Link, Undo, Redo. The new buttons use the existing APG
  roving-focus, active/mixed observation, preserved-selection queue, and exact
  undo/redo path.

### Demo and compatibility proof

- Switched the React demo to the Showcase profile and a new lineage and
  IndexedDB slot, leaving alpha.8 demo data untouched. The initial document
  retains the Highlight + safe Link example while the new styles begin
  inactive for immediate experimentation.
- Added reference fixtures and browser/package-consumer coverage for exact
  wrapper nesting, active/mixed state, cross-paragraph formatting, Link and
  Highlight preservation, undo/redo, checkpoint reload, responsive layout,
  and accessibility.
- Existing `REFERENCE_HIGHLIGHT_*` and `REFERENCE_FORMATTING_*` values remain
  unchanged. Alpha.9 stays on Profile Bootstrap V2, Document V2, Session/
  State/Commit/Checkpoint V3, and Wasm ABI 5. Exact prerelease package matching
  remains required, and no alpha.9 package is published by this checkpoint.
- The Showcase formats deliberately coexist: there are no exclusion rules,
  extension keyboard shortcuts, clear-format command, block code, headings,
  lists, rich paste, or runtime plugin loading in this checkpoint.

## 0.3.0-alpha.8 - 2026-09-10

This unpublished source checkpoint adds exact Rust-owned current-property
observation and pristine browser-form hydration to alpha.7's property-aware
inline-format control. It reuses Wasm ABI 5 and changes no bootstrap,
fingerprint, document, operation, state, commit, checkpoint, or storage format.

### Exact typed-set state

- Generated `SetInlineFormatAction` state now declares the independently typed
  output contract whose serialized pair is
  `breditor/set-inline-format-input@1`. The pair intentionally matches the
  input contract because every uniform output is its canonical round-trippable
  complete-map `set` branch; Rust input and output versions remain separate
  types.
- Added exact whole-map observation. Absence of the target format is `unset`; the same
  complete `PropertyMap` on every relevant run is `uniform`; and partial
  presence or differing complete maps is `mixed`. The fixed Remove query keeps
  activation input-relative, so differing all-present maps are active/mixed,
  partial presence is mixed/mixed, and absence is inactive/unset. A collapsed
  selection observes its effective pending/context formats.
- Added compile-time state representability proofs. Every schema-valid map for
  one generated setter must fit the fixed canonical `ActionValue` envelope.
  The generated setter catalog's collective worst case must also fit the Rust
  action-state batch value-count and text-byte budgets; compilation rejects the
  first canonical declaration that crosses a bound.

### Strict hydration and draft ownership

- The browser now requires the exact output contract and validates every
  uniform operation, lexical property order, complete schema coverage, scalar
  type/bounds, and activation/value pairing before replacing last-good state.
  Unset and mixed carry no fabricated field values.
- Opening a pristine form, or refreshing one while it remains pristine,
  hydrates an exact form-admissible uniform map. Unset and mixed use declared
  empty/default values. User input marks the draft dirty, after which ordinary
  state refresh and rejected dispatch preserve it.
- Completed dispatch discards the dirty draft, refreshes authoritative state,
  and hydrates the still-open form from the post-command observation. Close,
  Escape, opening another form, and disposal clear presentation state; reopening
  seeds from the latest fresh observation.
- Link URL strings remain exact inert scalar values in Rust and Wasm. The
  native field is `type="text"` with `inputmode="url"`, avoiding `type="url"`'s
  whitespace normalization. Because every single-line HTML input strips CR/LF,
  those two scalars are explicitly outside the form presentation contract: a
  stored value containing either makes the form (including UI Remove)
  unavailable, and submitted form values containing either are rejected rather
  than silently rewritten. The programmatic typed intent can still remove it.
  Only the separate `safeLinkV1` renderer may derive canonical `href`, `rel`,
  and `target` attributes.

### Compatibility and limits

- Alpha.8 adds no generated Wasm method and therefore keeps ABI 5. Exact
  browser/Wasm/reference prerelease pairing remains required even when ABI
  numbers match. No alpha.8 package is published by this checkpoint.
- Property observation is ephemeral action state, not an operation, durable
  cache, or executable capability. Observations, open/closed state, focus,
  drafts, and feedback are not undoable, replayed, persisted, or restored.
- Mixed is whole-map state with no per-field differences or merge base. Set
  remains complete-map replacement; optional/integer fields, partial patches,
  rich-paste property reconstruction, and arbitrary widgets remain outside the
  closed browser form.
- The complete decision and threat model are in
  [`docs/TYPED_TOOLBAR_CONTROLS.md`](docs/TYPED_TOOLBAR_CONTROLS.md).

## 0.3.0-alpha.7 - 2026-09-10

This unpublished source checkpoint adds the first native typed toolbar control
for a compiled property-aware inline-format set surface. It advances the
reviewed Wasm transport to ABI 5 while preserving Profile Bootstrap V2, schema
fingerprint bytes, Document V2, and every V3 durable record generation.

### Canonical set-surface identity

- Added the UI-neutral `CompiledProfileInlineFormatSetDescriptor`, derived from
  each admitted `InlineFormatSetSpecV1`. Canonical rows correlate exactly one
  target format, typed semantic intent, and routed presence-state identity;
  concrete action and binding identities remain private to Rust routing.
- Added the ABI-5 descriptor count and indexed format/intent/state getters.
  Browser consumption validates strict order, uniqueness, property-bearing
  format ownership, the exact `breditor/set-inline-format-input@1` contract,
  tracked/value-free state shape, routed cross-links, and the out-of-range
  sentinel before publishing frozen handle-free metadata.
- Kept the new descriptor process-local and presentation-neutral. No set
  surface, label, field, or property value enters Bootstrap V2 or a durable
  document/checkpoint/fingerprint contract.

### Callback-free Link form

- Added the browser-only `inlineFormatForm` toolbar declaration. Alpha.7 admits
  required URL-presented bounded string fields and required Boolean fields with
  default `false`; field declarations must exactly cover the target format's
  required property contract. Values remain per-toolbar draft state.
- Added canonical complete-map Set JSON and fixed Remove JSON construction with
  lexical property order, allocation-bounded Unicode/UTF-8 validation, exact
  plain-record keys and types, hostile-accessor containment, and payload-
  redacted failures. URL presentation does not grant navigation authority;
  `safeLinkV1` remains the only Link-to-DOM safety policy.
- Kept APG roving navigation on native buttons inside `role="toolbar"`. Each
  typed form is a nonmodal sibling of that root, so native field editing does
  not conflict with toolbar Arrow keys. Opening focuses the first field;
  Escape/Close restores the launcher; active IME composition suppresses
  Escape and submit; teardown clears drafts and listeners.
- Routed Apply and Remove through the existing synchronous typed intent queue
  with semantic selection preservation and a close-before history boundary.
  Rust still revalidates applicability and records/replays only the resulting
  typed operation. Form focus, draft values, and feedback are not persisted or
  restored.
- Updated the combined reference Highlight + Link toolbar to place the native
  Link launcher/form between Highlight and Undo. The Highlight-only toolbar and
  all public programmatic Link input helpers remain unchanged.
- Hardened browser DOM access around module-realm, brand-checked Document,
  input, Selection, Range, and EventTarget intrinsics. Standalone toolbars work
  in a Document or ShadowRoot and lock any pre-existing mount children as an
  exact non-owned baseline. Editor hosts remain deliberately light-DOM-only;
  startup, live event routing, selection access, and API/toolbar dispatch all
  fail closed if a connected host crosses into a ShadowRoot.

### Compatibility and limits

- ABI-4 and ABI-5 browser/Wasm packages cannot be mixed; startup rejects the
  mismatch. Existing button-only manifests keep their runtime meaning, while
  TypeScript consumers must now narrow the public control union by `kind`.
- There is no current-property hydration, optional or integer field, partial
  property patch, arbitrary widget/callback, rich-paste Link reconstruction,
  dynamic manifest replacement, or same-realm JavaScript sandbox. Set still
  replaces one complete property map.
- The complete decision and threat model are in
  [`docs/TYPED_TOOLBAR_CONTROLS.md`](docs/TYPED_TOOLBAR_CONTROLS.md).

## 0.3.0-alpha.6 - 2026-09-09

This unpublished source checkpoint completes property-aware inline formatting
across Breditor's sealed direct-root paragraph selection. It changes action
semantics only: Wasm ABI 4, Profile Bootstrap V2, the schema fingerprint,
Document V2, and the Operation, State, Transaction, Commit, and Session V3
record generations remain unchanged.

### Cross-paragraph typed set and remove

- `SetInlineFormatAction` now accepts a non-collapsed range spanning two or
  more direct-root paragraphs. `Set` replaces the target format's complete
  property map on every selected character; `Remove` strips that target kind
  regardless of its prior properties. Unselected prefix/suffix text, paragraph
  boundaries, empty middle paragraphs, and every non-target typed or
  property-free peer format remain exact.
- One cross-paragraph command emits one guarded, same-paragraph-count
  `RootTextReplace`. A selection that crosses structure but contains no text is
  disabled as `breditor/no-selected-text`; an already exact set or absent
  remove remains `breditor/inline-format-unchanged` with no operation.
- The action rebuilds the selected endpoints explicitly after canonical run
  folding, preserving anchor/focus direction and endpoint affinities. It clears
  pending formats, records one independent history entry, and restores the
  exact document, selection, and pending state through undo and redo. A new
  edit after undo still clears the linear redo branch.
- Cross-paragraph activation is global. A requested set is active only when
  all selected text already has the exact requested instance and mixed when
  only some does. The generated fixed remove query reports target-format
  presence: all present is active, partial presence is mixed, none is inactive,
  and a structural-only range is unavailable/inactive.

### Admission, replay, and compatibility

- Planning validates the requested instance and the complete derived result,
  including the one-operation ceiling, formats per leaf, leaf and aggregate
  text, child/node counts, aggregate property values, and aggregate property-
  string bytes. A plan is never published when canonical seam folding or
  property-owner duplication would exceed a host limit.
- Session Checkpoint V3 retains the resulting typed `RootTextReplace` recipe on
  both undo and redo branches and replay-proves it without rerunning the action.
  Alpha.6 restores conforming alpha.5 checkpoints. Alpha.5 can also restore and
  replay alpha.6 checkpoints containing this action because alpha.5 already
  defined the same property-preserving `RootTextReplace` V3 contract.
- No typed native toolbar control, rich paste, arbitrary block grammar,
  property patch operation, general property-to-DOM/CSS policy, or Local Log
  V3 is introduced. The application-owned Link form uses the existing strict
  typed-intent path, and paste continues to discard source formatting.

## 0.3.0-alpha.5 - 2026-09-09

This unpublished source checkpoint makes Breditor's sealed direct-root
paragraph operations preserve typed inline-format properties and lifts the
corresponding built-in editor paths. It changes no schema language, fingerprint
bytes, Profile Bootstrap generation, durable format number, or Wasm method:
typed profiles still use Wasm ABI 4, Bootstrap V2, Document V2, and the V3
operation/state/transaction/commit/session families.

### Property-preserving structural operations

- `ParagraphSplit`, `ParagraphJoin`, and `RootTextReplace` now admit complete
  schema-valid typed format instances in source guards, replacements, and
  derived results. Their exact guards, canonical seam merging, relocation,
  reciprocal split/join inverses, same-type root-replacement inverse, atomic
  failure behavior, undo/redo, and V3 replay retain those property values.
- Structural validation accounts for aggregate property-value and property-
  string-byte budgets across each complete source, replacement, and result
  slice. Splitting one typed run can create another property owner and may
  therefore be disabled at a configured property ceiling; joining equal runs
  may merge owners.
- Added a separate compiler-minted paragraph-structure capability for the
  fixed document/paragraph/text grammar with typed inline formats. The prior
  property-free base-text capability remains the explicit V1/V2 operation-codec
  sentinel, so older payload generations still fail closed for every typed
  schema rather than dropping properties.

### Lifted built-in actions and browser proof

- Typed profiles now support collapsed and extended Enter, multiline plain-
  text insertion, cross-paragraph type-over and selection deletion, backward/
  forward paragraph-boundary joins, and cross-paragraph Strong or extension
  property-free toggles while preserving typed peer formats.
- Multiline insertion applies one captured destination format set to every
  non-empty replacement line and checks the complete final property delta. An
  empty replacement fragment introduces no formatted run itself; retained
  prefix or suffix text can still make an edge result paragraph non-empty, and
  splitting formatted context can duplicate an existing property owner.
  Clipboard paste remains formatting-stripping: it discards source wrappers
  and properties, although the resulting text can inherit typed formats such
  as Link from the target context.
- Added a React-demo end-to-end gate for safe Link plus Highlight across Enter,
  multiline paste, boundary Backspace, undo, autosave/reload with both history
  branches, and redo. Exact safe `href`, `rel`, and `target` values must survive
  every step.

### Compatibility and remaining boundary

- Alpha.5 restores conforming alpha.4 V3 checkpoints. Downgrade is not
  generally safe: alpha.4 cannot restore an alpha.5 Session Checkpoint V3 whose
  retained undo or redo history contains a typed structural operation, even
  though the envelope version remains 3. No reader sniffs, converts, or drops
  that history.
- `SetInlineFormatAction` remains same-paragraph only. Cross-paragraph typed
  set/remove, rich paste, arbitrary blocks or node kinds, block properties and
  identities, general property-to-DOM/CSS policies, typed native toolbar
  controls, and Local Log V3 remain unsupported.

## 0.3.0-alpha.4 - 2026-09-09

This source checkpoint adds the first property-driven browser presentation and
typed application control without changing Wasm ABI 4 or any durable format.
It also corrects the Rust capability gate for property-free toggles inside a
property-aware schema. It has not been published to npm or crates.io.

### Property-aware toggle compatibility

- Built-in Bold and explicitly declared property-free extension toggle bundles
  now use the same paragraph-local `TextSplice` capability as typed
  insert/delete/set paths. A collapsed or same-paragraph toggle preserves
  neighboring property-bearing formats and accounts for properties duplicated
  by run splitting before it is enabled. This does not auto-register a toggle
  or make a property-bearing format eligible for the no-input toggle contract.
- Cross-paragraph toggling remains on `RootTextReplace` and still fails closed
  for a property-aware schema until the structural property-preservation
  checkpoint is complete.

### Closed safe-Link presentation

- Added the sole property-driven render policy, `safeLinkV1`. It is valid only
  on `<a class="breditor-link">` and must bind a format whose descriptor has
  exactly two required properties: a `1..=2048` UTF-8-byte string for `href`
  and a Boolean open-in-new-window flag.
- The browser admits navigation only for absolute, credential-free `http:` or
  `https:` URLs without control or Unicode-whitespace scalars and emits their
  canonical normalization. Both source and normalized URL fit the 2048-byte
  ceiling. Raw authority syntax must begin immediately after exactly two
  slashes and use visible ASCII without percent escapes, backslashes, or raw
  `@` credentials; internationalized hosts use explicit `xn--` spelling.
  Rejected authority spellings fail closed before URL parsing. A schema-valid
  but unsafe URL deliberately renders as an inert anchor rather than faulting
  the editor.
- Attribute output is closed: a safe same-window link receives only `href`; a
  safe new-window link additionally receives canonical
  `rel="noopener noreferrer"` and `target="_blank"`. Recipes cannot choose
  arbitrary attributes, schemes, styles, callbacks, raw HTML, `rel`, or target
  values.

### DOM, clipboard, and reference integration

- Rendering and retained-DOM drift checks use the exact resolved attributes.
  Composition reconciliation admits only the inert, href-only, or exact
  href/rel/target Link shapes, applies a 1 MiB aggregate UTF-8 work budget to
  transient dynamic attribute values before URL parsing, and still reduces the
  leased DOM to text before one Rust command.
- Semantic copy/cut HTML escapes and emits the same canonical Link attributes.
  HTML paste may admit those exact shapes, but every paste remains plain text;
  no source property or formatting is reconstructed.
- Added an additive Highlight + Link reference profile and browser-owned render
  manifest while preserving the existing Highlight-only exports. The React
  demo owns its URL and new-window form and calls the existing strict
  `executeIntentJson()` boundary; the built-in toolbar remains button-only.

### Remaining boundary

- Rust validates the declared scalar property types and bounds, not URL
  semantics. URL admission is an explicit browser presentation policy.
- Typed structural paragraph edits, rich paste, arbitrary property-to-DOM
  mapping, CSS/color policies, custom toolbar control kinds, and Local Log V3
  remain unsupported.

## 0.3.0-alpha.3 - 2026-09-09

This source checkpoint advances the typed-property integration through Wasm
ABI 4 and the browser runtime. It has not been published to npm or crates.io;
registry installation remains contingent on a separate maintainer publication.

### Wasm ABI 4

- Added the explicit, strict, bounded
  `BreditorCompiledProfile.fromBootstrapJsonV2()` path. Profile Bootstrap V2
  declares typed Boolean, bounded JavaScript-safe integer, and UTF-8-bounded
  string property contracts plus manifest-owned inline-format set bundles.
  Bootstrap V1 remains unchanged and separately selected.
- Added canonical property-contract getters to
  `BreditorCompiledProfileDescriptor` and scalar property getters to
  `BreditorProjection`, preserving property names, kinds, bounds, presence, and
  values without exposing executable callbacks.
- Added `executeTypedActionJson()` and `executeTypedIntentJson()`. The registered
  action or intent supplies the exact contract identity; strict bounded JSON
  decoding rejects duplicate keys, non-integral or unsafe numbers, malformed
  shape, and over-limit input without reflecting attacker payloads.
- Added a Rust-atomic `closeHistoryGroupBefore` option to action, intent, undo,
  and redo commands. Rust runs the requested boundary and command on one private
  checkpointed candidate, publishes both or neither, and reports an effective
  boundary through `historyGroupClosedBefore`. Typed JSON or contract rejection
  therefore leaves undo grouping unchanged with one action preparation.
- Added explicit `createEngineFromDocumentJsonV3()` and
  `createEngineFromSessionCheckpointJsonV3()` profile factories. These emit
  Session Checkpoint, Editor State, and Commit V3 while continuing to use
  Document V2. Existing exact-base V1 and compiled-profile V2 factories and
  egress remain explicit compatibility paths; there is no generation sniffing
  or automatic conversion.

### Browser typed and durable path

- Added the explicit `semanticProfile: { bootstrapJson, formatVersion: 2 }`
  selector for Bootstrap V2 plus Session Checkpoint V3. Startup deep-validates
  and freezes the full property descriptor, consumes property-bearing semantic
  projections, and correlates schema, fingerprint, profile generation, and
  property catalog before publishing DOM.
- Added high-level synchronous `executeIntentJson(intentId, inputJson)` for
  descriptor-declared typed intents. It preserves exact JSON bytes for the Wasm
  decoder, uses the same immediate queue lease and selection-preserving command
  path as `executeIntent()`, and returns the same redacted committed, blocked,
  unhandled, rejected, or failed result family. A deterministic Rust rejection
  of malformed or contract-invalid typed JSON maps to `rejected` with
  `reason: "invalidInput"` without faulting or disposing the editor.
- Extended canonical Document validation, defensive Session Checkpoint
  structural preflight, IndexedDB binding, restore, export correlation, and
  autosave capture to the explicitly selected V3 profile mode. Rust decode and
  replay remain authoritative for aggregate retained-state limits and complete
  checkpoint acceptance. Legacy unprofiled V1 and Bootstrap-V1 profile-aware
  V2 modes remain unchanged and never act as fallback paths.

### Remaining boundary

- Typed properties now reach the browser data and programmatic command layers,
  but callback-free rendering still uses fixed property-insensitive wrapper
  recipes, copy HTML emits no property-derived attributes, paste remains plain
  text, and the supported toolbar still exposes native no-input buttons. Safe
  property-to-DOM recipes, URL/CSS policy, and typed toolbar controls are next.
- Typed `ParagraphSplit`, `ParagraphJoin`, and `RootTextReplace` and a V3
  local-log/storage graph remain out of scope at this checkpoint.

## 0.3.0-alpha.2 - 2026-09-09

This source checkpoint advances the workspace and package manifests to
`0.3.0-alpha.2` while retaining Wasm ABI 3. The packages remain unpublished,
and browser-facing profiles remain property-free.

### Rust core

- Added registration-owned `SetInlineFormatAction` and the closed typed
  `breditor/set-inline-format-input@1` set/remove input. Set replaces the exact
  complete property map; collapsed selections update pending typing formats,
  and same-paragraph ranges use one guarded `TextSplice`.
- Added `InlineFormatSetSpecV1`, which compiles a same-manifest typed format
  into its action, typed intent, priority-0 blocking route, and routed presence
  state without embedding values, callbacks, or presentation metadata.
- Made `TextSplice`, paragraph-local insert/type-over, selection deletion, and
  backward/forward grapheme deletion preserve typed formats, exact resource
  accounting, relocation, inverses, and undo/redo values. Structural typed
  paragraph split/join/root replacement remains unsupported.
- Added explicitly selected Operation, Editor State, Transaction Request,
  Commit, and Session Checkpoint V3 codecs. They preserve operation and pending
  properties, retain selector/fingerprint binding, use Document V2, preflight
  hostile payloads, and publish only after complete validation/replay.
- Preserved V1/V2 bytes and made their property-free operation generation fail
  closed for typed schemas, including optional-only contracts with empty maps.
  No generation is detected or converted automatically.
- Local-log entry/checkpoint/frame/root/storage V3, typed Wasm/browser input,
  rendering, clipboard, and toolbar integration remain deferred.

### Browser demo and input correctness

- Reworked the React reference into an immediately usable Highlight demo with
  a canonical sample, responsive four-control toolbar, truthful autosave state,
  retryable startup/persistence failures, and explicit architecture guidance.
- Added a dedicated Chromium demo gate covering ordinary keyboard input,
  Highlight and Bold, undo/redo replay, IndexedDB reload, axe accessibility,
  and toolbar containment at a 320-pixel viewport.
- Admitted Chromium's narrowly proven collapsed `insertText` target-range alias
  after trailing U+0020 spaces in one terminal text run. Exact target/selection
  correlation remains mandatory for every other range and content shape.

### Wasm build integrity

- Canonically remapped Rust workspace, Cargo-home, and target paths out of
  generated Wasm and added byte-level checks for the exact logical/physical
  roots plus common user-home patterns.
- Upgraded reproducibility to compare a direct build with a build reached
  through workspace, Cargo-home, and target symlinks; both must produce the
  same complete package hashes.
- Repaired the generated-glue gate's current two-intent descriptor and native
  JSDOM target-range fixture so the high-level runtime path executes again.

## 0.3.0-alpha.1 - 2026-09-08

This checkpoint establishes typed inline-format properties as compiled Rust
document-language data. It intentionally ships no property-aware editing or
browser path and remains unpublished.

### Typed property language

- Added immutable manifest-owned `InlineFormatPropertyContractV1` declarations
  for exact qualified keys with required/optional presence and Boolean,
  JavaScript-safe integer, or UTF-8 byte-bounded string domains.
- Added the public checked `PropertyMap::try_from_sorted` constructor. It
  rejects duplicates and noncanonical input rather than sorting or overwriting
  caller values.
- Capped contracts at 32 properties and manifests at 255 contracts; contracts
  must be nonempty, target a format owned by the same manifest, and cannot claim
  `breditor/*` property names.

### Compilation, validation, and identity

- Compiled contracts into exact Document V2 key/type/range validation and the
  owned Rust profile descriptor. Added stable structured validation codes for
  unknown/missing/type/string-range/integer-range failures without retaining a
  rejected scalar payload.
- Added compiler-contract fingerprint version 2 for schemas containing typed
  properties. Property-free schemas preserve their exact version-1 bytes and
  the locked `breditor/base@1` digest. Locked the 356-byte Link fixture and
  `sha256:3903989dedf6015c4f81b16fdaaddafb4a7a100f1b7f61bfacef694b5141c9ef`.
- Added per-property-string and aggregate-document byte policies, cached
  document property-string accounting, a retained Session Checkpoint V2 byte
  budget, bounded JSON preflight, and a 1,024-entry validation-report ceiling
  including one truncation issue.

### Fail-closed alpha boundary

- A schema containing any property-bearing format rejects all four existing
  content operation variants at capture, validation, codec, and transaction
  boundaries. This prevents silent loss until a property-aware mutation and
  inverse protocol exists.
- Property-bearing formats cannot enter the existing V1 pending-format state or
  use generated no-input toggle declarations. Valid typed Document V2 values,
  ordinary selections without typed pending state, and empty-history Session
  Checkpoint V2 state remain representable.
- Wasm ABI 3, ABI-local profile bootstrap, browser descriptors/rendering,
  clipboard/HTML conversion, toolbar controls, and the reference Highlight
  package remain property-free. Matching package metadata is a source
  checkpoint only; no npm or crates.io publication occurs here.

## 0.2.1 - 2026-09-08

This checkpoint closes the guarded engine's process-local replay-classification
gap without changing the document model, durable V1/V2 formats, Wasm ABI 3,
browser API, compiled-profile fingerprint, or extension semantics.

### Core event-classification projection

- Added a non-lossy consuming projection from every sealed
  `EditorEngineEvent` to `EditorEngineLocalLogEvent`. It retains the source
  engine kind, corresponding `LocalLogEvent`, and exact successor
  `EditorEngineObservation`. Action and selection share the ordinary local
  commit classification but remain distinguishable by source kind; undo,
  redo, close-history-group, and clear-history remain distinct.
- Added `EditorIntentOutcome::into_event_outcome`. Committed intents retain
  their intent, selected binding, ordered fallthrough trace, action-classified
  engine event, and successor observation. Blocked and unhandled routes remain
  complete unchanged outcomes and claim no mutation.
- Kept `LocalLogEvent::try_undo` and `try_redo` mandatory for decoded or
  caller-supplied commits. The trusted constructors now require
  direction-specific, session-issued replay proofs rather than an arbitrary
  crate-internal commit.

### Scope

- Added exhaustive public-boundary coverage for all six engine event kinds,
  exact durable commit bytes across projection, codec round trips, successful
  V1 and profile-owned V2 log recovery (including a schema-bound control),
  state-only selection commits, successor-observation retention, redacted
  wrapper diagnostics, and non-lossy committed/blocked/unhandled intent
  projection with an ordered disabled fallthrough trace.
- This is process-local classification, not durable append coordination. It
  does not construct a `LocalLogEntry`; supply its schema, session, log,
  sequence, or replay bindings; establish ordering, uniqueness, or atomic
  append ownership; perform I/O; acknowledge an append; or attest durability.
  Package definitions remain unpublished.

## 0.2.0 - 2026-09-08

This release makes Breditor's first narrow semantic extension path shippable.
It promotes the audited RC.1 surface without changing Rust semantics, the
closed primitive replay language, V1/V2 durable formats, reference identities
or fingerprint, package-root exports other than the required final version
literal, or Wasm ABI 3.

### Supported extension foundation

- Added a supported, immutable compiled-profile path for property-free inline
  formats on Breditor's sealed paragraph/text AST. Rust remains authoritative
  for schema validation, selection, actions, transactions, history, replay,
  checkpoints, and semantic action state.
- Added exact Document/Session Checkpoint V2 profile binding, an opaque
  process-local profile generation, callback-free browser rendering, guarded
  no-input semantic intents, descriptor-validated toggle-button toolbars,
  canonical export/copy, plain-text paste, and profile-scoped IndexedDB restore.
- Shipped matching `@breditor/browser@0.2.0`, `@breditor/wasm@0.2.0`, and
  `@breditor/reference-highlight@0.2.0` package definitions. The reference
  package proves the full Highlight path from supported package roots with one
  exact shared browser peer. Publication remains a separate maintainer action;
  this release workflow does not publish to npm or crates.io.
- Retained the exact-base V1 browser path and documented `0.1.x` promises.
  Advanced browser exports, raw generated Wasm handles, Rust APIs, and the
  local-log/storage-generation research remain outside the supported
  package-root compatibility surface.

### Final shippability proof

- Repeated Rust formatting, all-target/all-feature workspace check, Clippy with
  warnings denied, the complete native workspace suite, and the Wasm target
  check, lint, and 24 browser-run boundary tests on final `0.2.0` metadata.
- Passed all TypeScript checks and 869 browser, 9 reference-package, and 14
  React unit tests. All 48 package-built browser tests passed in Chromium,
  Firefox, and WebKit, including Highlight, history, persistence reload,
  clipboard, teardown, and accessibility assertions.
- Rebuilt Wasm twice with byte-identical output, verified the reviewed
  202-signature ABI baseline, generated declarations, package file allowlists,
  locked dependency notices, and license bytes, then passed the isolated legacy
  and supported-root reference consumer flows through real Chromium.
- Measured 848,842 browser JavaScript bytes, 225,614 browser declaration bytes,
  8,088 reference JavaScript bytes, 7,880 reference declaration bytes,
  1,224,760 Wasm bytes, and 46,732 Wasm-glue bytes. The React reference build is
  734,680 JavaScript bytes (194,962 gzip) and 1,224,760 Wasm bytes (362,048
  gzip). Packed artifacts are 210,754 browser, 9,435 reference, and 428,471
  Wasm bytes. Every frozen ceiling passed.

### Explicit release limits

- Profiles are fixed for an engine lifetime. There is no dynamic extension
  install/unload, package discovery, independently compiled plugin ABI, or
  browser/Rust callback seam.
- Extensions cannot add arbitrary nodes, blocks, links/properties, operations,
  codecs, custom action inputs, keymaps, input rules, menus, selects, or custom
  toolbar controls. The supported contribution is a property-free inline format
  with the fixed generic toggle/intent/state path.
- Paste deliberately strips source formatting; generic HTML fidelity and rich
  fragment round trips are not promised. Browser evidence is desktop
  Playwright coverage, not mobile IME, screen-reader, or WCAG certification.
- History is bounded local linear undo/redo, and IndexedDB is a same-origin
  checkpoint slot with conflict detection rather than merge, collaboration,
  CRDT/OT, authenticated storage, rollback defense, or secure erasure.
- Resource ceilings can reject otherwise meaningful large inputs. Moving to a
  different schema fingerprint requires explicit admission/migration and starts
  a new history lineage; no general migration or downgrade engine ships here.

## 0.2.0-rc.1 - 2026-09-08

This unpublished release candidate freezes the complete Alpha.8 extension
surface and performs the `0.2.0` release audit without adding a feature. The
Rust implementation, schema compiler, action and intent semantics, V1/V2
durable formats, reference profile identities and fingerprint, and Wasm ABI 3
remain unchanged. The production delta is limited to exact release-candidate
version surfaces and documentation.

### Contract and package audit

- Confirmed that Cargo and npm manifests, lockfiles, package peers, the browser
  runtime version probe, examples, smoke fixtures, and tarball names all use
  exact `0.2.0-rc.1` pairing. The reference package still resolves one shared
  `@breditor/browser` peer and contains no bundled browser runtime.
- Rechecked the reviewed ABI 3 declaration against its 202-signature baseline,
  generated browser declarations, package-root exports, generated artifact
  allowlists, license parity, the locked dependency graph, and third-party
  notices. Apart from the required exported version literal, no unintended
  wire, ABI, package-root export, or semantic-profile drift was found.
- Completed independent scope, browser-runtime, and package/API audits with no
  P0, P1, or P2 implementation finding. Historical Alpha.8 measurements and
  exact consumer versions remain labeled as Alpha.8 evidence.

### Complete release gates

- Passed Rust formatting, all-target/all-feature workspace check, Clippy with
  warnings denied, the complete native workspace test suite, and the Wasm
  target check, lint, and 24 browser-run boundary tests.
- Passed TypeScript checks and 869 browser, 9 reference-package, and 14 React
  unit tests. All 48 real-browser tests passed in Chromium, Firefox, and WebKit,
  including the actual packaged Highlight profile and accessibility checks.
- Proved two byte-identical clean Wasm package builds, then packed all three
  packages with lifecycle hooks disabled. Isolated legacy and supported-root
  reference consumers imported, type-checked, production-bundled, initialized
  real Wasm, and opened successfully in Chromium without workspace resolution.

### Measured artifacts

- Browser output: 848,847 JavaScript bytes, 225,619 declaration bytes, and a
  210,732-byte tarball.
- Reference Highlight output: 8,088 JavaScript bytes, 7,880 declaration bytes,
  and a 9,436-byte tarball.
- Wasm output: 1,224,768 binary bytes, 46,732 JavaScript-glue bytes, and a
  428,417-byte tarball.
- React reference output: 734,685 JavaScript bytes (194,968 gzip) and
  1,224,768 Wasm bytes (362,021 gzip). Every existing ceiling passed and no
  release-candidate budget was widened.

`0.2.0-rc.1` is complete and remains unpublished. The final `0.2.0` checkpoint
will repeat the shippability gates without speculative feature work.

## 0.2.0-alpha.8 - 2026-09-08

This unpublished checkpoint proves the complete narrow extension path from
three installable package tarballs. It adds no new document, operation, or Wasm
transport generation: ABI 3 and the V1/V2 durable formats remain unchanged.

### Reference Highlight package

- Added `@breditor/reference-highlight`, a callback-free package assembled
  entirely from supported package-root APIs. It exports the exact profile
  bootstrap, fingerprint-bound Document V2 fixtures, a complete render
  manifest, and a Bold/Highlight/Undo/Redo toolbar manifest.
- Fixed its semantic identities as schema `example/editor@1`, extension
  `example/highlight-extension@1`, property-free format
  `example/highlight@7`, action `example/toggle-highlight`, no-input intent
  `example/toggle-highlight-intent`, binding
  `example/toggle-highlight-binding`, and tracked state
  `example/highlight-control`.
- Recorded the exact durable schema fingerprint as
  `sha256:374d5f058129ab8916d052866e37f3b3540dbb754ba560e55086415a3c58f741`.
  The package contains data and browser presentation declarations, not a
  JavaScript mutation callback or dynamically loaded Rust/Wasm plugin.

### External-consumer and browser proof

- Extended the packaging gate to build and pack matching
  `@breditor/browser`, `@breditor/wasm`, and
  `@breditor/reference-highlight` tarballs. A clean consumer outside the
  repository installs all three, proves that every import resolves inside its
  own `node_modules` and that the reference presentation uses the consumer's
  single browser peer, then type-checks, bundles with Vite, initializes real
  Wasm, renders Highlight, exports V2 content, and disposes in Chromium.
- Added high-level startup failures for missing and extra render recipes and
  missing or extra initial action-state catalog entries. Invalid presentation
  or catalog input is rejected before the editor host is mutated; an unknown
  toolbar intent/state contribution is rejected before either host is mutated.
- Ran the actual reference package through Chromium, Firefox, and WebKit. The
  matrix covers V2 startup, Highlight intent/state/toolbar delivery, canonical
  mixed Strong/Highlight nesting, undo/redo, canonical export and safe copy,
  formatting-stripping paste, persistence flush/reload, restored history, and
  teardown.

### Release boundaries and budgets

- Added reference-package ceilings of 12,000 emitted JavaScript bytes, 12,000
  declaration bytes, and a 20,000-byte packed tarball. The Alpha.8 artifacts
  measured 8,088 JavaScript bytes, 7,880 declaration bytes, and a 9,430-byte
  tarball.
- Recalibrated only the raw React reference-application ceiling from 725,000 to
  750,000 bytes after clean Alpha.8 and unchanged tagged Alpha.7 sources both
  rebuilt to 734,688 bytes with the current locked toolchain. The measured
  level-9 gzip size is 194,970 bytes and its 200,000-byte ceiling is unchanged;
  the reference extension is not imported by that application.
- Kept exact prerelease pairing: the reference package has an exact
  `@breditor/browser@0.2.0-alpha.8` peer, and supported use installs
  `@breditor/browser@0.2.0-alpha.8`, `@breditor/wasm@0.2.0-alpha.8`, and
  `@breditor/reference-highlight@0.2.0-alpha.8` together.
- Documented the package/application trust boundary and the deliberately
  deferred nodes, properties, callbacks, rich paste, typed intents, dynamic
  lifecycle, collaboration, and plugin-ABI capabilities.

Alpha.8 is complete. Its next checkpoint was the `0.2.0-rc.1` release audit
with no feature widening.

## 0.2.0-alpha.7 - 2026-09-08

This unpublished checkpoint completes the supported synchronous semantic-
intent path from the compiled Rust profile through native browser input, the
public editor API, and the default or extension-supplied toggle-button toolbar.
It retains Wasm ABI 3 and the durable V1/V2 formats unchanged.

### Built-in intent and routed state

- Added the core-owned tracked, no-input `breditor/format-strong` intent and
  the priority-zero blocking `breditor/format-strong-binding` route to
  `breditor/toggle-strong`. Both the exact base profile and compiled extension
  profiles include that declaration and binding.
- Changed `breditor/control-bold` from a direct action-state source to the
  built-in routed intent. Its inactive/active/mixed and blocked results now
  exercise the same frozen route used by supported Bold dispatch.
- Kept concrete actions, bindings, and routed-fallthrough provenance inside
  Rust and the advanced adapter result. The public browser result reports only
  the requested intent, committed/blocked/unhandled/rejected/failed status,
  stable blocked reason and activation when applicable, and the authoritative
  document snapshot.

### Supported browser intent path

- Added synchronous `BreditorBrowserEditor.executeIntent()` for declared
  no-input intents. Invalid, unknown, typed-input, busy, and unavailable calls
  reject without entering the queue; committed, blocked, and unhandled results
  remain discriminated and handle-free.
- Made public API delivery immediate-or-rejected through an exact idle queue
  lease. It never waits behind earlier work, never executes recursively, and
  reports busy while another delivery, authoritative read, or composition owns
  the adapter. An uncertain leased submission faults the high-level owner
  rather than retrying a possibly published intent.
- Routed native `beforeinput` `formatBold`, the configured primary-modifier+B
  shortcut, and the default Bold toolbar button through
  `breditor/format-strong`. Undo/Redo remain history commands; text and
  structural edits retain their existing concrete built-in actions.

### Descriptor-correlated presentation

- Added exact startup validation between every high-level toolbar control and
  the compiled profile descriptor. Supported controls must name a declared
  no-input intent and its routed state, or an exact history direction; their
  activation and absent value contracts must also agree. Direct concrete
  action controls remain available only through the advanced low-level toolbar
  assembly and are rejected by the supported editor startup path.
- Correlated every consumed action-state snapshot with the descriptor's fixed
  canonical catalog before publication. Missing, extra, substituted,
  reordered, or duplicate state IDs and activation/value contract drift fail
  closed; a failed refresh does not mutate the store's last-good snapshot.
- Kept the public contribution model deliberately narrow: one immutable
  native-button manifest, no callbacks, typed public intent input, custom
  control kinds, menus/selects, extension keymaps or `beforeinput` rules,
  dynamic replacement, or JavaScript action registration.

Alpha.7 is complete. Alpha.8 is the consumer-proof checkpoint: the reference
extension package, missing/extra contribution fixtures, complete cross-browser
and packaging gates, compatibility/limitation sweep, and final size evidence.

## 0.2.0-alpha.6 - 2026-09-08

This unpublished checkpoint completes the profile-aware base-text browser path.
It renders every property-free inline format admitted by a compiled Rust
profile, carries that meaning through selection, composition, clipboard,
export, and persistence boundaries, and retains the exact-base V1 path without
changing Wasm ABI 3.

### Profile-aware browser presentation

- Added an immutable callback-free inline-format render manifest with a closed
  safe-element vocabulary, checked class tokens, exact format coverage, unique
  DOM signatures, bounded ordering edges, deterministic topological order, and
  a process-local presentation identity distinct from schema identity.
- Extended semantic projections and updates with canonical lexical format sets
  bound to the exact compiled-profile descriptor and opaque generation. The
  legacy base projection remains unfingerprinted and compatible with the V1
  renderer and `<strong>`/`<b>` HTML admission path.
- Extended full and incremental DOM rendering, DOM-drift checks, AST/DOM point
  mapping, and composition reconciliation across nested format wrappers. Safe
  budgets cap projection nodes and wrappers, and hostile detached-DOM
  constructor reentry cannot overwrite intervening application content.

### Clipboard, export, and durable startup

- Copy and cut now serialize escaped semantic HTML from the authoritative AST
  using the exact compiled presentation. Paste keeps `text/plain` authoritative
  and otherwise accepts only an exact bounded presentation-shaped HTML tree,
  then deliberately strips source formatting before one Rust text action.
- Added explicit, non-sniffed Document and Session Checkpoint V1/V2 browser
  validators. Canonical JSON export is correlated with the current snapshot,
  schema, fingerprint, complete format catalog, and semantic projection.
- Added profile-aware IndexedDB slots and an outer-V2 record carrying the exact
  schema fingerprint and checkpoint format. A handle-free profile preflight
  selects the binding before stored payload validation or digest work; mismatch
  preserves evidence and returns no CAS token, fallback, repair, or write.
- Semantic profiles default to one slot per schema fingerprint; applications
  with multiple same-schema documents must supply distinct caller slots. V1
  bindings accept only the built-in base fingerprint.

### Boundary and release hardening

- Re-proved reserved editor and toolbar mounts after every synchronous generated
  boundary. Failed startup removes only exact Breditor-owned DOM nodes before
  hostile cleanup, preserves foreign siblings/replacements, and restores host
  attributes only when their installed values still match.
- Hardened the supported native-event path with brand-checked realm-prototype
  reads and calls for the `Event` family, `DataTransfer`, and
  `AbstractRange`/`Range`/`StaticRange`. Own and intermediate-prototype shadows
  cannot forge event facts, specialized interfaces, cancellation, clipboard
  methods, or range endpoints; advanced structural calls and mutation of the
  realm's actual platform globals/prototypes remain host-trusted.
- Copied generated-handle protection lists, target ranges, and clipboard MIME
  types only through bounded dense own data descriptors. Sparse, accessor,
  custom-iterator, over-limit, and failing-proxy inputs reject without executing
  indexed getters or transferring handle ownership.
- Split the browser TypeScript build into comment-free runtime emission and a
  declaration-only documentation pass, retaining public `.d.ts` docs within the
  existing package budgets. The reference application omits Vite's unused
  module-preload polyfill, and the size gate now totals every emitted JavaScript
  chunk rather than measuring only one named asset.
- Recalibrated only the raw JavaScript ceilings from 800,000 to 825,000 browser
  package bytes and from 700,000 to 725,000 reference-application bytes. The
  final gated artifacts measure 812,022 and 708,638 raw bytes respectively;
  declaration, gzip, Wasm, glue, and package ceilings were not raised.
- Added adversarial coverage for descriptor/generation correlation, manifests,
  projection updates, render drift/reentry, selection and composition wrappers,
  clipboard limits, V1/V2 export, persistence mismatch ordering, startup
  rollback, and scoped-slot coexistence.

Known limits remain intentional: the semantic tree is still document,
paragraph, and text only; formats are property-free; paste is plain-text;
links, lists, tables, embeds, collaboration, rich-fragment transfer, extension
keymaps, and supported intent toolbar dispatch are not included in this
checkpoint; the Alpha.7 entry above records their deliberately narrow
successor surface.

## 0.2.0-alpha.5 - 2026-09-07

This unpublished checkpoint carries one immutable compiled semantic profile
through the guarded Rust engine and the new Wasm ABI 3 boundary. It does not
yet render extension formats or expose extension toolbar controls in the
supported browser editor; those remain alpha.6 and alpha.7 work.

### Profile-correlated Rust engine

- Added the opaque compiled-profile generation to profile-created
  `EditorContext`, `EditorEngine`, engine observations and intent outcomes,
  and profile-owned action-state caches and observations. Guard checks reject
  another profile generation before engine instance, snapshot, or history
  mismatch and leave the authoritative owner unchanged.
- Added an owned, canonical `CompiledProfileDescriptor` containing the durable
  schema binding, every admitted inline-format kind and persisted revision,
  every intent input/state contract, and every action-state contract plus its
  complete direct, routed, or history source. Binary lookup APIs use the same
  lexical order as enumeration, and guarded command candidates share the
  immutable descriptor allocation instead of copying its bounded catalogs.
- Added guarded synchronous intent execution. Routing and the selected prepared
  action are consumed exactly once inside the engine; committed, blocked, and
  unhandled receipts retain route provenance, disabled fallthroughs, blocked
  reason and indicator data, and the authoritative successor observation.
- Made the checkpoint generation an explicit construction policy. The legacy
  constructor remains Session Checkpoint V1, while `try_new_v2` retains
  fingerprint-bearing Session Checkpoint V2 across every atomic candidate
  mutation—even for the exact built-in base profile.

### Wasm ABI 3

- Added strict, bounded `breditor/profile-bootstrap` version 1 JSON and a
  reusable `BreditorCompiledProfile` owner. It can create any number of fresh
  or restored engines from Document V2 and Session Checkpoint V2 without being
  consumed; equivalent recompilation preserves the schema fingerprint but
  mints a fresh opaque runtime generation.
- Added owned Wasm generation and descriptor handles plus generation checks on
  engines, observations, projections and updates, action-state reads, selection
  reads, command results, and semantic-intent results. The generation has no
  number, string, pointer, JSON, or persistence representation.
- Added `executeNoInputIntent`. The result distinguishes `committed`,
  `blocked`, `unhandled`, and `error`, retains binding and fallthrough
  provenance, exposes blocked reason/indicator data, emits Commit V2 and a
  profile-correlated projection update for commits, and returns the successor
  observation. Generic `ActionValue` JSON ingress remains intentionally absent.
- Retained the exact base-only Document V1 and Session Checkpoint V1 factories
  as an advanced compatibility path, but correlated their engines to the
  trusted built-in profile. All new profile factories are V2-only; neither path
  auto-detects or silently converts a wire generation.
- Added a dedicated size-oriented `wasm-release` Cargo profile and a pinned,
  deterministic generated-glue minification step. Native release optimization
  remains unchanged, and the larger ABI 3 surface stays within the existing
  Wasm binary, gzip, JavaScript glue, and npm-tarball ceilings.

### Browser boundary hardening

- The official browser bootstrap now requires an initialized module namespace,
  checks ABI exactly `"3"` and runtime package version exactly
  `"0.2.0-alpha.5"` before reading the engine factory, and rejects the former
  bare-factory shortcut.
- Bootstrap consumes and validates the opaque profile generation and complete
  descriptor, requires the exact built-in base profile at this checkpoint, and
  checks every initial and later observation, projection, selection,
  action-state, and command result against that generation. The standalone
  uncorrelated restore seam was removed in favor of the one guarded bootstrap.
- Extension rendering and extension toolbar execution are still deliberately
  unavailable. The supported browser continues to render the exact base
  profile while ABI 3 establishes the correlation needed by alpha.6 and
  alpha.7.

## 0.2.0-alpha.4 - 2026-09-07

This Rust-core checkpoint compiles the first complete semantic profile around
the property-free inline-format path introduced in alpha.3. It does not widen
the browser product, durable wire families, or Wasm ABI: the official npm pair
is version-aligned at `0.2.0-alpha.4` but remains unpublished and continues to
use Wasm ABI 2 and the exact-base V1 browser path.

### Manifest-owned toggle bundles

- Added immutable manifest-owned inline-format toggle declarations. Each bundle
  names exactly one format kind, action ID, intent ID, binding ID, and
  action-state ID; it carries no handler, callback, custom input, label, icon,
  shortcut, or toolbar placement.
- Limited toggle declarations to 255 per manifest and 255 across the compiled
  profile. Each toggle must target a property-free format declared by the same
  manifest, and one format can have at most one toggle.
- Reject duplicate action, intent, binding, and action-state identities within
  each typed namespace across the complete profile. Extension semantic
  identities cannot use the reserved `breditor/*` namespace.

### Immutable compiled editor profile

- Added an immutable `CompiledEditorProfile` that co-owns one resolved
  `ExtensionSet`, compiled schema, action registry, semantic intent router, and
  observable action-state catalog. Each successful compilation mints a fresh,
  opaque process-local profile generation for correlating those components.
- Each admitted toggle instantiates the existing generic Rust
  `ToggleInlineFormatAction`, a tracked no-input intent, one priority-0 blocking
  binding, and routed action state suitable for a future toolbar. All mutation
  planning and authoritative state evaluation remain in Rust. The existing base
  actions and Bold/Undo/Redo action-state entries remain present.
- Kept action, intent, binding, and action-state declarations out of the durable
  schema fingerprint. Adding or renaming only this semantic routing bundle does
  not change document meaning or any canonical V2 schema fingerprint.

### Deliberate alpha.4 limits

- Extensions cannot define custom actions, callbacks, action inputs, effect
  declarations, cross-extension format targets, shared toggle routes, or
  fallback routes. The only generated behavior is one no-input toggle per
  admitted declaration targeting a manifest-owned property-free format.
- Existing native Rust action-registry, intent-router, and engine APIs remain
  advanced bypasses; a host that uses them directly is outside the compiled
  profile's ownership and correlation guarantee.
- `CompiledProfileGeneration` is only a Rust-local container identity in this
  checkpoint. It is not yet carried by `EditorEngine`, observations, outcomes,
  or Wasm values; that transport work belongs to alpha.5.
- No browser rendering or toolbar UI is added. Profile-aware rendering remains
  alpha.6 work and the supported browser intent/toolbar path remains alpha.7.
  Every V1 codec remains exact-`breditor/base@1`-only.

## 0.2.0-alpha.3 - 2026-09-07

This unpublished prerelease completes the Rust-core sealed inline-format
checkpoint. Resolved extension manifests can now contribute property-free
inline formats to the existing base text structure, and the resulting schema
can use the already-versioned V2 persistence and replay graph. No browser or
Wasm extension surface is opened yet.

### Sealed schema contribution

- Added the public nonzero `PersistedTypeRevision` and
  `InlineFormatSpecV1` values. Each `ExtensionManifest` owns an immutable,
  canonically ordered format list; duplicate kinds and the fixed 255-format
  per-manifest ceiling fail before a manifest is published.
- Added `CompiledSchema::try_compile_base_text_profile`, which accepts one
  caller-owned non-`breditor/*` `SchemaId` and one resolved `ExtensionSet`.
  The compiler fixes the document/paragraph/text grammar, built-in strong
  format, property/entity prohibitions, and canonicality laws while admitting
  at most 255 extension formats in total.
- Compilation rejects reserved schema, extension, and format namespaces plus
  duplicate format ownership in deterministic phases. The declared format
  kind and persisted revision enter the canonical schema fingerprint; manifest
  owner identity, `ExtensionVersion`, and declaration order do not.

### Generic formatting and replay

- Added `ToggleInlineFormatAction`, an immutable Rust-owned action configured
  with one qualified format kind. It is enabled only when the active compiled
  schema admits that kind as property-free, reports inactive/active/mixed
  state, handles collapsed pending formats, and emits only existing
  `TextSplice` or `RootTextReplace` primitives for extended selections.
- Kept `ToggleStrongAction` as the compatibility wrapper for the existing
  built-in action identity and diagnostics. The generic action is public but
  is not automatically registered; compiled action ownership and semantic
  intent routing remain the next checkpoint.
- Extended `TextSplice`, `ParagraphSplit`, `ParagraphJoin`, and
  `RootTextReplace` admission to compiler-minted sealed base-text schemas.
  Extension formats survive canonicalization, exact inverse application,
  relocation, undo, redo, independent-proof Session Checkpoint V2 restore,
  and replay without rerunning the action handler.

### Compatibility and deliberate limits

- Every V1 codec remains byte-stable and exact-`breditor/base@1`-only. The
  sealed profile path uses explicit V2 selector-and-fingerprint binding; Wasm
  ABI 2, `@breditor/browser`, autosave, and IndexedDB remain V1-only.
- `breditor/base@1` remains the original strong-only schema. Extension
  profiles must use a caller-owned non-reserved schema selector and cannot add
  nodes, properties, entities, format parameters, exclusions, normalization,
  operation variants, codecs, or replay callbacks.
- This checkpoint does not yet build a complete `CompiledEditorProfile`,
  auto-register extension actions or states, bind semantic intents, or expose
  extension presentation through Wasm, the browser renderer, or the toolbar.

## 0.2.0-alpha.2 - 2026-09-06

This prerelease completes the Rust-core durable schema-binding checkpoint. It
adds an explicit fingerprint-bearing V2 generation for every durable record
family while preserving every V1 type, method, constant, and canonical byte.
It remains unpublished.

### Durable identity and record generations

- Added strict public `SchemaFingerprint` parsing and an owned
  `DurableSchemaBinding` containing both the human-readable schema selector and
  the exact compiled-content fingerprint. Syntax failure and a valid but
  mismatched fingerprint remain distinct payload-free errors.
- Added separate V2 codecs for Document, Operation, Transaction Request, Editor
  State, Commit, Session Checkpoint, Local Log Entry, Local Log Checkpoint,
  Local Log Frame, Storage Root, and Storage Generation. Each independent JSON
  envelope uses canonical `format`, `formatVersion`, `schema`, then
  `schemaFingerprint` order; every nested family is generation-locked.
- Propagated the durable binding through control-only log entries, recovery,
  continuation, Frame V2 tail admission, compaction, root/generation
  preparation, selected-root normalization, and selected-aware rotation.
  Matching fingerprints from independently compiled proofs are fully
  revalidated and rebound; mixed V1/V2 or cross-fingerprint graphs fail closed.

### Structural schema admission

- Added `SchemaAdmissionRequest`, which borrows a checked compact checkpoint,
  revalidates the source, validates the unchanged AST under a different target
  schema, and prepares a fresh revision-zero lineage, session, empty history,
  and exact Local Log Checkpoint V2 JSON.
- Added an explicit bridge that prepares an unpublished Storage Root V2 from
  the admission result. It rechecks the target binding and exact checkpoint
  bytes and performs no storage I/O or publication.
- Admission is deliberately structural only: it performs no content transform,
  never replays source history under the target language, and leaves the source
  owner and external persistence untouched on failure.

### Compatibility and deliberate limits

- V1 remains exact-base-only and byte-stable. Wasm ABI generation `2`, browser
  validation, autosave, IndexedDB, and all browser behavior remain V1-only;
  package versions move together solely for exact-pair repository testing.
- Storage V2 stops at checked prepare, encode, decode, and normalization. It
  does not enter the V1 `Prepared` -> `Uncertain` publication lifecycle and
  grants no compare-and-swap, durability, authenticity, freshness, writer-fence,
  or append authority.
- General non-base profile construction and generic property-free inline-format
  operations remain scheduled for `0.2.0-alpha.3`.

## 0.2.0-alpha.1 - 2026-09-06

This prerelease replaces the fixed base-schema implementation with a private,
parity-first declarative compiler and adds the proof identities required before
Breditor can safely admit extension-defined content. It intentionally exposes
no general schema compiler, extension format, new document wire generation,
browser command, or toolbar behavior yet.

### Declarative base compiler

- The public `CompiledSchema::breditor_base()` factory now compiles a canonical
  data-only declaration for `breditor/base@1`. The compiled tables express the
  document root, direct paragraphs, text leaves, property/entity prohibitions,
  property-free strong format, and existing canonicality laws.
- Added independent checked persisted type revisions, deterministic compiler
  phases, fixed schema-registration limits, duplicate/reference validation, and
  complete per-namespace reservation of `breditor/*` identities.
- Added a domain-separated, versioned canonical binary encoding and SHA-256
  `SchemaFingerprint`. Fingerprints include compiled content meaning and exclude
  extension package identity, actions, presentation, process data, and host-only
  memory/work budgets.

### Runtime proof safety

- Every independently created compiled-schema instance now owns a
  collision-free private allocation identity. Clones share that proof;
  separately created but semantically equal schemas share a fingerprint without
  sharing process-local proof authority.
- Documents carry both durable fingerprint and private proof identity. Exact
  proof and host-policy matches retain validated fast paths; explicit state
  construction can completely revalidate and rebind a same-fingerprint
  document, while different fingerprints fail without publishing state.
- Selection, operation, transaction, relocation, history, replay, and document
  encoding boundaries now reject or revalidate proof mismatches according to
  their ownership contract instead of treating a matching `SchemaId` as proof.

### Compatibility and limitations

- Existing Document V1 and every other durable V1 byte remain unchanged and
  bound to the built-in base definition. General schema construction remains
  private until fingerprint-bearing durable generations are implemented in
  `0.2.0-alpha.2`.
- Wasm transport ABI generation remains `2`; the exact npm pair is versioned
  together for clean prerelease consumer checks and remains unpublished.
- Added the locked RustCrypto SHA-256 dependency and updated the exact Wasm
  dependency/license inventory. Schema compilation is a cold-path operation;
  document editing does not hash on each transaction.
- Set the optimized release build to one code-generation unit so the
  fingerprint implementation and its dependencies remain inside the existing
  Wasm and npm-tarball size budgets without sacrificing clean-build byte
  reproducibility.

## 0.1.1 - 2026-09-06

This is the first additive foundation checkpoint toward `0.2.0`. It introduces
no new editor behavior, document/schema meaning, durable wire format, Wasm ABI,
browser command, or toolbar union. The npm packages remain un-published; their
versions are aligned only so repository builds and tarball smoke tests continue
to use an exact browser/Wasm pair.

### Extension-set foundation

- Added private-field, checked-constructor Rust values for extension semantic
  revisions, exact extension identities, behavior-free manifests, configurable
  resource limits under fixed ceilings, and immutable resolved extension sets.
- Added exact-version required dependencies, explicit exact-version conflicts,
  rejection of duplicate identities and multiple installed revisions of one
  qualified name, missing/wrong dependency diagnostics, and cycle rejection.
- Frozen canonical identity order as qualified-name ASCII bytes followed by a
  numeric semantic revision. Dependency-first topological resolution chooses
  the smallest currently-ready identity under that order, never caller or
  package installation order.
- Added 30 focused tests for canonicalization, registration permutations,
  deterministic diagnostics, numeric revision order, exact hard limits, and
  limit-plus-one failures. Public error enums are non-exhaustive so later
  compiler phases can add failures without forcing downstream exhaustive
  matches.

### Architecture decisions

- Defined the narrow `0.2.0` product goal: frozen declarative profiles and one
  end-to-end property-free inline-format extension path over the existing base
  text structure.
- Separated durable schema fingerprints, process-local compiled-profile
  generations, and browser presentation identities. Legacy V1 durable records
  remain bound to the exact built-in base schema; non-base profiles require new
  fingerprint-bearing record generations.
- Kept the primitive operation/replay language closed, rendering declarative
  and callback-free, portable extension actions Rust-owned, semantic intents
  distinct from toolbar presentation, and clipboard paste intentionally
  formatting-stripping until a complete semantic-fragment ingress exists.
- Recorded the deliberate exclusions: arbitrary nodes and properties, links,
  headings, hot semantic loading, JavaScript planners, custom operation codecs,
  dynamic Rust/Wasm linking, migrations, and collaboration.

### Deliberate checkpoint limitation

`ExtensionSet` proves only that bounded relationship metadata is internally
consistent. It does not register a schema, format, action, intent, renderer, or
toolbar item; execute code; mint a fingerprint; or prove that any document,
checkpoint, or replay log is compatible. Those capabilities remain gated by
the `0.2.0` prerelease sequence.

## 0.1.0 - 2026-09-06

The first shippable repository checkpoint is a deliberately small, local-first
rich-text editor. The npm package manifests and reproducible tarball gates are
prepared for `@breditor/browser` and `@breditor/wasm`; publishing those packages
is a separate operation and has not been performed. The Rust crates remain
repository implementation artifacts with `publish = false`.

### Product and architecture

- Added a framework-neutral browser editor whose canonical state is a validated
  immutable Rust AST. The editable DOM is a disposable projection and is never
  accepted as an independent document model.
- Added a synchronous Rust `EditorEngine` boundary with exact
  engine/state/history observations. Prepared work cannot be retained and
  applied to a later observation, and every effective mutation is admitted by a
  complete canonical session checkpoint before publication.
- Added the generated `@breditor/wasm` transport package and a high-level
  `@breditor/browser` owner. JavaScript owns browser event timing, DOM mapping,
  focus, native composition intervals, clipboard capabilities, scheduling, and
  IndexedDB I/O; Rust owns documents, selections, action evaluation,
  transactions, history, and checkpoint validation.
- Added a bounded non-recursive browser command FIFO. Reentrant work is ordered,
  exclusive composition and clipboard leases provide backpressure, and an
  uncertain executor or observer failure quarantines the queue instead of
  retrying a command that might already have committed.
- Kept Breditor's AST, points, actions, transaction records, history, extension
  surface, and persistence contracts original. ProseMirror, Lexical, Tiptap,
  and CKEditor are design references only; Breditor implements none of their
  protocols.

### Editing, selection, and history

- Added direct-root paragraphs, non-empty text leaves, and property-free strong
  formatting under the versioned `breditor/base@1` schema.
- Added typed and atomic multiline plain-text insertion, paragraph breaks,
  selection replacement, forward deletion, Unicode-grapheme-aware backward and
  forward deletion, and strong-format toggling.
- Added snapshot-bound UTF-16-safe caret and directional range selections,
  guarded DOM-to-AST and AST-to-DOM mapping, select-all boundaries, exact
  selection-echo suppression, and selection restoration through history.
- Hardened post-render collapsed-caret restoration against WebKit's transient
  `Selection`/`Range` disagreement while preserving exact backward direction
  for non-collapsed selections.
- Added paragraph-local native composition ownership. Intermediate IME DOM is
  treated as temporary evidence, reconciled to one guarded Rust operation, and
  replaced by the canonical projection on success, cancellation, or recovery.
- Added bounded deterministic linear undo and redo, explicit history-group
  boundaries, typing merge groups, exact inverse operations, and replay-proved
  checkpoint restoration.

### Actions and toolbar

- Added a namespaced immutable action registry, semantic intent routing, exact
  prepared capabilities, coherent action-state observations, and conservative
  invalidation.
- Added one public toolbar extension surface based on bounded immutable data,
  not callbacks or mutable plugin objects. The default manifest exposes Bold,
  Undo, and Redo; custom manifests can reorder, relabel, and group controls, or
  bind controls to matching state/command bindings already exposed by the
  injected engine. The official `0.1.0` engine exposes only the Bold, Undo, and
  Redo bindings.
- Added native-button semantics, accessible names, enabled state,
  pressed/mixed state, roving focus, and Home/End/arrow-key navigation. Toolbar
  commands preserve the semantic selection and use the same command FIFO as
  keyboard and browser input.

### Clipboard, persistence, and content egress

- Added semantic copy and cut plus atomic plain-text paste. Supported-subset HTML
  is escaped on copy; HTML-only paste is parsed without creating browser DOM,
  checked against a closed paragraph/strong allowlist, and flattened to plain
  text before it reaches Rust.
- Added the one-slot `breditor/indexeddb-session-checkpoint@1` profile with
  strict schema attestation, exact UTF-8 sizing, SHA-256 alteration detection,
  opaque compare-and-swap tokens, atomic replacement, explicit conflict and
  corruption outcomes, bounded autosave, flush, and paused-state retry.
- Added strict canonical `breditor/document@1` export and semantic plain-text
  export. Both are synchronously correlated to one live Rust snapshot and never
  read mutable DOM text, expose history, or leak Wasm handles.
- Added strict Session Checkpoint V1 encode/decode and replay validation for the
  current document, selection, pending formats, undo/redo position, history
  capacity, and merge continuity.

### Packaging, security, and verification

- Added reproducible generated Wasm checks, reviewed TypeScript declarations,
  transport ABI `2`, exact browser/Wasm version pairing, clean tarball install
  and provenance checks, external type-check and production bundle checks, and
  a real-browser consumer smoke test.
- Added MIT OR Apache-2.0 package licensing plus deterministic third-party
  notices and license payloads for the statically linked Wasm dependency graph.
- Added bounded decoding, projection, action-state, clipboard, queue, history,
  checkpoint, and export limits. Untrusted HTML uses a closed parse5-backed tree
  policy; untrusted documents and checkpoints are strictly decoded and fail
  without installing partial state.
- Hardened editing and toolbar host admission, generated-control dispatch,
  focus, and cleanup with native, brand-checked DOM reads and mutations, so
  shadowed tag, connectedness, child/parent topology, owner-document, role,
  tab-index, editable-ancestry properties, or own
  `setAttribute`/`append`/`remove`/`focus` methods cannot masquerade as, corrupt,
  dispatch through, or prevent cleanup of a supported mount or control.
- Added native Rust format, lint, test, property, security, compile-fail,
  rustdoc, Wasm-target, direct wasm-bindgen browser-runner, package, audit, and
  artifact-size gates.
- Added public-package Playwright coverage in lockfile-pinned Chromium, Firefox,
  and WebKit for editing, Unicode, directional selection, composition, toolbar,
  clipboard, IndexedDB reload, content export, undo, redo, and axe-detectable
  accessibility issues. A representative Safari/macOS accessibility-tree audit
  also checked native roles, names, values, and state changes.

### Deliberate limitations

- The base product supports paragraphs, text, and strong formatting only. It has
  no headings, lists, links, images, tables, nested blocks, arbitrary marks or
  properties, extension renderers, or dynamic action/plugin registration.
- Editing is single-user and local. There is no collaboration, CRDT/OT rebase,
  remote cursor, selective undo, cross-device synchronization, or multi-document
  registry.
- Selection is one light-DOM range. Composition is one range in one paragraph,
  and the automated composition scenarios are synthetic; real operating-system
  IMEs and mobile browsers are not certified.
- Clipboard support uses synchronous event `clipboardData`. There is no async
  Clipboard API, custom internal MIME type, file/image transfer, or rich
  mixed-format paste.
- Persistence is one best-effort same-origin checkpoint slot. Its digest is not
  authentication, and there is no rollback protection, cryptographic origin,
  executable append log, crash-tail recovery, or storage-generation publication
  adapter.
- The supported high-level browser content-egress API is Document V1 or plain
  text only. It exposes no HTML, editor-state, history, or session-checkpoint
  export operation.
- Commands are synchronous, and clipboard/DOM/core work is not one rollback
  transaction. Fail-stop behavior and canonical reconciliation contain an
  uncertain later stage but cannot undo an earlier external side effect.
- Browser automation, axe, and one Safari accessibility-tree inspection do not
  establish real-IME or mobile support, screen-reader behavior, or WCAG
  conformance. The supported and excluded compatibility surfaces are defined in
  [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md).
