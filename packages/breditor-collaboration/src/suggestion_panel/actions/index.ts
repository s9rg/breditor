import {replaceTextSuggestion} from "./replace_text.js";
import {protectedTextSuggestion} from "./replace_protected_text.js";
import {formatTextSuggestion} from "./format_text.js";
import {headingSuggestion} from "./set_heading.js";
import {listSuggestion} from "./wrap_list.js";
import {tableRowSuggestion} from "./insert_table_row.js";
import {tableColumnSuggestion} from "./insert_table_column.js";
import {imageAltSuggestion} from "./set_image_alt.js";
import {imageCaptionSuggestion} from "./set_image_caption.js";
import type {SharedSuggestionComposerAction} from "../types.js";
import type {RichUiLocale,RichUiStringKey} from "@breditor/experimental-rich-content/rendering";
/** Typed original semantic draft builders. Native capture owns complete admission and source proof. */
export const standardSharedSuggestionActions=Object.freeze([replaceTextSuggestion,protectedTextSuggestion,formatTextSuggestion,headingSuggestion,listSuggestion,tableRowSuggestion,tableColumnSuggestion,imageAltSuggestion,imageCaptionSuggestion]);
type Choice=RichUiStringKey|((ui:RichUiLocale)=>string);
interface ActionText {label:RichUiStringKey;fields?:Readonly<Record<string,{label:RichUiStringKey;choices?:Readonly<Record<string,Choice>>}>>}
const text:ReadonlyMap<SharedSuggestionComposerAction,ActionText>=new Map<SharedSuggestionComposerAction,ActionText>([
 [replaceTextSuggestion,{label:"suggestReplaceText",fields:{text:{label:"suggestFieldProposedText"}}}],
 [protectedTextSuggestion,{label:"suggestProtectedText",fields:{text:{label:"suggestFieldProposedText"}}}],
 [formatTextSuggestion,{label:"suggestFormatText",fields:{format:{label:"suggestFieldTextFormat",choices:{"breditor/strong":"suggestFormatBold","breditor-inline/italic":"suggestFormatItalic","breditor-inline/underline":"suggestFormatUnderline","breditor-inline/strike":"suggestFormatStrike"}},enabled:{label:"suggestFieldFormatChange",choices:{true:"suggestFormatApply",false:"suggestFormatRemove"}}}}],
 [headingSuggestion,{label:"suggestHeadingAction",fields:{level:{label:"suggestFieldHeadingRank",choices:{"0":"suggestHeadingParagraph",...Object.fromEntries([1,2,3,4,5,6].map(level=>[String(level),(ui:RichUiLocale)=>ui.text("suggestHeadingLevel",{level})]))}}}}],
 [listSuggestion,{label:"suggestListAction",fields:{style:{label:"suggestFieldListStyle",choices:{bullet:"suggestListBullet",ordered:"suggestListNumbered"}}}}],
 [tableRowSuggestion,{label:"suggestTableRow"}],
 [tableColumnSuggestion,{label:"suggestTableColumn",fields:{width:{label:"suggestFieldColumnWidth"}}}],
 [imageAltSuggestion,{label:"suggestImageAlt",fields:{text:{label:"suggestFieldImageDescription"}}}],
 [imageCaptionSuggestion,{label:"suggestImageCaption",fields:{text:{label:"suggestFieldImageCaption"}}}],
]);
/** @internal Catalog labels for one of the exact standard action objects; any other action is returned unchanged. */
export function localizeSuggestionAction(action:SharedSuggestionComposerAction,ui:RichUiLocale):SharedSuggestionComposerAction{
 const entry=text.get(action);if(!entry)return action;
 const label=(choice:Choice)=>typeof choice==="function"?choice(ui):ui.text(choice);
 return {...action,label:ui.text(entry.label),...(action.fields?{fields:action.fields.map(field=>{const local=entry.fields?.[field.id];if(!local)return field;
  return {...field,label:ui.text(local.label),...(field.choices?{choices:field.choices.map(choice=>{const key=local.choices?.[choice.value];return key===undefined?choice:{...choice,label:label(key)};})}:{})};})}:{})};
}
