# Static rendering and framework adapters

Status: private SDK candidate in `@breditor/editor`. The API below is not a published
package decision. It covers the "inert data renderer" and "adapter responsibility for other
frameworks" parts of the `framework-integrations` gap in `docs/v1-readiness.json`.

## What it is

`renderStaticDocument(document, options)` turns canonical Breditor rich document JSON into
an HTML string. It does not need a DOM, the Wasm module or an editor owner, so it runs in
Node, edge workers, build-time static generation and server-side rendering.

```ts
// The lean entry avoids loading the interactive editor module graph during SSR.
import {renderStaticDocument,renderStaticDocumentWithReport} from "@breditor/editor/static";

const html=renderStaticDocument(editor.view().documentJson,{
 resolveAsset:({image,asset,generation})=>assetUrls.get(`${asset}@${generation}`),
});
```

```tsx
import {BreditorStaticDocument} from "@breditor/editor/react";

export function Article({documentJson}:{documentJson:string}){
 return <BreditorStaticDocument document={documentJson} options={{resolveAsset}} className="article"/>;
}
```

`BreditorStaticDocument` is pure. It has no effects, refs or state, so `renderToString`,
streaming SSR and React Server Components can render it. Its output is identical,
byte for byte, to the vanilla string with the default wrapper.

### Input

- A canonical document envelope (`format: "breditor/document"`, `formatVersion` 1 or 2, with
  `schemaFingerprint` for V2), as a JSON string or a parsed object. `RichView.documentJson`
  and the `{kind:"document"}` initial value of the local editor use this shape.
- A bare `breditor/document` root element is also accepted.

The renderer checks the input against the rich content grammar, which is the union of rich
languages V1 to V3. It checks the following:

- Exact node and envelope fields. `entityId` must be `null`.
- Required and allowed `breditor/*` properties for each element type. An unexpected property,
  including `__proto__` or any non-`breditor/` key, is an error.
- Identity syntax, heading levels, ordered-list ordinals, code-language tokens, image alt
  rules and the paired image size.
- Block layout integers: alignment 1–6, direction 1–3, indent 0–12, line height 100–300%.
- The allowed children of each parent, and that list and task items begin with a paragraph
  or heading.
- Every inline format literal against the standard inline V1 catalog: exact property set,
  types and ranges.
- Table axes and the merge records. Merges are resolved by a TypeScript port of Rust
  `TableShape::resolve`, so priority order, retraction, overlap and axis-move conflicts give
  the same geometry the live editor shows.

This is a presentation check. It does not prove that a document matches a schema. It never
repairs a document.

### Options

| Option | Default | Meaning |
| --- | --- | --- |
| `resolveAsset(binding)` | none | Synchronous `{image, asset, generation}` lookup. The returned URL must pass the image policy below. A Promise is not awaited, and the image stays unresolved. |
| `unknown` | `"error"` | `"skip"` leaves out unknown node types (with their whole subtree) and unknown format kinds, and reports them. Their content is never passed through. |
| `fragment` | `false` | Return only the block markup, without the surface wrapper. |
| `blockIds` | `true` | Emit `data-rich-block`, `data-rich-text`, `data-rich-task`, `data-task-check` and `data-rich-cell` hooks. |
| `limits` | 16 MiB / depth 128 / 250 000 nodes | `maxInputBytes`, `maxDepth` and `maxNodes`. Each is clamped to a hard maximum (64 MiB, 512, 2 000 000). |

`renderStaticDocumentWithReport` also returns a report with:

- `skipped`: the type and JSON path of each skipped item, never document text.
- `images`: the state of each image (`ready`, `unresolved`, `rejected` or `error`).
- `hiddenTables`: tables with no rows or no columns. These render nothing.
- `inactiveMerges`: inactive merges with the Rust conflict reason.

Invalid input throws `StaticDocumentError` with a stable `code` and a JSON `path`. The
codes are `json`, `shape`, `format` (envelope or format literal), `grammar`, `property`,
`unknown-node`, `unknown-format`, `table` and `limit`. Messages never echo document content.

## Output and parity with the live editor

The markup follows the live rich renderer (`render.ts` in
`@breditor/experimental-rich-content`) element for element:

- Text blocks are `p`/`h1`–`h6`/`pre>code` with `data-rich-block` and `data-rich-text`. An
  empty block holds a `<br>`.
- Lists are `ul`/`ol[start]`/`li`. A task list is `ul[data-task-list][role=list]`, and each
  item holds a disabled checkbox with `aria-label="Task completed"` and a
  `div[data-task-body]`.
- A blockquote is `blockquote` and a rule is `hr`.
- An image is `figure[data-rich-image][data-asset-state]` holding an `img` with `alt`, the
  optional `width`/`height` and an optional `src`. A caption is a `figcaption`.
