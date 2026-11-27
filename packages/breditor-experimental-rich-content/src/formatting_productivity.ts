/**
 * Opt-in formatting-productivity toolbar controls: special characters, case change, the format painter and
 * named formatting presets (named styles and highlight presets).
 *
 * Every edit is an existing native command with exact history: special characters are ordinary text input,
 * case change is the native `changeSelectionCase` command and painting or applying/removing a named preset
 * is one native selection-format change.
 * The specs are DOM-free and owner-agnostic; `createFormattingProductivityToolbar` adapts them to a local
 * owner and `@breditor/collaboration` adapts the same specs to a shared owner. See
 * docs/FORMATTING_PRODUCTIVITY.md.
 */
import type {FormatLiteral,RichSelection,RichSelectionFormatChange,RichSelectionFormatStateRead,RichSelectionPolicy} from "./core.js";
import type {ActionContext,ToolbarControl} from "./actions.js";
import type {RichCommand} from "./commands.js";
import {requireRichInlinePresentation,type RichInlinePresentation} from "./inline_presentation.js";
import {standardInlineKindsV1} from "./standard_inline_v1.js";
import {selectionFormatChanges,type StandardInlineChange} from "./standard_inline_controls.js";
import type {RichControlAttachPort,RichControlPanelPort,RichToolbarField,RichToolbarReading} from "./toolbar_control_view.js";
import {createNamedFormatPresetRegistry,namedFormatPresetApplyChanges,namedFormatPresetRemoveChanges,namedFormatPresetState,RICH_NAMED_PRESET_REMOVE,type RichNamedFormatPreset,type RichNamedFormatPresetOptions} from "./named_format_presets.js";
import {createSpecialCharacterCatalog,mountSpecialCharacterPicker,type RichSpecialCharacterCatalog,type RichSpecialCharacterOptions} from "./special_characters.js";

export type RichCaseChangeMode="upper"|"lower"|"title"|"cycle";
/** Native intent of `changeSelectionCase`. Rust validates it again and owns every mapping decision. */
export interface RichCaseChangeIntent {readonly change:RichCaseChangeMode;readonly locale?:string;readonly titleMinorWords?:readonly string[]}
/** Snapshot primitive intent fields; reject accessors, extra keys and wrong types before JSON. */
export function encodeCaseChangeIntent(input:unknown):RichCaseChangeIntent{
 if(!input||typeof input!=="object"||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw new TypeError("Expected a plain case-change intent");
 const value=input as Record<string,unknown>;
 for(const key of Object.keys(value))if(!["change","locale","titleMinorWords"].includes(key))throw new TypeError(`Unknown case-change field ${JSON.stringify(key)}`);
 const change=value["change"];if(change!=="upper"&&change!=="lower"&&change!=="title"&&change!=="cycle")throw new TypeError("Expected change upper, lower, title or cycle");
 const locale=value["locale"];if(locale!==undefined&&(typeof locale!=="string"||!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8}){0,7}$/.test(locale)||locale.length>35))throw new TypeError("Expected a BCP 47 locale tag");
 const words=value["titleMinorWords"];
 if(words!==undefined&&(!Array.isArray(words)||words.length>256||words.some(word=>typeof word!=="string"||!word||word.length>32)))throw new TypeError("Expected at most 256 nonempty minor words");
 return Object.freeze({change,...(locale!==undefined?{locale:locale as string}:{}),...(words!==undefined?{titleMinorWords:Object.freeze([...(words as string[])])}:{})});
}

/** What a productivity control asks its owner adapter to do. */
export type RichProductivityIntent=
 |{readonly kind:"insertText";readonly text:string}
 |{readonly kind:"changeCase";readonly data:RichCaseChangeIntent}
 |{readonly kind:"changeFormats";readonly changes:readonly RichSelectionFormatChange[]};
