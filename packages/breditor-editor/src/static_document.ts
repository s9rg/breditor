/**
 * Inert static document renderer.
 *
 * Turns canonical Breditor rich document JSON into an escaped HTML string without a DOM,
 * Wasm module or editor owner, so it can run in Node, edge workers and SSR passes. The
 * output follows the live rich renderer's presentation structure (the same element names,
 * `data-rich-*` hooks, inline recipe order, table geometry and block layout values) minus
 * every editing affordance: no contenteditable islands, selection buttons or event hooks.
 *
 * Safety model: every node, property and inline format literal is validated against the
 * closed rich-content grammar before output. Unknown node types and format kinds either
 * throw or are skipped with a report; nothing from document data is ever passed through as
 * markup. Links resolve through the shared `safeLinkV1` policy from
 * `@breditor/experimental-rich-content/rendering` (re-exported from the browser presentation module), the same canonicalizer the live editor uses. Style
 * attributes appear only as values computed from bounded integers.
 */
import {
 compileInlineFormatRecipes,createInlineFormatRenderManifest,resolveInlineFormatRenderAttributes,isCanonicalLanguageTagV1,isImageLinkHrefV1,imageLinkRenderAttributesV1,
 type BrowserProfileFormatDescriptor,type InlineFormatRenderRecipe,type InlineFormatRenderAttribute,
} from "@breditor/experimental-rich-content/rendering";
import {groupMentionRuns,mentionChipAttributes,mentionOf,richMentionFormat,richMentionIdProperty,richMentionKindProperty,richMentionLabelProperty} from "@breditor/experimental-rich-content/rendering";
import {bookmarkAttributes,internalLinkAttributes,internalLinkOf,isBookmarkName} from "@breditor/experimental-rich-content/rendering";
import {groupRubyRuns,richRubyAnnotationMaxBytes,richRubyAnnotationProperty,richRubyClass,richRubyFormat} from "@breditor/experimental-rich-content/rendering";
import {legalListMarkersWith,richLegalListStyles} from "@breditor/experimental-rich-content/rendering";
import {pageBreakAttributes,richPrintStyles,resolveRichPrintLayout,richUiStringsEn,type RichPrintOptions,type RichPrintLayout} from "@breditor/experimental-rich-content/rendering";
import {headingHierarchy,type HeadingBranch} from "@breditor/experimental-rich-content/rendering";
import {CodeSyntaxBudget,codeSyntaxPalette} from "@breditor/experimental-rich-content/rendering";

/** Immutable image binding handed to the host resolver; mirrors the live `AssetBinding`. */
export interface StaticAssetBinding {readonly image:string;readonly asset:string;readonly generation:string}

/** Explicit resource ceilings. Each is clamped to a fixed hard maximum. */
export interface StaticRenderLimits {
 /** Maximum UTF-8 bytes of a JSON string input, or of all text in an object input. Default 16 MiB. */
 maxInputBytes?:number;
 /** Maximum element nesting depth below the document root. Default 128, hard maximum 512. */
 maxDepth?:number;
 /** Maximum element plus text nodes. Default 250 000, hard maximum 2 000 000. */
 maxNodes?:number;
}

export interface StaticTableOfContentsOptions {
 /** Visible title and navigation landmark name. Defaults to "Table of contents". */
 label?:string;
 /** Unique instance prefix when putting more than one copy of a document on a page. */
 idPrefix?:string;
}

export interface StaticRenderOptions {
 /**
  * Synchronous host asset lookup. Returned URLs pass the static image URL policy:
  * canonical credential-free http(s), a root-relative path, or a bounded base64
  * `data:image/(png|jpeg|gif|webp|avif)` URL. Anything else leaves the image unresolved.
  * Promises are not awaited; SSR output must be synchronous.
  */
 resolveAsset?:(binding:StaticAssetBinding)=>string|undefined|null;
 /** `"error"` (default) throws on unknown node types or inline format kinds; `"skip"` omits and reports them. */
 unknown?:"error"|"skip";
 /** Emit only the block children, without the surface wrapper element. */
 fragment?:boolean;
 /** Emit `data-rich-block` / `data-rich-text` / `data-rich-cell` hooks (default true). */
 blockIds?:boolean;
 limits?:StaticRenderLimits;
 /** Accessible label of V4 page-break elements (default the English catalog `pageBreakLabel`, "Page break"). */
 pageBreakLabel?:string;
 /**
  * Print/export mode (default off, output unchanged). `true` or bounded `RichPrintOptions` (A4/Letter,
  * portrait/landscape, narrow/normal/wide margins): the wrapper starts with a `<style data-breditor-print>`
  * holding `richPrintStyles` for that layout (fragments carry no stylesheet; hosts add `richPrintStyles`
  * themselves), and a table's leading rows whose every cell is a header cell (no row span crossing into a
  * body row) are emitted in `<thead>` so paged media repeats them on each page.
  */
 print?:boolean|RichPrintOptions;
 /**
  * Legal multi-level numbering presentation (default off, output unchanged), with the same derived
  * markers as the live `legalListNumbering` option: ordered lists get `data-rich-legal` and
  * `role="list"`, their items `data-rich-legal-marker="1.2."`. The wrapper carries a
  * `<style data-breditor-legal-lists>` with `richLegalListStyles`; fragments carry no stylesheet.
  */
 legalListNumbering?:boolean;
 /** Prepend a linked table of contents to the rendered document, including fragment output. */
 tableOfContents?:boolean|StaticTableOfContentsOptions;
 /** Color syntax in labeled code blocks using the bounded live editor language set. */
 codeHighlighting?:boolean;
}

export type StaticImageState="ready"|"unresolved"|"rejected"|"error";
export type StaticMergeConflictReason="axes-deleted"|"axes-reordered"|"old-axis-moved-inside"|"singleton"|"overlap";
export interface StaticRenderReport {
 /** Unknown nodes or format kinds omitted in `"skip"` mode, by JSON path. Never includes document text. */
 readonly skipped:readonly {readonly kind:"node"|"format";readonly type:string;readonly path:string}[];
 readonly images:readonly {readonly image:string;readonly state:StaticImageState}[];
 /** Axisless tables are retained document state with no visible grid; they render nothing. */
 readonly hiddenTables:readonly string[];
 /** Merge intents that are inactive in the derived geometry (content stays in base cells). */
 readonly inactiveMerges:readonly {readonly table:string;readonly merge:string;readonly reason:StaticMergeConflictReason}[];
}
export interface StaticRenderResult {readonly html:string;readonly report:StaticRenderReport}

/** Validation failure. `path` locates the offending JSON value; messages never echo document content. */
export class StaticDocumentError extends Error {
 readonly code:string;readonly path:string;
 constructor(code:string,message:string,path:string){super(`${message} at ${path}`);this.name="StaticDocumentError";this.code=code;this.path=path;}
}

/** Wrapper attributes shared by the vanilla string and the React component. */
export const staticSurfaceClass="breditor-rich-surface";
/** Include this stylesheet with fragment output or apply an equivalent host theme. */
export const staticCodeHighlightingStyles=Object.entries(codeSyntaxPalette).map(([kind,color])=>
 `[data-breditor-code-token="${kind}"]{color:var(--breditor-code-${kind},${color})}`
).join("");

/** Render inert HTML for one canonical document; throws {@link StaticDocumentError} on invalid input. */
export function renderStaticDocument(document:unknown,options:StaticRenderOptions={}):string {
 return renderStaticDocumentWithReport(document,options).html;
}

/** Same as {@link renderStaticDocument}, plus a report of skipped, hidden and unresolved content. */
export function renderStaticDocumentWithReport(document:unknown,options:StaticRenderOptions={}):StaticRenderResult {
 const rendered=renderContents(document,options,!options.fragment);
 if(options.fragment)return rendered;
 return {...rendered,html:`<div class="${staticSurfaceClass}" data-breditor-rich="" data-breditor-static="">${rendered.html}</div>`};
}

/** @internal Render the same contents and styles into a framework-owned wrapper. */
export function renderStaticDocumentContents(document:unknown,options:Omit<StaticRenderOptions,"fragment">={}):string {
 return renderContents(document,options,true).html;
}

function renderContents(document:unknown,options:StaticRenderOptions,includeStyles:boolean):StaticRenderResult {
 const renderer=new Renderer(options);
 const root=renderer.admit(document);
 renderer.legal(root);
 const body=renderer.render(root);
 const style=includeStyles?[
  renderer.print?`<style data-breditor-print="">${richPrintStyles(renderer.print)}</style>`:"",
  options.legalListNumbering===true?`<style data-breditor-legal-lists="">${richLegalListStyles}</style>`:"",
  renderer.hasCodeColors?`<style data-breditor-code-highlighting="">${staticCodeHighlightingStyles}</style>`:"",
 ].join(""):"";
 return {html:style+body,report:Object.freeze({skipped:Object.freeze(renderer.skipped),images:Object.freeze(renderer.images),hiddenTables:Object.freeze(renderer.hiddenTables),inactiveMerges:Object.freeze(renderer.inactiveMerges)})};
}