- A table is `table[data-rich-table]` with a `colgroup` of pixel widths and a `tbody`. Each
  visible master cell is a `td` or `th` with `rowspan`/`colspan` and `data-rich-cell`. Inside
  the cell, each source base cell is a `div[data-source-cell]`, so a merged cell keeps every
  body, as in the live editor.
- Inline formats nest in the standard inline V1 recipe order, with the same elements,
  `data-rich-format` attributes, classes and resolved attributes.
- Block layout appears as a `dir` attribute and a `style` built only from bounded integers:
  `text-align`, `margin-inline-start` in `em` and a unitless `line-height`.

The renderer leaves out the editing affordances: `contenteditable`, selection buttons,
`tabindex`, selection markers and the hidden-table restore placeholder. The wrapper is
`<div class="breditor-rich-surface" data-breditor-rich="" data-breditor-static="">`. The
editor's CSS therefore applies once the host includes it: `standardInlineStylesV1`,
`structuralBlockStylesV2` and its own surface rules.

`tests/static_document_parity.test.ts` checks this parity. It renders one fixture that holds
every node type and format through the real live `render()`, using a native table geometry
written by hand. It removes only the editing affordances listed above and compares the
element tree, attributes and text with the static output. It also checks that the static
inline recipe table equals `createStandardRichInlinePresentationV1(...).recipesOuterToInner`.

## Safety policy

- **Text and attributes.** Text is escaped for `&`, `<` and `>`, so `</script>` and
  `<!--` stay inert text. Attribute values are double-quoted and also escape `"` and `'`.
- **Element names.** Element names come from a fixed table. No tag or attribute name ever
  comes from document data.
- **Event handlers and scripts.** The renderer never emits an event handler, `script`,
  `style` element, `iframe`, `object`, `svg` or form element.
- **Links.** Links go through `safeLinkV1` from `@breditor/browser/presentation`, the
  canonicalizer the live editor uses. Only absolute credential-free `http:` or `https:` URLs
  of at most 2048 bytes pass, without whitespace, controls, backslashes or ambiguous
  authority spellings. The emitted href is the canonical, percent-encoded form. A rejected
  href gives an inert `<a class="breditor-link">` with no `href`, as in the live editor.
  `target="_blank"` always comes with `rel="noopener noreferrer"`.
