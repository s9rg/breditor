/**
 * Opt-in named formatting presets: host-configured named inline styles ("Marker yellow", "Code-ish",
 * "Big red") and highlight presets (catalog case `named-formatting-presets@1`).
 *
 * A preset is only a validated, frozen bundle of existing typed standard-profile formats (marks, RGB24
 * text/background color, text size 8..96 and a font-family preset). It has no document identity: applying
 * it is one native `changeSelectionFormats` request (one selection-format change, one Undo step, locally
 * and in shared editors), the result is ordinary typed formats that export, replay and merge like any
 * other, and active/mixed state is derived from the Rust selection-format state of each kind. See
 * docs/FORMATTING_PRODUCTIVITY.md.
 */
import type {FormatLiteral,RichInlineFormatState} from "./core.js";
import {standardInlineKindsV1 as k,standardInlinePropertiesV1 as p} from "./standard_inline_v1.js";
import type {StandardInlineChange} from "./standard_inline_controls.js";

export type RichNamedPresetMark="bold"|"italic"|"underline"|"strike"|"code"|"subscript"|"superscript";
export type RichNamedPresetFont="system"|"sans"|"serif"|"mono";
export type RichNamedPresetGroup="style"|"highlight";
/** Host input for one preset. At least one format; values use the standard control domains. */
export interface RichNamedFormatPresetInput {
 /** Stable id `[a-z][a-z0-9-]{0,31}`, unique within its group; `remove` is reserved. */
 readonly id:string;
 /** Nonempty single-line display name, at most 64 characters. The host localizes it. */
 readonly label:string;
 readonly marks?:readonly RichNamedPresetMark[];
 /** `#RRGGBB`. */
 readonly textColor?:string;
 /** `#RRGGBB`. */
 readonly backgroundColor?:string;
 /** Integer pixels 8..96. */
 readonly textSize?:number;
 readonly fontFamily?:RichNamedPresetFont;
}
export interface RichNamedFormatPresetOptions {
 /** Named inline styles (the `named-styles` dropdown). */
 readonly styles?:readonly RichNamedFormatPresetInput[];
 /** Highlight presets (the `highlight-presets` dropdown). */
 readonly highlights?:readonly RichNamedFormatPresetInput[];
}
/** One compiled preset: its typed formats sorted by kind. */
export interface RichNamedFormatPreset {
 readonly id:string;readonly label:string;readonly group:RichNamedPresetGroup;readonly formats:readonly FormatLiteral[];
}
export interface RichNamedFormatPresetRegistry {
 readonly styles:readonly RichNamedFormatPreset[];readonly highlights:readonly RichNamedFormatPreset[];
}
/** "unavailable": the selection cannot carry inline formats (for example a document selection). */
export type RichNamedPresetState="active"|"mixed"|"inactive"|"unavailable";

export const RICH_NAMED_PRESET_MAX_PER_GROUP=32;
/** The reserved dropdown value of the remove choice. */
export const RICH_NAMED_PRESET_REMOVE="remove";

/** CKEditor-like highlight defaults a host may pass as `highlights`; never installed implicitly. */
export const richDefaultHighlightPresets:readonly RichNamedFormatPresetInput[]=Object.freeze([
 {id:"marker-yellow",label:"Yellow marker",backgroundColor:"#FDFD77"},
 {id:"marker-green",label:"Green marker",backgroundColor:"#62F962"},
 {id:"marker-pink",label:"Pink marker",backgroundColor:"#FC7899"},
 {id:"marker-blue",label:"Blue marker",backgroundColor:"#72CCFD"},
 {id:"pen-red",label:"Red pen",textColor:"#E71313"},
 {id:"pen-green",label:"Green pen",textColor:"#128A00"},
].map(preset=>Object.freeze(preset)));

const markKinds:Readonly<Record<RichNamedPresetMark,string>>=Object.freeze({bold:k.strong,italic:k.italic,underline:k.underline,strike:k.strike,code:k.code,subscript:k.subscript,superscript:k.superscript});
const fontValues:Readonly<Record<RichNamedPresetFont,number>>=Object.freeze({system:1,sans:2,serif:3,mono:4});
const inputKeys=["id","label","marks","textColor","backgroundColor","textSize","fontFamily"];

