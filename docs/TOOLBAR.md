# Breditor toolbar and action-state contract

Status: supported by the public `0.1.0` runtime and carried unchanged into the
`0.2.0` descriptor-validated intent toolbar and reference-package
consumer/cross-browser release; `0.3.0-alpha.7` adds the closed callback-free
typed inline-format form, and `0.3.0-alpha.8` adds exact property-state
hydration. `0.3.0-alpha.9` proves additive eight-control manifest composition,
`0.3.0-alpha.10` adds the Rust-owned aggregate Clear formatting route and
nine-control Showcase, `0.3.0-alpha.11` projects a separately compiled
declarative shortcut manifest onto toolbar `aria-keyshortcuts`, as defined in
[`TYPED_TOOLBAR_CONTROLS.md`](TYPED_TOOLBAR_CONTROLS.md) and
[`KEYBOARD_SHORTCUTS.md`](KEYBOARD_SHORTCUTS.md), and
`0.3.0-alpha.12` adds one exact native RGB24 field and ten-control Color
Showcase as defined in [`TEXT_COLOR.md`](TEXT_COLOR.md).

This is Breditor's own presentation protocol. Rust owns semantic availability,
activation, typed values, selection, history, and action preparation. The
browser owns labels, ordering, keyboard navigation, and DOM. A toolbar state is
display evidence for one exact snapshot; it is never permission to execute a
later click.

## Decisions

1. Toolbar state comes from the existing Rust `ActionStateCatalog` and
   `ActionStateCache`. JavaScript does not recreate action enablement rules.
2. Every click enters the same bounded command queue used by browser input.
   Supported toggle buttons name semantic intents; Undo/Redo name history
   directions. Rust reroutes and reprepares against the current observation
   even when a matching display state was enabled. Direct action controls are
   an advanced low-level bypass.
3. Selection changes are semantic work. New in-editor DOM ranges synchronize
   through that queue; absent and outside-editor ranges preserve the last core
   selection instead of clearing it.
4. Toolbar focus does not supply a new editor range. Toolbar requests use the
   explicit `preserve` selection policy and act on the current semantic
   selection. This supports both pointer and keyboard toolbar use.
5. The presentation manifest is bounded, immutable, callback-free, and
   independent from Rust catalog order. Adding a control does not add a switch
   statement to the toolbar renderer.
6. The APG toolbar uses only native command or launcher buttons. A typed
   launcher's nonmodal form is a sibling, not a descendant of `role="toolbar"`.
   CSS, icons, localization, and framework wrappers remain optional layers.
7. Shortcut declarations are separate from toolbar layout. Both address the
   same Rust-owned state identity; one descriptor compilation derives the
   executable target and one compiled table drives `keydown` plus truthful ARIA
   metadata. Neither manifest can become command authority.

## Base state catalog

The first Wasm engine constructs one frozen catalog from the same base action
registry used for execution:

- `breditor/control-bold` observes the tracked, no-input
  `breditor/format-strong` intent, whose priority-zero blocking
  `breditor/format-strong-binding` selects `breditor/toggle-strong`;
- `breditor/control-clear-inline-formatting` observes the stateless, no-input
  `breditor/clear-inline-formatting` intent, whose priority-zero blocking
  `breditor/clear-inline-formatting-binding` selects
  `breditor/clear-inline-formats`;
- `breditor/control-undo` observes history undo; and
- `breditor/control-redo` observes history redo.

Catalog entries are returned in lexical state-ID order. A manifest chooses its
own visible order, so presentation order is not a semantic or wire contract.
Bold uses tracked activation (`inactive`, `active`, or `mixed`). Clear
formatting, Undo, and Redo are stateless. Clear formatting derives availability
from the current selection and effective inline formats; history controls
derive it from authoritative replay preflight.

The generalized boundary also retains resolved typed action-state values,
disabled or blocked reason codes, and explicit `unhandled` and `faulted`
states. The four base states do not require a value payload.

## Wasm ownership boundary

An action-state read is guarded by the engine's current observation. Rust
refreshes its cache synchronously and returns one disposable result owning one
disposable snapshot. The snapshot contains the complete entry set plus a
bounded changed-ID hint and is classified as `full`, `unchanged`, or `delta`.

The browser adapter treats every generated object as hostile:

