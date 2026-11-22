// Advanced list structure: multi-block item keyboard intents and the opt-in legal numbering
// presentation. Both are read-only derivations of the admitted Rust AST; the Rust owner
// (local or shared) admits every resulting command. See docs/LIST_STRUCTURE.md.
import {id,isProse,property,text,type ElementNode,type RichPresentationModel} from "./model.js";

/** Collapsed caret block, its offset and its direct parent, or undefined. */
function caretBlock(value:RichPresentationModel):{node:ElementNode;parent:ElementNode;offset:number}|undefined{
 const selection=value.view.selection;
 if(selection?.kind!=="text"||selection.anchor.block!==selection.focus.block||selection.anchor.offset!==selection.focus.offset)return undefined;
 const node=value.nodes.get(selection.focus.block),parent=node?value.parents.get(id(node)):undefined;
 return node&&parent?{node,parent,offset:Number(selection.focus.offset)}:undefined;
}
/**
 * Enter in an EMPTY later paragraph/heading of a list item (not its leading block): that block and
 * every block after it move into a fresh sibling item directly after the current one, keeping their
 * identities (`splitListItemBlock` / `split_list_item_block`). Undefined otherwise, so ordinary Enter
 * (a new paragraph inside the item, or a new item from the leading block) is unchanged.
 */
export function multiBlockListEnter(value:RichPresentationModel):{block:string;item:string}|undefined{
 const caret=caretBlock(value);if(!caret)return undefined;
 const {node,parent}=caret;
 if(parent.type!=="breditor/list-item"||!isProse(node)||text(node)!=="")return undefined;
 const index=parent.children.indexOf(node);
 return index>0?{block:id(node),item:id(parent)}:undefined;
}
/**
 * Backspace at the start of an EMPTY leading block of a list item that has a previous sibling item:
 * the item's marker is removed and all its blocks become later blocks of the previous item, text
 * never joined (`joinListItems` / `join_list_items` with `blocks: true`). This is CKEditor's
 * "Enter, then Backspace" way of adding a block to an item; a second Backspace then joins the now
 * later empty paragraph with the block before it as ordinary paragraphs do.
 */
export function multiBlockListBackspace(value:RichPresentationModel):{container:string;left:string;right:string}|undefined{
 const caret=caretBlock(value);if(!caret)return undefined;
 const {node,parent,offset}=caret;
 if(parent.type!=="breditor/list-item"||parent.children[0]!==node||offset!==0||!isProse(node)||text(node)!=="")return undefined;
 const list=value.parents.get(id(parent));if(!list||list.type!=="breditor/bullet-list"&&list.type!=="breditor/ordered-list")return undefined;
 const items=list.children.filter((child):child is ElementNode=>child.kind==="element"),index=items.indexOf(parent),left=items[index-1];
 return left?{container:id(list),left:id(left),right:id(parent)}:undefined;
}

/**
 * Legal multi-level numbering (`1.`, `1.2.`, `1.2.3.`), derived from admitted structure only.
 *
 * Every ordered list owns its counting (its explicit `start` and V4 reversal); its items get that
 * ordinal. An ordered list that is a direct child of an ordered list's item continues the parent's
 * marker; any other placement (a bullet/task item, quote, section, table cell or the root) starts a
 * new chain at one component. Components are always decimal (like Word's "legal" numbering), so a
 * V4 letter/roman marker style is not shown in this mode. Nothing is stored in the document.
 */
export function legalListMarkers(root:ElementNode):ReadonlyMap<ElementNode,string>{
 return legalListMarkersWith(root,{
  type:node=>node.type,
  children:node=>node.children.filter((child):child is ElementNode=>child.kind==="element"),
  start:node=>property(node,"start"),
  reversed:node=>property(node,"list-reversed")===true,
 });
}
/** Node-shape reader for {@link legalListMarkersWith} (live AST or a DOM-free static tree). */
export interface LegalListReader<N> {type(node:N):string;children(node:N):readonly N[];start(node:N):unknown;reversed(node:N):boolean}
/** {@link legalListMarkers} over any admitted tree shape; markers are keyed by item node. */
export function legalListMarkersWith<N>(root:N,read:LegalListReader<N>):ReadonlyMap<N,string>{
 const markers=new Map<N,string>();
 const walk=(node:N,prefix:readonly number[]|null):void=>{
  if(read.type(node)==="breditor/ordered-list"){
   const start=read.start(node),reversed=read.reversed(node);
   const first=typeof start==="number"&&Number.isSafeInteger(start)?start:1;
   read.children(node).forEach((item,index)=>{
    const components=[...(prefix??[]),reversed?first-index:first+index];
    markers.set(item,`${components.join(".")}.`);
    for(const child of read.children(item))walk(child,read.type(child)==="breditor/ordered-list"?components:null);
   });
   return;
  }
  for(const child of read.children(node))walk(child,null);
 };
 walk(root,null);
 return markers;
}
/** Marker attribute on a rendered `<li>`; the ordered list carries {@link legalListAttribute}. */
export const legalListMarkerAttribute="data-rich-legal-marker";
export const legalListAttribute="data-rich-legal";
/** Presentation for legal markers: a generated, non-editable gutter label per item. Scoped to the
 * opt-in attributes, so it never affects documents rendered without the option. */
export const richLegalListStyles=`[data-breditor-rich] ol[${legalListAttribute}]{list-style-type:none;padding-inline-start:3.5em}[data-breditor-rich] li[${legalListMarkerAttribute}]{position:relative}[data-breditor-rich] li[${legalListMarkerAttribute}]::before{content:attr(${legalListMarkerAttribute});position:absolute;inset-inline-end:100%;margin-inline-end:.5em;white-space:nowrap;font-variant-numeric:tabular-nums;pointer-events:none;user-select:none;-webkit-user-select:none}`;