type Selection=RichSelection|{kind:"document"}|null;
/** One owner-agnostic control. `intent` may also change local painter state and then return null. */
export interface RichProductivityControlSpec {
 readonly id:string;readonly label:string;
 /** Ordinary toolbar fields (the named-preset dropdowns); applied through `intent`. */
 readonly fields?:readonly RichToolbarField[];readonly mixedHint?:string;
 readonly panel?:(body:HTMLElement,port:RichControlPanelPort)=>void;
 readonly attach?:(port:RichControlAttachPort)=>void;
 read():RichToolbarReading;
 enabled(selection:Selection,readOnly:boolean):boolean;
 intent(fields:Readonly<Record<string,string>>,selection:Selection,readOnly:boolean):RichProductivityIntent|null;
}
/** Native capabilities read by the specs (implemented by local and shared owners). */
export interface RichProductivityReader {
 supportsCaseChange?():boolean;supportsSelectionFormatting?():boolean;
 selectionFormatState?(kind:string):RichSelectionFormatStateRead;
}
export interface RichFormattingProductivityOptions {
 /** Special-character picker (default on); `false` omits it. */
 readonly specialCharacters?:false|RichSpecialCharacterOptions;
 /** UPPERCASE/lowercase/Title Case buttons and Shift+F3 (default on when the owner supports it). */
 readonly caseChange?:false|{readonly locale?:string;readonly titleMinorWords?:readonly string[];readonly shortcut?:boolean};
 /** Format painter (default on when the owner reads native selection formats). */
 readonly formatPainter?:false|{readonly shortcuts?:boolean};
 /**
  * Named styles and highlight presets (default off). Each nonempty group adds one dropdown
  * (`named-styles`, `highlight-presets`) when the owner reads native selection formats.
  */
 readonly namedPresets?:false|RichNamedFormatPresetOptions;
}

const caseIds={upper:"case-upper",lower:"case-lower",title:"case-title"} as const;
const caseLabels={upper:"UPPERCASE",lower:"lowercase",title:"Title Case"} as const;
const isText=(selection:Selection):selection is Extract<RichSelection,{kind:"text"}>=>selection?.kind==="text";
const isCaret=(selection:Selection)=>isText(selection)&&selection.anchor.block===selection.focus.block&&selection.anchor.offset===selection.focus.offset;
/** Exact Mod+Alt+letter by physical key, never AltGraph text input. */
function modAlt(event:KeyboardEvent,code:string):boolean{
 return (event.ctrlKey||event.metaKey)&&event.altKey&&!event.shiftKey&&event.code===code&&!event.getModifierState?.("AltGraph")&&!event.isComposing;
}
/** One listener set per surface even when a control is also borrowed by context UI. */
function once(seen:WeakSet<HTMLElement>,port:RichControlAttachPort,install:()=>void):void{if(seen.has(port.surface))return;seen.add(port.surface);install();}

/** The specs in toolbar order (special characters, case change, painter, named presets), filtered by capability. */
export function formattingProductivityControls(core:RichProductivityReader,presentation:RichInlinePresentation,options:RichFormattingProductivityOptions={}):readonly RichProductivityControlSpec[]{
 for(const key of Object.keys(options))if(!["specialCharacters","caseChange","formatPainter","namedPresets"].includes(key))throw new TypeError(`Unknown formatting-productivity option ${JSON.stringify(key)}`);
 const specs:RichProductivityControlSpec[]=[];
 if(options.specialCharacters!==false)specs.push(specialCharacterSpec(createSpecialCharacterCatalog(options.specialCharacters??{})));
 if(options.caseChange!==false&&core.supportsCaseChange?.()===true)specs.push(...caseSpecs(options.caseChange??{}));
 if(options.formatPainter!==false&&core.supportsSelectionFormatting?.()===true&&typeof core.selectionFormatState==="function"){
  requireRichInlinePresentation(presentation,presentation.schema);
  specs.push(painterSpec(core,presentation,options.formatPainter??{}));
 }
 if(options.namedPresets!==undefined&&options.namedPresets!==false){
  // Validate the registry even when the owner cannot use it, so a bad host configuration never hides.
  const registry=createNamedFormatPresetRegistry(options.namedPresets);
  if(core.supportsSelectionFormatting?.()===true&&typeof core.selectionFormatState==="function"){
   requireRichInlinePresentation(presentation,presentation.schema);
   const rendered=new Set(paintedKinds(presentation));
   for(const preset of [...registry.styles,...registry.highlights])for(const format of preset.formats)if(!rendered.has(format.type))throw new TypeError(`Named preset ${JSON.stringify(preset.id)} uses ${format.type}, which this presentation does not render`);
   if(registry.styles.length)specs.push(presetSpec(core,"named-styles","Named styles","Remove named style",registry.styles));
   if(registry.highlights.length)specs.push(presetSpec(core,"highlight-presets","Highlight","Remove highlight",registry.highlights));
  }
 }
 return Object.freeze(specs.map(spec=>Object.freeze(spec)));
}