- snapshot lineage and revision must equal the adapter's atomic expected base;
- counts, identifiers, lexical ordering, status combinations, value contracts,
  and JSON value limits are independently checked;
- aliases with protected or already-owned handles fail closed; and
- the result, snapshot, nested value results, and cloned errors are freed
  exactly once on every path.

Alpha.7 adds a second correlation check before publication: the snapshot's
complete count and ordered lexical IDs must equal the compiled profile
descriptor. Resolved activation must satisfy the descriptor's stateless or
tracked contract. `unsupported` is valid exactly when the descriptor declares
no value; otherwise the snapshot must repeat the exact value name and version.
Missing, extra, substituted, reordered, duplicate, and contract-drifted
catalogs fail closed before the last-good store can mutate. Unhandled/faulted
entries retain the transport's deliberate absence of state observations.

Alpha.8 requires every descriptor-declared property-aware set state to repeat
the exact independently typed `breditor/set-inline-format-input@1` output
contract. After generic action-value validation, the browser correlates its
semantics as well: inactive pairs only with `unset`; uniform pairs only with
active; and value `mixed` pairs with active when all runs contain differing
maps or with mixed when presence itself is partial. The uniform property list
must exactly match the compiled schema in lexical order, requiredness, type,
and bounds. Any impossible pair or malformed value rejects the complete
refresh without replacing last-good state.

No generated handle, Wasm engine reference, observation capability, or
executable preparation enters application state or a subscriber callback.
The raw `full`, `unchanged`, and `delta` classification is relative to the
engine-global cache, not a browser store's local baseline, and no core cache
identity crosses Wasm. The store therefore consumes every complete successful
snapshot and derives its own caller-local comparison; raw changed IDs are only
bounded hints. Action-state reads expose stable disabled/blocked reason codes,
but intentionally omit the core's optional reason-detail payload.

## Browser state store

`BreditorActionStateStore` owns at most one complete immutable browser snapshot.
`refresh()` reads through the adapter-bound action-state port. A failed refresh
leaves the last good snapshot installed. Rust's `full`, `unchanged`, and
`delta` relation is engine-cache-global, so it is never treated as an
individual store's baseline: every successful view is complete, and each store
locally derives its initial full publication, exact duplicates, and changed-ID
hint. This keeps independent toolbar or inspector consumers correct even when
another reader advanced the engine cache. A locally unchanged refresh publishes
nothing to the snapshot slot.

The store also exposes one immutable synchronous status through `getStatus()`:

- `unavailable` means no successful snapshot exists yet;
- `fresh` means the installed snapshot came from the latest successful read;
- `stale` means a read failed and the installed last-good snapshot was retained;
  and
- `disposed` is terminal and retains the last-good snapshot, if any.

Unavailable and stale states expose the most recent redacted read error. A
successful read clears that error. Consequently, a successful snapshot equal
to the last-good value remains an `unchanged` refresh result but still notifies
when it restores `stale` to `fresh`. Repeated semantically identical errors and
equal reads which are already fresh remain silent.

Subscribers run synchronously in registration order. Notification is
non-recursive: a refresh requested by a subscriber is rejected while the
current notification pass owns delivery. One throwing subscriber cannot suppress
later subscribers or escape into the command queue observer. Unsubscribe and
store disposal are idempotent. Disposal synchronously publishes `disposed` to
the subscribers that were current when disposal began, then releases their
slots. If a subscriber disposes during another notification, the terminal
publication runs as a second non-recursive pass.

The store exposes a stable queue observer. Installing it when constructing the
shared queue refreshes state after every completed semantic delivery, including
selection-only delivery, disabled actions, undo, and redo. Initial state still
requires one explicit refresh after the adapter is live.

## Selection and focus

`EditorSelectionSync` has three exact meanings:

- `range`: synchronize this projection-bound semantic range before the command;
- `none`: explicitly clear the core selection before the command; and
- `preserve`: do not read, clear, or write DOM before the command; use the
  selection already held by the core.

A queue-routed `selection/synchronize` request performs only the first step; it
does not smuggle selection updates through a history boundary or no-op action.
It therefore produces one normal observer notification and one action-state
refresh without inventing undo history.