// ---------------------------------------------------------------------------------------
// Shared mapping tables. Inline recipes are the standard inline V1 declarations used by the
// live editor (`createStandardRichInlinePresentationV1`), compiled by the same DOM-free
// `compileInlineFormatRecipes` so the outer-to-inner nesting is identical. Property domains
// mirror the Rust standard inline V1 catalog. A parity test compares both tables.

const K={strong:"breditor/strong",italic:"breditor-inline/italic",underline:"breditor-inline/underline",strike:"breditor-inline/strike",code:"breditor-inline/code",subscript:"breditor-inline/subscript",superscript:"breditor-inline/superscript",link:"breditor-inline/link",textColor:"breditor-inline/text-color",backgroundColor:"breditor-inline/background-color",textSize:"breditor-inline/text-size",fontFamily:"breditor-inline/font-family"} as const;
const P={href:"breditor-inline/href",newWindow:"breditor-inline/new-window",rgb24:"breditor-inline/rgb24",pixels:"breditor-inline/pixels",family:"breditor-inline/family"} as const;
const integerType=(minimum:number,maximum:number)=>({kind:"integer" as const,minimum,maximum});
/** @internal Standard inline V1 format catalog (Rust `standard_inline_v1.rs`). */
export const staticInlineCatalogV1:readonly BrowserProfileFormatDescriptor[]=Object.freeze([
 ...[K.strong,K.italic,K.underline,K.strike,K.code,K.subscript,K.superscript].map(kind=>({kind,revision:1,properties:[]})),
 {kind:K.link,revision:1,properties:[{name:P.href,presence:"required",valueType:{kind:"string",minimumUtf8Bytes:1,maximumUtf8Bytes:2048}},{name:P.newWindow,presence:"required",valueType:{kind:"boolean"}}]},
 {kind:K.textColor,revision:1,properties:[{name:P.rgb24,presence:"required",valueType:integerType(0,0xffffff)}]},
 {kind:K.backgroundColor,revision:1,properties:[{name:P.rgb24,presence:"required",valueType:integerType(0,0xffffff)}]},
 {kind:K.textSize,revision:1,properties:[{name:P.pixels,presence:"required",valueType:integerType(8,96)}]},
 {kind:K.fontFamily,revision:1,properties:[{name:P.family,presence:"required",valueType:integerType(1,4)}]},
] as BrowserProfileFormatDescriptor[]);
/** Rich V4 native text-language format (Rust `text_language.rs`). */
const LANGUAGE="breditor/text-language",LANGUAGE_TAG="breditor/language-tag";
/** @internal Standard inline V1 catalog plus the rich V4 `breditor/text-language` format. */
export const staticInlineCatalogV4:readonly BrowserProfileFormatDescriptor[]=Object.freeze([...staticInlineCatalogV1,
 {kind:LANGUAGE,revision:1,properties:[{name:LANGUAGE_TAG,presence:"required",valueType:{kind:"string",minimumUtf8Bytes:2,maximumUtf8Bytes:35}}]},
] as BrowserProfileFormatDescriptor[]);
const free:readonly [string,InlineFormatRenderRecipe["element"]][]=[[K.strong,"strong"],[K.italic,"em"],[K.underline,"u"],[K.strike,"s"],[K.code,"code"],[K.subscript,"sub"],[K.superscript,"sup"]];
/** @internal Outer-to-inner recipes, identical to the live standard inline V1 presentation. */
export const staticInlineRecipesV1:readonly InlineFormatRenderRecipe[]=compileInlineFormatRecipes(staticInlineCatalogV1,createInlineFormatRenderManifest({recipes:[
 ...free.map(([formatKind,element])=>({formatKind,element})),
 {formatKind:K.link,element:"a",classes:["breditor-link"],before:Object.values(K).filter(kind=>kind!==K.link),attributes:{kind:"safeLinkV1",hrefProperty:P.href,openInNewWindowProperty:P.newWindow}},
 {formatKind:K.textColor,element:"span",classes:["breditor-inline-text-color"],attributes:{kind:"safeRgb24V1",propertyName:P.rgb24,channel:"text"}},
 {formatKind:K.backgroundColor,element:"span",classes:["breditor-inline-background-color"],attributes:{kind:"safeRgb24V1",propertyName:P.rgb24,channel:"background"}},
 {formatKind:K.textSize,element:"span",classes:["breditor-inline-text-size"],attributes:{kind:"safeTextSizeV1",propertyName:P.pixels}},
 {formatKind:K.fontFamily,element:"span",classes:["breditor-inline-font-family"],attributes:{kind:"safeIntegerTokenV1",propertyName:P.family,tokens:[{value:1,token:"system"},{value:2,token:"sans"},{value:3,token:"serif"},{value:4,token:"mono"}]}},
]}));
/**
 * @internal Outer-to-inner recipes used for output, identical to the live standard presentation
 * over a V4 catalog: V1 recipes plus `<span class="breditor-text-language" lang="…">`. A V1–V3
 * document never carries the language format, so its output is unchanged.
 */
export const staticInlineRecipesV4:readonly InlineFormatRenderRecipe[]=compileInlineFormatRecipes(staticInlineCatalogV4,createInlineFormatRenderManifest({recipes:[
 ...free.map(([formatKind,element])=>({formatKind,element})),
 {formatKind:K.link,element:"a",classes:["breditor-link"],before:[...Object.values(K).filter(kind=>kind!==K.link),LANGUAGE],attributes:{kind:"safeLinkV1",hrefProperty:P.href,openInNewWindowProperty:P.newWindow}},
 {formatKind:K.textColor,element:"span",classes:["breditor-inline-text-color"],attributes:{kind:"safeRgb24V1",propertyName:P.rgb24,channel:"text"}},
 {formatKind:K.backgroundColor,element:"span",classes:["breditor-inline-background-color"],attributes:{kind:"safeRgb24V1",propertyName:P.rgb24,channel:"background"}},
 {formatKind:K.textSize,element:"span",classes:["breditor-inline-text-size"],attributes:{kind:"safeTextSizeV1",propertyName:P.pixels}},
 {formatKind:K.fontFamily,element:"span",classes:["breditor-inline-font-family"],attributes:{kind:"safeIntegerTokenV1",propertyName:P.family,tokens:[{value:1,token:"system"},{value:2,token:"sans"},{value:3,token:"serif"},{value:4,token:"mono"}]}},
 {formatKind:LANGUAGE,element:"span",classes:["breditor-text-language"],attributes:{kind:"safeLanguageTagV1",propertyName:LANGUAGE_TAG}},
]}));
/**
 * @internal Rich V4 `breditor/mention` declaration (Rust `mention.rs`). It has no inline
 * recipe: a mention renders as one structural chip `<span class="breditor-mention" data-mention-kind
 * data-mention-id>@label</span>` grouping its styled pieces, exactly like the live renderer.
 */
export const staticMentionFormatV4:BrowserProfileFormatDescriptor=Object.freeze({kind:richMentionFormat,revision:1,properties:Object.freeze([
 {name:richMentionIdProperty,presence:"required",valueType:{kind:"string",minimumUtf8Bytes:1,maximumUtf8Bytes:128}},
 {name:richMentionKindProperty,presence:"required",valueType:{kind:"string",minimumUtf8Bytes:3,maximumUtf8Bytes:4}},
 {name:richMentionLabelProperty,presence:"required",valueType:{kind:"string",minimumUtf8Bytes:1,maximumUtf8Bytes:256}},
])} as BrowserProfileFormatDescriptor);
/**
 * @internal The opt-in ruby V1 extension format (`breditor-ruby/ruby`, docs/RUBY_ANNOTATIONS.md). It has
 * no recipe: each group of equal annotations renders as `<ruby class="breditor-ruby" data-rich-ruby="">base
 * <rp>(</rp><rt>annotation</rt><rp>)</rp></ruby>`. An annotation outside the authoring policy renders as plain base.
 */
export const staticRubyFormatV1:BrowserProfileFormatDescriptor=Object.freeze({kind:richRubyFormat,revision:1,properties:Object.freeze([
 {name:richRubyAnnotationProperty,presence:"required",valueType:{kind:"string",minimumUtf8Bytes:1,maximumUtf8Bytes:richRubyAnnotationMaxBytes}},
])} as BrowserProfileFormatDescriptor);
const catalogByKind=new Map([...staticInlineCatalogV4,staticMentionFormatV4,staticRubyFormatV1].map(format=>[format.kind,format]));
const linkPolicy=staticInlineRecipesV1.find(recipe=>recipe.formatKind===K.link)!.attributes!;

