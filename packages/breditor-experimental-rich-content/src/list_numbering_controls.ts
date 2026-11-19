import type {RichListNumberingPatch,RichListNumberStyle,RichSelectionPolicy} from "./core.js";
import {id,selectedText,type ElementNode,type RichPresentationModel} from "./model.js";
import type {ActionContext} from "./actions.js";
import type {RichToolbarField,RichToolbarReading} from "./toolbar_control_view.js";
import {listNumberStyles,listNumberingOf} from "./list_numbering_presentation.js";
interface NumberingReader {richLanguageVersion?():1|2|3|4;supportsListNumbering?():boolean}
/** Highest native ordinal; Rust also checks that the final ordinal fits. */
const MAX_ORDINAL=2_147_483_647;
const lists=new Set(["breditor/bullet-list","breditor/ordered-list","breditor/task-list"]);
function nearestList(model:RichPresentationModel,block:string):ElementNode|undefined{
 let node=model.nodes.get(block);
 while(node){if(lists.has(node.type))return node;node=model.parents.get(id(node));}
 return undefined;
}
/** The ordered list that directly owns the whole selection; a nested bullet or task list is its own
 * target, so it never borrows an ancestor's numbering. */
export function selectedOrderedList(model:RichPresentationModel):ElementNode|undefined{
 const s=model.view.selection;
 if(s?.kind==="node"){const node=model.nodes.get(s.block);return node?.type==="breditor/ordered-list"?node:node?nearestList(model,id(node)):undefined;}
 if(s?.kind!=="text"||!selectedText(model))return undefined;
 const a=nearestList(model,s.anchor.block),f=nearestList(model,s.focus.block);
 return a&&a===f&&a.type==="breditor/ordered-list"?a:undefined;
}
export interface ListNumberingControl {
 readonly id:string;readonly label:string;readonly fields:readonly RichToolbarField[];
 read(model:RichPresentationModel):RichToolbarReading;
 patch(model:RichPresentationModel,fields:Readonly<Record<string,string>>):RichListNumberingPatch|null;
}
/** One owner-bound candidate V4 control; it reads the admitted AST and produces intent only. */
export function listNumberingControl(core:NumberingReader):ListNumberingControl{
 if(core.richLanguageVersion?.()!==4||core.supportsListNumbering?.()!==true)throw Error("Use an explicitly selected matching rich V4 owner");
 const styleOptions=[{value:"default",label:"Default"},{value:"decimal",label:"1, 2, 3"},{value:"lower-alpha",label:"a, b, c"},{value:"upper-alpha",label:"A, B, C"},{value:"lower-roman",label:"i, ii, iii"},{value:"upper-roman",label:"I, II, III"}];
 return Object.freeze({id:"list-numbering",label:"List numbering",fields:Object.freeze([
  {id:"style",label:"Numbering style",type:"select",options:styleOptions},
  {id:"order",label:"Counting order",type:"select",options:[{value:"ascending",label:"Ascending"},{value:"reversed",label:"Reversed (counts down)"}]},
  {id:"start",label:"Start at",type:"number",min:1,max:MAX_ORDINAL,placeholder:"1"},
 ] satisfies RichToolbarField[]),
 read(model:RichPresentationModel):RichToolbarReading{
  const list=selectedOrderedList(model);if(!list)return {kind:"unavailable"};
  const value=listNumberingOf(list)!;
  return {kind:"uniform",values:{style:value.style===undefined?"default":listNumberStyles[value.style-1]!,order:value.reversed?"reversed":"ascending",start:String(value.start)}};
 },
 patch(model:RichPresentationModel,fields:Readonly<Record<string,string>>):RichListNumberingPatch|null{
  const list=selectedOrderedList(model);if(!list)return null;
  const current=listNumberingOf(list)!,patch:RichListNumberingPatch={list:id(list)};
  const style=fields["style"],order=fields["order"],start=fields["start"];
  if(style){
   if(style!=="default"&&!(listNumberStyles as readonly string[]).includes(style))throw new TypeError("Unknown numbering style");
   const next=style==="default"?undefined:listNumberStyles.indexOf(style as RichListNumberStyle)+1;
   if(next!==current.style)patch.style=style==="default"?null:style as RichListNumberStyle;
  }
  if(order){
   if(order!=="ascending"&&order!=="reversed")throw new TypeError("Unknown counting order");
   if((order==="reversed")!==current.reversed)patch.reversed=order==="reversed";
  }
  if(start){
   if(!/^[1-9][0-9]*$/.test(start))throw new TypeError("Enter a whole starting number");
   const n=Number(start);if(!Number.isSafeInteger(n)||n>MAX_ORDINAL)throw new TypeError("Starting number is outside its supported range");
   if(n!==current.start)patch.start=n;
  }
  return Object.keys(patch).length>1?patch:null;
 }});
}
/** Toolbar adapter: native commands only, bound to the same owner it was built for. */
export function listNumberingToolbarControl<P extends RichSelectionPolicy>(core:NumberingReader&object){
 const spec=listNumberingControl(core);
 return {id:spec.id,label:spec.label,fields:spec.fields,mixedHint:"Numbering applies to the whole ordered list that contains the selection.",
  read:(c:ActionContext<P>)=>spec.read(c.model),enabled:(c:ActionContext<P>)=>selectedOrderedList(c.model)!==undefined,
  command(c:ActionContext<P>,_value?:string,fields:Readonly<Record<string,string>>={}){if(c.core!==core)throw Error("Numbering control belongs to a different Rust owner");const data=spec.patch(c.model,fields);return data?{kind:"setListNumbering" as const,data}:null;}};
}