- **Image URLs** (`staticImageUrl`):
  - canonical `http(s)` through the same link policy;
  - root-relative paths with a closed RFC 3986 character set (never `//` or `/\`);
  - `data:image/(png|jpeg|gif|webp|avif);base64,...` up to 8 MiB.

  `javascript:`, `vbscript:`, SVG `data:` URLs, `blob:` and every other scheme are rejected.
  A rejected image renders `alt` without `src` and is reported as `rejected`.
- **Styles.** The only `style` values are computed from validated integers: RGB24 colors,
  font sizes from 8 to 96 px, column widths from 32 to 4096 px, and the block layout codes.
- **Unknown content.** An unknown node or format is an error by default. Skipping is an
  explicit opt-in and is always reported. Nothing is passed through raw.

Hosts that insert the string themselves, with `innerHTML` or a template's raw HTML binding,
should insert only the renderer's own output, unmodified.

## Limits and what is not covered

- **Custom formats.** Only the standard inline V1 catalog is known. Custom formats added
  through `additionalInlinePresentation` are unknown here: they throw, or are skipped as
  plain text when `unknown` is `"skip"`.
- **Code.** Code blocks keep `data-language` but get no syntax highlighting.
- **Images.** Asset resolution is synchronous. Resolve URLs before rendering, for example
  from your asset manifest.
- **Package exports.** Importing `@breditor/editor` or `@breditor/editor/react` evaluates
  the editor modules but does not start the Wasm runtime. A dedicated `./static` package
  subpath and a declared `@breditor/browser` dependency are still open package decisions.
  The renderer module imports only `@breditor/browser/presentation`.

## Adapter responsibility for other frameworks

Breditor ships vanilla and React entry points. Vue, Svelte, Angular, Solid and similar hosts
wrap the vanilla owner themselves. An adapter has four duties.

1. **Own exactly one editor per host element.** Call `openLocalEditor({host, initial,
   signal, ...})`, or the shared or document variant, after the element is attached. Do it
   on the client only. Pass an `AbortSignal` so that an unmount during the asynchronous
   Wasm start cancels cleanly, and call `editor.dispose()` on teardown. Never let the
   framework render children into, or patch, the host element. The editor owns that
   subtree.
2. **Treat configuration as initial.** `initial`, `richLanguage`, `history` and the profile
   are applied once, like an uncontrolled input's default value. Recreate the editor, under
   a new key, to change them. Live policy, such as `setReadOnly`, goes through editor
   methods, not re-mounts.
3. **Forward events outward and never write the document back in.** Publish `onChange` /
   `view()` / `checkpointJson()` to framework state for saving. Do not feed that state back
   as new `initial` on every change, because that recreates the owner and drops undo history.
4. **Use the static renderer for SSR and before the editor starts.** On the server, render
   `renderStaticDocument(documentJson, {fragment: true})` inside a wrapper element. On the
   client, mount the editor into a separate host element and remove the static preview once
   `openLocalEditor` resolves. Do not hydrate the editor into the static markup: the static
   tree is a read-only placeholder, not editor state. Read-only pages can ship the static
   output alone, with no Wasm.

### Vue 3

```vue
<script setup lang="ts">
import {onMounted,onBeforeUnmount,ref,shallowRef} from "vue";
import {openLocalEditor,renderStaticDocument,type LocalEditor} from "@breditor/editor";
const props=defineProps<{documentJson:string}>();
const emit=defineEmits<{change:[documentJson:string]}>();
const host=ref<HTMLElement>();const editor=shallowRef<LocalEditor>();const ready=ref(false);
const preview=renderStaticDocument(props.documentJson,{fragment:true}); // runs during SSR too
const controller=new AbortController();
onMounted(async()=>{
 editor.value=await openLocalEditor({host:host.value!,signal:controller.signal,initial:{kind:"document",documentJson:props.documentJson},
  onChange:view=>emit("change",view.documentJson)});
 ready.value=true;
});
onBeforeUnmount(()=>{controller.abort();editor.value?.dispose();});
</script>
<template>
 <div v-if="!ready" class="breditor-rich-surface" data-breditor-rich="" data-breditor-static="" v-html="preview"/>
 <div ref="host"/>
</template>
```

`v-html` is acceptable here only because the string comes straight from the renderer.
Keep the editor host free of Vue children.

### Svelte 5

```svelte
<script lang="ts">
 import {onMount} from "svelte";
 import {openLocalEditor,renderStaticDocument,type LocalEditor} from "@breditor/editor";
 let {documentJson,onchange}:{documentJson:string;onchange?:(json:string)=>void}=$props();
 let host:HTMLElement;let ready=$state(false);
 const preview=renderStaticDocument(documentJson,{fragment:true});
 onMount(()=>{
  const controller=new AbortController();let editor:LocalEditor|undefined;
  openLocalEditor({host,signal:controller.signal,initial:{kind:"document",documentJson},onChange:view=>onchange?.(view.documentJson)})
   .then(value=>{editor=value;ready=true;},error=>{if(!controller.signal.aborted)throw error;});
  return()=>{controller.abort();editor?.dispose();};
 });
</script>
{#if !ready}<div class="breditor-rich-surface" data-breditor-rich="" data-breditor-static="">{@html preview}</div>{/if}
<div bind:this={host}></div>
```

### Angular

```ts
@Component({selector:"app-breditor",standalone:true,
 template:`@if(!ready){<div class="breditor-rich-surface" data-breditor-rich="" data-breditor-static="" [innerHTML]="preview"></div>}<div #host></div>`})
export class BreditorComponent implements AfterViewInit,OnDestroy {
 @Input({required:true}) documentJson!:string;
 @Output() change=new EventEmitter<string>();
 @ViewChild("host") host!:ElementRef<HTMLElement>;
 ready=false;preview!:SafeHtml;
 #controller=new AbortController();#editor?:LocalEditor;
 constructor(private sanitizer:DomSanitizer,private zone:NgZone,@Inject(PLATFORM_ID) private platform:object){}
 ngOnInit(){this.preview=this.sanitizer.bypassSecurityTrustHtml(renderStaticDocument(this.documentJson,{fragment:true}));}
 async ngAfterViewInit(){
  if(!isPlatformBrowser(this.platform))return;
  this.#editor=await this.zone.runOutsideAngular(()=>openLocalEditor({host:this.host.nativeElement,signal:this.#controller.signal,
   initial:{kind:"document",documentJson:this.documentJson},onChange:view=>this.zone.run(()=>this.change.emit(view.documentJson))}));
  this.ready=true;
 }
 ngOnDestroy(){this.#controller.abort();this.#editor?.dispose();}
}
```

Angular's own sanitizer would remove the `data-*` hooks and inline styles, so the adapter
bypasses it for this one string only. The renderer has already validated it. The adapter
runs the editor outside the zone so that native input does not start change detection, and
re-enters the zone only to emit.

### Checklist for any adapter

- Start the editor on the client only, once per host element, with an abort signal.
  Dispose it on unmount.
- Do not let the framework manage the host element's children or attributes.
- Treat options as initial values. Change live policy through editor methods.
- Emit changes outward and never round-trip them into `initial`.
- Render the SSR or no-JS fallback with `renderStaticDocument` in a separate element, and
  remove it once the editor is ready.
- Include the editor CSS if the static output should look the same as the live editor.