function plain(value:unknown,where:string):Record<string,unknown>{
 if(!value||typeof value!=="object"||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new TypeError(`Expected a plain object for ${where}`);
 for(const key of Object.keys(value))if(!("value" in Object.getOwnPropertyDescriptor(value,key)!))throw new TypeError(`${where} must not use accessors`);
 return value as Record<string,unknown>;
}
function rgb(value:unknown,where:string):number{
 if(typeof value!=="string"||!/^#[0-9a-fA-F]{6}$/.test(value))throw new TypeError(`${where} must be a six-digit #RRGGBB color`);
 return Number.parseInt(value.slice(1),16);
}
function compilePreset(input:unknown,group:RichNamedPresetGroup,where:string):RichNamedFormatPreset{
 const value=plain(input,where);
 for(const key of Object.keys(value))if(!inputKeys.includes(key))throw new TypeError(`Unknown ${where} field ${JSON.stringify(key)}`);
 const id=value["id"],label=value["label"];
 if(typeof id!=="string"||!/^[a-z][a-z0-9-]{0,31}$/.test(id)||id===RICH_NAMED_PRESET_REMOVE)throw new TypeError(`${where} id must match [a-z][a-z0-9-]{0,31} and must not be "remove"`);
 if(typeof label!=="string"||!label.trim()||label.length>64||/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(label))throw new TypeError(`${where} label must be a nonempty single line of at most 64 characters`);
 const formats:FormatLiteral[]=[];
 const marks=value["marks"];
 if(marks!==undefined){
  if(!Array.isArray(marks))throw new TypeError(`${where} marks must be an array`);
  const seen=new Set<string>();
  for(const mark of marks){
   if(typeof mark!=="string"||!Object.hasOwn(markKinds,mark))throw new TypeError(`${where} has unknown mark ${JSON.stringify(mark)}`);
   if(seen.has(mark))throw new TypeError(`${where} repeats mark ${JSON.stringify(mark)}`);
   seen.add(mark);formats.push({type:markKinds[mark as RichNamedPresetMark],properties:{}});
  }
  if(seen.has("subscript")&&seen.has("superscript"))throw new TypeError(`${where} cannot combine subscript and superscript`);
 }
 if(value["textColor"]!==undefined)formats.push({type:k.textColor,properties:{[p.rgb24]:rgb(value["textColor"],`${where} textColor`)}});
 if(value["backgroundColor"]!==undefined)formats.push({type:k.backgroundColor,properties:{[p.rgb24]:rgb(value["backgroundColor"],`${where} backgroundColor`)}});
 const size=value["textSize"];
 if(size!==undefined){if(typeof size!=="number"||!Number.isInteger(size)||size<8||size>96)throw new TypeError(`${where} textSize must be an integer from 8 through 96`);formats.push({type:k.textSize,properties:{[p.pixels]:size}});}
 const font=value["fontFamily"];
 if(font!==undefined){if(typeof font!=="string"||!Object.hasOwn(fontValues,font))throw new TypeError(`${where} fontFamily must be system, sans, serif or mono`);formats.push({type:k.fontFamily,properties:{[p.family]:fontValues[font as RichNamedPresetFont]}});}
 if(!formats.length)throw new TypeError(`${where} must set at least one format`);
 formats.sort((a,b)=>a.type<b.type?-1:a.type>b.type?1:0);
 return Object.freeze({id,label,group,formats:Object.freeze(formats.map(format=>Object.freeze({type:format.type,properties:Object.freeze({...format.properties})})))});
}
function compileGroup(input:unknown,group:RichNamedPresetGroup,name:string):readonly RichNamedFormatPreset[]{
 if(input===undefined)return Object.freeze([]);
 if(!Array.isArray(input))throw new TypeError(`Named presets ${name} must be an array`);
 if(input.length>RICH_NAMED_PRESET_MAX_PER_GROUP)throw new TypeError(`At most ${RICH_NAMED_PRESET_MAX_PER_GROUP} named ${name}`);
 const presets=input.map((preset,index)=>compilePreset(preset,group,`named ${name}[${index}]`)),ids=new Set<string>();
 for(const preset of presets){if(ids.has(preset.id))throw new TypeError(`Duplicate named preset id ${JSON.stringify(preset.id)} in ${name}`);ids.add(preset.id);}
 return Object.freeze(presets);
}
/** Validate and freeze a host preset registry. Throws a TypeError naming the first invalid entry. */
export function createNamedFormatPresetRegistry(options:RichNamedFormatPresetOptions):RichNamedFormatPresetRegistry{
 const value=plain(options,"named-preset options");
 for(const key of Object.keys(value))if(key!=="styles"&&key!=="highlights")throw new TypeError(`Unknown named-preset option ${JSON.stringify(key)}`);
 return Object.freeze({styles:compileGroup(value["styles"],"style","styles"),highlights:compileGroup(value["highlights"],"highlight","highlights")});
}

/** Reads the native selection-format state of one kind (Rust owns the answer). */
export type RichNamedPresetStateReader=(kind:string)=>RichInlineFormatState;
function sameFormat(a:FormatLiteral,b:FormatLiteral):boolean{
 if(a.type!==b.type)return false;
 const left=Object.keys(a.properties),right=Object.keys(b.properties);
 return left.length===right.length&&left.every(key=>Object.hasOwn(b.properties,key)&&a.properties[key]===b.properties[key]);
}
/** The selection carries exactly this format everywhere. */
function matches(state:RichInlineFormatState,format:FormatLiteral):boolean{
 return state.kind==="uniform"&&sameFormat(state.format,format)||state.kind==="mixed"&&state.presentEverywhere&&Object.keys(format.properties).length===0;
}
/** Part of the selection may carry this format: a partial flag or mixed values of the kind. */
function partial(state:RichInlineFormatState,format:FormatLiteral):boolean{return matches(state,format)||state.kind==="mixed";}
/**
 * Derive a preset's state from native per-kind reads: `active` when every format of the preset is uniform
 * with the preset's exact value across the selection (or the caret's effective formats), `mixed` when some
 * format is present on part of the selection or a kind it sets has mixed values, otherwise `inactive`.
 */
export function namedFormatPresetState(read:RichNamedPresetStateReader,preset:RichNamedFormatPreset):RichNamedPresetState{
 const states=preset.formats.map(format=>read(format.type));
 if(states.some(state=>state.kind==="unavailable"))return "unavailable";
 if(preset.formats.every((format,index)=>matches(states[index]!,format)))return "active";
 return preset.formats.some((format,index)=>partial(states[index]!,format))?"mixed":"inactive";
}
/**
 * Apply: set every preset format the selection does not already carry exactly, removing the opposite
 * script first. Other formats are kept, so presets of different kinds compose. Empty when nothing changes.
 */
export function namedFormatPresetApplyChanges(read:RichNamedPresetStateReader,preset:RichNamedFormatPreset):readonly StandardInlineChange[]{
 if(namedFormatPresetState(read,preset)==="unavailable")return [];
 const removes:StandardInlineChange[]=[],sets:StandardInlineChange[]=[];
 for(const format of preset.formats){
  if(matches(read(format.type),format))continue;
  const opposite=format.type===k.subscript?k.superscript:format.type===k.superscript?k.subscript:null;
  if(opposite&&read(opposite).kind!=="unset")removes.push({kind:"remove",format:opposite});
  sets.push({kind:"set",format});
 }
 return [...removes,...sets];
}
/**
 * Remove: for every given preset that is active or mixed, remove each kind it sets whose state matches the
 * preset's value or is mixed. A kind uniformly carrying a different value (the author's own red text) is
 * kept. Empty when no preset is present.
 */
export function namedFormatPresetRemoveChanges(read:RichNamedPresetStateReader,presets:readonly RichNamedFormatPreset[]):readonly StandardInlineChange[]{
 const kinds=new Set<string>();
 for(const preset of presets){
  const state=namedFormatPresetState(read,preset);if(state!=="active"&&state!=="mixed")continue;
  for(const format of preset.formats)if(partial(read(format.type),format))kinds.add(format.type);
 }
 return [...kinds].sort().map(kind=>({kind:"remove",format:kind}));
}