/** Block layout codes, identical to `applyBlockLayout` and Rust `block_layout.rs`. */
const alignments=["start","center","end","justify","left","right"] as const;
const directions=["ltr","rtl","auto"] as const;

/** Ordered-list marker types of rich V4, identical to `applyListNumbering` and Rust `list_numbering.rs`. */
const listTypes=["1","a","A","i","I"] as const;

/** Rich child grammar: the union of rich languages V1–V3 plus the V4 list numbering,
 * image-link properties, collapsible sections (`breditor/details`, Rust `details.rs`), table
 * captions (one trailing `breditor/paragraph` after a table's rows, Rust `table_caption.rs`) and
 * page breaks (`breditor/page-break`, document root only, Rust `page_break.rs`). */
const flowKinds=["paragraph","heading","bullet-list","ordered-list","image","blockquote","code-block","horizontal-rule","task-list","details"].map(local=>`breditor/${local}`);
/** V4: at most this many sections on any root-to-leaf path (Rust `RICH_DETAILS_MAX_DEPTH`). */
const MAX_DETAILS_DEPTH=8;
const flowWithTables=[...flowKinds,"breditor/table"];
interface Grammar {readonly children:readonly string[]|"text"|"none";readonly minimum:number;readonly maximum?:number;readonly required:readonly string[];readonly optional?:readonly string[];readonly firstTextBlock?:boolean}
const layout=["block-align","block-direction","block-indent","line-height-percent"];
const grammar:Readonly<Record<string,Grammar>>={
 "breditor/document":{children:[...flowWithTables,"breditor/page-break"],minimum:1,required:["document-id"]},
 "breditor/paragraph":{children:"text",minimum:0,required:["block-id"],optional:[...layout,"bookmark"]},
 "breditor/heading":{children:"text",minimum:0,required:["block-id","level"],optional:[...layout,"bookmark"]},
 "breditor/code-block":{children:"text",minimum:0,required:["block-id"],optional:["language",...layout,"bookmark"]},
 "breditor/bullet-list":{children:["breditor/list-item"],minimum:1,required:["block-id"]},
 "breditor/ordered-list":{children:["breditor/list-item"],minimum:1,required:["block-id","start"],optional:["list-style","list-reversed"]},
 "breditor/list-item":{children:flowWithTables,minimum:1,required:["block-id"],firstTextBlock:true},
 "breditor/task-list":{children:["breditor/task-item"],minimum:1,required:["block-id"]},
 "breditor/task-item":{children:flowWithTables,minimum:1,required:["block-id","checked"],firstTextBlock:true},
 "breditor/blockquote":{children:flowWithTables,minimum:1,required:["block-id"]},
 "breditor/horizontal-rule":{children:"none",minimum:0,maximum:0,required:["block-id"]},
 "breditor/page-break":{children:"none",minimum:0,maximum:0,required:["block-id"]},
 "breditor/details":{children:["breditor/details-summary",...flowWithTables],minimum:2,required:["block-id"],optional:["details-open"]},
 "breditor/details-summary":{children:"text",minimum:0,required:["block-id"]},
 "breditor/image":{children:["breditor/paragraph"],minimum:0,maximum:1,required:["block-id","image-id","asset-id","asset-generation","alt-text","decorative"],optional:["width","height","image-href","image-link-new-window"]},
 "breditor/table":{children:["breditor/table-row","breditor/paragraph"],minimum:0,maximum:257,required:["block-id","table-id","columns","merges","retracted-merges"]},
 "breditor/table-row":{children:["breditor/table-cell"],minimum:0,maximum:128,required:["block-id","row-id"]},
 "breditor/table-cell":{children:flowKinds,minimum:1,required:["block-id","column-id","header"]},
};

// ---------------------------------------------------------------------------------------
// Admitted tree. Validation copies everything into this closed shape before any output.

interface Text {readonly kind:"text";readonly text:string;readonly formats:readonly {readonly type:string;readonly properties:Readonly<Record<string,unknown>>}[]}
interface Element {readonly kind:"element";readonly type:string;readonly properties:Readonly<Record<string,unknown>>;readonly children:readonly Node[];readonly path:string}
type Node=Text|Element;
interface Column {readonly id:string;readonly width:number}
interface Cell {readonly table:string;readonly row:string;readonly column:string}
interface Resolved {readonly base:Cell;readonly master:Cell;rowSpan:number;columnSpan:number;sources:Cell[]}