function specialCharacterSpec(catalog:RichSpecialCharacterCatalog):RichProductivityControlSpec{
 const seen=new WeakSet<HTMLElement>();
 return {id:"special-characters",label:"Special characters",
  panel:(body,port)=>mountSpecialCharacterPicker(body,port,catalog),
  // Mod+Alt+S opens the picker from the editing surface.
  attach:port=>once(seen,port,()=>port.surface.addEventListener("keydown",event=>{if(modAlt(event,"KeyS")){event.preventDefault();port.activate();}},{signal:port.signal})),
  read:()=>({kind:"unset"}),
  enabled:(selection,readOnly)=>!readOnly&&isText(selection),
  intent(fields,selection,readOnly){
   const text=fields["value"]??"";
   if(readOnly||!isText(selection)||!text)return null;
   if(text.length>16||!catalog.categories.some(group=>group.characters.some(item=>item.character===text)))throw new TypeError("Choose a character from the special-character catalog");
   return {kind:"insertText",text};
  }};
}

function caseSpecs(options:Exclude<RichFormattingProductivityOptions["caseChange"],false|undefined>):RichProductivityControlSpec[]{
 for(const key of Object.keys(options))if(!["locale","titleMinorWords","shortcut"].includes(key))throw new TypeError(`Unknown case-change option ${JSON.stringify(key)}`);
 const base=encodeCaseChangeIntent({change:"upper",...(options.locale!==undefined?{locale:options.locale}:{}),...(options.titleMinorWords!==undefined?{titleMinorWords:options.titleMinorWords}:{})});
 const seen=new WeakSet<HTMLElement>(),shortcut=options.shortcut!==false;
 return (["upper","lower","title"] as const).map(mode=>({id:caseIds[mode],label:caseLabels[mode],
  // Shift+F3 cycles UPPER → lower → Title (resolved natively from the selected text).
  ...(shortcut?{attach:(port:RichControlAttachPort)=>once(seen,port,()=>port.surface.addEventListener("keydown",event=>{if(event.key==="F3"&&event.shiftKey&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.isComposing){event.preventDefault();port.run({change:"cycle"});}},{signal:port.signal}))}:{}),
  read:()=>({kind:"unset"}),
  enabled:(selection,readOnly)=>!readOnly&&selection!==null&&selection.kind!=="document",
  intent(fields,selection,readOnly){
   if(readOnly||selection===null||selection.kind==="document")return null;
   const change=fields["change"]==="cycle"?"cycle":mode;
   return {kind:"changeCase",data:Object.freeze({...base,change})};
  }}));
}

