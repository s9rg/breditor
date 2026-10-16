import {isText,property,type ElementNode} from "./model.js";
const alignments=["start","center","end","justify","left","right"] as const;
const directions=["ltr","rtl","auto"] as const;
function integer(value:unknown,min:number,max:number):number|undefined{
 if(value===undefined)return undefined;
 if(typeof value!=="number"||!Number.isInteger(value)||value<min||value>max)throw new TypeError("Invalid admitted block layout value");
 return value;
}
/** Closed presentation of native semantics: logical 2em indent levels and unitless line-height. */
export function applyBlockLayout(element:HTMLElement,node:ElementNode):void{
 const raw=[property(node,"block-align"),property(node,"block-direction"),property(node,"block-indent"),property(node,"line-height-percent")];
 if(!isText(node)){if(raw.some(v=>v!==undefined))throw new TypeError("Layout belongs only to text blocks");return;}
 const alignment=integer(raw[0],1,6),direction=integer(raw[1],1,3),indent=integer(raw[2],0,12),height=integer(raw[3],100,300);
 element.style.textAlign=alignment===undefined?"":alignments[alignment-1]!;
 if(direction===undefined)element.removeAttribute("dir");else element.dir=directions[direction-1]!;
 element.style.marginInlineStart=indent===undefined?"":`${indent*2}em`;
 element.style.lineHeight=height===undefined?"":String(height/100);
}
