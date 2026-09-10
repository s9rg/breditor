# Declarative keyboard shortcuts

Status: implemented normative browser contract for the unpublished
`0.3.0-alpha.11` source checkpoint

This decision adds profile-addressed keyboard shortcuts without making
JavaScript a mutation authority. A shortcut declaration is bounded,
callback-free browser presentation data. It names an existing Rust-owned
`ActionStateId`; browser startup compiles that state identity into exactly one
descriptor-proved no-input semantic intent or history direction. The resulting
request then uses the same selection capture, one-use delivery authority,
non-recursive FIFO, guarded Rust execution, history, projection, and DOM
reconciliation path as toolbar and native editing commands.

This is Breditor's own contract. Tiptap and Lexical informed the usability and
data-compilation questions, but Breditor does not implement either project's
keymap, command, extension, node, selection, transaction, or plugin protocol.

## Decision

The public browser declaration consists of:

```ts
interface PrimaryKeyChord {
  readonly code: string;
  readonly shift: boolean;
}

interface KeyboardShortcutDeclaration {
  readonly stateId: string;
  readonly chords: readonly PrimaryKeyChord[];
}

interface KeyboardShortcutManifest {
  readonly shortcuts: readonly KeyboardShortcutDeclaration[];
}
```

Applications construct it with `createKeyboardShortcutManifest()` and may pass
the resulting owned value as `BreditorBrowserEditorOptions.keyboardShortcuts`.
The declaration contains no action ID, intent ID, history direction, handler,
callback, native event, DOM node, mutable command object, or precedence value.

`stateId` is the stable presentation correlation point already projected from
the compiled Rust profile. This lets one declaration drive both keyboard
execution and `aria-keyshortcuts` on a toolbar control without duplicating
semantic routing data in JavaScript. Rust remains authoritative for action and
intent registration, applicability, selection semantics, mutation, undo/redo,
and replay.

For example, the Showcase declares its no-input Emphasis state rather than its
toggle action:

```ts
import {
  createKeyboardShortcutManifest,
  type BreditorBrowserEditorOptions,
} from "@breditor/browser";

declare const requiredEditorOptions: Omit<
  BreditorBrowserEditorOptions,
  "keyboardShortcuts"
>;

const keyboardShortcuts = createKeyboardShortcutManifest({
  shortcuts: [
    {
      stateId: "example/emphasis-control",
      chords: [{ code: "KeyI", shift: false }],
    },
  ],
});

const options: BreditorBrowserEditorOptions = {
  ...requiredEditorOptions,
  keyboardShortcuts,
};
```

The factory copies, validates, canonicalizes, and deeply freezes the admitted
data. The high-level runtime accepts only a manifest minted by that factory;
plain look-alikes, accessors, sparse arrays, extra properties, invalid Unicode,
and hostile reflective input fail closed. The compiler retains no caller-owned
array or declaration object.

## Profile compilation

Startup compiles the complete manifest against the exact owned
`BrowserCompiledProfileDescriptor` selected for the editor. Every declared
state must resolve by one of these two rules:

1. A routed state must name an existing semantic intent whose input kind is
   exactly `none`. The state's activation and optional value contract must
   exactly equal the intent's state contract. The compiled target is that
   intent ID.
2. A history state must be stateless, have no value contract, and declare an
   exact Rust-owned `undo` or `redo` direction. The compiled target is that
   direction.

A missing state, direct-action state, typed-input intent, mismatched state
contract, tracked history state, or valued history state rejects the entire
explicit manifest. Startup returns
`browser_editor.keyboard_shortcut_profile_invalid` before listeners or editor
or toolbar DOM are installed. There is no partial install, fallback target,
best-effort omission, or JavaScript choice between competing routes.

`BreditorBrowserEditor` and `BreditorBrowserEventRouter` additionally require
the compiled shortcut table to retain the exact same descriptor object as the
engine adapter. Direct construction of `BreditorBrowserEventController` or
`BreditorToolbar` is an advanced host-trusted composition boundary: those
standalone pieces have no engine descriptor from which to infer correlation,
so the caller must supply a table compiled from the descriptor used by its
queue, state store, and toolbar manifest. Cross-profile wiring at that advanced
boundary is an integration-contract violation; the semantic engine still
rejects unknown work, but standalone ARIA presentation need not describe an
unrelated queue.

An omitted `keyboardShortcuts` option has a deliberately different
compatibility policy. Breditor starts from the base default declarations and
filters out each default whose semantic state is unavailable or incompatible
with the selected compiled profile. The remaining defaults are then compiled
by the same exact rules. This permits a deliberately custom profile to omit a
base state without making an omitted convenience option fatal. An explicitly
supplied manifest is never filtered, augmented, or repaired.