`handleSelectionChange` accepts a canonical live render and delivery token. An
exact programmatic selection receipt is ignored. A new in-host range is mapped,
revalidated after DOM access, and queued. No DOM range or an outside-host range
is a focus transition and preserves semantic selection. Active composition,
stale delivery, DOM drift, and queue uncertainty fail closed.

The unified event router introduced at checkpoint `0.0.58` owns listener
ordering and routes document `selectionchange` through the ordinary browser
controller. Advanced hosts that assemble lower-level components must preserve
that route and use the same queue observer for action-state refresh.

## Presentation manifest

`createToolbarManifest` accepts a dense array of 1 through 64 controls. The
toolbar label and every control label contain valid Unicode, at least one
non-whitespace character, no ASCII control or DEL character, and at most 128
UTF-16 code units / 512 UTF-8 bytes. Every unique `stateId`, intent ID, and action ID is at
most 128 ASCII characters and follows the lowercase
`namespace/local-name` grammar. An optional group is valid Unicode, already
trimmed, nonempty, control-free, and at most 64 UTF-16 code units / 256 UTF-8
bytes. A string action input is nonempty valid Unicode and at most 65,536 UTF-16
code units / 65,536 UTF-8 bytes. The public package root exports constants for
these bounds. The manifest and every nested value are copied and frozen. Button
declarations retain primitive data only:

- a bounded toolbar label;
- a unique qualified action-state ID per button;
- a bounded visible/accessibility label;
- tracked or stateless activation presentation;
- an optional presentation group; and
- a declarative semantic intent, no-input/string direct action, or undo/redo
  command.

Alpha.7 adds `inlineFormatForm`, containing a unique state ID, format kind,
typed intent ID, bounded labels, and 1 through 32 fields. Across all forms one
toolbar admits at most 64 fields. One Alpha.7 field is a required
`presentation: "url"` string with its exact profile UTF-8 minimum and maximum;
the other Alpha.7 field shape is a required Boolean with `defaultValue: false`.
Alpha.12 adds one exact required integer shape with presentation
`"rgb24"`, fixed bounds `0..=16_777_215`, and an in-range non-negative-zero
default. Every form must contain at least one value-presenting URL string or
RGB24 integer field; a Boolean-only form is rejected.
Property names are unique inside the form. The declaration carries no value,
callback, URL policy, DOM node, or executable object.

It accepts no callback, DOM node, HTML, CSS, icon markup, Wasm handle, or
executable object. Hosts can map their own icons or localized labels by stable
presentation/state IDs outside this manifest.

Every retained field must be an own data property, and `controls` must be a
bounded dense array of own data elements. Accessors and inherited fields are
never read. Undeclared properties are dropped. The historical v0.1.0 toolbar
manifest did not admit shortcut metadata. Alpha.11 keeps that schema unchanged
and adds a separate manifest whose descriptor-compiled behavior is shared with
the toolbar before `aria-keyshortcuts` is emitted.

The default manifest is Bold, Undo, Redo, with Bold naming
`breditor/format-strong`. Alpha.7 high-level startup checks every control
against the owned compiled-profile descriptor. An intent control must name a
routed action-state entry sourced from the same declared no-input intent, match
its tracked/stateless activation, and declare no value on either side. A
history control must match the state entry's exact Undo or Redo direction.
For a button, missing state or intent declarations, direct sources, typed
inputs, value contracts, and any source/activation mismatch reject the complete
startup.

An `inlineFormatForm` instead must match one ABI-5 canonical typed-set triple:
format kind, typed intent ID, and routed action-state ID. Its fields must
exactly cover the profile's required properties with equal types and string
bounds. Its intent input and state output both name the exact serialized
`breditor/set-inline-format-input@1` pair, although Rust types their versions
independently. Optional properties, integer fields, omitted or extra keys, and
partial patches are rejected. Alpha.12's sole exception to the integer
rejection is the exact RGB24 field with bounds equal to its required profile
integer property; arbitrary integer fields remain rejected.

Custom validated manifests can omit, reorder, relabel, group, or expose
additional compiled property-free format toggle intents as native buttons. A
manifest still cannot register behavior. The parser retains direct action
declarations for advanced low-level toolbar construction, but the supported
high-level editor rejects them as a policy bypass.

