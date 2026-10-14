// Stable logical selections bridge native ranges; DOM coordinates never become durable identity.
import type {RichPoint,RichSelection} from "./core.js";
import {sourceCell,type RichModel} from "./model.js";
const blockSelector="[data-rich-text]";
function containing(node:Node):HTMLElement|null {
 return (node.nodeType===1?node as Element:node.parentElement)?.closest<HTMLElement>(blockSelector)??null;
}
function point(surface:HTMLElement,node:Node,offset:number,side:"start"|"end"):RichPoint|null {
 const block=containing(node);
 if(block&&surface.contains(block)){
  const range=surface.ownerDocument.createRange();range.setStart(block,0);range.setEnd(node,offset);
  return {block:block.dataset["richText"]??"",offset:String(range.toString().length),affinity:"after"};
 }
 if(!surface.contains(node)&&node!==surface)return null;
 const children=node.childNodes;
 const child=side==="start"?children[offset]:children[offset-1];
 let nearest:HTMLElement|null=null;
 if(child){nearest=containing(child);if(!nearest&&child.nodeType===1){const matches=(child as Element).querySelectorAll<HTMLElement>(blockSelector);nearest=side==="start"?matches[0]??null:matches[matches.length-1]??null;}}
 if(!nearest){const matches=surface.querySelectorAll<HTMLElement>(blockSelector);nearest=side==="start"?matches[0]??null:matches[matches.length-1]??null;}
 return nearest?{block:nearest.dataset["richText"]??"",offset:String(side==="start"?0:nearest.textContent?.length??0),affinity:"after"}:null;
}
export function readNative(surface:HTMLElement,value:RichModel):RichSelection|null {
 const native=surface.ownerDocument.getSelection();
 if(!native?.anchorNode||!native.focusNode)return null;
 let anchor=point(surface,native.anchorNode,native.anchorOffset,"start"),focus=native.isCollapsed&&anchor?{...anchor}:point(surface,native.focusNode,native.focusOffset,"end");
 if(!anchor||!focus)return null;
 const prior=value.view.selection;
 if(prior?.kind==="text"){
  if(anchor.block===prior.anchor.block&&anchor.offset===prior.anchor.offset)anchor={...anchor,affinity:prior.anchor.affinity};
  if(focus.block===prior.focus.block&&focus.offset===prior.focus.offset)focus={...focus,affinity:prior.focus.affinity};
 }
 const a=sourceCell(value,anchor.block),f=sourceCell(value,focus.block);
 if(a&&f&&a.table===f.table&&(a.row!==f.row||a.column!==f.column))return {kind:"grid",anchor:a,focus:f};
 return {kind:"text",anchor,focus};
}
export function readTarget(surface:HTMLElement,range:StaticRange):Extract<RichSelection,{kind:"text"}>|null {
 const anchor=point(surface,range.startContainer,range.startOffset,"start"),focus=range.startContainer===range.endContainer&&range.startOffset===range.endOffset&&anchor?{...anchor}:point(surface,range.endContainer,range.endOffset,"end");
 return anchor&&focus?{kind:"text",anchor,focus}:null;
}
function endpoint(surface:HTMLElement,value:RichPoint):[Node,number]|null {
 const block=[...surface.querySelectorAll<HTMLElement>(blockSelector)].find(node=>node.dataset["richText"]===value.block);
 if(!block)return null;
 let remaining=Number(value.offset);const walker=surface.ownerDocument.createTreeWalker(block,4);let node=walker.nextNode();
 while(node){const length=node.textContent?.length??0;if(remaining<=length)return [node,remaining];remaining-=length;node=walker.nextNode();}
 return remaining===0?[block,0]:null;
}
export function restoreNative(surface:HTMLElement,selection:RichSelection|null):void {
 const native=surface.ownerDocument.getSelection();if(!native)return;
 if(selection?.kind!=="text"){native.removeAllRanges();return;}
 const anchor=endpoint(surface,selection.anchor),focus=endpoint(surface,selection.focus);
 if(anchor&&focus)native.setBaseAndExtent(anchor[0],anchor[1],focus[0],focus[1]);
}
