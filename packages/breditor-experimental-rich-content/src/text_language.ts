/** Rich V4 text-run language: presentation recipe, intent encoding and toolbar controls. */
import {canonicalLanguageTagV1,isCanonicalLanguageTagV1} from "@breditor/browser/presentation";
import type {FormatLiteral,RichInlineFormatState,RichInlineFormatStateRead,RichSelectionFormatStateRead,RichSelectionPolicy} from "./core.js";
import type {ActionContext} from "./actions.js";
import type {RichToolbarField,RichToolbarReading} from "./toolbar_control_view.js";

/** Native V4 format kind and its single required property (Rust `text_language.rs`). */
export const richTextLanguageFormat="breditor/text-language";
export const richTextLanguageTagProperty="breditor/language-tag";
/**
 * Inert presentation recipe: `<span class="breditor-text-language" lang="…">`. Only a canonical
 * admitted tag is emitted; anything else renders an inert span without `lang`.
 */
export const richTextLanguageRecipeV4=Object.freeze({formatKind:richTextLanguageFormat,element:"span" as const,classes:Object.freeze(["breditor-text-language"]),attributes:Object.freeze({kind:"safeLanguageTagV1" as const,propertyName:richTextLanguageTagProperty})});

/** Canonical case of a well-formed bounded tag, or `null`. Rust admission stays authoritative. */
export function canonicalTextLanguage(value:unknown):string|null{return canonicalLanguageTagV1(value);}
/** Canonical stored tag of one admitted `breditor/text-language` literal. */
export function textLanguageOf(format:FormatLiteral):string|undefined{
 const value=format.type===richTextLanguageFormat?format.properties[richTextLanguageTagProperty]:undefined;
 return isCanonicalLanguageTagV1(value)?value:undefined;
}
/** Snapshot only primitive intent before JSON; canonical case is decided again by Rust. */
export function encodeTextLanguageIntent(input:unknown):{language:string|null}{
 if(!input||typeof input!=="object"||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw new TypeError("Expected plain text language intent");
 const keys=Reflect.ownKeys(input);
 if(keys.length!==1||keys[0]!=="language")throw new TypeError("Text language intent has exactly one language field");
 const language=(input as Record<string,unknown>)["language"];
 if(language!==null&&typeof language!=="string")throw new TypeError("Text language must be a primitive string or null");
 return {language};
}

interface LanguageReader {
 richLanguageVersion?():1|2|3|4;supportsTextLanguage?():boolean;
 inlineFormatState(kind:string):RichInlineFormatStateRead;
 supportsSelectionFormatting?():boolean;selectionFormatState?(kind:string):RichSelectionFormatStateRead;
}
export interface TextLanguageControl {
 readonly id:string;readonly label:string;readonly fields?:readonly RichToolbarField[];readonly mixedHint?:string;
 read():RichToolbarReading;
 /** Intent only; the native owner applies it to its own selection in one history group. */
 language(fields:Readonly<Record<string,string>>):{language:string|null};
}
/**
 * Owner-bound DOM-free V4 controls: **Language** (a validated tag field) and **Clear language**.
 * The state read is the native selection/caret format state of `breditor/text-language`.
 */
export function textLanguageControls(core:LanguageReader):readonly TextLanguageControl[]{
 if(core.richLanguageVersion?.()!==4||core.supportsTextLanguage?.()!==true)throw Error("Use an explicitly selected matching rich V4 owner");
 const native=core.supportsSelectionFormatting?.()===true&&typeof core.selectionFormatState==="function";
 const state=():RichInlineFormatState=>(native?core.selectionFormatState!(richTextLanguageFormat):core.inlineFormatState(richTextLanguageFormat)).state;
 const field:RichToolbarField={id:"value",label:"Language tag (BCP 47)",type:"text",maxLength:35,placeholder:"en, fr-CA, zh-Hant-TW"};
 return Object.freeze([
  Object.freeze({id:"text-language",label:"Language",fields:Object.freeze([field]),mixedHint:"Mixed languages: applying sets one language on every selected character.",
   read():RichToolbarReading{const s=state();return s.kind==="uniform"?{kind:s.kind,values:{value:textLanguageOf(s.format)??""}}:{kind:s.kind};},
   language(fields:Readonly<Record<string,string>>){
    const input=(fields["value"]??"").trim();if(!input)throw Error("Enter a language tag, or use Clear language");
    const language=canonicalTextLanguage(input);
    if(language===null)throw Error("Enter a well-formed language tag such as en, fr-CA or zh-Hant-TW");
    return {language};
   }}),
  Object.freeze({id:"reset-text-language",label:"Clear language",
   read():RichToolbarReading{return {kind:state().kind};},
   language(){return {language:null};}}),
 ]);
}
/** Toolbar adapters: native `setTextLanguage` commands only, bound to the owner they were built for. */
export function textLanguageToolbarControls<P extends RichSelectionPolicy>(core:LanguageReader&object){
 return textLanguageControls(core).map(spec=>({id:spec.id,label:spec.label,...(spec.fields?{fields:spec.fields}:{}),...(spec.mixedHint?{mixedHint:spec.mixedHint}:{}),
  read:()=>spec.read(),
  enabled:(c:ActionContext<P>)=>{const k=spec.read().kind;return Boolean(c.model.view.selection)&&k!=="unavailable"&&(spec.id==="text-language"||k!=="unset");},
  command(c:ActionContext<P>,_value?:string,fields:Readonly<Record<string,string>>={}){if(c.core!==core)throw Error("Language control belongs to a different Rust owner");return {kind:"setTextLanguage" as const,data:spec.language(fields)};}}));
}
