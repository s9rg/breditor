/** DOM-free standard control semantics. Rust supplies state and effective caret formats. */
import {resolveInlineFormatRenderAttributes} from "@breditor/browser/presentation";
import type {FormatLiteral,RichInlineFormatState,RichInlineFormatStateRead,RichSelectionFormatStateRead,RichSelectionFormatChange} from "./core.js";
import {requireRichInlinePresentation,richInlineFormatDescriptor,type RichInlinePresentation} from "./inline_presentation.js";
import {createStandardRichInlinePresentationV1,standardInlineKindsV1 as k,standardInlinePropertiesV1 as p} from "./standard_inline_v1.js";
import {richTextLanguageFormat} from "./text_language.js";
import type {RichToolbarField,RichToolbarReading} from "./toolbar_control_view.js";
export type StandardInlineChange={kind:"set";format:FormatLiteral}|{kind:"remove";format:string}|{kind:"patch";format:FormatLiteral;properties:readonly string[]};
export interface StandardInlineReader {inlineFormatState(kind:string):RichInlineFormatStateRead;caretFormats?():readonly FormatLiteral[];supportsStandardInlineControls?():boolean;supportsInlinePropertyPatches?():boolean}
export interface StandardSelectionInlineReader extends Omit<StandardInlineReader,"inlineFormatState"> {supportsSelectionFormatting?():boolean;selectionFormatState?(kind:string):RichSelectionFormatStateRead}
/** One host-configured highlight choice, `#rrggbb`. */
export interface StandardHighlightColor {readonly label:string;readonly color:string}
/**
 * Optional highlight policy of the stock controls (docs/CLEAR_INLINE_FORMATTING.md, "Highlight").
 * Highlight is the existing RGB24 `breditor-inline/background-color` format: the schema still admits every
 * RGB24 value, so this shapes only what the toolbar offers. `color` is what the one-click Highlight button and
 * Mod+Shift+H apply (default `#ffff00`, the colour HTML `<mark>` imports as). `colors` turns the Background
 * color field into a choice of exactly these entries; the first is the default when `color` is omitted.
 */
