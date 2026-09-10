# Browser support and accessibility gate

Status: required `0.1.0` base and `0.2.0` profile desktop-browser and
accessibility gate passed; the unpublished alpha.13 source checkpoint retains
exact uniform-property hydration, the additive Showcase composition proof, and
the Rust-owned Clear formatting route, then adds descriptor-compiled declarative
shortcuts with truthful toolbar `aria-keyshortcuts` and the closed RGB24 Color
Showcase, then adds the exhaustive native Text Size select described below.

Breditor's supported desktop-browser baseline is the exact Playwright matrix
locked by this repository: Chromium, Firefox, and WebKit. `npm run test:browser`
serves a real page, initializes the generated `@breditor/wasm` package, and
opens the public `@breditor/browser` runtime in every engine. A missing browser
capability or browser executable is a test failure; the core matrix is never
silently skipped.

The matrix covers the supported `0.1.0` base and `0.2.0` profile browser
contracts:

- programmatically dispatched `beforeinput` coverage for Unicode insertion and
  backward deletion across non-BMP text;
- Playwright keyboard-driven ASCII typing, Backspace, and Delete;
- ordinary Chromium typing after a formatted trailing-space boundary, with
  only the exact collapsed U+0020 target-range alias admitted;
- forward/collapsed and backward browser selection mapping;
- composition lease settlement into one canonical Rust commit;
- Bold, Undo, and Redo through the public toolbar and shared history, including
  mixed-format `aria-pressed="mixed"` presentation;
- synchronous copy, cut, and paste events, including plain-text preference and
  flattening of admitted HTML-only clipboard markup;
- an IndexedDB checkpoint flushed before and restored after page reload, with
  its persisted undo and redo history exercised after restoration, plus exact
  public plain-text and canonical Document V1 exports correlated to the live
  revision both before and after reload;
- toolbar names, orientation, roving tab stop, arrow/Home/End focus, keyboard
  activation, `aria-pressed` state, and a computed visible focus outline on the
  keyboard-focused control and editor;
- an axe-core scan of the mounted editor, toolbar, status, and surrounding
  fixture; and
- the actual `@breditor/reference-highlight` package with Document V2 startup,
  Highlight intent/state/toolbar behavior, Strong/Highlight nesting, undo/redo,
  export/copy, plain paste, persistence reload, restored history, and teardown.

Alpha.4's separate clean tarball-only Chromium consumer opens the unchanged
Highlight profile beside the additive Bootstrap-V2 Highlight + Link profile,
executes typed Link set/remove/set commands, checks canonical safe-Link
attributes and wrapper nesting, and disposes both editors without workspace
imports.

The separate `npm run test:demo` gate covers the complete React page in
Chromium, Firefox, and WebKit:
its canonical Highlight + Link sample, runtime-owned native URL and new-window
controls, typed Link set/remove, canonical anchor attributes, Bold/Highlight
coexistence, undo/redo, ordinary keyboard editing, dirty-to-idle Session-V3
autosave and reload restoration, a full-page axe scan, and toolbar containment
at a 320-pixel viewport. It complements rather than replaces the three-engine
package harness.

Alpha.5 extends that demo gate without changing the browser protocol. One safe
Link must preserve its exact `href`, `rel`, and `target` plus its Highlight peer
through Enter, multiline plain-text paste, paragraph-boundary Backspace, undo,
autosave/reload with an intact redo branch, and redo. The assertion exercises
the ordinary public event, toolbar, projection, and persistence paths; it does
not inject a browser-side operation or restore from retained DOM.

Alpha.6 adds a multi-paragraph Link Apply/Remove gate through the same React-
owned form and Chromium demo. It verifies Highlight peers and unselected edge
text, generated mixed/presence state, undo/redo, and reload without adding a
native toolbar control or broadening the desktop, synthetic-IME, mobile, or
assistive-technology claim.

Alpha.7 moves those controls into a native callback-free toolbar declaration.
The APG toolbar retains a Link launcher button while the interactive nonmodal
form is a sibling, so field Arrow keys do not enter roving-toolbar navigation.
The gate covers launcher/field/Close focus, Escape, URL and Boolean input,
Apply/Remove, selection preservation, state, history, teardown, and axe. It
does not establish a screen-reader, mobile, or WCAG-conformance claim. See
[`TYPED_TOOLBAR_CONTROLS.md`](TYPED_TOOLBAR_CONTROLS.md).