Alpha.8's `@breditor/reference-highlight` package proves this through its root
exported Bold, Highlight, Undo, and Redo manifest. Highlight names state
`example/highlight-control` and no-input intent
`example/toggle-highlight-intent`; the compiled descriptor binds those to
`example/toggle-highlight` through `example/toggle-highlight-binding`. The
package declares the exact browser version as a peer because toolbar and render
manifests are branded by their creating browser module instance. Clean-consumer
and Chromium/Firefox/WebKit tests exercise the actual package rather than an
inline imitation.

Alpha.4's additive Highlight + Link reference profile does not widen this
toolbar protocol. Its URL field, open-in-new-window checkbox, Apply Link, and
Remove Link buttons are React-owned application UI beside the declarative
toolbar. They construct exact typed set/remove JSON and call the existing
`executeIntentJson()` boundary. They are not toolbar manifest controls and do
not receive renderer, selection, or Rust mutation authority.

Alpha.5 likewise adds no control kind or toolbar dispatch rule. The existing
Enter, paste, delete, undo, and redo routes can now preserve typed peer formats
through Rust's sealed paragraph-structure operations.

Alpha.6 adds no control kind or toolbar dispatch rule either. The React-owned
Link form can now apply its existing strict typed-intent set/remove request to a
multi-paragraph semantic selection. Rust reports the generated presence state
as active when all selected text has Link, mixed when only part does, inactive
when none does, and unavailable/inactive for a structural-only range. This does
not make the form a toolbar manifest control or allow the toolbar to collect a
property value.

Alpha.7 replaces that application-only presentation in the combined reference
manifest with one native `inlineFormatForm` launcher between Highlight and
Undo. The existing public Link JSON helpers remain available for programmatic
calls. Apply builds the same canonical complete-map set input; Remove builds
the same canonical remove input. Drafts are runtime-owned, cleared on Close,
Escape, completed delivery, and disposal, and are not hydrated from selection
values or persisted.

Alpha.8 adds exact state-value seeding without changing that declaration. The
fixed Remove query still owns activation. Its orthogonal value is `unset` when
Link is absent, `uniform` with canonical set input when every relevant run has
the same complete Link map, and `mixed` for partial presence or differing maps.
A collapsed selection observes the effective pending/context formats. This is
whole-map equality; no fieldwise mixed or merge value exists.

Opening a pristine form and refreshing a pristine open form hydrate a uniform
value exactly; unset or mixed uses the declaration defaults. User input marks
the draft dirty, after which background state refreshes preserve it. Rejected
dispatch also preserves it. Completed dispatch clears the dirty state,
refreshes synchronously, and hydrates from the authoritative post-command
value. Close, Escape, another form opening, and disposal clear presentation
state; a later open seeds from fresh state again. These drafts are not action
state, history, replay, or persistence data.

Alpha.9 adds no toolbar control kind or dispatch rule. Its Showcase profile
uses ordinary no-input toggle buttons for Bold, Italic, Strikethrough, Code,
and Highlight; the existing typed Link form; and the existing Undo and Redo
history controls, in that order. The three new style buttons are admitted from
their compiled property-free toggle declarations and execute through the same
queue, intent router, Rust action state, transaction, and history boundary as
Bold and Highlight. No switch statement or feature-specific command callback
is added to the toolbar.

The styles are independent and may all be active or mixed over one selection.
The toolbar does not implement mutual exclusion, a clear-format aggregate,
extension shortcuts, overflow menus, or runtime manifest replacement. The
Showcase is evidence that the fixed declaration grammar composes; it is not a
general toolbar-widget or plugin API.

Alpha.10 adds no control kind or dispatch rule. The Showcase appends one
ordinary stateless **Clear formatting** button after Link and before Undo/Redo,
for the exact order Bold, Italic, Strikethrough, Code, Highlight, Link, Clear
formatting, Undo, Redo. The button uses the base routed state and no-input
intent above. Native `beforeinput` type `formatRemove` uses that same semantic
intent. Over a nonempty same- or cross-paragraph text range, Rust removes every
inline format and typed property as one undoable transaction; at a collapsed
selection it clears the effective pending/context format set without adding a
standalone undo entry. Structural-only and already-plain selections remain
disabled. This supersedes only Alpha.9's aggregate-clear limitation; it does
not add per-format clearing, exclusion groups, callbacks, or a new Wasm ABI or
durable generation.