The base default manifest declares:

- primary+B for `breditor/control-bold`;
- primary+Z for `breditor/control-undo`; and
- primary+Y plus primary+Shift+Z for `breditor/control-redo`.

All compiled bindings are immutable. Lookup is indexed by exact normalized
chord, while toolbar presentation is indexed by exact state identity. Manifest
registration order never selects a winner.

## Chord language and bounds

The chord grammar is intentionally closed:

- `code` is exactly one UI Events letter code `KeyA` through `KeyZ`;
- `shift` is an explicit Boolean and must match exactly;
- the primary modifier is implicit and selected by the host as either
  `control` or `meta` in `KeyboardTranslationPolicy`;
- Alt, AltGraph, the secondary primary modifier, digits, punctuation, function
  keys, navigation keys, modifier-only keys, multi-key sequences, and
  platform-specific alternatives are not declarable; and
- the same `(code, shift)` pair may occur only once in the complete manifest.

An explicit empty manifest is valid and installs no configured editor
shortcut. It does not authorize native rich-text mutation: known browser
editing chords that Breditor cannot reconcile remain blocked by the existing
event policy.

The letters A, C, V, and X are reserved under both Shift states so Select All
and clipboard ownership remain native. They cannot appear in a manifest.

The existing core chords are reserved to their existing semantic states:

- unshifted B may target only `breditor/control-bold`;
- unshifted Z may target only `breditor/control-undo`; and
- unshifted Y and shifted Z may target only
  `breditor/control-redo`.

Those chords may be omitted, but they cannot be rebound. Shifted B and shifted
Y are not among these fixed core chords. A duplicate chord rejects the whole
manifest even when both occurrences name the same state. A state identity may
appear in only one declaration and receives one through four chord aliases.

The exact public bounds are:

- at most 43 declarations;
- at most four aliases in one declaration;
- at most 44 chords in the complete manifest; and
- at most 128 ASCII characters in one qualified state identity.

There are 52 letter/Shift combinations before reservations. Reserving both
Shift states of A, C, V, and X leaves exactly 44 admissible chords. The maximum
state count is 43 because the two fixed Redo chords share one state and a state
cannot be declared twice. These are closed-domain bounds, not arbitrary memory
allowances.

Declarations are canonicalized by ASCII state identity. Chords within one
declaration are canonicalized by code and then by unshifted before shifted.
Compiled execution bindings are canonicalized independently by code, Shift,
and state identity. Source order is neither priority nor conflict resolution;
duplicates are errors.

## Event identity and layout behavior

Matching uses only the exact `KeyboardEvent.code` value `KeyA` through `KeyZ`.
`KeyboardEvent.key`, including text generated by the active layout, never
selects or rejects a binding. A declaration therefore names the physical
letter-key position described by UI Events: `KeyI` means the key at the US
keyboard's I position even when the active layout generates another character.
This same physical-letter identity is used to generate the toolbar's
`aria-keyshortcuts` token, so executable routing and advertised shortcut
metadata come from one binding.

A missing, malformed, or non-letter `code` does not match. There is no
logical-key fallback and no inference from generated text. This is a deliberate
limit: virtual keyboards, dictation, switch devices, and other assistive input
that do not emit a conforming exact `KeyboardEvent.code` may be unable to invoke
the shortcut. Browser chrome and the operating system may also reserve or
intercept a physical chord before the editor receives it.

A configured shortcut matches only when:

- the host-selected primary modifier is pressed;
- the other primary modifier is not pressed;
- Alt is not pressed and the event is not AltGraph;
- Shift exactly equals the declaration; and
- no composition evidence is active.

Breditor does not sniff an operating system to choose Ctrl or Meta. The host's
explicit policy governs both execution and accessibility presentation.

## Selection, queue, and execution

Shortcut recognition never edits the DOM and never executes a JavaScript
mutation callback. For one admitted editor-owned `keydown`, the runtime:

1. snapshots bounded keyboard facts and classifies the compiled chord;
2. captures an exact range selection from the current canonical projection;
3. cancels the native event before submission;
4. constructs an immutable request carrying the same projection-bound
   one-use delivery token and semantic selection;
5. submits the request synchronously to the bounded non-recursive command FIFO;
6. lets the guarded Rust engine synchronize selection and execute the resolved
   no-input intent, undo, or redo; and
