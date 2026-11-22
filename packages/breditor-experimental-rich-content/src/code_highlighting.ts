import {codeLanguageForHighlighting, tokenizeCode, type CodeTokenKind} from "./code_syntax.js";

export interface RichCodeHighlightingOptions {
 /** Content Security Policy nonce for the palette stylesheet. */
 readonly nonce?: string;
}

export interface RichCodeHighlighting {
 readonly supported: boolean;
 dispose(): void;
}

const palette = {
 comment: "#55696a",
 keyword: "#743eb0",
 literal: "#a13e13",
 number: "#a13e13",
 operator: "#255884",
 string: "#08734c",
} satisfies Record<CodeTokenKind, string>;
const kinds = Object.keys(palette) as CodeTokenKind[];
const maxBlocks = 128;
const maxBlockUnits = 16_384;
const maxSurfaceUnits = 65_536;
const maxRanges = 4_096;
const mounted = new WeakSet<HTMLElement>();
// Highlight names are page-global. `crypto.randomUUID` exists only in secure contexts, so a plain-HTTP host
// would throw; a per-module counter plus a random suffix stays unique per mount and across module copies.
const instance = Math.floor(Math.random() * 0x1_0000_0000).toString(36);
let mounts = 0;

function renderedCode(code: HTMLElement, maxUnits: number): {source: string; nodes: Text[]} | undefined {
 const walker = code.ownerDocument.createTreeWalker(code, 4 /* SHOW_TEXT */);
 const nodes: Text[] = [];
 let length = 0;
 for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
  if (node.length === 0) continue;
  length += node.length;
  if (length > maxUnits) return undefined;
  nodes.push(node);
 }
 return {source: nodes.map(node => node.data).join(""), nodes};
}

/** Add presentation-only syntax colors to a local or collaborative editor's code blocks. */
export function mountRichCodeHighlighting(
 host: {readonly surface: HTMLElement} | HTMLElement,
 options: RichCodeHighlightingOptions = {},
): RichCodeHighlighting {
 const surface = "surface" in host ? host.surface : host;
 const document = surface.ownerDocument;
 const window = document.defaultView;
 const registry = window?.CSS?.highlights;
 if (!registry || typeof window?.Highlight !== "function") return {supported: false, dispose() {}};
 if (mounted.has(surface)) throw new Error("Code highlighting is already mounted on this surface");

 const prefix = `breditor-syntax-${instance}-${++mounts}`;
 const names = kinds.map(kind => [kind, `${prefix}-${kind}`] as const);
 const style = document.createElement("style");
 if (options.nonce !== undefined) style.nonce = options.nonce;
 style.textContent = names.map(([kind, name]) =>
  `::highlight(${name}){color:var(--breditor-code-${kind},${palette[kind]})}`
 ).join("\n");
 const root = surface.getRootNode();
 (root instanceof window.ShadowRoot ? root : document.head).append(style);

 function paint(): void {
  const ranges = new Map<CodeTokenKind, Range[]>();
  let remainingUnits = maxSurfaceUnits;
  let remainingRanges = maxRanges;
  let blocks = 0;
  for (const code of surface.querySelectorAll<HTMLElement>("pre[data-rich-text][data-language] > code")) {
   if (remainingUnits === 0 || remainingRanges === 0 || blocks === maxBlocks) break;
   const language = codeLanguageForHighlighting(code.parentElement?.dataset["language"] ?? "");
   if (!language) continue;
   blocks++;
   const rendered = renderedCode(code, Math.min(maxBlockUnits, remainingUnits));
   if (!rendered || rendered.source.length === 0) continue;
   const {source, nodes} = rendered;
   remainingUnits -= source.length;
   const tokens = tokenizeCode(source, language, remainingRanges + 1);
   if (tokens.length > remainingRanges) break;
   remainingRanges -= tokens.length;

   // Tokens are ordered and non-overlapping. Advance through adjacent text nodes once.
   let index = 0;
   let nodeStart = 0;
   for (const {start, end, kind} of tokens) {
    let node = nodes[index]!;
    while (start >= nodeStart + node.length) {
     nodeStart += node.length;
     node = nodes[++index]!;
    }
    const range = document.createRange();
    range.setStart(node, start - nodeStart);
    while (end > nodeStart + node.length) {
     nodeStart += node.length;
     node = nodes[++index]!;
    }
    range.setEnd(node, end - nodeStart);
    const group = ranges.get(kind);
    if (group) group.push(range);
    else ranges.set(kind, [range]);
   }
  }
  for (const [kind, name] of names) {
   const group = ranges.get(kind);
   if (group) registry!.set(name, new window!.Highlight(...group));
   else registry!.delete(name);
  }
 }

 let frame: number | undefined;
 let disposed = false;
 const observer = new window.MutationObserver(() => {
  if (frame !== undefined) return;
  frame = window.requestAnimationFrame(() => {
   frame = undefined;
   paint();
  });
 });
 observer.observe(surface, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["data-language"]});
 mounted.add(surface);
 paint();
 return {
  supported: true,
  dispose() {
   if (disposed) return;
   disposed = true;
   observer.disconnect();
   if (frame !== undefined) window.cancelAnimationFrame(frame);
   for (const [, name] of names) registry.delete(name);
   style.remove();
   mounted.delete(surface);
  },
 };
}