Alpha.12 adds one closed required integer field for the Color Showcase's
`example/text-color@1` format. It is admitted only when all three correlated
descriptor surfaces name the existing typed-set contract and the profile
declares exactly required integer `example/rgb24` with bounds
`0..=16_777_215`. The manifest field must use `kind: "integer"`,
`presentation: "rgb24"`, those exact bounds, and a valid RGB24 default. It is
not a general numeric input.

The runtime creates native `<input type="color">`. Hydration maps one uniform
Rust integer to lowercase zero-padded `#rrggbb`; unset or mixed uses the
declared default. Input is mapped back only from that canonical seven-scalar
form. Apply emits the existing complete-map set JSON in lexical property order
and Remove emits the existing property-free removal JSON. Dirty-draft,
selection preservation, dispatch, close/reset, feedback, and focus semantics
are the same as the Link form. Drafts never become Rust state or persisted
content.

The Color Showcase toolbar order is Bold, Italic, Strikethrough, Code,
Highlight, Text color, Link, Clear formatting, Undo, Redo. Text color has no
shortcut; the shortcut contract cannot carry a value or open the native form.
Native color-picker UI and keyboard affordances vary across browsers and
operating systems. The browser neither guarantees contrast nor bypasses CSP or
forced-colors policy. See [`TEXT_COLOR.md`](TEXT_COLOR.md).

## Shortcut presentation

Alpha.11 adds a browser-owned `KeyboardShortcutManifest`; it does not add a
field to `ToolbarManifest` or the Rust extension profile. One declaration names
an existing qualified action-state ID and one through four chords. Each chord
is exactly one physical `KeyA` through `KeyZ` code plus the configured primary modifier and
an exact Boolean Shift state. `createKeyboardShortcutManifest` copies,
canonicalizes, deeply freezes, and brands the data.

The complete manifest admits at most 43 state declarations and 44 unique
chords. State IDs are at most 128 ASCII characters in the existing qualified
grammar. A/C/V/X are unavailable with either Shift value so Select All and
clipboard ownership remain native. Primary+B, primary+Y, primary+Z, and
primary+Shift+Z may be omitted but can target only their exact built-in Bold,
Redo, Undo, and Redo states. Duplicate state IDs, duplicate chords, accessors,
extra fields, sparse arrays, malformed/non-letter codes, and limit overflow reject
the entire value. Registration order never chooses a winner.

High-level startup compiles each state against the same owned profile descriptor
used for toolbar admission. The state must be an exact stateless/value-free
Undo or Redo source, or a routed no-input intent whose action-state contract
equals the intent contract. Unknown states, direct actions, typed intents,
mismatched routed-state contracts, and nonstateless or valued history states
reject startup before native listeners or toolbar DOM become live. Omitting
`keyboardShortcuts` compiles only the compatible
subset of the default Bold/Undo/Redo manifest; supplying an explicit manifest
is exact and receives no implicit bindings.

When `keyboard.shortcuts` is `"enabled"`, every generated control whose state
has compiled bindings receives one canonical `aria-keyshortcuts` value. Tokens
use `Control` or `Meta` from `keyboard.primaryModifier`, optional `Shift`, and
the uppercase letter; aliases are separated by spaces. Unbound controls and a
disabled shortcut policy omit the attribute. The toolbar integrity check treats
that attribute as owned DOM. ARIA remains descriptive evidence: the matching
native `keydown` is looked up in the same compiled table and enters the guarded
semantic intent/history path. No mutation observer repairs or faults attribute
drift immediately; a guarded toolbar interaction or explicit canonical-DOM
validation detects it, and keyboard execution never consults the attribute.

The Showcase advertises primary+B, primary+I, primary+Shift+S, primary+E,
primary+Shift+H, primary+Z, primary+Y, and primary+Shift+Z. Typed Link has no
shortcut because a chord cannot carry its required property map or open a
general widget. Clear formatting is unbound in that reference manifest but can
be assigned a non-reserved letter by another descriptor-matched presentation.
Intent auto-repeat is suppressed and requests `closeBefore`; Undo/Redo repeat is
admitted. Alt, AltGraph, the secondary primary modifier, dead/process/
composition keys, punctuation, function keys, sequences, callbacks, runtime
replacement, and extension-defined `beforeinput` rules remain outside this
surface. It changes no Rust action, Wasm ABI 5 member, durable schema or
fingerprint, history/replay law, or persisted record.

