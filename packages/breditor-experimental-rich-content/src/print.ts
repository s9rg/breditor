// Opt-in print presentation for rich documents. Breditor stays a continuous flow editor: this module
// is CSS only. It never measures, splits or reflows content and never changes the canonical document.
// Forced breaks come from candidate V4 page-break blocks; everything else is the browser's paged-media
// layout under a bounded @page choice and a few `break-*` hints.
import {resolveRichUi,type RichUiLocale,type RichUiOptions} from "./ui_locale.js";
import {richPageBreakClass} from "./page_break.js";

/** Closed paper sizes (CSS `@page size` keywords). */
export type RichPrintPageSize="A4"|"Letter";
export type RichPrintOrientation="portrait"|"landscape";
/** Closed margin presets: narrow 12.7 mm (0.5 in), normal 25.4 mm (1 in), wide 38.1 mm (1.5 in), on every side. */
export type RichPrintMargin="narrow"|"normal"|"wide";
export interface RichPrintOptions {readonly size?:RichPrintPageSize;readonly orientation?:RichPrintOrientation;readonly margin?:RichPrintMargin}
/** One validated, frozen layout. Lengths are millimetres, exact to 0.1 mm. */
export interface RichPrintLayout {
 readonly size:RichPrintPageSize;readonly orientation:RichPrintOrientation;readonly margin:RichPrintMargin;
 readonly pageWidthMm:number;readonly pageHeightMm:number;readonly marginMm:number;readonly contentWidthMm:number;readonly contentHeightMm:number;
}
export const richPrintPageSizes:readonly RichPrintPageSize[]=Object.freeze(["A4","Letter"]);
export const richPrintOrientations:readonly RichPrintOrientation[]=Object.freeze(["portrait","landscape"]);
export const richPrintMargins:readonly RichPrintMargin[]=Object.freeze(["narrow","normal","wide"]);
/** Portrait paper in tenths of a millimetre (integers keep every derived length exact). */
const paper:Readonly<Record<RichPrintPageSize,readonly [number,number]>>={A4:[2100,2970],Letter:[2159,2794]};
const margins:Readonly<Record<RichPrintMargin,number>>={narrow:127,normal:254,wide:381};
const mm=(tenths:number):number=>tenths/10;

/** Validate options against the closed sets; defaults are A4, portrait, normal. Throws TypeError otherwise. */
export function resolveRichPrintLayout(options:RichPrintOptions|RichPrintLayout={}):RichPrintLayout{
 if(options===null||typeof options!=="object"||Array.isArray(options))throw new TypeError("Print options must be an object");
 const known=["size","orientation","margin","pageWidthMm","pageHeightMm","marginMm","contentWidthMm","contentHeightMm"];
 for(const key of Object.keys(options))if(!known.includes(key))throw new TypeError(`Unknown print option ${JSON.stringify(key)}`);
 const size=options.size??"A4",orientation=options.orientation??"portrait",margin=options.margin??"normal";
 if(!richPrintPageSizes.includes(size))throw new TypeError("Print size must be A4 or Letter");
 if(!richPrintOrientations.includes(orientation))throw new TypeError("Print orientation must be portrait or landscape");
 if(!richPrintMargins.includes(margin))throw new TypeError("Print margin must be narrow, normal or wide");
 const [short,long]=paper[size],width=orientation==="portrait"?short:long,height=orientation==="portrait"?long:short,edge=margins[margin];
 return Object.freeze({size,orientation,margin,pageWidthMm:mm(width),pageHeightMm:mm(height),marginMm:mm(edge),contentWidthMm:mm(width-2*edge),contentHeightMm:mm(height-2*edge)});
}

const scope="[data-breditor-rich]";
const rule=(selectors:readonly string[],body:string):string=>`${selectors.map(selector=>`${scope} ${selector}`).join(",")}{${body}}`;
/**
 * Print stylesheet for a live editor root or static output (`[data-breditor-rich]`). Deterministic: the
 * same options always produce the same string. It sets `@page` size and margins and, under `@media print`:
 * forces a page after each page-break block (and hides its on-screen marker), keeps table rows, captions,
 * figures (image plus caption) and headings whole, keeps a heading with the block that follows it, repeats
 * `<thead>` rows on every page, keeps orphans/widows at 2 lines, lets code wrap instead of clipping and hides
 * editing chrome. Content order and text are never changed.
 */