/** Format kinds a painter copies: the standard inline formatting the presentation renders, never links. */
function paintedKinds(presentation:RichInlinePresentation):readonly string[]{
 const rendered=new Set(presentation.recipesOuterToInner.map(recipe=>recipe.formatKind));
 return Object.values(standardInlineKindsV1).filter(kind=>kind!==standardInlineKindsV1.link&&rendered.has(kind)).sort();
}
type PainterMode="off"|"once"|"sticky";
/** Painter state is presentation state of one control instance; it never enters the document or history. */
class Painter {
 mode:PainterMode="off";copied:readonly FormatLiteral[]=[];armedAt=0;
 readonly buttons=new Set<HTMLButtonElement>();readonly statuses=new Set<HTMLElement>();
 announce(text:string):void{for(const status of this.statuses)status.textContent=text;}
 show():void{for(const button of this.buttons){button.setAttribute("aria-pressed",String(this.mode!=="off"));button.dataset["painter"]=this.mode;}}
}
function painterSpec(core:RichProductivityReader,presentation:RichInlinePresentation,options:{readonly shortcuts?:boolean}):RichProductivityControlSpec{
 for(const key of Object.keys(options))if(!["shortcuts"].includes(key))throw new TypeError(`Unknown format-painter option ${JSON.stringify(key)}`);
 const kinds=paintedKinds(presentation),painter=new Painter(),seen=new WeakSet<HTMLElement>(),shortcuts=options.shortcuts!==false;
 const state=(kind:string)=>core.selectionFormatState!(kind).state;
 let ui:RichControlAttachPort["ui"]|undefined;
 const say=(key:"formatPainterCopied"|"formatPainterSticky"|"formatPainterApplied"|"formatPainterCancelled"|"formatPainterNothing")=>{if(ui)painter.announce(ui.text(key));};
 const off=()=>{if(painter.mode==="off")return;painter.mode="off";painter.copied=[];painter.show();say("formatPainterCancelled");};
 const copy=()=>{painter.copied=Object.freeze(kinds.flatMap(kind=>{const s=state(kind);return s.kind==="uniform"?[s.format]:[];}));painter.mode="once";painter.armedAt=Date.now();painter.show();say("formatPainterCopied");};
 const changes=():StandardInlineChange[]=>{
  const result:StandardInlineChange[]=[];
  for(const kind of kinds){
   const source=painter.copied.find(format=>format.type===kind),target=state(kind);
   if(target.kind==="unavailable")continue;
   if(source){if(target.kind!=="uniform"||JSON.stringify(target.format)!==JSON.stringify(source))result.push({kind:"set",format:source});}
   else if(target.kind!=="unset")result.push({kind:"remove",format:kind});
  }
  // Subscript and superscript exclude each other: remove the opposite before setting one.
  return result.sort((a,b)=>(a.kind==="remove"?0:1)-(b.kind==="remove"?0:1));
 };
 return {id:"format-painter",label:"Format painter",
  attach:port=>{
   ui=port.ui;painter.buttons.add(port.button);port.button.setAttribute("aria-pressed","false");
   const status=port.button.ownerDocument.createElement("span");status.setAttribute("role","status");status.className="breditor-format-painter-status";
   status.style.cssText="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap";
   port.button.after(status);painter.statuses.add(status);
   port.signal.addEventListener("abort",()=>{painter.buttons.delete(port.button);painter.statuses.delete(status);},{once:true});
   once(seen,port,()=>{
    // A pointer selection applies once it settles; a plain click (collapsed caret) keeps the painter armed.
    port.surface.addEventListener("pointerup",()=>{if(painter.mode!=="off")setTimeout(()=>{if(!port.signal.aborted&&painter.mode!=="off")port.run({painter:"pointer"});},0);},{signal:port.signal});
    port.surface.addEventListener("keydown",event=>{
     if(event.key==="Escape"&&painter.mode!=="off"){event.preventDefault();port.run({painter:"cancel"});return;}
     if(!shortcuts)return;
     if(modAlt(event,"KeyC")){event.preventDefault();port.run({painter:"copy"});}
     else if(modAlt(event,"KeyV")&&painter.mode!=="off"){event.preventDefault();port.run({painter:"apply"});}
    },{signal:port.signal});
   });
  },
  read:()=>({kind:"unset",pressed:painter.mode!=="off"}),
  enabled:(selection,readOnly)=>!readOnly&&selection!==null&&selection.kind!=="document",
  intent(fields,selection,readOnly){
   const action=fields["painter"]??"toggle";
   if(action==="cancel"||readOnly){off();return null;}
   if(action==="toggle"||action==="copy"){
    // A second activation within 500 ms (a double-click) keeps the copy for repeated use.
    if(painter.mode==="once"&&Date.now()-painter.armedAt<500){painter.mode="sticky";painter.show();say("formatPainterSticky");return null;}
    if(painter.mode!=="off"&&action==="toggle"){off();return null;}
    if(selection===null||selection.kind==="document")return null;
    copy();return null;
   }
   if(painter.mode==="off"||selection===null||selection.kind==="document")return null;
   if(action==="pointer"&&(!isText(selection)||isCaret(selection)))return null;
   const list=changes();
   if(painter.mode==="once"){painter.mode="off";painter.copied=Object.freeze([...painter.copied]);painter.show();}
   if(!list.length){say("formatPainterNothing");return null;}
   say("formatPainterApplied");
   return {kind:"changeFormats",changes:selectionFormatChanges(list)};
  }};
}

