// Rich V4 page breaks: presentation, read-only targeting and an owner-bound toolbar control.
// Rust owns grammar (document root only), identities and history; this module never edits the document.
import type {RichCoreEditor,RichSelectionPolicy} from "./core.js";
import type {FlowPosition} from "./commands.js";
import type {ActionContext,ToolbarControl} from "./actions.js";
import {id,selectedTable,type ElementNode,type RichPresentationModel} from "./model.js";

/** Atomic, content-free page-break element kind. Admitted only as a direct child of the document root. */
export const richPageBreakKind="breditor/page-break";
/** Class shared by the live and static page-break elements (and by `richPrintStyles`). */
export const richPageBreakClass="breditor-page-break";
/** Inline style shared by the live and static elements: a forced page break after the marker in paged media.
 * `page-break-after` is the legacy alias some print pipelines still read. */
export const richPageBreakStyle="break-after:page;page-break-after:always";

export const isPageBreak=(node:ElementNode|undefined):boolean=>node?.type===richPageBreakKind;
/**
 * Presentation attributes of a page-break element, identical in the live and static renderers. The
 * accessible label comes from the UI catalog (`pageBreakLabel`); live adds only editing affordances
 * (`data-rich-block`, `data-select-node`, `contenteditable="false"`).
 */
export function pageBreakAttributes(label:string):readonly {readonly name:string;readonly value:string}[]{
 return Object.freeze([
  {name:"class",value:richPageBreakClass},{name:"role",value:"separator"},{name:"aria-label",value:label},{name:"style",value:richPageBreakStyle},
 ]);
}
/** Live, non-editable page-break marker. Clicking it selects the node (like a horizontal rule). */
export function createPageBreakElement(document:Document,node:ElementNode,label:string):HTMLElement{
 const element=document.createElement("div"),block=id(node);
 element.dataset["richBlock"]=block;element.dataset["richPageBreak"]=block;
 for(const {name,value} of pageBreakAttributes(label))element.setAttribute(name,value);
 element.setAttribute("contenteditable","false");element.dataset["selectNode"]=block;
 return element;
}
/** Visible editor marker: a dashed rule with the catalog label centred on it. Print hides it (see `richPrintStyles`). */
export const richPageBreakStyles=`[data-breditor-rich] [data-rich-page-break]{position:relative;height:1.6em;margin:12px 0;cursor:default;user-select:none;-webkit-user-select:none}[data-breditor-rich] [data-rich-page-break]::before{content:"";position:absolute;left:0;right:0;top:50%;border-top:2px dashed #9dbbb0}[data-breditor-rich] [data-rich-page-break]::after{content:attr(aria-label);position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:0 8px;background:#fff;color:#527269;font-size:12px;line-height:1.6;white-space:nowrap}`;

/** The document-root block that contains the selection (a caret, range focus, node or grid table). */
export function rootBlockOfSelection(model:RichPresentationModel):ElementNode|undefined{
 const s=model.view.selection;
 let node:ElementNode|undefined=s?.kind==="node"?model.nodes.get(s.block):s?.kind==="text"?model.nodes.get(s.focus.block):s?.kind==="grid"?selectedTable(model):undefined;
 while(node){
  const parent=model.parents.get(id(node));
  if(!parent||parent===model.root||parent.type==="breditor/document")return node;
  node=parent;
 }
 return undefined;
}
/** Root-flow insertion position right after the selection's root block (append when there is none). */
export function pageBreakPosition(model:RichPresentationModel):FlowPosition{
 const block=rootBlockOfSelection(model);
 const siblings=model.root.children.filter((child):child is ElementNode=>child.kind==="element");
 const index=block?siblings.findIndex(child=>id(child)===id(block)):-1;
 const next=index>=0?siblings[index+1]:undefined;
 return {parent:{kind:"document"},before:next?id(next):null};
}
type PageBreakOwner={richLanguageVersion?():number;supportsPageBreaks?():boolean};
/**
 * V4 control **Page break**: inserts one page break after the document-root block that holds the
 * selection (a break inside a list, quote, section or table lands after that whole root block), as
 * one Undo step. The selection is kept. Removing a page break is ordinary node deletion.
 */
export function pageBreakToolbarControls<P extends RichSelectionPolicy>(core:RichCoreEditor<P>&PageBreakOwner):readonly ToolbarControl<P>[]{
 if(core.richLanguageVersion?.()!==4||core.supportsPageBreaks?.()!==true)throw Error("Use an explicitly selected matching rich V4 owner");
 const bound=(c:ActionContext<P>):void=>{if(c.core!==core)throw Error("Page break control belongs to a different Rust owner");};
 return Object.freeze([
  {id:"page-break",label:"Page break",owner:core,
   enabled:c=>{const s=c.model.view.selection;return s!==null&&s?.kind!=="document"&&rootBlockOfSelection(c.model)!==undefined;},
   command:c=>{bound(c);return {kind:"insertPageBreak",data:{position:pageBreakPosition(c.model),block:c.allocate("page-break")}};}},
 ] satisfies ToolbarControl<P>[]);
}