## Accessible DOM behavior

`BreditorToolbar` treats its constructor element as a mount. It accepts only an
HTML `article`, `aside`, `div`, `footer`, `header`, `main`, `nav`, or `section`
outside an effective editable region, with no `tabindex` attribute. A role is
absent/empty or contains only case-insensitive `banner`, `complementary`,
`contentinfo`, `form`, `generic`, `group`, `main`, `navigation`, `none`,
`presentation`, `region`, or `search` tokens. The high-level owner additionally
requires a connected, empty, distinct toolbar host. The toolbar appends one
owned inner `<div data-breditor-toolbar-root>`. Only that inner root
receives `role="toolbar"`, its accessible name, horizontal orientation, and the
generated native `<button type="button">` controls. Existing mount attributes
and children remain outside the toolbar role. Their exact node identities and
order form an immutable baseline for the toolbar lifetime; drift faults before
dispatch, while disposal removes only Breditor-owned nodes. `.element` returns
the owned inner root.

Each typed form is appended under the toolbar mount as a hidden sibling of the
owned toolbar root. Its launcher carries the expansion/control relationship.
Opening one form closes any other and focuses its first field. Escape or the
explicit Close button clears the draft, hides the form, and restores launcher
focus. The form is nonmodal: it has no dialog role, focus trap, backdrop, or
page inerting, and its fields therefore do not participate in toolbar Arrow-key
navigation.

Exactly one generated button has `tabindex="0"`; Left/Right (and Up/Down), Home,
and End implement roving focus. Pointer down prevents the primary pointer from
stealing the editor's DOM selection. A keyboard-activated synchronous command
can cause browser selection restoration to focus the editing host, so the
toolbar restores the exact activating button with `preventScroll` and faults
closed if it cannot prove restoration.

Alpha.6 reads genuine pointer/mouse/click and keyboard event facts through
brand-checked `Event`, `MouseEvent`, and `KeyboardEvent` realm-prototype
intrinsics and cancels through the native `Event` method. Own and
intermediate-prototype shadows are ignored, and a generic native `Event` cannot
impersonate a mouse or keyboard event. Direct structural event calls remain an
advanced host-trusted fixture path; replacement of the realm's actual platform
globals or prototypes is outside this defense.

The `0.1.0` Playwright release matrix,
introduced at checkpoint `0.0.59`, exercises this real-engine focus path in
Chromium, Firefox, and WebKit; see the
[browser support and accessibility gate](BROWSER_SUPPORT_AND_ACCESSIBILITY.md).

Unavailable, stale, disposed, absent, malformed, unhandled, and faulted state
disables dispatch with `aria-disabled="true"`. Tracked activation maps to
`aria-pressed="false"`, `"true"`, or `"mixed"`; stateless controls omit
`aria-pressed`. The toolbar rechecks the latest store snapshot immediately
before dispatch, but the queue and Rust remain authoritative.

`aria-keyshortcuts` does not imply current availability: an unavailable command
retains its declared shortcut metadata while `aria-disabled="true"` prevents
toolbar dispatch and Rust re-evaluates any keyboard request. When shortcut
translation itself is disabled, the attribute is omitted rather than
advertising an inactive chord.

Dispatch must return an outcome minted by `toolbarCommandDispatchResult`:
`completed` means the requested target command completed synchronously,
`rejected` means that target was not applied, and `failed` means the runtime
cannot prove a safe outcome. For a typed intent, `rejected` can still follow an
effective `closeBefore` history boundary when Rust reports the target blocked
or unhandled; the form retains its draft and authoritative state is refreshed.
A deterministic typed-input decoder rejection does not publish that boundary.
Thrown, asynchronous, forged, malformed, and failed outcomes fault the toolbar closed. The public
high-level runtime owns this dispatcher and routes intent controls without
exposing selected action or binding provenance; advanced low-level
construction still requires a host-supplied implementation.

Disposal removes the owned inner root, generated buttons, listeners, and
subscriptions without modifying the mount. Callback contract violations fault
the toolbar closed and disable every control. A failed constructor enters a
terminal state before rollback, so even a callback retained by a broken
subscriber becomes inert.