/**
 * One named-preset dropdown. The select lists the group's presets and a final remove choice; its reading
 * shows the first active preset (uniform), `mixed` when a preset is partly present, otherwise unset.
 */
function presetSpec(core:RichProductivityReader,id:string,label:string,removeLabel:string,presets:readonly RichNamedFormatPreset[]):RichProductivityControlSpec{
 const read=(kind:string)=>core.selectionFormatState!(kind).state;
 const fields:readonly RichToolbarField[]=Object.freeze([Object.freeze({id:"preset",label,type:"select" as const,options:Object.freeze([...presets.map(preset=>Object.freeze({value:preset.id,label:preset.label})),Object.freeze({value:RICH_NAMED_PRESET_REMOVE,label:removeLabel})])})]);
 const reading=():RichToolbarReading=>{
  const states=presets.map(preset=>namedFormatPresetState(read,preset));
  if(states.every(state=>state==="unavailable"))return {kind:"unavailable",values:{}};
  const active=states.indexOf("active");
  if(active>=0)return {kind:"uniform",values:{preset:presets[active]!.id}};
  return {kind:states.includes("mixed")?"mixed":"unset",values:{}};
 };
 return {id,label,fields,mixedHint:"Part of the selection has one of these presets. Choose one to apply it to the whole selection, or remove it.",
  read:reading,
  enabled:(selection,readOnly)=>!readOnly&&selection!==null&&selection.kind!=="document"&&reading().kind!=="unavailable",
  intent(values,selection,readOnly){
   if(readOnly||selection===null||selection.kind==="document")return null;
   const choice=values["preset"]??"";
   if(!choice)throw new TypeError("Choose a named preset");
   let list:readonly StandardInlineChange[];
   if(choice===RICH_NAMED_PRESET_REMOVE)list=namedFormatPresetRemoveChanges(read,presets);
   else{const preset=presets.find(candidate=>candidate.id===choice);if(!preset)throw new TypeError(`Unknown named preset ${JSON.stringify(choice)}`);list=namedFormatPresetApplyChanges(read,preset);}
   return list.length?{kind:"changeFormats",changes:selectionFormatChanges(list)}:null;
  }};
}

/** Local toolbar controls for one owner: special characters, case change, the format painter and named presets. */
export function createFormattingProductivityToolbar<P extends RichSelectionPolicy="original">(core:RichProductivityReader&object,presentation:RichInlinePresentation,options:RichFormattingProductivityOptions={}):readonly ToolbarControl<P>[]{
 return Object.freeze(formattingProductivityControls(core,presentation,options).map(spec=>Object.freeze({id:spec.id,label:spec.label,
  ...(spec.fields?{fields:spec.fields}:{}),...(spec.mixedHint?{mixedHint:spec.mixedHint}:{}),
  ...(spec.panel?{panel:spec.panel}:{}),...(spec.attach?{attach:spec.attach}:{}),
  read:()=>spec.read(),
  enabled:(c:ActionContext<P>)=>spec.enabled(c.model.view.selection as Selection,c.model.view.readOnly===true),
  command(c:ActionContext<P>,_value?:string,fields:Readonly<Record<string,string>>={}):RichCommand|null{
   if(c.core!==core)throw Error("Formatting-productivity control belongs to a different Rust owner");
   const selection=c.model.view.selection as Selection,intent=spec.intent(fields,selection,c.model.view.readOnly===true);
   if(!intent)return null;
   if(intent.kind==="changeCase")return {kind:"changeSelectionCase",data:intent.data};
   if(intent.kind==="changeFormats")return {kind:"changeSelectionFormats",data:{changes:intent.changes}};
   if(!isText(selection))return null;
   return isCaret(selection)?{kind:"insertPlainText",text:intent.text}:{kind:"replaceTextRange",data:{selection,text:intent.text}};
  }} satisfies ToolbarControl<P>)));
}