Alpha.8 adds the state-value cases to that form gate: exact uniform values seed
pristine URL/Boolean fields, unset and whole-map mixed use defaults, refresh
preserves dirty input, rejection retains it, and completed dispatch plus close/
reopen hydrate again from authoritative state. The accessibility scope remains
unchanged; this behavior adds no broader assistive-technology claim.

Alpha.9 adds the package-owned Showcase profile to the real browser and React
demo gates. They assert all eight controls in declared order, independent
Italic/Strikethrough/Code state, deterministic six-format wrapper nesting,
multi-paragraph selection, one-command undo/redo steps, safe Link and Highlight
peer preservation, persistence reload, responsive containment, and axe. The
new assertions reuse the existing generic toggle and projection protocols;
they do not claim extension shortcuts, block code, rich paste, mobile support,
screen-reader conformance, or runtime plugin loading.

Alpha.10 keeps that support boundary and adds the ninth **Clear formatting**
button immediately before Undo and Redo. The browser and React demo gates
select fully formatted text, clear base Strong plus every extension format and
typed Link property through one Rust-owned command, verify the plain canonical
DOM, and restore the exact wrapper/property tree with one Undo. The demo covers
a backward cross-paragraph selection and persistence after restoration. These
assertions also cover the stateless enabled/disabled presentation and native
`formatRemove` routing; they do not broaden the desktop, mobile, IME,
screen-reader, or WCAG-conformance claim.

Alpha.11 passes the package-owned Showcase shortcut manifest to the public
runtime in the Chromium, Firefox, and WebKit harness. The gate checks exact
`Control+B`, `Control+I`, `Control+Shift+S`, `Control+E`, `Control+Shift+H`,
`Control+Z`, and dual Redo ARIA declarations; it then selects text and executes
Bold, Italic, Strikethrough, Code, Highlight, Undo, and both Redo aliases through
Playwright's genuine primary-modifier keyboard path. The React demo uses the
same exported manifest. Unit and browser-owner gates additionally cover exact
physical `KeyboardEvent.code` and modifier matching, independence from
generated `KeyboardEvent.key` text, repeat policy, disabled shortcuts,
hostile/forged manifests,
profile mismatch, and ARIA omission/drift detection at guarded toolbar
interactions and explicit canonical-DOM validation. No mutation observer faults
or repairs ARIA drift immediately.

This is evidence for the bounded physical-letter contract, not arbitrary input
hardware or layouts. Only an exact `KeyboardEvent.code` from `KeyA` through
`KeyZ` selects a binding; generated `key` text does not. Those codes identify
US physical-key positions. Virtual keyboards and assistive devices that do not
emit a conforming code may not invoke a shortcut, and browser or operating-
system reservations can intercept a chord. The tests do not establish
Alt/AltGraph, multi-key sequence, typed-input shortcut, operating-system IME,
screen-reader announcement, mobile, or WCAG-conformance support.

Alpha.12 moves the React demo and the dedicated Color Showcase browser scenario
to `example/color-showcase-editor@1`. The gate submits a native-picker value,
observes canonical lowercase `style="color:#rrggbb"` and Rust-state form
hydration, combines it with every peer format in the fixed seven-wrapper order,
and covers Remove, Clear formatting, Undo, Redo, safe copy, formatting-losing
HTML-only paste, Session-V3 flush/reload, and the distinct demo slot. Unit gates
prove the exact RGB24 integer conversion plus descriptor/recipe correlation,
hostile values and style shapes, field/state hydration, and manifest bounds.

This is desktop-engine evidence for one semantic contract, not proof of a
uniform native color-picker UI, keyboard experience, screen-reader
announcement, high-contrast result, or WCAG contrast. CSP `style-src-attr`,
forced-colors modes, user styles, and browser preferences can suppress or
override the visible author color. Text color has no shortcut, and paste does
not preserve the source RGB24 value. See [`TEXT_COLOR.md`](TEXT_COLOR.md).

Alpha.13 moves the React demo and dedicated profile scenario to
`example/size-showcase-editor@1`. The React demo gate now runs in Chromium,
Firefox, and WebKit and exercises the exact native
Small/Large/Huge select, uniform-state hydration, Apply and Reset, the fixed
`data-breditor-integer-token` projection, all eleven controls, and the complete
eight-wrapper chain with Text Size outside Text Color. It also covers one-step
Undo/Redo, Clear formatting, semantic copy, formatting-losing HTML-only paste,
and the distinct Session-V3 persistence slot. Unit gates cover dense exhaustive
option/token admission, descriptor correlation, hostile shapes, canonical DOM,
composition, and clipboard inverse admission.

