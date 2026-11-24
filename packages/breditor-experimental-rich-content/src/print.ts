// Opt-in print presentation for rich documents. A mounted preview can read the screen flow.
// Forced breaks come from V4 page-break blocks. The browser paginates the printed output using
// the chosen @page settings and break hints. Canonical content remains independent of layout.
import {resolveRichUi,type RichUiLocale,type RichUiOptions} from "./ui_locale.js";
import {richPageBreakClass} from "./page_break.js";

/** Closed paper sizes (CSS `@page size` keywords). */
export type RichPrintPageSize="A4"|"Letter";
export type RichPrintOrientation="portrait"|"landscape";
/** Closed margin presets: narrow 12.7 mm (0.5 in), normal 25.4 mm (1 in), wide 38.1 mm (1.5 in), on every side. */
export type RichPrintMargin="narrow"|"normal"|"wide";
export interface RichPrintOptions {
 readonly size?:RichPrintPageSize;
 readonly orientation?:RichPrintOrientation;
 readonly margin?:RichPrintMargin;
 /** One line of text centered in the printed top margin. */
 readonly runningHeader?:string;
 /** Print the current page and total page count in the bottom margin. */
 readonly pageNumbers?:boolean;
}
/** One validated, frozen layout. Lengths are millimetres, exact to 0.1 mm. */
export interface RichPrintLayout {
 readonly size:RichPrintPageSize;readonly orientation:RichPrintOrientation;readonly margin:RichPrintMargin;
 readonly pageWidthMm:number;readonly pageHeightMm:number;readonly marginMm:number;readonly contentWidthMm:number;readonly contentHeightMm:number;
 readonly runningHeader?:string;readonly pageNumbers?:boolean;
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
 const known=["size","orientation","margin","pageWidthMm","pageHeightMm","marginMm","contentWidthMm","contentHeightMm","runningHeader","pageNumbers"];
 for(const key of Object.keys(options))if(!known.includes(key))throw new TypeError(`Unknown print option ${JSON.stringify(key)}`);
 const size=options.size??"A4",orientation=options.orientation??"portrait",margin=options.margin??"normal";
 if(!richPrintPageSizes.includes(size))throw new TypeError("Print size must be A4 or Letter");
 if(!richPrintOrientations.includes(orientation))throw new TypeError("Print orientation must be portrait or landscape");
 if(!richPrintMargins.includes(margin))throw new TypeError("Print margin must be narrow, normal or wide");
 const {runningHeader,pageNumbers}=options;
 if(runningHeader!==undefined&&(typeof runningHeader!=="string"||runningHeader.length>240||/[\u0000-\u001f\u007f\ud800-\udfff]/u.test(runningHeader))){
  throw new TypeError("The running header needs one line of Unicode text, up to 240 UTF-16 code units");
 }
 if(pageNumbers!==undefined&&typeof pageNumbers!=="boolean")throw new TypeError("Print pageNumbers must be a Boolean");
 const [short,long]=paper[size],width=orientation==="portrait"?short:long,height=orientation==="portrait"?long:short,edge=margins[margin];
 return Object.freeze({size,orientation,margin,pageWidthMm:mm(width),pageHeightMm:mm(height),marginMm:mm(edge),contentWidthMm:mm(width-2*edge),contentHeightMm:mm(height-2*edge),
  ...(runningHeader?{runningHeader}:{}),...(pageNumbers?{pageNumbers}:{})});
}

