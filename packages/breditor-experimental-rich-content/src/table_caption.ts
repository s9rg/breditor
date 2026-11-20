// Candidate rich V4 table captions: read-only targeting and an owner-bound toolbar control.
// Rust owns grammar, identities, the caret placement and history; this module never edits DOM.
import type {RichCoreEditor,RichSelectionPolicy} from "./core.js";
import type {ActionContext,ToolbarControl} from "./actions.js";
import {id,property,selectedTable,type ElementNode,type RichPresentationModel} from "./model.js";

/**
 * A V4 table's children are its rows followed by at most one `breditor/paragraph`: the caption.
 * The caption is an ordinary inline-text paragraph (formats, language, mentions), but never a
 * flow block: it cannot be split, converted, wrapped in a list or moved on its own.
 */
export const richTableCaptionKind="breditor/paragraph";
/** The caption paragraph of one table node, or `undefined`. */
export function tableCaptionOf(table:ElementNode):ElementNode|undefined{
 if(table.type!=="breditor/table")return undefined;
 const last=table.children[table.children.length-1];
 return last?.kind==="element"&&last.type===richTableCaptionKind?last:undefined;
}
/** Whether `block` is a table caption in this projection (a paragraph directly below a table). */
export function isTableCaption(model:RichPresentationModel,block:string):boolean{
 const node=model.nodes.get(block);
 return node?.type===richTableCaptionKind&&model.parents.get(block)?.type==="breditor/table";
}
type CaptionOwner={richLanguageVersion?():number;supportsTableCaptions?():boolean};
/**
 * V4 control **Table caption** for the selected table (a node or grid selection, or a caret or
 * range in a cell or in the caption): pressed when the table has a caption. Activating it adds an
 * empty caption and moves the caret into it, or removes the caption (one Undo step either way).
 */
export function tableCaptionToolbarControls<P extends RichSelectionPolicy>(core:RichCoreEditor<P>&CaptionOwner):readonly ToolbarControl<P>[]{
 if(core.richLanguageVersion?.()!==4||core.supportsTableCaptions?.()!==true)throw Error("Use an explicitly selected matching rich V4 owner");
 const bound=(c:ActionContext<P>):void=>{if(c.core!==core)throw Error("Table caption control belongs to a different Rust owner");};
 return Object.freeze([
  {id:"table-caption",label:"Table caption",owner:core,enabled:c=>selectedTable(c.model)!==undefined,
   read:c=>{const table=selectedTable(c.model);return table?{kind:"uniform",pressed:tableCaptionOf(table)!==undefined}:{kind:"unavailable"};},
   command:c=>{bound(c);const table=selectedTable(c.model);if(!table)return null;const target=String(property(table,"table-id"));
    return tableCaptionOf(table)?{kind:"removeTableCaption",data:{table:target}}:{kind:"addTableCaption",data:{table:target,caption:c.allocate("caption")}};}},
 ] satisfies ToolbarControl<P>[]);
}
/** Identity of the caption of the selected table, if any (for hosts that focus it explicitly). */
export function selectedTableCaption(model:RichPresentationModel):string|undefined{
 const table=selectedTable(model),caption=table?tableCaptionOf(table):undefined;
 return caption?id(caption):undefined;
}
