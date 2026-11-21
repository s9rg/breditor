import type {RichBlockLayoutPatch,RichBlockLayoutStateRead,RichLayoutFieldState} from "./core.js";
import type {RichToolbarField,RichToolbarReading} from "./toolbar_control_view.js";
interface LayoutReader {richLanguageVersion?():1|2|3|4;supportsBlockLayout?():boolean;blockLayoutState?():RichBlockLayoutStateRead}
export interface BlockLayoutControl {
 readonly id:string;readonly label:string;readonly fields?:readonly RichToolbarField[];readonly mixedHint?:string;
 read():RichToolbarReading;patch(fields:Readonly<Record<string,string>>):RichBlockLayoutPatch|null;
}
function numeric(value:string|undefined,min:number,max:number):number{
 if(value===undefined||!/^(0|[1-9][0-9]*)$/.test(value))throw new TypeError("Enter a whole layout value");
 const number=Number(value);if(!Number.isSafeInteger(number)||number<min||number>max)throw new TypeError("Layout value is outside its supported range");return number;
}
function reading<T>(state:RichLayoutFieldState<T>,numbers=false):RichToolbarReading{
 if(state.kind!=="uniform")return {kind:state.kind};
 return {kind:"uniform",values:numbers?{mode:state.value===null?"inherit":"set",value:state.value===null?"":String(state.value)}:{value:state.value===null?"inherit":String(state.value)}};
}
/** Definitions read native state and produce intent only; no AST targets, changes or conflict resolution. */
export function blockLayoutControls(core:LayoutReader):readonly BlockLayoutControl[]{
 const language=core.richLanguageVersion?.();if((language!==3&&language!==4)||core.supportsBlockLayout?.()!==true||!core.blockLayoutState)throw Error("Use an explicitly selected matching layout V3 or V4 owner");
 const current=()=>core.blockLayoutState!();
 const choose=(id:string,label:string,key:"alignment"|"direction",options:readonly {value:string;label:string}[]):BlockLayoutControl=>({id,label,fields:[{id:"value",label,type:"select",options:[{value:"inherit",label:"Inherit"},...options]}],mixedHint:"Mixed values: choose one explicit value or Inherit for all covered blocks.",read:()=>reading(current()[key]),patch:fields=>{
  const value=fields["value"];if(!value)return null;if(value!=="inherit"&&!options.some(option=>option.value===value))throw new TypeError("Unknown layout choice");return {[key]:value==="inherit"?null:value} as RichBlockLayoutPatch;
 }});
 const number=(id:string,label:string,key:"indent"|"lineHeightPercent",min:number,max:number):BlockLayoutControl=>({id,label,fields:[{id:"mode",label:`${label} source`,type:"select",options:[{value:"inherit",label:"Inherit"},{value:"set",label:"Explicit value"}]},{id:"value",label,type:"number",min,max,placeholder:`${min}–${max}`,enabledWhen:{field:"mode",value:"set"}}],mixedHint:"Mixed values: choose Inherit to reset this field, or Explicit value and a whole number. Other layout fields stay unchanged.",read:()=>reading(current()[key],true),patch:fields=>{
  const mode=fields["mode"];if(!mode)return null;if(mode==="inherit")return {[key]:null};if(mode!=="set")throw new TypeError("Unknown layout source");return {[key]:numeric(fields["value"],min,max)};
 }});
 return Object.freeze([
  choose("block-alignment","Alignment","alignment",[{value:"start",label:"Start"},{value:"center",label:"Center"},{value:"end",label:"End"},{value:"justify",label:"Justify"},{value:"left",label:"Left (physical)"},{value:"right",label:"Right (physical)"}]),
  choose("block-direction","Text direction","direction",[{value:"ltr",label:"Left to right"},{value:"rtl",label:"Right to left"},{value:"auto",label:"Automatic"}]),
  number("block-indent","Block indentation","indent",0,12),number("block-line-height","Line spacing percent","lineHeightPercent",100,300),
  {id:"reset-block-layout",label:"Reset block layout",read:()=>({kind:current().blocks==="0"?"unavailable":"uniform"}),patch:()=>({alignment:null,direction:null,indent:null,lineHeightPercent:null})} satisfies BlockLayoutControl,
 ]);
}
/** Familiar physical alignment shortcuts; Start/End remain distinct logical choices. */
export function blockLayoutShortcut(event:Pick<KeyboardEvent,"key"|"shiftKey"|"altKey"|"metaKey"|"ctrlKey">):NonNullable<RichBlockLayoutPatch["alignment"]>|undefined{
 if(!(event.metaKey||event.ctrlKey)||!event.shiftKey||event.altKey)return undefined;
 return ({l:"left",e:"center",r:"right",j:"justify"} as const)[event.key.toLowerCase() as "l"|"e"|"r"|"j"];
}