7. adopts the validated successor projection, renders canonical DOM, restores
   semantic selection, and refreshes action state.

If selection capture, event cancellation, delivery authority, canonical DOM,
queue admission, profile correlation, or guarded Rust execution fails, the
runtime does not substitute a native rich-text mutation. Expected inability is
reported through the existing blocked/rejected result paths; uncertain runtime
state follows the existing fault and reconciliation contract.

A routed no-input intent always requests a `closeBefore` history boundary. It
therefore forms the same deliberate boundary whether invoked by a toolbar,
public intent API, or shortcut. Rust still decides whether the action is
enabled and whether it produces an operation or state-only change. A held key
does not repeatedly toggle a no-input intent: `KeyboardEvent.repeat` is
canceled and reported as `repeatSuppressed` without queue submission.

Undo and Redo are history requests, not semantic toggle intents. Their native
repeat is retained so a held configured history chord can traverse multiple
stored units through separate serialized requests. History executes stored
operations and editor-state snapshots; it never replays a key event, recompiles
the old manifest, or reevaluates the original shortcut binding. Changing
browser presentation therefore cannot change the meaning of existing history
or checkpoints.

Native `beforeinput` echo suppression is narrower than semantic alias routing.
A receipt is armed only for primary+B Bold, primary+Z Undo,
primary+Shift+Z Redo, and Control+Y Redo; Meta+Y and arbitrary aliases of those
same states do not claim a future native echo. This prevents an unrelated later
`formatBold`, `historyUndo`, or `historyRedo` event from being swallowed merely
because an earlier custom chord resolved to the same semantic target. If the
browser emits no matching `beforeinput`, the receipt expires at the end of the
current task; it is never retained as authority over a later independent event.

`beforeinput` and `input` remain governed by the existing exact-once and
reconciliation contract. The built-in Bold and history paths retain their
recognized echo receipts. A new extension shortcut does not automatically
create a browser `inputType` mapping or a generalized echo alias. Its canceled
`keydown` is the semantic command; any unexpected later editing input remains
subject to the closed `beforeinput` policy and cannot become an extension
callback.

When `KeyboardTranslationPolicy.shortcuts` is `disabled`, configured editor
chords are not executed and are canceled as unsupported editing shortcuts.
Known unowned native rich-text chords are also blocked where Breditor cannot
allow `contenteditable` to mutate outside the AST. Clipboard and Select All
chords remain native. Unrelated primary-modifier commands remain native
selection or page commands.

## Composition and text input

Shortcut handling is disabled while any supported composition evidence is
present: the router's composition lease, `isComposing`, key code 229, `Dead`,
or `Process`. AltGraph also remains native. These events cannot consume a
shortcut, close history, or submit queue work.

Keyboard shortcuts never derive inserted text or binding identity from
`keydown`'s generated `key` value. Text input,
replacement, deletion, paragraphs, and IME settlement continue through the
existing `beforeinput`/composition paths. This decision makes no claim about
arbitrary hardware layouts, mobile virtual keyboards, assistive input devices,
dictation, autocorrect, browser chrome, or operating-system shortcut
interception.

## Toolbar accessibility

When a runtime-owned toolbar presents a control whose `stateId` has one or
more compiled bindings, shortcuts are enabled, and the primary modifier is
known, the button receives canonical `aria-keyshortcuts` generated from the
same compiled table used for execution. Examples are `Control+I`,
`Meta+Shift+S`, and the space-separated Redo aliases
`Control+Y Control+Shift+Z`.

The runtime never accepts author-supplied ARIA shortcut text in a toolbar
manifest. A control with no binding receives no attribute. Disabling shortcuts
removes the advertised metadata. Canonical DOM validation includes the exact
attribute, so a guarded toolbar interaction or explicit integrity validation
faults after application or script drift. There is no mutation observer:
between those validation boundaries, drift can remain visible, while keyboard
execution continues to use the immutable compiled table rather than the DOM
attribute.

`aria-keyshortcuts` communicates an available key command; it does not replace
the visible label, roving toolbar navigation, focus indication, disabled and
pressed state, or application help. This checkpoint does not claim full
screen-reader, keyboard-layout, or WCAG certification.

## Compatibility and persistence

This feature is browser-only presentation and input policy. It adds no Rust
action, intent, binding, state, operation, node, selection, transaction, or
replay variant. It adds no generated Wasm method and leaves Wasm ABI generation
5 unchanged.