Since checkpoint `0.0.58`, `subscribe` exposes the toolbar's one terminal
`faulted` or `disposed` transition to at most 64 distinct lifecycle listeners.
Duplicate functions share one delivery slot with independent unsubscribe
closures; throws and rejected promises are listener-local. The high-level
browser owner uses this signal to turn presentation failure into a
payload-redacted editor fault rather than continuing to report a false-live
toolbar.

## Explicit limits

- The default toolbar contains Bold, Undo, and Redo. The base catalog also
  contains Clear formatting. Compiled profiles can add
  property-free format toggle intents/states as native buttons; Alpha.7 adds
  the closed typed-form launcher and sibling form, and Alpha.8 adds its exact
  property-value hydration.
- One browser action-state snapshot admits at most 514 entries, while one
  presentation manifest admits at most 64 controls. A toolbar can expose a
  catalog subset; these are deliberately different ceilings. One uniform
  value admits at most 524,288 encoded JSON bytes; one complete snapshot admits
  at most 8,388,608 such encoded bytes, 65,536 decoded values, and 1,048,576
  retained UTF-8 bytes across decoded strings and object keys.
- One state store retains at most 1,024 distinct listener functions. Duplicate
  registrations share one delivery slot but retain independent unsubscribe
  closures.
- The public `{lineage, revision}` pair identifies the document snapshot, not a
  complete action-state/history observation. Undo or redo state can therefore
  publish changed entries at the same pair; consumers must compare the entries
  or use store publications instead of using that pair as a unique cache key.
- `unhandled` and `faulted` expose their category across Wasm, but not the
  routed fallthrough trace, fault code, or fault detail. Disabled reason detail
  likewise remains core-only; the browser receives only its stable reason code.
- Toolbar state and dispatch remain synchronous; the public runtime
  bridges status into a bounded, immutable external-store subscription.
- A host can inject a descriptor-matched custom manifest, but the surface does
  not dynamically register Rust actions or catalog entries from JavaScript.
- The public editor can execute descriptor-declared typed intent JSON. The
  typed form remains limited to required URL-string and Boolean fields plus the
  exact Alpha.12 RGB24 integer field. Alpha.8
  hydrates only a uniform complete map; mixed state has no fieldwise value.
  A stored string containing CR or LF cannot be represented exactly by the
  native single-line control, so the complete form, including Remove, becomes
  unavailable; programmatic removal remains available.
  There is no persisted draft, optional or general integer field, partial
  patch, or arbitrary widget.
  There are no menus/selects, callback or multi-key keymaps, extension-defined
  `beforeinput` rules, dynamic manifest replacement, or asynchronous
  toolbar dispatch.
- The declarative shortcut surface is limited to primary-modifier physical
  `KeyA` through `KeyZ` codes with optional Shift, state-derived no-input intents, and exact
  Undo/Redo. It cannot carry typed values, execute direct actions, open forms,
  override Select All/clipboard, use Alt, or change while the editor is live.
- URL presentation checks only string shape and UTF-8 bounds. `safeLinkV1`
  independently owns parsing, normalization, scheme, and navigation safety.
  Hydration preserves the exact inert stored string. Same-realm JavaScript is
  trusted configuration and is not sandboxed.
- RGB24 presentation is opaque sRGB only. It has no alpha, background,
  gradient, theme-token, palette, arbitrary CSS, or contrast policy; native
  picker UX and visible forced-colors/CSP behavior remain host/browser work.
- A generated setter is compile-rejected unless every schema-valid complete
  map fits one action value. Compilation also proves that the canonical set of
  generated setters collectively fits the Rust state-batch value-count and
  text-byte limits, rejecting the first canonical declaration that crosses a
  bound. Runtime checks remain defense in depth.
- Icons, styling, localization infrastructure, menus, comboboxes, overflow,
  vertical writing modes, and mobile-specific interaction remain host work.
- The `0.1.0` automated gate covers keyboard navigation, computed focus
  visibility, accessible names, toolbar semantics, and pressed/mixed state in
  Chromium, Firefox, and WebKit, plus an axe scan. It does not certify WCAG
  conformance or announcements and interaction in screen readers or other
  assistive technology; those remain manual checks.