const scope="[data-breditor-rich]";
const rule=(selectors:readonly string[],body:string):string=>`${selectors.map(selector=>`${scope} ${selector}`).join(",")}{${body}}`;
function pageRule(layout:RichPrintLayout):string {
 // Escape the CSS string and the surrounding HTML style element used by static export.
 const text=layout.runningHeader?.replace(/["\\<]/g,value=>`\\${value.charCodeAt(0).toString(16)} `);
 const header=text?`@top-center{content:"${text}";font:9pt system-ui;white-space:nowrap}`:"";
 const footer=layout.pageNumbers?'@bottom-center{content:counter(page) " / " counter(pages);font:9pt system-ui}':"";
 const boxes=header+footer;
 return `@page{size:${layout.size} ${layout.orientation};margin:${layout.marginMm}mm${boxes?`;${boxes}`:""}}`;
}
/**
 * Print stylesheet for a live editor root or static output (`[data-breditor-rich]`). Deterministic: the
 * same options always produce the same string. It sets `@page` size and margins and, under `@media print`:
 * forces a page after each page-break block (and hides its on-screen marker), keeps table rows, captions,
 * figures (image plus caption) and headings whole, keeps a heading with the block that follows it, repeats
 * `<thead>` rows on every page, keeps orphans/widows at 2 lines, lets code wrap instead of clipping and hides
 * editing chrome. Content order and text are never changed.
 */
export function richPrintStyles(options:RichPrintOptions|RichPrintLayout={}):string{
 return pageRule(resolveRichPrintLayout(options))+printRules;
}

const avoidInside="break-inside:avoid;page-break-inside:avoid";
const printRules=`@media print{${[
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

/**
 * Screen-only preview styles for an element carrying `data-breditor-print-preview`: the element is sized to
 * the printable width and padded by the page margin, and a thin guide is drawn every printable page height.
 * The guides are approximate: they ignore forced breaks, `break-*` avoidance, repeated headers and browser
 * print scaling, so the printed pagination can differ.
 */
export function richPrintPreviewStyles(options:RichPrintOptions|RichPrintLayout={}):string{
 return previewStyles(resolveRichPrintLayout(options),"[data-breditor-print-preview]");
}

function previewStyles(layout:RichPrintLayout,selector:string):string{
 const height=`${layout.contentHeightMm}mm`;
 return `@media screen{${selector}{box-sizing:content-box!important;width:${layout.contentWidthMm}mm!important;max-width:none!important;padding:${layout.marginMm}mm!important;margin-left:auto;margin-right:auto;background-color:#fff;background-image:repeating-linear-gradient(to bottom,transparent 0,transparent calc(${height} - 1px),#d0457a calc(${height} - 1px),#d0457a ${height})!important;background-origin:content-box!important;background-clip:content-box!important;background-size:100% ${height}!important;background-repeat:repeat-y!important}}`;
}

/** One measured page start, relative to the preview's content box in CSS pixels. */
export interface RichPrintPreviewPage {
 readonly number:number;
 readonly topCssPx:number;
 readonly reason:"start"|"automatic"|"forced";
}
export interface RichPrintPreviewMeasurement {
 readonly contentHeightCssPx:number;
 readonly pageHeightCssPx:number;
 readonly pages:readonly RichPrintPreviewPage[];
}
/** A mounted preview with a read of its current screen flow. */
export interface RichPrintPreview {
 readonly layout:RichPrintLayout;
 update(options:RichPrintOptions):RichPrintLayout;
 measure():RichPrintPreviewMeasurement;
 dispose():void;
}
export interface RichPrintPreviewOptions extends RichPrintOptions {
 /** Chrome catalog for the preview description (`printPreviewLabel`). */
 readonly ui?:RichUiOptions|RichUiLocale;
 /** Also install `richPrintStyles` for the same layout (default true), so printing uses the previewed page. */
 readonly print?:boolean;
}

function measurePreview(surface:HTMLElement,layout:RichPrintLayout):RichPrintPreviewMeasurement{
 const view=surface.ownerDocument.defaultView;
 const bounds=surface.getBoundingClientRect(),height=surface.offsetHeight;
 if(!view||!surface.isConnected||height===0||bounds.height===0||view.matchMedia("print").matches){
  throw Error("Measure a connected print preview in screen media");
 }
 const style=view.getComputedStyle(surface),paddingTop=parseFloat(style.paddingTop)||0,paddingBottom=parseFloat(style.paddingBottom)||0;
 const contentHeightCssPx=Math.max(0,surface.scrollHeight-paddingTop-paddingBottom),pageHeightCssPx=layout.contentHeightMm*96/25.4;
 const scaleY=bounds.height/height;
 const contentTop=surface.clientTop+paddingTop-surface.scrollTop;
 const tolerance=1; // scrollHeight rounds to an integer CSS pixel.
 const forced=new Set<number>();
 for(const child of surface.children){
  if(!child.classList.contains(richPageBreakClass)||child.getClientRects().length===0)continue;
  const after=(child.getBoundingClientRect().bottom-bounds.top)/scaleY-contentTop;
  if(after>tolerance&&after<contentHeightCssPx-tolerance)forced.add(after);
 }
 const pages:RichPrintPreviewPage[]=[Object.freeze({number:1,topCssPx:0,reason:"start"})];
 let start=0;
 for(const end of [...forced].sort((a,b)=>a-b).concat(contentHeightCssPx)){
  for(let at=start+pageHeightCssPx;at<end-tolerance;at+=pageHeightCssPx){
   pages.push(Object.freeze({number:pages.length+1,topCssPx:at,reason:"automatic"}));
  }
  if(end<contentHeightCssPx)pages.push(Object.freeze({number:pages.length+1,topCssPx:end,reason:"forced"}));
  start=end;
 }
 return Object.freeze({contentHeightCssPx,pageHeightCssPx,pages:Object.freeze(pages)});
}
/**
 * Opt-in print preview on an editing surface (or a static wrapper). It adds `data-breditor-print-preview`,
 * an `aria-description` from the catalog and styles in the surface's tree. Page size and margins are
 * placed in the owner document. Screen styles match the surface's current layout.
 */
export function mountRichPrintPreview(surface:HTMLElement,options:RichPrintPreviewOptions={}):RichPrintPreview{
 if(!surface||typeof surface.setAttribute!=="function")throw new TypeError("Print preview needs an HTMLElement");
 const {ui:uiOption,print=true,...rest}=options;
 if(typeof print!=="boolean")throw new TypeError("print must be a Boolean");
 const ui=resolveRichUi(uiOption);
 let layout=resolveRichPrintLayout(rest);
 if(surface.hasAttribute("data-breditor-print-preview"))throw Error("A print preview is already mounted on this element");
 const document=surface.ownerDocument;
 const style=document.createElement("style");style.dataset["breditorPrintPreview"]="";
 const pageStyle=print?document.createElement("style"):undefined;
 const attributes=["aria-description","data-breditor-print-preview","data-breditor-print-size","data-breditor-print-orientation","data-breditor-print-margin"];
 const previous=attributes.map(name=>[name,surface.getAttribute(name)] as const);
 const apply=():void=>{
  const ownerDocument=surface.ownerDocument,documentStyles=ownerDocument.head??ownerDocument.documentElement;
  const root=surface.getRootNode(),shadow=root.nodeType===11&&"host" in root?root as ShadowRoot:undefined;
  const styleRoot=shadow??documentStyles;
  const selector=`[data-breditor-print-preview][data-breditor-print-size="${layout.size}"][data-breditor-print-orientation="${layout.orientation}"][data-breditor-print-margin="${layout.margin}"]`;
  style.textContent=previewStyles(layout,selector)+(print?(shadow?printRules:pageRule(layout)+printRules):"");
  if(style.parentNode!==styleRoot)styleRoot.append(style);
  if(pageStyle&&shadow){
   pageStyle.textContent=pageRule(layout);
   if(pageStyle.parentNode!==documentStyles)documentStyles.append(pageStyle);
  }else pageStyle?.remove();
  surface.setAttribute("aria-description",ui.text("printPreviewLabel"));
  surface.dataset["breditorPrintSize"]=layout.size;surface.dataset["breditorPrintOrientation"]=layout.orientation;surface.dataset["breditorPrintMargin"]=layout.margin;
 };
 // Custom elements can react synchronously to the preview's attribute writes.
 surface.setAttribute("data-breditor-print-preview","");apply();
 let disposed=false;
 return {
  get layout(){return layout;},
  update(next:RichPrintOptions):RichPrintLayout{if(disposed)throw Error("The print preview was disposed");layout=resolveRichPrintLayout(next);apply();return layout;},
  measure():RichPrintPreviewMeasurement{if(disposed)throw Error("The print preview was disposed");return measurePreview(surface,layout);},
  dispose():void{
   if(disposed)return;disposed=true;style.remove();pageStyle?.remove();
   for(const [name,value]of previous){
    if(value===null)surface.removeAttribute(name);else surface.setAttribute(name,value);
   }
  },
 };
}
