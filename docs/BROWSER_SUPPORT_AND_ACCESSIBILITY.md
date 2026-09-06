# Browser support and accessibility gate

Status: required `0.1.0` desktop-browser and accessibility gate passed

Breditor's supported desktop-browser baseline is the exact Playwright matrix
locked by this repository: Chromium, Firefox, and WebKit. `npm run test:browser`
serves a real page, initializes the generated `@breditor/wasm` package, and
opens the public `@breditor/browser` runtime in every engine. A missing browser
capability or browser executable is a test failure; the core matrix is never
silently skipped.

The matrix covers the supported `0.1.0` browser contract:

- programmatically dispatched `beforeinput` coverage for Unicode insertion and
  backward deletion across non-BMP text;
- Playwright keyboard-driven ASCII typing, Backspace, and Delete;
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
  keyboard-focused control and editor; and
- an axe-core scan of the mounted editor, toolbar, status, and surrounding
  fixture.

Run the gate after generating the two public packages:

```sh
export WASM_BINDGEN_BIN=/absolute/path/to/wasm-bindgen
npm run build --workspace @breditor/wasm
npm run build --workspace @breditor/browser
npm run typecheck:browser
npm run test:browser
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

The composition scenario exercises the complete native-event/DOM-settlement
path in all three desktop engines, but synthetic composition cannot reproduce
an operating system IME. Japanese, Korean, Chinese, Indic, handwriting,
dictation, autocorrect, and hardware/software keyboard behavior—especially on
iOS/iPadOS Safari and Android browsers—require manual testing on real devices.
Breditor's `0.1.0` claim remains the documented paragraph-local composition
subset, not blanket mobile-IME support.