export interface StandardHighlightOptions {readonly color?:string;readonly colors?:readonly StandardHighlightColor[]}
export interface StandardInlineControlOptions {readonly highlight?:StandardHighlightOptions}
/** The default highlight: the same yellow an imported HTML `<mark>` carries. */
export const standardDefaultHighlightColor="#ffff00";
const hex=/^#[0-9a-fA-F]{6}$/;
const plain=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==="object"&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
/** Snapshot and validate the options before any control exists; unknown keys and bad colours are TypeErrors. */
function resolveHighlight(options:unknown):{readonly rgb:number;readonly colors:readonly StandardHighlightColor[]|null}{
 if(!plain(options))throw new TypeError("Expected plain standard inline control options");
 for(const key of Object.keys(options))if(key!=="highlight")throw new TypeError(`Unknown standard inline control option ${JSON.stringify(key)}`);
 const value=options["highlight"];if(value===undefined)return {rgb:Number.parseInt(standardDefaultHighlightColor.slice(1),16),colors:null};
 if(!plain(value))throw new TypeError("Expected a plain highlight option");
 for(const key of Object.keys(value))if(key!=="color"&&key!=="colors")throw new TypeError(`Unknown highlight option ${JSON.stringify(key)}`);
 const list=value["colors"];let colors:StandardHighlightColor[]|null=null;
 if(list!==undefined){
  if(!Array.isArray(list)||list.length<1||list.length>32)throw new TypeError("Highlight colors must list 1 through 32 entries");
  colors=list.map(entry=>{
   if(!plain(entry)||Object.keys(entry).some(key=>key!=="label"&&key!=="color"))throw new TypeError("Expected {label,color} highlight entries");
   const {label,color}=entry;
   if(typeof label!=="string"||!label.trim()||label.length>64)throw new TypeError("A highlight label must be 1 through 64 characters");
   if(typeof color!=="string"||!hex.test(color))throw new TypeError("A highlight color must be #RRGGBB");
   return Object.freeze({label,color:color.toLowerCase()});
  });
  if(new Set(colors.map(c=>c.color)).size!==colors.length)throw new TypeError("Highlight colors must be distinct");
 }
 const chosen=value["color"];
 if(chosen!==undefined&&(typeof chosen!=="string"||!hex.test(chosen)))throw new TypeError("The default highlight color must be #RRGGBB");
 const color=(typeof chosen==="string"?chosen:colors?.[0]?.color??standardDefaultHighlightColor).toLowerCase();
 if(colors&&!colors.some(c=>c.color===color))throw new TypeError("The default highlight color must be one of the configured colors");
 return {rgb:Number.parseInt(color.slice(1),16),colors:colors&&Object.freeze(colors)};
}
export interface StandardInlineControl {
 readonly id:string;readonly label:string;readonly shortcut?:string;readonly fields?:readonly RichToolbarField[];readonly mixedHint?:string;
 read():RichToolbarReading;changes(values:Readonly<Record<string,string>>):readonly StandardInlineChange[];
}
export function standardInlineControls(core:StandardInlineReader,presentation:RichInlinePresentation,options:StandardInlineControlOptions={}):readonly StandardInlineControl[]{
 return compileControls(core,presentation,"breditor/rich-inline-format-state",options);
}
/** Explicit native selection-state controls; never widen the original read-family contract. */
export function standardSelectionInlineControls(core:StandardSelectionInlineReader,presentation:RichInlinePresentation,options:StandardInlineControlOptions={}):readonly StandardInlineControl[]{
 if(core.supportsSelectionFormatting?.()!==true||!core.selectionFormatState)throw Error("Use a matching native selection-formatting owner");
 const read=core.selectionFormatState.bind(core);
 return compileControls({inlineFormatState:read,supportsStandardInlineControls:()=>core.supportsStandardInlineControls?.()===true,caretFormats:()=>{if(!core.caretFormats)throw Error("Caret format capability is unavailable");return core.caretFormats();},supportsInlinePropertyPatches:()=>true},presentation,"breditor/rich-selection-format-state",options);
}
function compileControls(core:Omit<StandardInlineReader,"inlineFormatState">&{inlineFormatState(kind:string):RichInlineFormatStateRead|RichSelectionFormatStateRead},presentation:RichInlinePresentation,expected:RichInlineFormatStateRead["format"]|RichSelectionFormatStateRead["format"],options:StandardInlineControlOptions):readonly StandardInlineControl[]{
 const highlight=resolveHighlight(options);
 if(core.supportsStandardInlineControls?.()!==true||!core.caretFormats)throw Error("Use a matching Rust owner with standard inline-control capabilities");
 requireRichInlinePresentation(presentation,presentation.schema);
 const names=new Set<string>(Object.values(k)),all=presentation.recipesOuterToInner.map(recipe=>richInlineFormatDescriptor(presentation,recipe.formatKind)!).sort((a,b)=>a.kind<b.kind?-1:1),extra=presentation.recipesOuterToInner.filter(recipe=>!names.has(recipe.formatKind)&&recipe.formatKind!==richTextLanguageFormat);
 // Reuse the versioned compiler's exact native-domain checks, not a second schema.
 createStandardRichInlinePresentationV1(JSON.stringify({format:"breditor/inline-format-catalog",formatVersion:1,schema:presentation.schema,formats:all}),extra.length?{recipes:extra}:undefined);
 const state=(kind:string):RichInlineFormatState=>{const r=core.inlineFormatState(kind),s=presentation.schema;if(r.format!==expected||r.formatVersion!==1||r.formatKind!==kind||r.schema.name!==s.name||r.schema.version!==s.version||r.schema.fingerprint!==s.fingerprint)throw Error("Toolbar and Rust schema bindings differ");return r.state;};state(k.strong);
 const literal=(type:string,properties:Readonly<Record<string,unknown>>={}):FormatLiteral=>({type,properties});
 const set=(format:FormatLiteral):StandardInlineChange=>({kind:"set",format});
 const remove=(format:string):StandardInlineChange=>({kind:"remove",format});
 const removals=(kind:string):readonly StandardInlineChange[]=>{const s=state(kind);return s.kind==="uniform"||s.kind==="mixed"?[remove(kind)]:[];};
 const active=(s:RichInlineFormatState)=>s.kind==="uniform"||(s.kind==="mixed"&&s.presentEverywhere);
 const reading=(kind:string,value:(format:FormatLiteral)=>Readonly<Record<string,string>>):RichToolbarReading=>{const s=state(kind);return {kind:s.kind,values:s.kind==="uniform"?value(s.format):{}};};
 const free:readonly [string,string,string,string?][]=[["bold","Bold",k.strong,"b"],["italic","Italic",k.italic,"i"],["underline","Underline",k.underline,"u"],["strike","Strike",k.strike,"shift+x"],["code","Inline code",k.code],["subscript","Subscript",k.subscript],["superscript","Superscript",k.superscript]];
 const controls:StandardInlineControl[]=free.map(([id,label,kind,shortcut])=>({id,label,...(shortcut?{shortcut}:{}),read(){const s=state(kind);return {kind:s.kind,pressed:s.kind==="mixed"&&!s.presentEverywhere?"mixed":active(s)};},changes(){if(active(state(kind)))return [remove(kind)];const opposite=kind===k.subscript?k.superscript:kind===k.superscript?k.subscript:null;return [...(opposite?removals(opposite):[]),set(literal(kind))];}}));
 // One-click highlight: a toggle over the typed background colour. Any present highlight colour counts as on,
 // so pressing it on a uniformly highlighted range removes the highlight; a partial range is "mixed" and applies.
 controls.push({id:"highlight",label:"Highlight",shortcut:"shift+h",read(){const s=state(k.backgroundColor);return {kind:s.kind,pressed:s.kind==="mixed"&&!s.presentEverywhere?"mixed":active(s)};},changes(){return active(state(k.backgroundColor))?[remove(k.backgroundColor)]:[set(literal(k.backgroundColor,{[p.rgb24]:highlight.rgb}))];}});
 const color=(id:string,label:string,kind:string):void=>{controls.push({id,label,fields:[{id:"value",label:`${label} (#RRGGBB)`,type:"text",maxLength:7,placeholder:"#RRGGBB"}],read:()=>reading(kind,f=>({value:`#${Number(f.properties[p.rgb24]).toString(16).padStart(6,"0")}`})),changes(v){if(!/^#[0-9a-fA-F]{6}$/.test(v["value"]??""))throw Error("Enter a six-digit #RRGGBB color");return [set(literal(kind,{[p.rgb24]:Number.parseInt(v["value"]!.slice(1),16)}))];}});};
 color("text-color","Text color",k.textColor);
 if(highlight.colors){const palette=highlight.colors;controls.push({id:"background-color",label:"Background color",fields:[{id:"value",label:"Highlight color",type:"select",options:palette.map(c=>({value:c.color,label:c.label}))}],read:()=>reading(k.backgroundColor,f=>({value:`#${Number(f.properties[p.rgb24]).toString(16).padStart(6,"0")}`})),changes(v){const value=(v["value"]??"").toLowerCase();if(!palette.some(c=>c.color===value))throw Error("Choose a configured highlight color");return [set(literal(k.backgroundColor,{[p.rgb24]:Number.parseInt(value.slice(1),16)}))];}});}
 else color("background-color","Background color",k.backgroundColor);
 controls.push({id:"text-size",label:"Text size",fields:[{id:"value",label:"Text size (px)",type:"number",min:8,max:96}],read:()=>reading(k.textSize,f=>({value:String(f.properties[p.pixels])})),changes(v){const input=v["value"]??"",n=Number(input);if(!/^\d+$/.test(input)||!Number.isInteger(n)||n<8||n>96)throw Error("Text size must be an integer from 8 through 96");return [set(literal(k.textSize,{[p.pixels]:n}))];}});
 controls.push({id:"font-family",label:"Font family",fields:[{id:"value",label:"Font family",type:"select",options:[{value:"1",label:"System"},{value:"2",label:"Sans serif"},{value:"3",label:"Serif"},{value:"4",label:"Monospace"}]}],read:()=>reading(k.fontFamily,f=>({value:String(f.properties[p.family])})),changes(v){if(!/^[1-4]$/.test(v["value"]??""))throw Error("Choose a font-family preset");return [set(literal(k.fontFamily,{[p.family]:Number(v["value"])}))];}});
 controls.push({id:"link",label:"Link",shortcut:"k",mixedHint:"Mixed links: leave a field blank to keep each existing value. Every selected character must already be linked.",fields:[{id:"href",label:"Link URL",type:"text",maxLength:2048,placeholder:"https://…"},{id:"target",label:"Link opens in",type:"select",options:[{value:"same",label:"Same window"},{value:"new",label:"New window"}]}],read(){const r=reading(k.link,f=>({href:String(f.properties[p.href]),target:f.properties[p.newWindow]?"new":"same"}));return r.kind==="unset"?{...r,values:{href:"",target:"same"}}:r;},changes(v){
  const href=v["href"]??"",target=v["target"]??"",s=state(k.link);
  if(target!==""&&target!=="same"&&target!=="new")throw Error("Choose a Link target");
  if(!href&&!target)throw Error("Enter a Link URL or choose a target");
  const format=literal(k.link,{[p.href]:href||"https://example.invalid/",[p.newWindow]:target==="new"});
  const attributes=resolveInlineFormatRenderAttributes({kind:"safeLinkV1",hrefProperty:p.href,openInNewWindowProperty:p.newWindow},Object.entries(format.properties).map(([name,value])=>({name,value:value as string|boolean})));
  if(href&&!attributes.some(a=>a.name==="href"))throw Error("Enter an absolute HTTP(S) URL without credentials or whitespace");
  if(href&&target)return [set(format)];
  if(s.kind!=="uniform"&&!(s.kind==="mixed"&&s.presentEverywhere))throw Error("Partial Link edits require every selected character to be linked; supply both fields to create links");
  if(core.supportsInlinePropertyPatches?.()!==true)throw Error("Use a matching Rust owner with inline property-patch support");
  return [{kind:"patch",format,properties:[href?p.href:p.newWindow]}];
 }});
 for(const [id,label,kind]of [["unlink","Unlink",k.link],["reset-text-color","Reset text color",k.textColor],["reset-background-color","Reset background color",k.backgroundColor],["reset-text-size","Reset text size",k.textSize],["reset-font-family","Reset font family",k.fontFamily]])controls.push({id:id!,label:label!,read:()=>({kind:state(kind!).kind}),changes:()=>removals(kind!)});
 controls.push({id:"clear-inline",label:"Clear standard formatting",read:()=>({kind:state(k.strong).kind}),changes:()=>Object.values(k).flatMap(removals)});
 return Object.freeze(controls.map(control=>Object.freeze(control)));
}
/** Preserve every inherited/custom format using the exact Rust caret read. */
export function pendingStandardFormats(core:StandardInlineReader,changes:readonly StandardInlineChange[]):readonly FormatLiteral[]{
 if(!core.caretFormats)throw Error("Caret format capability is unavailable");const formats=new Map(core.caretFormats().map(format=>[format.type,format]));
 for(const change of changes)if(change.kind==="remove")formats.delete(change.format);else if(change.kind==="set")formats.set(change.format.type,change.format);else{const previous=formats.get(change.format.type);if(!previous)throw Error("A property patch requires an existing caret format");const properties={...previous.properties};for(const name of change.properties){if(!Object.hasOwn(change.format.properties,name))throw Error("Property patch template is missing a field");properties[name]=change.format.properties[name];}formats.set(change.format.type,{type:change.format.type,properties});}
 return [...formats.values()].sort((a,b)=>a.type<b.type?-1:1);
}
/** A valid disabled-annotation literal; removal semantics depend on kind, not values. */
export function standardRemovalLiteral(kind:string):FormatLiteral {
 const properties=kind===k.link?{[p.href]:"https://example.invalid/",[p.newWindow]:false}:kind===k.textColor||kind===k.backgroundColor?{[p.rgb24]:0}:kind===k.textSize?{[p.pixels]:8}:kind===k.fontFamily?{[p.family]:1}:{};
 return {type:kind,properties};
}
/** Intent literals only; every interval and final semantic result is derived in Rust. */
export function selectionFormatChanges(changes:readonly StandardInlineChange[]):readonly RichSelectionFormatChange[]{
 return changes.map(change=>change.kind==="remove"?{kind:"remove",formatsJson:JSON.stringify([standardRemovalLiteral(change.format)])}:{kind:change.kind,formatsJson:JSON.stringify([change.format]),...(change.kind==="patch"?{properties:change.properties}:{})}) as readonly RichSelectionFormatChange[];
}