The WebKit run additionally exercises post-render selection restoration after
formatting, paragraph joins, and history traversal. WebKit may transiently make
anchor/focus disagree with `getRangeAt(0)` after Breditor replaces an owned
subtree. Breditor overwrites that incoherent state only when either complete
endpoint pair independently maps inside the current canonical projection; it
does not accept mixed-pair, one-sided, cross-host, or null-selection evidence.

This proves the closed native single-select and token contract in the tested
desktop engines. It is not a screen-reader announcement, custom-select,
arbitrary-number, exact cross-device typography, mobile, or WCAG-conformance
claim. Arrow-key interaction remains native browser behavior, visual ratios
remain host CSS, Text Size has no shortcut, and paste discards the source step.
See [`TEXT_SIZE_PRESETS.md`](TEXT_SIZE_PRESETS.md).

Run the gate after generating the three public packages:

```sh
export WASM_BINDGEN_BIN=/absolute/path/to/wasm-bindgen
npm run build --workspace @breditor/wasm
npm run build --workspace @breditor/browser
npm run build --workspace @breditor/reference-highlight
npm run typecheck:browser
npm run test:browser
npm run typecheck:demo
npm run test:demo
```

The Wasm package build requires the repository's pinned Rust toolchain and the
matching `wasm-bindgen` CLI. The browser test itself consumes package exports;
it does not import TypeScript source or substitute a JavaScript editor engine.

## Representative Safari accessibility-tree audit

On 2026-09-06, the package-built local harness was inspected through the macOS
accessibility API on arm64 macOS 26.6.2 and Safari 26.6.2. The tree exposed:

- the page heading and a named `Editor controls` toolbar;
- a named Bold toggle with off/on value, plus named Undo and Redo buttons with
  their disabled state;
- a settable text-entry area named `Release gate rich-text editor`; and
- the live status text containing lifecycle, revision, and persistence state.

The editor was focused and edited through accessibility actions, its text was
selected through the accessibility API, Bold was activated, and Undo was then
activated. The observed tree changed Bold from off to on and back to off,
enabled Redo after Undo, retained the editor's name/value, and advanced the
live revision status. This is recorded evidence for native Safari/macOS role,
name, value, and state exposure in one representative environment.

VoiceOver was not enabled for this audit, so no spoken announcements,
screen-reader navigation commands, or rotor behavior were tested. The result
does not extend the support claim below.

## What the automated gate does not prove

An axe pass catches a useful subset of machine-detectable accessibility
problems. It does not certify WCAG conformance or correct announcements and
interaction in VoiceOver, NVDA, JAWS, TalkBack, switch control, voice control,
screen magnification, high-contrast/forced-colors modes, or user styles. Those
remain manual release checks with representative assistive technology.

The clipboard scenarios use real dispatched browser events with a bounded
synchronous `clipboardData` capability. They deliberately do not grant or
claim operating-system clipboard permissions, async Clipboard API behavior,
file/image transfer, or browser chrome integration.

The ordinary Unicode scenario dispatches cancelable `beforeinput` directly so
it can cover non-BMP payloads deterministically. The separate ASCII scenario
uses Playwright's keyboard path for typing, Backspace, and Delete in every
engine. Neither is evidence for arbitrary hardware keyboards, mobile virtual
keyboards, autocorrect, dead-key layouts, or platform text services.

The Alpha.11 primary-modifier scenario uses Playwright's desktop keyboard path
in all three engines and verifies the resulting semantic intent/history work.
It does not prove that every keyboard layout, remapping tool, browser-reserved
shortcut, or assistive technology will deliver the same event sequence. Hosts
must choose `control` or `meta`; Breditor does not sniff the operating system.

The composition scenario exercises the complete native-event/DOM-settlement
path in all three desktop engines, but synthetic composition cannot reproduce
an operating system IME. Japanese, Korean, Chinese, Indic, handwriting,
dictation, autocorrect, and hardware/software keyboard behavior—especially on
iOS/iPadOS Safari and Android browsers—require manual testing on real devices.
Breditor's support claim remains the documented paragraph-local composition
subset, not blanket mobile-IME support.
