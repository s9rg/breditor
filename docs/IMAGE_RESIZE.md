# Rich images: accessible resize handles

This note covers the drag-handle and resize-gesture part of the
`advanced-images` V1 parity entry. Images already have paired numeric display
dimensions and an existing resize command; the handles are a gesture layer over
that command and add no new document semantics. Cropping, alignment and
image presentation panels are separate work.

## Mounting

`mountRichImageResize(overlay, host, {commit})` from
`@breditor/experimental-rich-content` (re-exported by `@breditor/collaboration`
as `mountSharedImageResize`) adds handles to every rendered image. You opt in
to it. Editors that don't call it are unchanged.

```ts
import {mountRichImageResize, richImageResizeCommit} from "@breditor/experimental-rich-content";
const resize = mountRichImageResize(overlayHost, dom, {commit: richImageResizeCommit(dom)});
// shared editor:
import {mountSharedImageResize, sharedImageResizeCommit} from "@breditor/collaboration";
const shared = mountSharedImageResize(overlayHost, sharedDom, {commit: sharedImageResizeCommit(sharedDom)});
// later, before disposing the editor:
resize.dispose();
```

The rich demo (`experiments/rich-browser/demo.mjs`) mounts it next to the table
column resize handles.

### Host and ownership

- `host` is a structural port that `RichDomEditor` and the shared DOM editor
  already satisfy: `surface`, `writingState()`, `subscribeWriting()`, `view()`
  and optionally `uiLocale()`. Image ids, block ids and display sizes are read
  from `view().documentJson` (parsed once per revision, and only when the
  surface renders an image). A node selection in `view().selection` marks the
  selected image. Rendered `figure[data-rich-image] > img` boxes are read only
  to place the handles.
- `overlay` must be an unused element in the same document, outside editable
  content (mounting inside the surface throws). Handles live in an absolutely
  positioned layer measured in viewport coordinates, so the overlay can sit
  anywhere, for example as a sibling of the editor root. The layer repositions
  on every publication notification, window resize, document scroll, surface
  `ResizeObserver` callback and image `load`.
- Handles never change editor DOM. All size changes go through the existing
  action API:
  - local owner: one `{kind:"resizeImage", data:{image, size:{width, height}}}`
    sent through `dom.execute(command, false, revision)`;
  - shared owner: one `{commands:[{kind:"resize_image", data:{block, size:[width, height]}}]}`
    sent through `dom.execute(dispatch, false, revision)`.

  `revision` is the publication current at commit time. The Rust `ResizeImage`
  action also records the image binding it expected, so a stale target is
  rejected rather than overwritten. Both dimensions are always written as one
  pair.

### Handles

Each rendered image gets three handles, placed on its rendered bitmap box:

| Handle | Pointer drag | Keyboard |
| --- | --- | --- |
| bottom inline-end corner | proportional; **Shift** resizes freely | focusable `role="slider"` |
| inline-end edge | width only | — (pointer only, `aria-hidden`) |
| bottom edge | height only | — (pointer only, `aria-hidden`) |

"Inline-end" follows the image's own computed content direction (block
direction or inherited), never the chrome direction: in right-to-left content
the corner and the width edge are on the left.

Handles are invisible and do not take pointer input until the image is
hovered (the bitmap box plus a 12 px margin, so moving onto a handle keeps them
shown), node-selected, being dragged, or its corner slider has keyboard focus.
Touch pointers do not hover; select the image first.

### Pointer drag

- `pointerdown` (primary button) captures the pointer on the handle and moves
  focus to the image's corner slider.
- `pointermove` changes only an overlay outline, a size badge and the slider's
  `aria-valuetext`. Nothing is published while dragging. The outline stays
  anchored at the image's top inline-start corner, where the rendered image
  stays after the commit. Pixel deltas are divided by the rendered-to-model
  scale of each axis when the image is shrunk (for example by `max-width`); CSS
  minimum sizes never inflate deltas.
- Aspect ratio: a corner drag follows whichever axis the pointer moved further,
  relative to that axis's size, and scales both. Holding Shift during the move
  sets width and height independently. Edge drags are always single-axis.
- `pointerup` publishes **exactly one** resize command, which makes one Undo
  step and, in shared rooms, one causal operation. Nothing is published if the
  size did not change.

### Admitted domain

