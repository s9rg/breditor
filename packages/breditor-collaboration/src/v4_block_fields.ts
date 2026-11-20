/** Shared rich V4 block fields: ordered-list numbering, bookmarks with link-preserving rename and
 * internal links, and section open state. Intent is snapshotted to primitives here; Rust owns
 * admission, uniqueness, conflict order and history (one Undo step per control). */
import {id,property,textTargets,listNumberStyles,listNumberingOf,bookmarkOf,bookmarkNames,isBookmarkName,type ElementNode,type RichPresentationModel,type RichToolbarField,type RichToolbarReading} from "@breditor/experimental-rich-content/rendering";
import type {ActionContext,SharedToolbarControl} from "./actions.js";
import type {SharedCommand,SharedSelectionPolicy} from "./types.js";
import type {SharedRichEditor} from "./core.js";

export type SharedListNumberStyle=typeof listNumberStyles[number];
/** Same intent as the local `setListNumbering`: omitted fields keep, `style:null` clears, `reversed:false` removes. */
export interface SharedListNumberingIntent {list:string;style?:SharedListNumberStyle|null;reversed?:boolean;start?:number}
export interface SharedSetBookmarkIntent {block:string;name:string|null}
export interface SharedRenameBookmarkIntent {from:string;to:string}
/** Exact inventory in document order; a broken link targets a name no block carries. */
export interface SharedBookmarkIndex {
 readonly bookmarks:readonly {readonly name:string;readonly block:string}[];
 readonly links:readonly {readonly block:string;readonly target:string}[];
 readonly brokenLinks:readonly {readonly block:string;readonly target:string}[];
}
const MAX_ORDINAL=2_147_483_647;
function plain(input:unknown,required:readonly string[],optional:readonly string[],what:string):Record<string,unknown>{
 if(!input||typeof input!=="object"||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw new TypeError(`Expected plain ${what} intent`);
 const own=Reflect.ownKeys(input);
 if(own.some(key=>typeof key!=="string"||(!required.includes(key)&&!optional.includes(key)))||required.some(key=>!own.includes(key)))throw new TypeError(`${what} intent has the fields ${[...required,...optional].join(", ")}`);
 return input as Record<string,unknown>;
}
/** Lower numbering intent to one native group: an optional start change (`set_list_kind`) and the
 * owned style/reversal fields (`set_list_numbering`). Both publish as one Undo step. */
export function sharedListNumberingCommands(input:unknown):SharedCommand[]{
 const r=plain(input,["list"],["style","reversed","start"],"List numbering"),list=r["list"],style=r["style"],reversed=r["reversed"],start=r["start"];
 if(typeof list!=="string")throw new TypeError("List numbering list must be a block identity string");
 if(style!==undefined&&style!==null&&!(listNumberStyles as readonly unknown[]).includes(style))throw new TypeError("Unknown numbering style");
 if(reversed!==undefined&&typeof reversed!=="boolean")throw new TypeError("Counting order must be a Boolean");
 if(start!==undefined&&(typeof start!=="number"||!Number.isSafeInteger(start)||start<1||start>MAX_ORDINAL))throw new TypeError("Starting number is outside its supported range");
 const commands:SharedCommand[]=[];
 if(start!==undefined)commands.push({kind:"set_list_kind",data:{container:list,style:{kind:"ordered",start}}});
 if(style!==undefined||reversed!==undefined)commands.push({kind:"set_list_numbering",data:{list,style:style===undefined?"keep":style===null?"clear":{set:style as SharedListNumberStyle},reversed:reversed===undefined?null:reversed}});
 if(!commands.length)throw new TypeError("List numbering intent changes nothing");
 return commands;
}
export function encodeSharedSetBookmark(input:unknown):SharedCommand{
 const r=plain(input,["block","name"],[],"Bookmark"),block=r["block"],name=r["name"];
 if(typeof block!=="string")throw new TypeError("Bookmark block must be a block identity string");
 if(name!==null&&typeof name!=="string")throw new TypeError("Bookmark name must be a primitive string or null");
 return {kind:"set_bookmark",data:{block,name}};
}
export function encodeSharedRenameBookmark(input:unknown):SharedCommand{
 const r=plain(input,["from","to"],[],"Bookmark rename"),from=r["from"],to=r["to"];
 if(typeof from!=="string"||typeof to!=="string")throw new TypeError("Bookmark rename names must be primitive strings");
 return {kind:"rename_bookmark",data:{from,to}};
}
export function parseSharedBookmarkIndex(json:string):SharedBookmarkIndex{
 const value=JSON.parse(json) as SharedBookmarkIndex;
 const pairs=(list:unknown,a:string,b:string)=>Array.isArray(list)&&list.every(item=>item&&typeof item==="object"&&typeof (item as Record<string,unknown>)[a]==="string"&&typeof (item as Record<string,unknown>)[b]==="string");
 if(!value||!pairs(value.bookmarks,"name","block")||!pairs(value.links,"block","target")||!pairs(value.brokenLinks,"block","target"))throw new TypeError("Invalid native bookmark index");
 return Object.freeze({bookmarks:Object.freeze(value.bookmarks.map(e=>Object.freeze({...e}))),links:Object.freeze(value.links.map(e=>Object.freeze({...e}))),brokenLinks:Object.freeze(value.brokenLinks.map(e=>Object.freeze({...e})))});
}

const listKinds=new Set(["breditor/bullet-list","breditor/ordered-list","breditor/task-list"]);
const bookmarkKinds=new Set(["breditor/paragraph","breditor/heading","breditor/code-block"]);
function nearestList(m:RichPresentationModel,block:string):ElementNode|undefined{let n=m.nodes.get(block);while(n){if(listKinds.has(n.type))return n;n=m.parents.get(id(n));}return undefined;}
/** The ordered list that directly owns the whole selection (a nested bullet/task list is its own target). */
export function sharedSelectedOrderedList(m:RichPresentationModel):ElementNode|undefined{
 const s=m.view.selection;
 if(s?.kind==="node"){const n=m.nodes.get(s.block);return n?.type==="breditor/ordered-list"?n:n?nearestList(m,id(n)):undefined;}
 if(s?.kind!=="text")return undefined;const a=nearestList(m,s.anchor.block),f=nearestList(m,s.focus.block);
 return a&&a===f&&a.type==="breditor/ordered-list"?a:undefined;
}
/** The one paragraph, heading or code block holding the whole text selection. */
export function sharedBookmarkTarget(m:RichPresentationModel):ElementNode|undefined{
 const s=m.view.selection;if(s?.kind!=="text"||s.anchor.block!==s.focus.block)return undefined;
 const n=m.nodes.get(s.focus.block);return n&&bookmarkKinds.has(n.type)?n:undefined;
}
/** Nearest section owning the selection. */
export function sharedSelectedDetails(m:RichPresentationModel):ElementNode|undefined{
 const s=m.view.selection;let n=s?.kind==="node"?m.nodes.get(s.block):s?.kind==="text"?m.nodes.get(s.focus.block):undefined;
 while(n){if(n.type==="breditor/details")return n;n=m.parents.get(id(n));}return undefined;
}
const linkFormat=(name:string)=>({type:"breditor-inline/link",properties:{"breditor-inline/href":`#${name}`,"breditor-inline/new-window":false}});
const styleOptions=[{value:"default",label:"Default"},{value:"decimal",label:"1, 2, 3"},{value:"lower-alpha",label:"a, b, c"},{value:"upper-alpha",label:"A, B, C"},{value:"lower-roman",label:"i, ii, iii"},{value:"upper-roman",label:"I, II, III"}];

/**
 * Shared V4 controls with the local V4 labels and semantics: **List numbering**, **Bookmark** (sets a
 * new name, or renames an existing one so every internal link follows), **Remove bookmark**, **Link to
 * bookmark** and **Expand/Collapse section**. Each run is one native group, so one Undo step.
 */
export function sharedV4BlockFieldControls<P extends SharedSelectionPolicy="original">(core:SharedRichEditor<P>):readonly SharedToolbarControl<P>[]{
 if(!core.supportsListNumbering()||!core.supportsBookmarks()||!core.supportsDetails())throw Error("Shared V4 block-field controls require a matching native V4 owner");
 const model=(c:ActionContext<P>)=>c.model as RichPresentationModel;
 const bound=(c:ActionContext<P>)=>{if(c.core!==core)throw Error("V4 block-field control belongs to a different Rust owner");};
 const linkable=(m:RichPresentationModel)=>m.view.selection?.kind==="text"&&textTargets(m).length>0&&bookmarkNames(m.root).length>0;
 return Object.freeze([
  {id:"list-numbering",label:"List numbering",owner:core,mixedHint:"Numbering applies to the whole ordered list that contains the selection.",
   fields:Object.freeze([{id:"style",label:"Numbering style",type:"select",options:styleOptions},{id:"order",label:"Counting order",type:"select",options:[{value:"ascending",label:"Ascending"},{value:"reversed",label:"Reversed (counts down)"}]},{id:"start",label:"Start at",type:"number",min:1,max:MAX_ORDINAL,placeholder:"1"}] satisfies RichToolbarField[]),
   read:(c:ActionContext<P>):RichToolbarReading=>{const list=sharedSelectedOrderedList(model(c));if(!list)return {kind:"unavailable"};const v=listNumberingOf(list)!;return {kind:"uniform",values:{style:v.style===undefined?"default":listNumberStyles[v.style-1]!,order:v.reversed?"reversed":"ascending",start:String(v.start)}};},
   enabled:c=>sharedSelectedOrderedList(model(c))!==undefined,
   run(c,_value,fields={}){
    bound(c);const list=sharedSelectedOrderedList(model(c));if(!list)return;const current=listNumberingOf(list)!,intent:SharedListNumberingIntent={list:id(list)};
    const style=fields["style"],order=fields["order"],start=fields["start"];
    if(style){if(style!=="default"&&!(listNumberStyles as readonly string[]).includes(style))throw new TypeError("Unknown numbering style");const next=style==="default"?undefined:listNumberStyles.indexOf(style as SharedListNumberStyle)+1;if(next!==current.style)intent.style=style==="default"?null:style as SharedListNumberStyle;}
    if(order){if(order!=="ascending"&&order!=="reversed")throw new TypeError("Unknown counting order");if((order==="reversed")!==current.reversed)intent.reversed=order==="reversed";}
    if(start){if(!/^[1-9][0-9]*$/.test(start))throw new TypeError("Enter a whole starting number");const n=Number(start);if(!Number.isSafeInteger(n)||n>MAX_ORDINAL)throw new TypeError("Starting number is outside its supported range");if(n!==current.start)intent.start=n;}
    if(Object.keys(intent).length>1)core.setListNumbering(intent,c.revision);
   }},
  {id:"bookmark",label:"Bookmark",owner:core,mixedHint:"Renaming a bookmark updates every link to it.",
   fields:[{id:"name",label:"Bookmark name",type:"text",maxLength:64,placeholder:"section-name"}],
   read:(c:ActionContext<P>):RichToolbarReading=>{const n=sharedBookmarkTarget(model(c));if(!n)return {kind:"unavailable"};const name=bookmarkOf(n);return name?{kind:"uniform",values:{name}}:{kind:"unset",values:{name:""}};},
   enabled:c=>sharedBookmarkTarget(model(c))!==undefined,
   run(c,_value,fields={}){
    bound(c);const m=model(c),n=sharedBookmarkTarget(m);if(!n)return;const input=(fields["name"]??"").trim();
    if(!input)throw Error("Enter a bookmark name, or use Remove bookmark");
    if(!isBookmarkName(input))throw Error("A bookmark name starts with a letter and uses at most 64 letters, digits, hyphens or underscores");
    const current=bookmarkOf(n);if(input===current)return;
    if(bookmarkNames(m.root).includes(input))throw Error("Another block already uses this bookmark name");
    if(current)core.renameBookmark({from:current,to:input},c.revision);else core.setBookmark({block:id(n),name:input},c.revision);
   }},
  {id:"remove-bookmark",label:"Remove bookmark",owner:core,
   read:c=>{const n=sharedBookmarkTarget(model(c));return n?{kind:bookmarkOf(n)?"uniform":"unset"}:{kind:"unavailable"};},
   enabled:c=>{const n=sharedBookmarkTarget(model(c));return n!==undefined&&bookmarkOf(n)!==undefined;},
   run(c){bound(c);const n=sharedBookmarkTarget(model(c));if(n&&bookmarkOf(n))core.setBookmark({block:id(n),name:null},c.revision);}},
  {id:"link-bookmark",label:"Link to bookmark",owner:core,mixedHint:"Links the selected text to a bookmark in this document.",
   fields:[{id:"target",label:"Bookmark",type:"select",options:[]}],
   read:(c:ActionContext<P>):RichToolbarReading=>{const m=model(c);if(!linkable(m))return {kind:"unavailable"};return {kind:"unset",values:{target:""},options:{target:bookmarkNames(m.root).map(name=>({value:name,label:name}))}};},
   enabled:c=>linkable(model(c)),
   run(c,_value,fields={}){
    bound(c);const m=model(c),target=fields["target"]??"";if(!bookmarkNames(m.root).includes(target))throw Error("Choose an existing bookmark");
    const format=linkFormat(target);
    if(core.supportsSelectionFormatting()){core.changeSelectionFormats([{kind:"set",formatsJson:JSON.stringify([format])}],c.revision);return;}
    const commands=textTargets(m).map(t=>({kind:"set_format" as const,data:{block:t.block,offset:Number(t.start),length:Number(t.end)-Number(t.start),format,enabled:true}})).filter(op=>op.data.length>0);
    if(commands.length)core.dispatch({commands},c.revision);
   }},
  {id:"details-open",label:"Expand/Collapse section",owner:core,
   read:c=>{const n=sharedSelectedDetails(model(c));return n?{kind:"uniform",pressed:property(n,"details-open")===true}:{kind:"unavailable"};},
   enabled:c=>sharedSelectedDetails(model(c))!==undefined,
   run(c){bound(c);const n=sharedSelectedDetails(model(c));if(n)core.setDetailsOpen(id(n),property(n,"details-open")!==true,c.revision);}},
 ] satisfies SharedToolbarControl<P>[]);
}
