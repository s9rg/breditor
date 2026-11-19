/** Presentation for the Rust-owned, explicitly installed standard inline V1 extension. */
import {createInlineFormatRenderManifest,type InlineFormatRenderRecipe} from "@breditor/browser/presentation";
import {createRichInlinePresentation,richInlineFormatDescriptor,type RichInlinePresentation} from "./inline_presentation.js";
import {richTextLanguageFormat,richTextLanguageRecipeV4} from "./text_language.js";

export const standardInlineKindsV1=Object.freeze({
 strong:"breditor/strong",italic:"breditor-inline/italic",underline:"breditor-inline/underline",strike:"breditor-inline/strike",code:"breditor-inline/code",subscript:"breditor-inline/subscript",superscript:"breditor-inline/superscript",link:"breditor-inline/link",textColor:"breditor-inline/text-color",backgroundColor:"breditor-inline/background-color",textSize:"breditor-inline/text-size",fontFamily:"breditor-inline/font-family",
});
export const standardInlinePropertiesV1=Object.freeze({href:"breditor-inline/href",newWindow:"breditor-inline/new-window",rgb24:"breditor-inline/rgb24",pixels:"breditor-inline/pixels",family:"breditor-inline/family"});
/** Inert fixed host CSS. Font choices are presets, not embedded font files or arbitrary CSS. */
export const standardInlineStylesV1=`.breditor-inline-font-family[data-breditor-integer-token="system"]{font-family:system-ui,sans-serif}.breditor-inline-font-family[data-breditor-integer-token="sans"]{font-family:Arial,Helvetica,sans-serif}.breditor-inline-font-family[data-breditor-integer-token="serif"]{font-family:Georgia,"Times New Roman",serif}.breditor-inline-font-family[data-breditor-integer-token="mono"]{font-family:ui-monospace,monospace}`;

/**
 * Compile the full standard renderer and explicit additional application recipes.
 * Rust remains the schema source; names, revisions and exact property domains are
 * checked before any DOM is mounted. Additional recipes use the existing inert
 * manifest boundary, including its accessor/callback and complete-coverage guards.
 * A candidate rich V4 catalog also declares the native `breditor/text-language` format; its
 * fixed `lang` recipe is added automatically unless an additional recipe already covers it.
 */
/** Bounded structural peek; the presentation compiler below still validates the complete catalog. */
function catalogDeclares(catalogJson:string,kind:string):boolean{
 try{const formats=(JSON.parse(catalogJson) as {formats?:unknown})?.formats;return Array.isArray(formats)&&formats.some(format=>typeof format==="object"&&format!==null&&(format as {kind?:unknown}).kind===kind);}catch{return false;}
}
export function createStandardRichInlinePresentationV1(catalogJson:string,additional?:unknown):RichInlinePresentation {
 const k=standardInlineKindsV1,p=standardInlinePropertiesV1;
 const declared=additional===undefined?[]:createInlineFormatRenderManifest(additional).recipes;
 const extra=catalogDeclares(catalogJson,richTextLanguageFormat)&&!declared.some(recipe=>recipe.formatKind===richTextLanguageFormat)?[...declared,richTextLanguageRecipeV4]:declared;
 const free:readonly [string,InlineFormatRenderRecipe["element"]][]=[[k.strong,"strong"],[k.italic,"em"],[k.underline,"u"],[k.strike,"s"],[k.code,"code"],[k.subscript,"sub"],[k.superscript,"sup"]];
 const recipes:unknown[]=[...free.map(([formatKind,element])=>({formatKind,element})),
  {formatKind:k.link,element:"a",classes:["breditor-link"],before:[...Object.values(k).filter(kind=>kind!==k.link),...extra.map(recipe=>recipe.formatKind)],attributes:{kind:"safeLinkV1",hrefProperty:p.href,openInNewWindowProperty:p.newWindow}},
  {formatKind:k.textColor,element:"span",classes:["breditor-inline-text-color"],attributes:{kind:"safeRgb24V1",propertyName:p.rgb24,channel:"text"}},
  {formatKind:k.backgroundColor,element:"span",classes:["breditor-inline-background-color"],attributes:{kind:"safeRgb24V1",propertyName:p.rgb24,channel:"background"}},
  {formatKind:k.textSize,element:"span",classes:["breditor-inline-text-size"],attributes:{kind:"safeTextSizeV1",propertyName:p.pixels}},
  {formatKind:k.fontFamily,element:"span",classes:["breditor-inline-font-family"],attributes:{kind:"safeIntegerTokenV1",propertyName:p.family,tokens:[{value:1,token:"system"},{value:2,token:"sans"},{value:3,token:"serif"},{value:4,token:"mono"}]}},...extra];
 const presentation=createRichInlinePresentation(catalogJson,{recipes});
 for(const kind of Object.values(k))if(richInlineFormatDescriptor(presentation,kind)?.revision!==1)throw new TypeError("Standard inline V1 requires every exact revision-one format");
 return presentation;
}