Each dimension is rounded and clamped to
`RICH_IMAGE_SIZE_MIN..RICH_IMAGE_SIZE_MAX` (1..4096 logical pixels,
`ImageSize::try_new` in `breditor-core`; the shared owner's validated document
projection reads image sizes through the same check in
`rich_content/ast_properties.rs`). A proportional resize first limits its scale factor so that
neither axis leaves the domain, so the ratio only moves by rounding and the
1 px floor. `clampRichImageDimension` and `scaleRichImageSize` expose the same
policy.

An image without display dimensions starts from its decoded intrinsic size
(the slider announces it as "original size"); until the bitmap has decoded its
slider is `aria-disabled` and nothing can be dragged. The first resize writes
an explicit size.

### Cancellation

A drag is cancelled without publishing on:

- `Escape`, handled on the slider or in a capturing document listener;
- slider blur or window blur;
- `pointercancel` or `lostpointercapture`;
- the editor becoming read-only, composing or closed;
- any publication, local or remote, that changes the dragged image's size or
  block, or removes the image (recheck also runs right before the release
  commit).

`options.onCancel(reason)` reports `"escape"`, `"blur"`, `"pointer-cancel"`,
`"unavailable"`, `"image-changed"`, `"api"` (from `cancel()`) or `"disposed"`.
Publications that don't touch the image (remote typing elsewhere, selection
changes) leave the drag running, and the commit then uses the newer revision.

### Keyboard and accessibility

The corner handle is one focusable `role="slider"` per image, in document
order. A single slider (rather than separate width and height sliders) keeps
one tab stop per image and matches the proportional corner gesture; exact
independent width and height values remain available through the existing
"Image width" and "Image height" toolbar fields.

- `aria-label`: "Resize image 1 of 3" (`imageResizeLabel`; `options.label(index, count, image)` overrides it).
- `aria-valuenow`: committed width; `aria-valuemin`/`aria-valuemax`: the
  smallest and largest widths reachable while keeping the aspect ratio.
- `aria-valuetext`: "340 by 150 pixels" (`imageResizeValue`), "640 by 320
  pixels (original size)" for an unsized image (`imageResizeOriginal`), and
  "… (preview)" during a drag (`imageResizePreview`). The badge uses
  `imageResizeBadge` ("340 × 150") and gets the catalog's `dir`/`lang`.

| Key | Effect (aspect ratio kept) |
| --- | --- |
| ArrowRight / ArrowUp | width + `step` (default 8 px) |
| ArrowLeft / ArrowDown | width − `step` |
| Shift+Arrow, PageUp / PageDown | ± `largeStep` (default 64 px) |
| Home / End | smallest / largest admitted size |
| Escape | cancels an active pointer drag |

In right-to-left content ArrowLeft grows and ArrowRight shrinks, because the
corner moves visually; ArrowUp/ArrowDown are unchanged. Each accepted key
publishes one command, so it is one Undo step. Keys that would not change the
size publish nothing, and keys with Alt, Ctrl or Meta are ignored. Publishing
with `focus=false` keeps focus on the slider, and sliders are reused across
renders by image identity, so focus survives the commit.

While the editor is busy or composing, sliders show `aria-disabled="true"` and
publish nothing. Read-only editors get no handles.

### Localization

The five strings live in the UI catalog (`ui_locale.ts`) with English
defaults; existing default strings are unchanged.

### Lifetime

`dispose()` cancels any drag, unsubscribes, disconnects observers and removes
the layer. It never disposes the editor. Call it before disposing or replacing
the editor. `cancel()` cancels an active drag. `preview()` returns the
in-progress `{image, handle, start, size, free}` or `null`. `refresh()`
re-measures on demand, for example after a host-page layout change the
observers cannot see.

## Tests

- `packages/breditor-experimental-rich-content/tests/image_resize.test.ts`
  (jsdom): attributes, aspect policy, Shift, edges, clamping, scale, no-op
  releases, every cancellation reason, keyboard steps, focus retention, RTL,
  disabled states, intrinsic size, selection/hover, catalog, local and shared
  command mapping.
- `experiments/rich-browser/image-resize.spec.mjs` (Playwright, Chromium,
  Firefox and WebKit): real pointer drags and keys on the real Rust/Wasm owner,
  including one Undo per release, Escape and a mid-drag image change, read-only
  and right-to-left content.