export function richPrintStyles(options:RichPrintOptions|RichPrintLayout={}):string{
 const layout=resolveRichPrintLayout(options);
 const avoidInside="break-inside:avoid;page-break-inside:avoid";
 return `@page{size:${layout.size} ${layout.orientation};margin:${layout.marginMm}mm}@media print{${[
  rule([".breditor-rich-toolbar",".breditor-rich-status","button[data-select-node]","button[data-select-cell]","[data-breditor-block-drag]"],"display:none!important"),
  rule([".breditor-rich-surface"],"border:0!important;padding:0!important;margin:0!important;box-shadow:none!important;min-height:0!important;max-width:none!important;width:auto!important;background:none!important"),
  rule(["[data-node-selected]","[data-selected]"],"outline:none!important;box-shadow:none!important"),
  rule([`.${richPageBreakClass}`],"display:block!important;height:0!important;margin:0!important;padding:0!important;border:0!important;break-after:page;page-break-after:always"),
  rule([`.${richPageBreakClass}::before`,`.${richPageBreakClass}::after`],"content:none!important;display:none!important"),
  rule(["tr","table>caption","figure"],avoidInside),
  rule(["thead"],"display:table-header-group"),
  rule(["tfoot"],"display:table-footer-group"),
  rule(["h1","h2","h3","h4","h5","h6"],`break-after:avoid;page-break-after:avoid;${avoidInside}`),
  rule(["p","li","summary"],"orphans:2;widows:2"),
  rule(["img"],"max-width:100%;height:auto"),
  rule(["pre"],"white-space:pre-wrap;overflow-wrap:anywhere;overflow:visible"),
 ].join("")}}`;
}

/**
 * Screen-only preview styles for an element carrying `data-breditor-print-preview`: the element is sized to
 * the printable width and padded by the page margin, and a thin guide is drawn every printable page height.
 * The guides are approximate: they ignore forced breaks, `break-*` avoidance, repeated headers and browser
 * print scaling, so the printed pagination can differ.
 */
export function richPrintPreviewStyles(options:RichPrintOptions|RichPrintLayout={}):string{
 const layout=resolveRichPrintLayout(options),height=`${layout.contentHeightMm}mm`;
 return `@media screen{[data-breditor-print-preview]{box-sizing:content-box!important;width:${layout.contentWidthMm}mm!important;max-width:none!important;padding:${layout.marginMm}mm!important;margin-left:auto;margin-right:auto;background-color:#fff;background-image:repeating-linear-gradient(to bottom,transparent 0,transparent calc(${height} - 1px),#d0457a calc(${height} - 1px),#d0457a ${height})!important;background-origin:content-box!important;background-clip:content-box!important;background-size:100% ${height}!important;background-repeat:repeat-y!important}}`;
}

/** A mounted preview. `update` swaps the layout; `dispose` restores the element and removes the stylesheet. */
export interface RichPrintPreview {readonly layout:RichPrintLayout;update(options:RichPrintOptions):RichPrintLayout;dispose():void}
export interface RichPrintPreviewOptions extends RichPrintOptions {
 /** Chrome catalog for the preview description (`printPreviewLabel`). */
 readonly ui?:RichUiOptions|RichUiLocale;
 /** Also install `richPrintStyles` for the same layout (default true), so printing uses the previewed page. */
 readonly print?:boolean;
}
/**
 * Opt-in print preview on an editing surface (or a static wrapper). It adds `data-breditor-print-preview`,
 * an `aria-description` from the catalog and one stylesheet (preview guides plus, by default, the print
 * styles). It never edits document content or the Rust owner; editing continues normally while mounted.
 */
export function mountRichPrintPreview(surface:HTMLElement,options:RichPrintPreviewOptions={}):RichPrintPreview{
 if(!surface||typeof surface.setAttribute!=="function")throw new TypeError("Print preview needs an HTMLElement");
 const {ui:uiOption,print=true,...rest}=options;
 if(typeof print!=="boolean")throw new TypeError("print must be a Boolean");
 const ui=resolveRichUi(uiOption);
 let layout=resolveRichPrintLayout(rest);
 if(surface.hasAttribute("data-breditor-print-preview"))throw Error("A print preview is already mounted on this element");
 const document=surface.ownerDocument,style=document.createElement("style");style.dataset["breditorPrintPreview"]="";
 const previous=surface.getAttribute("aria-description");
 const apply=():void=>{
  style.textContent=richPrintPreviewStyles(layout)+(print?richPrintStyles(layout):"");
  surface.setAttribute("aria-description",ui.text("printPreviewLabel"));
  surface.dataset["breditorPrintSize"]=layout.size;surface.dataset["breditorPrintOrientation"]=layout.orientation;surface.dataset["breditorPrintMargin"]=layout.margin;
 };
 (document.head??document.documentElement).append(style);surface.setAttribute("data-breditor-print-preview","");apply();
 let disposed=false;
 return {
  get layout(){return layout;},
  update(next:RichPrintOptions):RichPrintLayout{if(disposed)throw Error("The print preview was disposed");layout=resolveRichPrintLayout(next);apply();return layout;},
  dispose():void{
   if(disposed)return;disposed=true;style.remove();
   for(const name of ["data-breditor-print-preview","data-breditor-print-size","data-breditor-print-orientation","data-breditor-print-margin"])surface.removeAttribute(name);
   if(previous===null)surface.removeAttribute("aria-description");else surface.setAttribute("aria-description",previous);
  },
 };
}