The manifest and compiled table are process-local and never enter Profile
Bootstrap V2, the content-language schema fingerprint, Document V1/V2,
Operation/Editor State/Transaction Request/Commit/Session Checkpoint V3, local
log or storage envelopes, IndexedDB payloads, clipboard data, or export. The
default compatibility filtering also has no durable representation. Official
prerelease browser, Wasm, and reference packages still require an exact version
match even though ABI 5 and all durable generations remain unchanged.

Because history stores semantic operations and state rather than input events,
a checkpoint restored with another browser shortcut presentation behaves
identically until the user invokes a new shortcut. Shortcut configuration is
application configuration; Breditor does not persist, synchronize, or replay
it.

## Explicit limitations

Alpha.11 does not provide:

- executable extension callbacks or JavaScript mutation handlers;
- direct-action or typed-input-intent shortcuts;
- runtime manifest replacement, per-editor rebinding after startup, or a
  persistent user keymap;
- priority, shadowing, fallback chains, registration-order winners, or
  extension conflict arbitration;
- Alt, AltGraph, secondary-primary, punctuation, digit, function-key,
  navigation-key, modifier-only, multi-stroke, key-up, or press-and-hold toggle
  declarations;
- automatic operating-system detection or a per-binding Ctrl/Meta choice;
- logical-layout bindings or fallback from `KeyboardEvent.key`; a binding uses
  the US physical position named by an exact `KeyA` through `KeyZ` code, and an
  input device without that code may not invoke it;
- a shortcut that opens or populates the typed Link form;
- a general mapping from native `beforeinput.inputType` values to extension
  intents, or extension-defined keyboard echo receipts;
- native rich-text DOM mutation followed by AST import;
- mobile/virtual-keyboard or assistive-input guarantees, global shortcuts,
  commands outside the editor host, or browser/operating-system reservation
  discovery or conflict avoidance; or
- synchronization, persistence, undo, replay, or fingerprinting of shortcut
  configuration.

The closed grammar is intentionally small enough to validate exhaustively and
advertise truthfully. Broader key sequences or user-configurable collision
resolution require a separate versioned decision rather than reinterpretation
of this manifest.

## Required proof

The checkpoint is incomplete until tests demonstrate:

- exact manifest shapes, ownership, deep freezing, hostile-accessor
  containment, canonical ordering, every count boundary, and aggregate
  collision rejection;
- reservation of A/C/V/X and the fixed Bold/Undo/Redo chords;
- exact descriptor compilation for routed no-input and history states, omitted
  default filtering, and startup rejection of every incompatible explicit
  state before host mutation;
- exact `KeyboardEvent.code` matching for `KeyA` through `KeyZ`, Shift
  exactness, independence from generated `KeyboardEvent.key` text, and refusal
  of missing, malformed, or non-letter codes;
- Ctrl and Meta host policies, disabled shortcuts, clipboard/Select All,
  secondary modifiers, AltGraph, and every composition signal;
- one queue submission per keydown, projection-bound selection capture,
  close-before intent history, repeat suppression for intents, repeat retention
  for history, exact undo/redo, end-of-current-task expiry for an unmatched
  conventional native echo receipt, and no JavaScript mutation callback;
- derived `aria-keyshortcuts` plus exact canonical-DOM validation, including
  aliases and omission when disabled or unbound;
- the packaged Showcase's Bold, Italic, Strikethrough, Code, Highlight, Undo,
  and both Redo aliases in Chromium, Firefox, and WebKit; and
- unchanged Wasm ABI 5, schema fingerprints, and durable-format generations.

## Research lineage

Tiptap demonstrates the usefulness of extension-local declarative shortcut
contributions and a primary-modifier abstraction in its
[keyboard shortcut guide](https://tiptap.dev/docs/editor/core-concepts/keyboard-shortcuts)
and
[extension API](https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new/extension).
Lexical's current
[compiled keyboard shortcut source](https://github.com/facebook/lexical/blob/main/packages/lexical/src/LexicalKeyboardShortcuts.ts)
demonstrates the value of precompiled lookup. The normative
[WAI-ARIA `aria-keyshortcuts` definition](https://www.w3.org/TR/wai-aria-1.2/#aria-keyshortcuts)
defines the accessibility metadata Breditor projects, while the UI Events
[KeyboardEvent `code` values](https://www.w3.org/TR/uievents-code/#code-value-tables)
define the physical-key identifiers accepted by the manifest and runtime.

Breditor borrows those engineering questions, not their answers as a protocol.
Its declaration is state-addressed data compiled against a Rust-owned profile;
it does not accept Tiptap command callbacks, ProseMirror keymaps, Lexical
commands, or another editor's precedence and event-dispatch semantics.
