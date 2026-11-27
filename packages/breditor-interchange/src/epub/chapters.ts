/**
 * Split a native document's top-level flow into content documents and render each one through the
 * existing semantic HTML exporter (`HtmlExport`), then serialize it as XHTML. Pure and
 * deterministic: file names, heading ids and image names are assigned in document order.
 */
import {Budget,fail} from "../budget.js";
import {bookmarkIdPrefix,isBookmarkName} from "../bookmark.js";
import {HtmlExport} from "../html_export.js";
import {escapeText} from "../safe_url.js";
import type {ImportedAsset} from "../types.js";
import {nodeText,property,type Node} from "../wire.js";
import {anchorIds,htmlToXhtml,resolveInternalLinks} from "./xhtml.js";
import type {NavEntry} from "./parts.js";

/** Where a new content document starts: before every top-level heading 1, at every top-level
 * page break (the break itself is consumed), at both, or never (one content document). */
export type EpubSplit="heading-1"|"page-break"|"heading-1-and-page-break"|"none";
export const epubSplits:readonly EpubSplit[]=Object.freeze(["heading-1","page-break","heading-1-and-page-break","none"]);

export function splitFlow(nodes:readonly Node[],split:EpubSplit,maxChapters:number):Node[][] {
  const atHeading=split==="heading-1"||split==="heading-1-and-page-break",atBreak=split==="page-break"||split==="heading-1-and-page-break";
  const chapters:Node[][]=[[]];
  for(const node of nodes){
    if(node.kind==="element"&&node.type==="breditor/page-break"&&atBreak){chapters.push([]);continue;}
    if(node.kind==="element"&&node.type==="breditor/heading"&&property(node,"level")===1&&atHeading&&chapters.at(-1)!.length)chapters.push([]);
    chapters.at(-1)!.push(node);
  }
  const filled=chapters.filter(chapter=>chapter.length);
  if(filled.length>maxChapters)fail("resource-limit");
  return filled.length?filled:[[]];
}

export interface RenderedChapter {readonly file:string;readonly body:string}
export interface RenderedFlow {readonly chapters:readonly RenderedChapter[];readonly nav:readonly NavEntry[];readonly danglingLinks:number}

const headingLabel=(node:Node):string=>escapeText(nodeText(node).replace(/[\t\n\v\f\r \u0085\u00A0\u2028\u2029]+/g," ").trim());
/**
 * `imageHref` maps a binding to its package-relative path, or `undefined` (the HTML exporter
 * then keeps the alt text and reports `image-reference`).
 */
export function renderFlow(chapters:readonly Node[][],budget:Budget,imageHref:(binding:ImportedAsset)=>string|undefined,fileName:(index:number)=>string):RenderedFlow {
  const nav:NavEntry[]=[],anchors=new Map<string,string>(),rendered:{file:string;body:string}[]=[];
  let generatedIds=0;
  chapters.forEach((nodes,index)=>{
    // One writer per content document: the per-writer node bound applies to each document.
    const file=fileName(index),writer=new HtmlExport(budget,{},true,imageHref);
    const parts=nodes.map(node=>{
      let html=writer.blocks([node]);
      if(node.kind==="element"&&node.type==="breditor/heading"){
        const level=property(node,"level") as number,bookmark=property(node,"bookmark");
        let id:string;
        if(isBookmarkName(bookmark))id=`${bookmarkIdPrefix}${bookmark}`;
        else{id=`heading-${++generatedIds}`;html=html.replace(/^<h([1-6])/,`<h$1 id="${id}"`);}
        const label=headingLabel(node);
        if(label)nav.push(Object.freeze({level,href:`${file}#${id}`,label}));
      }
      return html;
    });
    const body=htmlToXhtml(parts.join(""));
    for(const id of anchorIds(body))if(!anchors.has(id))anchors.set(id,file);
    rendered.push({file,body});
  });
  let danglingLinks=0;
  const linked=rendered.map(({file,body})=>{const r=resolveInternalLinks(body,file,anchors);danglingLinks+=r.dangling;return Object.freeze({file,body:r.xhtml});});
  return Object.freeze({chapters:Object.freeze(linked),nav:Object.freeze(nav),danglingLinks});
}