const identity=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const codeLanguage=/^[A-Za-z0-9][A-Za-z0-9+_.#-]{0,63}$/;
const fingerprint=/^sha256:[0-9a-f]{64}$/;
const canonicalU64=/^(0|[1-9][0-9]{0,19})$/;
const loneSurrogate=/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const encoder=new TextEncoder();
const U64_MAX=(1n<<64n)-1n;
const MAX_ORDINAL=2_147_483_647;
const maxContentsEntries=512;
const maxContentsLabelUnits=512;
const contentsPrefix=/^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

interface ContentsHeading {
 readonly id:string;
 readonly level:number;
 readonly label:string;
}

function contentsOptions(value:StaticRenderOptions["tableOfContents"]):Readonly<StaticTableOfContentsOptions>|undefined {
 if(value===undefined||value===false)return undefined;
 if(value===true)return {};
 if(typeof value!=="object"||value===null||Array.isArray(value))throw new TypeError("tableOfContents must be a Boolean or contents options");
 const {label,idPrefix}=value;
 if(label!==undefined&&(typeof label!=="string"||!label.trim()||label.length>256||loneSurrogate.test(label)||/[\u0000-\u001F\u007F]/.test(label)))throw new TypeError("Contents label must be nonempty text of at most 256 characters");
 if(idPrefix!==undefined&&(typeof idPrefix!=="string"||!contentsPrefix.test(idPrefix)))throw new TypeError("Contents idPrefix must be a letter followed by at most 63 letters, digits, underscores, or hyphens");
 return {...(label===undefined?{}:{label}),...(idPrefix===undefined?{}:{idPrefix})};
}

function headingLabel(node:Element):string {
 let label="";
 for(const child of node.children){
  if(child.kind!=="text")continue;
  const chunk=label.length===0?child.text.trimStart():child.text;
  label+=chunk.slice(0,maxContentsLabelUnits+1-label.length);
  if(label.length>maxContentsLabelUnits)break;
 }
 const truncated=label.length>maxContentsLabelUnits;
 label=label.slice(0,maxContentsLabelUnits).replace(/[\uD800-\uDBFF]$/,"").trim();
 return label+(truncated?"…":"")||"Untitled heading";
}

function contentsList(branches:readonly HeadingBranch<ContentsHeading>[]):string {
 return `<ol>${branches.map(({heading,children})=>
  `<li><a href="#${escapeHtmlAttribute(heading.id)}">${escapeHtmlText(heading.label)}</a>${children.length?contentsList(children):""}</li>`
 ).join("")}</ol>`;
}

const isRecord=(value:unknown):value is Record<string,unknown>=>typeof value==="object"&&value!==null&&!Array.isArray(value);
const own=(value:Record<string,unknown>,key:string):unknown=>Object.hasOwn(value,key)?value[key]:undefined;
const utf8Length=(value:string):number=>encoder.encode(value).length;
const clamp=(value:number|undefined,fallback:number,maximum:number):number=>value===undefined?fallback:Number.isSafeInteger(value)&&value>0?Math.min(value,maximum):fallback;

/** Escape text content. `<`, `>` and `&` cover every text-state transition, including `</script>`. */
export function escapeHtmlText(value:string):string {return value.replace(/[&<>]/g,c=>c==="&"?"&amp;":c==="<"?"&lt;":"&gt;");}
/** Escape a double-quoted attribute value. */
export function escapeHtmlAttribute(value:string):string {return value.replace(/[&<>"']/g,c=>c==="&"?"&amp;":c==="<"?"&lt;":c===">"?"&gt;":c==='"'?"&quot;":"&#39;");}

const imageMimes=/^data:image\/(png|jpeg|gif|webp|avif);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_DATA_URL_BYTES=8*1024*1024;
const rootRelative=/^\/(?![/\\])[A-Za-z0-9\-._~!$&'()*+,;=:@%/]*(\?[A-Za-z0-9\-._~!$&'()*+,;=:@%/?]*)?(#[A-Za-z0-9\-._~!$&'()*+,;=:@%/?]*)?$/;
/**
 * Static image URL policy. Absolute URLs pass the shared `safeLinkV1` canonicalizer
 * (http/https only, no credentials, no whitespace/controls/backslashes, ≤2048 bytes).
 * Root-relative paths use a closed RFC 3986 character set. `data:` is admitted only for
 * bounded base64 raster images; `javascript:`, `vbscript:`, SVG and every other scheme fail.
 */
export function staticImageUrl(value:unknown):string|undefined {
 if(typeof value!=="string"||value.length===0)return undefined;
 if(value.startsWith("data:"))return value.length<=MAX_DATA_URL_BYTES&&imageMimes.test(value)?value:undefined;
 if(value.startsWith("/"))return value.length<=2048&&rootRelative.test(value)?value:undefined;
 return safeHref(value);
}
/** Canonical href through the live editor's link policy, or undefined. */
export function staticSafeHref(value:unknown):string|undefined {return typeof value==="string"?safeHref(value):undefined;}
function safeHref(value:string):string|undefined {
 const attributes=resolveInlineFormatRenderAttributes(linkPolicy,[{name:P.href,value},{name:P.newWindow,value:false}]);
 return attributes[0]?.name==="href"?attributes[0].value:undefined;
}

class Renderer {
 readonly skipped:{kind:"node"|"format";type:string;path:string}[]=[];
 readonly images:{image:string;state:StaticImageState}[]=[];
 readonly hiddenTables:string[]=[];
 readonly inactiveMerges:{table:string;merge:string;reason:StaticMergeConflictReason}[]=[];
 readonly #skip:boolean;readonly #ids:boolean;readonly #resolve:StaticRenderOptions["resolveAsset"];
 readonly #maxBytes:number;readonly #maxDepth:number;readonly #maxNodes:number;readonly #pageBreak:string;
 /** Validated print layout, or undefined when print mode is off. */
 readonly print:RichPrintLayout|undefined;
 #nodes=0;#textBytes=0;#detailsDepth=0;
 /** V4 bookmark names seen during admission (unique per document). */
 readonly #bookmarks=new Set<string>();
 readonly #legal:boolean;#markers:ReadonlyMap<Element,string>=new Map();
 readonly #contentsOptions:Readonly<StaticTableOfContentsOptions>|undefined;
 readonly #contentsHeadings=new Map<string,ContentsHeading>();
 #contentsScope:string|undefined;
 readonly #codeBudget:CodeSyntaxBudget|undefined;
 #hasCodeColors=false;
 get hasCodeColors():boolean{return this.#hasCodeColors;}
 constructor(options:StaticRenderOptions){
  if(typeof options!=="object"||options===null||Array.isArray(options))throw new TypeError("Static render options must be an object");
  if(options.unknown!==undefined&&options.unknown!=="error"&&options.unknown!=="skip")throw new TypeError("unknown must be \"error\" or \"skip\"");
  if(options.resolveAsset!==undefined&&typeof options.resolveAsset!=="function")throw new TypeError("resolveAsset must be a function");
  this.#skip=options.unknown==="skip";this.#ids=options.blockIds!==false;this.#resolve=options.resolveAsset;
  const label=options.pageBreakLabel??richUiStringsEn.pageBreakLabel;
  if(typeof label!=="string"||!label.trim()||label.length>512||/[\u0000-\u001F\u007F]/.test(label))throw new TypeError("pageBreakLabel must be a nonempty string of at most 512 characters without control characters");
  this.#pageBreak=label;
  if(options.legalListNumbering!==undefined&&typeof options.legalListNumbering!=="boolean")throw new TypeError("legalListNumbering must be a Boolean");
  this.#legal=options.legalListNumbering===true;
  this.#contentsOptions=contentsOptions(options.tableOfContents);
  if(options.codeHighlighting!==undefined&&typeof options.codeHighlighting!=="boolean")throw new TypeError("codeHighlighting must be a Boolean");
  this.#codeBudget=options.codeHighlighting?new CodeSyntaxBudget():undefined;
  if(options.print!==undefined&&typeof options.print!=="boolean"&&(typeof options.print!=="object"||options.print===null))throw new TypeError("print must be a Boolean or print options");
  this.print=options.print===undefined||options.print===false?undefined:resolveRichPrintLayout(options.print===true?{}:options.print);
  const limits=options.limits??{};
  this.#maxBytes=clamp(limits.maxInputBytes,16*1024*1024,64*1024*1024);
  this.#maxDepth=clamp(limits.maxDepth,128,512);
  this.#maxNodes=clamp(limits.maxNodes,250_000,2_000_000);
 }
 #fail(code:string,message:string,path:string):never {throw new StaticDocumentError(code,message,path);}

 // ---- admission ------------------------------------------------------------------
 admit(input:unknown):Element {
  let value=input;
  if(typeof input==="string"){
   if(input.length>this.#maxBytes||utf8Length(input)>this.#maxBytes)this.#fail("limit","Document JSON exceeds its byte limit","$");
   try{value=JSON.parse(input) as unknown;}catch{this.#fail("json","Document is not valid JSON","$");}
  }
  if(!isRecord(value))this.#fail("shape","Document must be a JSON object","$");
  let root:unknown=value;
  if(own(value,"kind")===undefined){
   const keys=Object.keys(value);
   if(own(value,"format")!=="breditor/document")this.#fail("format","Unsupported document format","$.format");
   const version=own(value,"formatVersion");
   if(version!==1&&version!==2)this.#fail("format","Unsupported document format version","$.formatVersion");
   const allowed=version===2?["format","formatVersion","schema","schemaFingerprint","root"]:["format","formatVersion","schema","root"];
   if(keys.some(key=>!allowed.includes(key))||allowed.some(key=>!Object.hasOwn(value as object,key)))this.#fail("shape","Document envelope has missing or unexpected fields","$");
   const schema=own(value,"schema");
   if(!isRecord(schema)||Object.keys(schema).length!==2||typeof own(schema,"name")!=="string"||!Number.isSafeInteger(own(schema,"version")))this.#fail("shape","Invalid schema binding","$.schema");
   if(version===2&&(typeof own(value,"schemaFingerprint")!=="string"||!fingerprint.test(own(value,"schemaFingerprint") as string)))this.#fail("shape","Invalid schema fingerprint","$.schemaFingerprint");
   root=own(value,"root");
  }
  const element=this.#node(root,"root",0);
  if(!element||element.kind!=="element"||element.type!=="breditor/document")this.#fail("shape","Root must be a breditor/document element","root");
  return element;
 }
 #node(value:unknown,path:string,depth:number,parent?:string):Node|undefined {
  if(++this.#nodes>this.#maxNodes)this.#fail("limit","Document exceeds its node limit",path);
  if(depth>this.#maxDepth)this.#fail("limit","Document exceeds its depth limit",path);
  if(!isRecord(value))this.#fail("shape","Node must be an object",path);
  const kind=own(value,"kind");
  if(kind==="text")return this.#text(value,path,parent);
  if(kind!=="element")this.#fail("shape","Node kind must be element or text",path);
  const keys=Object.keys(value);
  if(keys.length<4||keys.length>5||keys.some(key=>!["kind","type","entityId","properties","children"].includes(key)))this.#fail("shape","Element has missing or unexpected fields",path);
  const type=own(value,"type"),properties=own(value,"properties"),children=own(value,"children");
  if(typeof type!=="string"||type.length>256)this.#fail("shape","Element type must be a bounded string",path);
  const rule=grammar[type];
  if(!rule){
   if(this.#skip){this.skipped.push({kind:"node",type,path});return undefined;}
   this.#fail("unknown-node",`Unknown node type ${JSON.stringify(type.slice(0,64))}`,path);
  }
  if(Object.hasOwn(value,"entityId")&&own(value,"entityId")!==null)this.#fail("shape","Rich elements do not carry entity identities",path);
  if(!isRecord(properties)||!Array.isArray(children))this.#fail("shape","Element properties must be an object and children an array",path);
  const props=this.#properties(type,rule,properties,`${path}.properties`);
  const raw=children as unknown[];
  if(raw.length<rule.minimum||(rule.maximum!==undefined&&raw.length>rule.maximum))this.#fail("grammar","Child count is outside the rich grammar",path);
  // The 257th table child can only be a V4 caption: the row ceiling stays 256.
  if(type==="breditor/table"&&raw.length>256&&!(isRecord(raw[256])&&own(raw[256],"type")==="breditor/paragraph"))this.#fail("grammar","Child count is outside the rich grammar",path);
  const admitted:Node[]=[],section=type==="breditor/details";
  if(section&&++this.#detailsDepth>MAX_DETAILS_DEPTH)this.#fail("grammar","Collapsible sections exceed the nesting bound",path);
  for(let index=0;index<raw.length;index++){
   const childPath=`${path}.children[${index}]`,child=this.#node(raw[index],childPath,depth+1,type);
   if(!child)continue;
   if(child.kind==="text"){if(rule.children!=="text")this.#fail("grammar","Text is not allowed here",childPath);}
   else if(rule.children==="text"||rule.children==="none"||!rule.children.includes(child.type))this.#fail("grammar",`${child.type} is not allowed inside ${type}`,childPath);
   if(child.kind==="element"&&(child.type==="breditor/details-summary")!==(section&&index===0))this.#fail("grammar","A collapsible section has exactly one leading summary",childPath);
   if(type==="breditor/table"&&child.kind==="element"&&(child.type==="breditor/paragraph")!==(index===raw.length-1&&child.type==="breditor/paragraph"))this.#fail("grammar","A table caption is one paragraph after every row",childPath);
   admitted.push(child);
  }
  if(section)this.#detailsDepth--;
  if(rule.firstTextBlock){
   const first=raw[0],firstType=isRecord(first)?own(first,"type"):undefined;
   if(firstType!=="breditor/paragraph"&&firstType!=="breditor/heading")this.#fail("grammar","List item must begin with a paragraph or heading",path);
  }
  if(type==="breditor/ordered-list"&&(props["start"] as number)+Math.max(raw.length-1,0)>MAX_ORDINAL)this.#fail("grammar","Ordered list final ordinal exceeds its ceiling",path);
  return Object.freeze({kind:"element",type,properties:props,children:Object.freeze(admitted),path});
 }
 #text(value:Record<string,unknown>,path:string,parent:string|undefined):Text|undefined {
  const keys=Object.keys(value);
  if(keys.length!==3||!keys.includes("text")||!keys.includes("formats"))this.#fail("shape","Text node has missing or unexpected fields",path);
  const text=own(value,"text"),formats=own(value,"formats");
  if(typeof text!=="string"||loneSurrogate.test(text))this.#fail("shape","Text must be a well-formed string",path);
  this.#textBytes+=utf8Length(text);
  if(this.#textBytes>this.#maxBytes)this.#fail("limit","Document text exceeds its byte limit",path);
  if(!Array.isArray(formats)||formats.length>256)this.#fail("shape","Formats must be a bounded array",path);
  if(parent==="breditor/code-block"&&formats.length)this.#fail("grammar","Code blocks cannot contain inline formats",path);
  const admitted:{type:string;properties:Record<string,unknown>}[]=[],seen=new Set<string>();
  for(let index=0;index<formats.length;index++){
   const format=formats[index] as unknown,formatPath=`${path}.formats[${index}]`;
   if(!isRecord(format)||Object.keys(format).length!==2||typeof own(format,"type")!=="string"||!isRecord(own(format,"properties")))this.#fail("shape","Format literal must be {type, properties}",formatPath);
   const type=own(format,"type") as string,properties=own(format,"properties") as Record<string,unknown>;
   if(seen.has(type))this.#fail("format","Duplicate format literal",formatPath);
   seen.add(type);
   const declaration=catalogByKind.get(type);
   if(!declaration){
    if(this.#skip){this.skipped.push({kind:"format",type:type.slice(0,256),path:formatPath});continue;}
    this.#fail("unknown-format",`Unknown format kind ${JSON.stringify(type.slice(0,64))}`,formatPath);
   }
   const names=Object.keys(properties);
   if(names.length!==declaration.properties.length||declaration.properties.some(property=>!Object.hasOwn(properties,property.name)))this.#fail("format","Format literal properties do not match the catalog",formatPath);
   const copy:Record<string,unknown>={};
   for(const property of declaration.properties){
    const item=properties[property.name],type=property.valueType;
    const valid=type.kind==="boolean"?typeof item==="boolean":type.kind==="integer"?typeof item==="number"&&Number.isSafeInteger(item)&&(type.minimum===null||item>=type.minimum)&&(type.maximum===null||item<=type.maximum)
     :typeof item==="string"&&!loneSurrogate.test(item)&&utf8Length(item)>=type.minimumUtf8Bytes&&utf8Length(item)<=type.maximumUtf8Bytes;
    if(!valid||declaration.kind===LANGUAGE&&!isCanonicalLanguageTagV1(item))this.#fail("format","Format literal property is outside its declared domain",formatPath);
    copy[property.name]=item;
   }
   if(declaration.kind===richMentionFormat&&!mentionOf({type,properties:copy}))this.#fail("format","Format literal property is outside its declared domain",formatPath);
   admitted.push({type,properties:Object.freeze(copy)});
  }
  return Object.freeze({kind:"text",text,formats:Object.freeze(admitted)});
 }
 #properties(type:string,rule:Grammar,value:Record<string,unknown>,path:string):Record<string,unknown> {
  const allowed=[...rule.required,...(rule.optional??[])],result:Record<string,unknown>={};
  for(const key of Object.keys(value)){
   if(!key.startsWith("breditor/")||!allowed.includes(key.slice(9)))this.#fail("property","Unexpected property",`${path}[${JSON.stringify(key.slice(0,64))}]`);
   result[key.slice(9)]=value[key];
  }
  for(const name of rule.required)if(!Object.hasOwn(result,name))this.#fail("property",`Missing required property breditor/${name}`,path);
  const at=(name:string)=>`${path}["breditor/${name}"]`;
  const id=(name:string)=>{const item=result[name];if(typeof item!=="string"||!identity.test(item))this.#fail("property","Invalid identity",at(name));return item;};
  const integer=(name:string,min:number,max:number)=>{const item=result[name];if(typeof item!=="number"||!Number.isSafeInteger(item)||item<min||item>max)this.#fail("property","Integer outside the rich contract",at(name));return item;};
  const boolean=(name:string)=>{if(typeof result[name]!=="boolean")this.#fail("property","Required boolean property",at(name));};
  if(type==="breditor/document"){id("document-id");return Object.freeze(result);}
  id("block-id");
  switch(type){
   case "breditor/heading":integer("level",1,6);break;
   case "breditor/ordered-list":integer("start",1,MAX_ORDINAL);if(Object.hasOwn(result,"list-style"))integer("list-style",1,5);if(Object.hasOwn(result,"list-reversed")&&result["list-reversed"]!==true)this.#fail("property","List reversal is only canonical as true",at("list-reversed"));break;
   case "breditor/task-item":boolean("checked");break;
   case "breditor/details":if(Object.hasOwn(result,"details-open")&&result["details-open"]!==true)this.#fail("property","Section open state is only canonical as true",at("details-open"));break;
   case "breditor/code-block":if(Object.hasOwn(result,"language")&&(typeof result["language"]!=="string"||!codeLanguage.test(result["language"])))this.#fail("property","Invalid code language token",at("language"));break;
   case "breditor/table-row":id("row-id");break;
   case "breditor/table-cell":id("column-id");boolean("header");break;
   case "breditor/image":{
    id("image-id");id("asset-id");id("asset-generation");boolean("decorative");
    const alt=result["alt-text"];
    if(typeof alt!=="string"||loneSurrogate.test(alt))this.#fail("property","Invalid image alt",at("alt-text"));
    if(result["decorative"]===true?alt!=="":(utf8Length(alt)>4096||alt.trim()===""))this.#fail("property","Invalid image alt",at("alt-text"));
    const width=Object.hasOwn(result,"width"),height=Object.hasOwn(result,"height");
    if(width!==height)this.#fail("property","Image display dimensions must be supplied as a pair",path);
    if(width){integer("width",1,4096);integer("height",1,4096);}
    // V4 image link (Rust `image_link.rs`): one canonical admitted target, `true`-only
    // new-window flag that needs a target, and never on a decorative image.
    if(Object.hasOwn(result,"image-href")){
     if(!isImageLinkHrefV1(result["image-href"]))this.#fail("property","Invalid image link target",at("image-href"));
     if(result["decorative"]===true)this.#fail("property","A decorative image cannot carry a link",at("image-href"));
    }
    if(Object.hasOwn(result,"image-link-new-window")&&(result["image-link-new-window"]!==true||!Object.hasOwn(result,"image-href")))this.#fail("property","Image link window flag is only canonical as true with a target",at("image-link-new-window"));
    break;
   }
   case "breditor/table":id("table-id");break;
  }
  // V4 bookmark (Rust `bookmark.rs`): a bounded name, unique per document.
  if(Object.hasOwn(result,"bookmark")){
   const name=result["bookmark"];
   if(!isBookmarkName(name))this.#fail("property","Invalid bookmark name",at("bookmark"));
   if(this.#bookmarks.has(name))this.#fail("property","Duplicate bookmark name",at("bookmark"));
   this.#bookmarks.add(name);
  }
  if(Object.hasOwn(result,"block-align"))integer("block-align",1,6);
  if(Object.hasOwn(result,"block-direction"))integer("block-direction",1,3);
  if(Object.hasOwn(result,"block-indent"))integer("block-indent",0,12);
  if(Object.hasOwn(result,"line-height-percent"))integer("line-height-percent",100,300);
  return Object.freeze(result);
 }

 // ---- output -----------------------------------------------------------------------
 children(element:Element):string {return element.children.map(child=>this.#flow(child)).join("");}
 /** Collect contents while rendering headings, so both links and targets use displayed order. */
 render(root:Element):string {
  if(!this.#contentsOptions)return this.children(root);
  this.#contentsScope=this.#contentsOptions.idPrefix??String(root.properties["document-id"]);
  const body=this.children(root);
  if(!this.#contentsHeadings.size)return body;
  const label=this.#contentsOptions.label??"Table of contents";
  return `<nav data-breditor-contents="" aria-label="${escapeHtmlAttribute(label)}"><p>${escapeHtmlText(label)}</p>${contentsList(headingHierarchy([...this.#contentsHeadings.values()]))}</nav>${body}`;
 }
 #contentsAnchor(node:Element):string {
  if(this.#contentsScope===undefined||this.#contentsHeadings.size>=maxContentsEntries)return "";
  const block=String(node.properties["block-id"]);
  if(this.#contentsHeadings.has(block))return "";
  const id=`breditor-contents-${this.#contentsScope}~${block}`;
  this.#contentsHeadings.set(block,{id,label:headingLabel(node),level:Number(node.properties["level"])});
  return ` id="${escapeHtmlAttribute(id)}"`;
 }
 #highlightCode(node:Element,language:string):string|undefined {
  const budget=this.#codeBudget,grammar=budget?.acceptLanguage(language);
  if(!budget||!grammar)return undefined;
  const pieces:string[]=[];
  let length=0;
  for(const child of node.children){
   if(child.kind!=="text")continue;
   length+=child.text.length;
   if(length>budget.maxBlockUnits)return undefined;
   pieces.push(child.text);
  }
  const source=pieces.join(""),tokens=budget.tokens(source,grammar);
  if(!tokens.length)return undefined;
  this.#hasCodeColors=true;
  let offset=0,html="";
  for(const token of tokens){
   html+=escapeHtmlText(source.slice(offset,token.start));
   html+=`<span data-breditor-code-token="${token.kind}">${escapeHtmlText(source.slice(token.start,token.end))}</span>`;
   offset=token.end;
  }
  return html+escapeHtmlText(source.slice(offset));
 }
 /** Derive legal markers once from the admitted tree (opt-in). */
 legal(root:Element):void {
  if(!this.#legal)return;
  const elements=(node:Element):Element[]=>node.children.filter((child):child is Element=>child.kind==="element");
  this.#markers=legalListMarkersWith<Element>(root,{type:node=>node.type,children:elements,start:node=>node.properties["start"],reversed:node=>node.properties["list-reversed"]===true});
 }
 #blockAttributes(node:Element,text:boolean):string {
  if(!this.#ids)return "";
  const id=escapeHtmlAttribute(String(node.properties["block-id"]));
  return text?` data-rich-block="${id}" data-rich-text="${id}"`:` data-rich-block="${id}"`;
 }
 /** Allowlisted computed layout: `dir` from a closed token set, style from bounded integers only. */
 #layout(node:Element):string {
  const p=node.properties,align=p["block-align"] as number|undefined,direction=p["block-direction"] as number|undefined,indent=p["block-indent"] as number|undefined,height=p["line-height-percent"] as number|undefined;
  const style:string[]=[];
  if(align!==undefined)style.push(`text-align:${alignments[align-1]!}`);
  if(indent!==undefined)style.push(`margin-inline-start:${indent*2}em`);
  if(height!==undefined)style.push(`line-height:${height/100}`);
  return (style.length?` style="${style.join(";")}"`:"")+(direction!==undefined?` dir="${directions[direction-1]!}"`:"");
 }
 /** V4 bookmark anchor: `id="bm-<name>" data-rich-bookmark="<name>"`, as in the live renderer. */
 #bookmark(node:Element):string {
  const name=node.properties["bookmark"];
  return typeof name==="string"?bookmarkAttributes(name).map(a=>` ${a.name}="${escapeHtmlAttribute(a.value)}"`).join(""):"";
 }
 #inline(node:Text):string {
  let html=escapeHtmlText(node.text);
  if(!node.formats.length)return html;
  const selected=new Map(node.formats.map(format=>[format.type,format]));
  const recipes=staticInlineRecipesV4.filter(recipe=>selected.has(recipe.formatKind));
  for(const recipe of [...recipes].reverse()){
   const literal=selected.get(recipe.formatKind)!;
   const attributes:readonly InlineFormatRenderAttribute[]=recipe.attributes?resolveInlineFormatRenderAttributes(recipe.attributes,Object.entries(literal.properties).map(([name,value])=>({name,value:value as string|number|boolean}))):[];
   let open=`<${recipe.element} data-rich-format="${escapeHtmlAttribute(recipe.formatKind)}"`;
   if(recipe.classes.length)open+=` class="${escapeHtmlAttribute(recipe.classes.join(" "))}"`;
   for(const attribute of attributes)open+=` ${attribute.name}="${escapeHtmlAttribute(attribute.value)}"`;
   // V4 internal link `#name`: `href="#bm-name"`, or a broken marker for a dangling target.
   const internal=recipe.formatKind===K.link?internalLinkOf(literal):undefined;
   if(internal!==undefined)for(const attribute of internalLinkAttributes(internal,this.#bookmarks.has(internal)))open+=` ${attribute.name}="${escapeHtmlAttribute(attribute.value)}"`;
   html=`${open}>${html}</${recipe.element}>`;
  }
  return html;
 }
 /** V4 mentions: whole `@label` units become chips around their styled pieces. */
 #inlineChildren(node:Element):string {
  const runs=node.children.filter((child):child is Text=>child.kind==="text");
  const rebuild=(run:Text,text:string,formats:readonly Text["formats"][number][])=>Object.freeze({kind:"text" as const,text,formats});
  let items;
  try{items=groupMentionRuns(runs,rebuild,true);}
  catch{return this.#fail("grammar","Mention text must be whole copies of @ plus its label",node.path);}
  const mentions=(list:ReturnType<typeof groupMentionRuns<Text>>)=>list.map(item=>{
   if(item.kind==="run")return this.#inline(item.run);
   const open=mentionChipAttributes(item.mention).map(({name,value})=>` ${name}="${escapeHtmlAttribute(value)}"`).join("");
   return `<span${open}>${item.pieces.map(piece=>this.#inline(piece)).join("")}</span>`;
  }).join("");
  // Opt-in ruby extension: group equal annotations; mentions are grouped within each segment.
  if(!runs.some(run=>run.formats.some(format=>format.type===richRubyFormat)))return mentions(items);
  return groupRubyRuns(runs,(run,formats)=>rebuild(run,run.text,formats)).map(segment=>{
   const body=mentions(groupMentionRuns(segment.runs,rebuild));
   return segment.kind==="plain"?body:`<ruby class="${richRubyClass}" data-rich-ruby="">${body}<rp>(</rp><rt>${escapeHtmlText(segment.annotation)}</rt><rp>)</rp></ruby>`;
  }).join("");
 }
 #flow(node:Node):string {
  if(node.kind==="text")return this.#inline(node);
  const p=node.properties,inner=()=>node.type==="breditor/paragraph"||node.type==="breditor/heading"||node.type==="breditor/details-summary"?this.#inlineChildren(node):node.children.map(child=>this.#flow(child)).join("");
  switch(node.type){
   case "breditor/paragraph":case "breditor/heading":{
    const tag=node.type==="breditor/paragraph"?"p":`h${String(p["level"])}`;
    const bookmark=this.#bookmark(node),contents=node.type==="breditor/heading"?this.#contentsAnchor(node):"";
    const target=bookmark&&contents?`<span${contents}></span>`:"";
    return `<${tag}${this.#blockAttributes(node,true)}${this.#layout(node)}${bookmark||contents}>${target}${node.children.length?inner():"<br>"}</${tag}>`;
   }
   case "breditor/code-block":{
    const label=typeof p["language"]==="string"?p["language"]:undefined;
    const language=label?` data-language="${escapeHtmlAttribute(label)}"`:"";
    const code=label?this.#highlightCode(node,label):undefined;
    return `<pre${this.#blockAttributes(node,true)}${this.#layout(node)}${this.#bookmark(node)}${language}><code>${code??(node.children.length?inner():"<br>")}</code></pre>`;
   }
   case "breditor/bullet-list":return `<ul${this.#blockAttributes(node,false)}>${inner()}</ul>`;
   case "breditor/ordered-list":return `<ol${this.#blockAttributes(node,false)} start="${String(p["start"])}"${p["list-style"]!==undefined?` type="${listTypes[(p["list-style"] as number)-1]!}"`:""}${p["list-reversed"]===true?" reversed":""}${this.#legal?' data-rich-legal="" role="list"':""}>${inner()}</ol>`;
   case "breditor/list-item":{const marker=this.#markers.get(node);return `<li${this.#blockAttributes(node,false)}${marker!==undefined?` data-rich-legal-marker="${escapeHtmlAttribute(marker)}"`:""}>${inner()}</li>`;}
   case "breditor/task-list":return `<ul${this.#blockAttributes(node,false)} data-task-list="" role="list">${inner()}</ul>`;
   case "breditor/task-item":{
    const value=this.#ids?escapeHtmlAttribute(String(p["block-id"])):"",id=this.#ids?` data-rich-task="${value}"`:"";
    return `<li${this.#blockAttributes(node,false)}${id}><input type="checkbox" data-task-check="${value}" aria-label="Task completed" disabled=""${p["checked"]===true?' checked=""':""}><div data-task-body="">${inner()}</div></li>`;
   }
   case "breditor/blockquote":return `<blockquote${this.#blockAttributes(node,false)}>${inner()}</blockquote>`;
   case "breditor/horizontal-rule":return `<hr${this.#blockAttributes(node,false)}>`;
   // V4 page break: the live marker's attributes minus editing affordances (`break-after:page`).
   case "breditor/page-break":return `<div${this.#blockAttributes(node,false)}${this.#ids?` data-rich-page-break="${escapeHtmlAttribute(String(p["block-id"]))}"`:""}${pageBreakAttributes(this.#pageBreak).map(a=>` ${a.name}="${escapeHtmlAttribute(a.value)}"`).join("")}></div>`;
   // Native disclosure: `open` mirrors persisted state; readers may toggle the static output freely.
   case "breditor/details":return `<details${this.#blockAttributes(node,false)}${this.#ids?` data-rich-details="${escapeHtmlAttribute(String(p["block-id"]))}"`:""}${p["details-open"]===true?' open=""':""}>${inner()}</details>`;
   case "breditor/details-summary":return `<summary${this.#blockAttributes(node,true)}>${node.children.length?inner():"<br>"}</summary>`;
   case "breditor/image":return this.#image(node);
   case "breditor/table":return this.#table(node);
  }
  // Unreachable: admission only produces grammar types handled above.
  return this.#fail("unknown-node","Unhandled node type",node.path);
 }
 #image(node:Element):string {
  const p=node.properties,binding=Object.freeze({image:String(p["image-id"]),asset:String(p["asset-id"]),generation:String(p["asset-generation"])});
  let state:StaticImageState="unresolved",src:string|undefined;
  if(this.#resolve){
   try{
    const value=this.#resolve(binding);
    if(typeof value==="string"){src=staticImageUrl(value);state=src?"ready":"rejected";}
    else if(value!==undefined&&value!==null)state="unresolved";
   }catch{state="error";}
  }
  this.images.push({image:binding.image,state});
  const size=typeof p["width"]==="number"?` width="${String(p["width"])}" height="${String(p["height"])}"`:"";
  const caption=node.children.length?`<figcaption>${node.children.map(child=>this.#flow(child)).join("")}</figcaption>`:"";
  const block=this.#ids?` data-rich-block="${escapeHtmlAttribute(String(p["block-id"]))}"`:"";
  const image=`<img alt="${escapeHtmlAttribute(String(p["alt-text"]))}"${size}${src?` src="${escapeHtmlAttribute(src)}"`:""}>`;
  return `<figure${block} data-rich-image="${escapeHtmlAttribute(binding.image)}" data-asset-state="${state}">${this.#imageLink(p,image)}${caption}</figure>`;
 }
 /** V4: the link wraps the image only, with the inline `safeLinkV1` attribute set. */
 #imageLink(p:Readonly<Record<string,unknown>>,image:string):string {
  const href=p["image-href"];if(typeof href!=="string")return image;
  const attributes=imageLinkRenderAttributesV1(href,p["image-link-new-window"]===true);
  if(attributes[0]?.name!=="href"||attributes[0].value!==href)return image;
  return `<a data-rich-image-link="" class="breditor-image-link"${attributes.map(a=>` ${a.name}="${escapeHtmlAttribute(a.value)}"`).join("")}>${image}</a>`;
 }
 #table(node:Element):string {
  const tableId=String(node.properties["table-id"]);
  const geometry=resolveTableGeometry(tableId,node,(code,message,suffix)=>this.#fail(code,message,`${node.path}${suffix}`));
  for(const conflict of geometry.conflicts)this.inactiveMerges.push({table:tableId,...conflict});
  if(geometry.rows.length===0||geometry.columns.length===0){this.hiddenTables.push(tableId);return "";}
  // V4: a trailing caption paragraph. <caption> must be the table's first child; it is
  // shown after the rows (`caption-side:bottom`), exactly like the live renderer.
  const last=node.children[node.children.length-1],captionNode=last?.kind==="element"&&last.type==="breditor/paragraph"?last:undefined;
  const caption=captionNode?`<caption data-rich-table-caption="${escapeHtmlAttribute(tableId)}" style="caption-side:bottom">${this.#flow(captionNode)}</caption>`:"";
  const bodies=new Map<string,Element>();
  for(const row of node.children)if(row.kind==="element")for(const cell of row.children)if(cell.kind==="element")bodies.set(cellKey({table:tableId,row:String(row.properties["row-id"]),column:String(cell.properties["column-id"])}),cell);
  const block=this.#ids?` data-rich-block="${escapeHtmlAttribute(String(node.properties["block-id"]))}"`:"";
  let html=`<table${block} data-rich-table="${escapeHtmlAttribute(tableId)}">${caption}<colgroup>`;
  for(const column of geometry.columns)html+=`<col style="width:${column.width}px">`;
  html+="</colgroup>";
  const head=this.print?headerRows(geometry,bodies):0;
  if(head===0)html+="<tbody>";else html+="<thead>";
  for(const [index,row] of geometry.rows.entries()){
   if(head>0&&index===head)html+="</thead><tbody>";
   html+="<tr>";
   for(const column of geometry.columns){
    const cell=geometry.cells.get(`${row}\u0000${column.id}`)!;
    if(cellKey(cell.base)!==cellKey(cell.master))continue;
    const base=bodies.get(cellKey(cell.base))!,tag=base.properties["header"]===true?"th":"td";
    html+=`<${tag} rowspan="${cell.rowSpan}" colspan="${cell.columnSpan}"${this.#ids?` data-rich-cell="${escapeHtmlAttribute(cellKey(cell.base))}"`:""}>`;
    for(const source of cell.sources){
     const original=bodies.get(cellKey(source));if(!original)continue;
     html+=`<div data-source-cell="${escapeHtmlAttribute(JSON.stringify(source))}">${original.children.map(child=>this.#flow(child)).join("")}</div>`;
    }
    html+=`</${tag}>`;
   }
   html+="</tr>";
  }
  return `${html}</tbody></table>`;
 }
}

const cellKey=(cell:Cell):string=>JSON.stringify([cell.table,cell.row,cell.column]);
/**
 * Print mode: the number of leading rows that form a repeatable header group: the longest run of leading
 * rows in which the cell covering every slot is a header cell (`header: true` on the covering master) and
 * no such cell continues below the run. At least one body row always remains. Zero means the table has
 * no header group (all rows stay in `<tbody>`).
 */
function headerRows(geometry:{readonly rows:readonly string[];readonly columns:readonly Column[];readonly cells:ReadonlyMap<string,Resolved>},bodies:ReadonlyMap<string,Element>):number{
 let count=0,reach=-1;
 for(const [index,row] of geometry.rows.entries()){
  if(index===geometry.rows.length-1)return count;
  for(const column of geometry.columns){
   const cell=geometry.cells.get(`${row}\u0000${column.id}`),master=cell&&geometry.cells.get(`${cell.master.row}\u0000${cell.master.column}`);
   if(!master||bodies.get(cellKey(master.base))?.properties["header"]!==true)return count;
   reach=Math.max(reach,geometry.rows.indexOf(master.base.row)+master.rowSpan-1);
  }
  if(reach<=index)count=index+1;
 }
 return count;
}

// ---------------------------------------------------------------------------------------
// Table geometry: a direct port of Rust `TableShape::resolve` (rich_content/table_geometry.rs)
// and the `table_view` property admission in `ast_properties.rs`. Deterministic for any
// record order; inactive merges keep content in their base cells.

interface Region {id:string;stamp:readonly [bigint,bigint,bigint];rows:readonly string[];columns:readonly string[];rowStart:number;rowEnd:number;columnStart:number;columnEnd:number}
type Fail=(code:string,message:string,pathSuffix:string)=>never;
const unique=(values:readonly string[])=>new Set(values).size===values.length;

function interval(current:readonly string[],context:readonly string[],start:number,end:number):[number,number]|StaticMergeConflictReason {
 const members=context.slice(start,end+1),positions=new Map(current.map((id,index)=>[id,index]));
 const surviving=members.flatMap(id=>positions.has(id)?[positions.get(id)!]:[]);
 if(!surviving.length)return "axes-deleted";
 for(let index=1;index<surviving.length;index++)if(surviving[index-1]!>=surviving[index]!)return "axes-reordered";
 const first=surviving[0]!,last=surviving[surviving.length-1]!,known=new Set(context),inside=new Set(members);
 for(let index=first;index<=last;index++){const id=current[index]!;if(known.has(id)&&!inside.has(id))return "old-axis-moved-inside";}
 return [first,last];
}

/** @internal Resolve one admitted table node into visible geometry. */
export function resolveTableGeometry(table:string,node:{readonly properties:Readonly<Record<string,unknown>>;readonly children:readonly unknown[]},fail:Fail):{rows:string[];columns:Column[];cells:Map<string,Resolved>;conflicts:{merge:string;reason:StaticMergeConflictReason}[]} {
 const p=node.properties,records=p["columns"];
 if(!Array.isArray(records)||records.length>128)fail("table","Table columns must be an array of at most 128 records",'.properties["breditor/columns"]');
 const columns=(records as unknown[]).map((record,index):Column=>{
  const at=`.properties["breditor/columns"][${index}]`;
  if(!isRecord(record)||Object.keys(record).length!==2)fail("table","Column record must be {id, width}",at);
  const id=own(record,"id"),width=own(record,"width");
  if(typeof id!=="string"||!identity.test(id))fail("table","Invalid table column identity",at);
  if(typeof width!=="number"||!Number.isSafeInteger(width)||width<32||width>4096)fail("table","Column width outside 32–4096",at);
  return {id,width};
 });
 // A V4 caption paragraph (always last) is not a row.
 const all=node.children as readonly Element[],tail=all[all.length-1],rowNodes=tail?.type==="breditor/paragraph"?all.slice(0,-1):all;
 if(rowNodes.length>256||rowNodes.length*columns.length>4096)fail("table","Table exceeds its row or base-cell ceiling","");
 const rows=rowNodes.map((row,rowIndex)=>{
  if(row.children.length!==columns.length)fail("table","Row must contain exactly one base cell per column",`.children[${rowIndex}]`);
  row.children.forEach((cell,index)=>{if(cell.kind!=="element"||cell.properties["column-id"]!==columns[index]!.id)fail("table","Base cell order must match stable table column order",`.children[${rowIndex}].children[${index}]`);});
  return String(row.properties["row-id"]);
 });
 const columnIds=columns.map(column=>column.id);
 if(!unique(rows)||!unique(columnIds))fail("table","Table axes must be unique","");
 const mergeRecords=p["merges"],retractedRecords=p["retracted-merges"];
 if(!Array.isArray(mergeRecords)||mergeRecords.length>256)fail("table","Merges must be an array of at most 256 records",'.properties["breditor/merges"]');
 if(!Array.isArray(retractedRecords)||retractedRecords.length>256)fail("table","Retracted merges must be an array of at most 256 identities",'.properties["breditor/retracted-merges"]');
 const fields=["id","lamport","writer","counter","rows","columns","first-row","last-row","first-column","last-column"];
 const regions=(mergeRecords as unknown[]).map((record,index):Region=>{
  const at=`.properties["breditor/merges"][${index}]`;
  if(!isRecord(record)||Object.keys(record).length!==fields.length||fields.some(field=>!Object.hasOwn(record,field)))fail("table","Merge record must contain exactly its declared fields",at);
  const string=(key:string)=>{const value=own(record,key);if(typeof value!=="string"||!identity.test(value))fail("table","Invalid merge identity field",at);return value;};
  const word=(key:string)=>{const value=own(record,key);if(typeof value!=="string"||!canonicalU64.test(value)||BigInt(value)>U64_MAX)fail("table","Causal words must be canonical unsigned decimal strings",at);return BigInt(value);};
  const axes=(key:string,max:number)=>{const value=own(record,key);if(!Array.isArray(value)||value.length>max||value.some(item=>typeof item!=="string"||!identity.test(item)))fail("table","Invalid merge axis context",at);return value as string[];};
  const id=string("id"),lamport=word("lamport"),writer=word("writer"),counter=word("counter");
  if(writer===0n)fail("table","Merge writer cannot be zero",at);
  const contextRows=axes("rows",256),contextColumns=axes("columns",128);
  if(contextRows.length*contextColumns.length>4096||!unique(contextRows)||!unique(contextColumns))fail("table","Invalid merge context shape",at);
  const rowStart=contextRows.indexOf(string("first-row")),rowEnd=contextRows.indexOf(string("last-row")),columnStart=contextColumns.indexOf(string("first-column")),columnEnd=contextColumns.indexOf(string("last-column"));
  if(rowStart<0||rowEnd<0||columnStart<0||columnEnd<0||rowStart>rowEnd||columnStart>columnEnd||(rowStart===rowEnd&&columnStart===columnEnd))fail("table","Invalid captured merge bounds",at);
  return {id,stamp:[lamport,writer,counter],rows:contextRows,columns:contextColumns,rowStart,rowEnd,columnStart,columnEnd};
 });
 for(let index=1;index<regions.length;index++)if(regions[index-1]!.id>=regions[index]!.id)fail("table","Merge records must have unique ascending identity order",'.properties["breditor/merges"]');
 const retracted=(retractedRecords as unknown[]).map((value,index)=>{if(typeof value!=="string"||!identity.test(value))fail("table","Invalid retracted merge identity",`.properties["breditor/retracted-merges"][${index}]`);return value;});
 for(let index=1;index<retracted.length;index++)if(retracted[index-1]!>=retracted[index]!)fail("table","Merge retractions must have unique ascending identity order",'.properties["breditor/retracted-merges"]');
 const compare=(left:Region,right:Region):number=>{
  for(let index=0;index<3;index++){const a=left.stamp[index]!,b=right.stamp[index]!;if(a!==b)return a<b?1:-1;}
  return left.id<right.id?1:left.id>right.id?-1:0;
 };
 const ordered=regions.filter(region=>!retracted.includes(region.id)).sort(compare);
 const cells=new Map<string,Resolved>(),grid:Resolved[]=[];
 for(const row of rows)for(const column of columnIds){const base={table,row,column};const cell={base,master:base,rowSpan:1,columnSpan:1,sources:[base]};grid.push(cell);cells.set(`${row}\u0000${column}`,cell);}
 const occupied=new Array<boolean>(grid.length).fill(false),conflicts:{merge:string;reason:StaticMergeConflictReason}[]=[];
 for(const region of ordered){
  const r=interval(rows,region.rows,region.rowStart,region.rowEnd),c=typeof r==="string"?r:interval(columnIds,region.columns,region.columnStart,region.columnEnd);
  if(typeof r==="string"||typeof c==="string"){conflicts.push({merge:region.id,reason:typeof r==="string"?r:c as StaticMergeConflictReason});continue;}
  const [firstRow,lastRow]=r,[firstColumn,lastColumn]=c;
  if(firstRow===lastRow&&firstColumn===lastColumn){conflicts.push({merge:region.id,reason:"singleton"});continue;}
  const indices:number[]=[];
  for(let row=firstRow;row<=lastRow;row++)for(let column=firstColumn;column<=lastColumn;column++)indices.push(row*columnIds.length+column);
  if(indices.some(index=>occupied[index])){conflicts.push({merge:region.id,reason:"overlap"});continue;}
  const masterIndex=firstRow*columnIds.length+firstColumn,master=grid[masterIndex]!.base,sources=indices.map(index=>grid[index]!.base);
  for(const index of indices){occupied[index]=true;const cell=grid[index]!;Object.assign(cell,{master,sources:[],rowSpan:0,columnSpan:0});}
  Object.assign(grid[masterIndex]!,{rowSpan:lastRow-firstRow+1,columnSpan:lastColumn-firstColumn+1,sources});
 }
 return {rows,columns,cells,conflicts};
}
