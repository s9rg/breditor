/** DOM-free standard control semantics. Rust supplies state and effective caret formats. */
import {resolveInlineFormatRenderAttributes} from "@breditor/browser/presentation";
import type {FormatLiteral,RichInlineFormatState,RichInlineFormatStateRead} from "./core.js";
import {requireRichInlinePresentation,richInlineFormatDescriptor,type RichInlinePresentation} from "./inline_presentation.js";
import {createStandardRichInlinePresentationV1,standardInlineKindsV1 as k,standardInlinePropertiesV1 as p} from "./standard_inline_v1.js";
import type {RichToolbarField,RichToolbarReading} from "./toolbar_control_view.js";
export type StandardInlineChange={kind:"set";format:FormatLiteral}|{kind:"remove";format:string};
export interface StandardInlineReader {inlineFormatState(kind:string):RichInlineFormatStateRead;caretFormats?():readonly FormatLiteral[];supportsStandardInlineControls?():boolean}
export interface StandardInlineControl {
 readonly id:string;readonly label:string;readonly shortcut?:string;readonly fields?:readonly RichToolbarField[];
 read():RichToolbarReading;changes(values:Readonly<Record<string,string>>):readonly StandardInlineChange[];
}
export function standardInlineControls(core:StandardInlineReader,presentation:RichInlinePresentation):readonly StandardInlineControl[]{
 if(core.supportsStandardInlineControls?.()!==true||!core.caretFormats)throw Error("Use a matching Rust owner with standard inline-control capabilities");
 requireRichInlinePresentation(presentation,presentation.schema);
 const names=new Set<string>(Object.values(k)),all=presentation.recipesOuterToInner.map(recipe=>richInlineFormatDescriptor(presentation,recipe.formatKind)!).sort((a,b)=>a.kind<b.kind?-1:1),extra=presentation.recipesOuterToInner.filter(recipe=>!names.has(recipe.formatKind));
 // Reuse the versioned compiler's exact native-domain checks, not a second schema.
 createStandardRichInlinePresentationV1(JSON.stringify({format:"breditor/inline-format-catalog",formatVersion:1,schema:presentation.schema,formats:all}),extra.length?{recipes:extra}:undefined);
 const state=(kind:string):RichInlineFormatState=>{const r=core.inlineFormatState(kind),s=presentation.schema;if(r.format!=="breditor/rich-inline-format-state"||r.formatVersion!==1||r.formatKind!==kind||r.schema.name!==s.name||r.schema.version!==s.version||r.schema.fingerprint!==s.fingerprint)throw Error("Toolbar and Rust schema bindings differ");return r.state;};state(k.strong);
 const literal=(type:string,properties:Readonly<Record<string,unknown>>={}):FormatLiteral=>({type,properties});
 const set=(format:FormatLiteral):StandardInlineChange=>({kind:"set",format});
 const remove=(format:string):StandardInlineChange=>({kind:"remove",format});
 const removals=(kind:string):readonly StandardInlineChange[]=>{const s=state(kind);return s.kind==="uniform"||s.kind==="mixed"?[remove(kind)]:[];};
 const active=(s:RichInlineFormatState)=>s.kind==="uniform"||(s.kind==="mixed"&&s.presentEverywhere);
 const reading=(kind:string,value:(format:FormatLiteral)=>Readonly<Record<string,string>>):RichToolbarReading=>{const s=state(kind);return {kind:s.kind,values:s.kind==="uniform"?value(s.format):{}};};
 const free:readonly [string,string,string,string?][]=[["bold","Bold",k.strong,"b"],["italic","Italic",k.italic,"i"],["underline","Underline",k.underline,"u"],["strike","Strike",k.strike,"shift+x"],["code","Inline code",k.code],["subscript","Subscript",k.subscript],["superscript","Superscript",k.superscript]];
 const controls:StandardInlineControl[]=free.map(([id,label,kind,shortcut])=>({id,label,...(shortcut?{shortcut}:{}),read(){const s=state(kind);return {kind:s.kind,pressed:s.kind==="mixed"&&!s.presentEverywhere?"mixed":active(s)};},changes(){if(active(state(kind)))return [remove(kind)];const opposite=kind===k.subscript?k.superscript:kind===k.superscript?k.subscript:null;return [...(opposite?removals(opposite):[]),set(literal(kind))];}}));
 const color=(id:string,label:string,kind:string):void=>{controls.push({id,label,fields:[{id:"value",label:`${label} (#RRGGBB)`,type:"text",maxLength:7,placeholder:"#RRGGBB"}],read:()=>reading(kind,f=>({value:`#${Number(f.properties[p.rgb24]).toString(16).padStart(6,"0")}`})),changes(v){if(!/^#[0-9a-fA-F]{6}$/.test(v["value"]??""))throw Error("Enter a six-digit #RRGGBB color");return [set(literal(kind,{[p.rgb24]:Number.parseInt(v["value"]!.slice(1),16)}))];}});};
 color("text-color","Text color",k.textColor);color("background-color","Background color",k.backgroundColor);
 controls.push({id:"text-size",label:"Text size",fields:[{id:"value",label:"Text size (px)",type:"number",min:8,max:96}],read:()=>reading(k.textSize,f=>({value:String(f.properties[p.pixels])})),changes(v){const input=v["value"]??"",n=Number(input);if(!/^\d+$/.test(input)||!Number.isInteger(n)||n<8||n>96)throw Error("Text size must be an integer from 8 through 96");return [set(literal(k.textSize,{[p.pixels]:n}))];}});
 controls.push({id:"font-family",label:"Font family",fields:[{id:"value",label:"Font family",type:"select",options:[{value:"1",label:"System"},{value:"2",label:"Sans serif"},{value:"3",label:"Serif"},{value:"4",label:"Monospace"}]}],read:()=>reading(k.fontFamily,f=>({value:String(f.properties[p.family])})),changes(v){if(!/^[1-4]$/.test(v["value"]??""))throw Error("Choose a font-family preset");return [set(literal(k.fontFamily,{[p.family]:Number(v["value"])}))];}});
 controls.push({id:"link",label:"Link",shortcut:"k",fields:[{id:"href",label:"Link URL",type:"text",maxLength:2048,placeholder:"https://…"},{id:"target",label:"Link opens in",type:"select",options:[{value:"same",label:"Same window"},{value:"new",label:"New window"}]}],read(){const r=reading(k.link,f=>({href:String(f.properties[p.href]),target:f.properties[p.newWindow]?"new":"same"}));return r.kind==="unset"?{...r,values:{href:"",target:"same"}}:r;},changes(v){const href=v["href"]??"",target=v["target"];if(target!=="same"&&target!=="new")throw Error("Choose a Link target; mixed links require an explicit replacement");const format=literal(k.link,{[p.href]:href,[p.newWindow]:target==="new"});const attributes=resolveInlineFormatRenderAttributes({kind:"safeLinkV1",hrefProperty:p.href,openInNewWindowProperty:p.newWindow},Object.entries(format.properties).map(([name,value])=>({name,value:value as string|boolean})));if(!attributes.some(a=>a.name==="href"))throw Error("Enter an absolute HTTP(S) URL without credentials or whitespace");return [set(format)];}});
 for(const [id,label,kind]of [["unlink","Unlink",k.link],["reset-text-color","Reset text color",k.textColor],["reset-background-color","Reset background color",k.backgroundColor],["reset-text-size","Reset text size",k.textSize],["reset-font-family","Reset font family",k.fontFamily]])controls.push({id:id!,label:label!,read:()=>({kind:state(kind!).kind}),changes:()=>removals(kind!)});
 controls.push({id:"clear-inline",label:"Clear standard formatting",read:()=>({kind:state(k.strong).kind}),changes:()=>Object.values(k).flatMap(removals)});
 return Object.freeze(controls.map(control=>Object.freeze(control)));
}
/** Preserve every inherited/custom format using the exact Rust caret read. */
export function pendingStandardFormats(core:StandardInlineReader,changes:readonly StandardInlineChange[]):readonly FormatLiteral[]{
 if(!core.caretFormats)throw Error("Caret format capability is unavailable");const formats=new Map(core.caretFormats().map(format=>[format.type,format]));
 for(const change of changes)if(change.kind==="remove")formats.delete(change.format);else formats.set(change.format.type,change.format);
 return [...formats.values()].sort((a,b)=>a.type<b.type?-1:1);
}
/** A valid disabled-annotation literal; removal semantics depend on kind, not values. */
export function standardRemovalLiteral(kind:string):FormatLiteral {
 const properties=kind===k.link?{[p.href]:"https://example.invalid/",[p.newWindow]:false}:kind===k.textColor||kind===k.backgroundColor?{[p.rgb24]:0}:kind===k.textSize?{[p.pixels]:8}:kind===k.fontFamily?{[p.family]:1}:{};
 return {type:kind,properties};
}
