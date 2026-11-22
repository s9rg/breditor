/**
 * Shared rich language V4 structure commands: collapsible sections (wrap/unwrap), page breaks
 * (insert/delete) and table captions (add/remove). Read-only preparation only: every request is one
 * guarded shared dispatch batch (one writer-local Undo step) and Rust owns grammar, placement,
 * identities and history (crates/breditor-collaboration/src/rich_replica/actions/*_details.rs,
 * *_page_break.rs and table_caption_v4.rs). User-visible semantics mirror the local V4 slice
 * commands (docs/RICH_LANGUAGE_V4.md); the shared encoding is in docs/SHARED_RICH_V4.md.
 */
import {id,property,text,isText,selectedText,selectedTable,structuralIntervalV2,type ElementNode,type RichPresentationModel} from "@breditor/experimental-rich-content/rendering";
import {publish,caret,paragraph as emptyParagraph,type ActionContext,type SharedIntentContext,type SharedToolbarControl} from "./actions.js";
import {SharedEditorError} from "./shared_editor_error.js";
import {sharedSelectedDetails} from "./v4_block_fields.js";
import type {SharedCommand,SharedDispatch,SharedSelectionPolicy,RichSelection} from "./types.js";

const details="breditor/details",summary="breditor/details-summary",pageBreak="breditor/page-break";
/** The six shared V4 structure command kinds (all require a model-14 owner). */
export const sharedStructureCommandKindsV4:readonly SharedCommand["kind"][]=Object.freeze(["wrap_details","unwrap_details","insert_page_break","delete_page_break","add_table_caption","remove_table_caption"]);

/** Nearest section owning the selection (a caret/range focus, a selected node or the section itself). */
/** Sibling blocks the Collapsible section control wraps; a range touching a summary is not wrappable. */
export function sharedDetailsInterval(model:RichPresentationModel):{first:string;last:string}|undefined{
 const range=structuralIntervalV2(model);
 return range&&range.nodes.every(node=>node.type!==summary&&node.type!==pageBreak)?{first:range.first,last:range.last}:undefined;
}
/** The document-root block holding the selection (a caret, range focus, node or grid table). */
export function sharedRootBlockOfSelection(model:RichPresentationModel):ElementNode|undefined{
 const s=model.view.selection;
 let node=s?.kind==="node"?model.nodes.get(s.block):s?.kind==="text"?model.nodes.get(s.focus.block):s?.kind==="grid"?selectedTable(model):undefined;
 while(node){const parent=model.parents.get(id(node));if(!parent||parent===model.root||parent.type==="breditor/document")return node;node=parent;}
 return undefined;
}
/** Root anchor right after the selection's root block (`null` appends), as the local Page break control. */
export function sharedPageBreakBefore(model:RichPresentationModel):string|null{
 const block=sharedRootBlockOfSelection(model),siblings=model.root.children.filter((child):child is ElementNode=>child.kind==="element");
 const index=block?siblings.findIndex(child=>id(child)===id(block)):-1,next=index>=0?siblings[index+1]:undefined;
 return next?id(next):null;
}
/** A table's caption: its trailing paragraph child. */
export function sharedTableCaptionOf(table:ElementNode):ElementNode|undefined{
 if(table.type!=="breditor/table")return undefined;
 const last=table.children[table.children.length-1];return last?.kind==="element"&&last.type==="breditor/paragraph"?last:undefined;
}
interface StructureCore {supportsSharedStructureV4():boolean;view():{documentJson:string;selection:unknown}}
type Json={type?:string;properties?:Record<string,unknown>;children?:Json[]};
function findJson(node:Json,block:string):Json|undefined{if(node.properties?.["breditor/block-id"]===block)return node;for(const child of node.children??[]){const found=findJson(child,block);if(found)return found;}return undefined;}
function captionInView(core:StructureCore,table:string):string|undefined{
 const root=(JSON.parse(core.view().documentJson) as {root:Json}).root,node=findJson(root,table),last=node?.type==="breditor/table"?node.children?.at(-1):undefined;
 return last?.type==="breditor/paragraph"?String(last.properties?.["breditor/block-id"]):undefined;
}
function inBlock(selection:unknown,block:string|undefined):boolean{
 const s=selection as RichSelection|null;return !!block&&s?.kind==="text"&&(s.anchor.block===block||s.focus.block===block);
}
/**
 * One guarded request for a structure command with the local selection policy: adding a caption
 * places a caret in it (pending formats cleared); removing a caption holding the selection selects
 * the table; every other command maps the selection.
 */
export function sharedStructureRequestV4(core:StructureCore,command:SharedCommand):SharedDispatch{
 if(!core.supportsSharedStructureV4())throw new SharedEditorError("structure_v4_unavailable","Use an explicitly selected matching shared V4 owner with structure commands");
 if(!sharedStructureCommandKindsV4.includes(command.kind))throw new TypeError("Expected a shared V4 structure command");
 if(command.kind==="add_table_caption")return {commands:[command],selectionUpdate:{kind:"set",value:caret(command.data.caption)},pendingFormatsUpdate:{kind:"set",value:null}};
 if(command.kind==="remove_table_caption"&&inBlock(core.view().selection,captionInView(core,command.data.block)))
  return {commands:[command],selectionUpdate:{kind:"set",value:{kind:"node",block:command.data.block}},pendingFormatsUpdate:{kind:"set",value:null}};
 return {commands:[command]};
}
const supported=(c:ActionContext<SharedSelectionPolicy>|SharedIntentContext):boolean=>(c.core as Partial<StructureCore>).supportsSharedStructureV4?.()===true;
/** Add (with a fresh `caption`) or remove a table caption with the local selection policy, from a presentation model. */
function captionRequest(model:RichPresentationModel,table:string,caption?:string):SharedDispatch{
 if(caption!==undefined)return {commands:[{kind:"add_table_caption",data:{block:table,caption}}],selectionUpdate:{kind:"set",value:caret(caption)},pendingFormatsUpdate:{kind:"set",value:null}};
 const node=model.nodes.get(table),current=node?sharedTableCaptionOf(node):undefined,command:SharedCommand={kind:"remove_table_caption",data:{block:table}};
 return inBlock(model.view.selection,current?id(current):undefined)?{commands:[command],selectionUpdate:{kind:"set",value:{kind:"node",block:table}},pendingFormatsUpdate:{kind:"set",value:null}}:{commands:[command]};
}

/**
 * Shared V4 controls with the local ids and labels: **Collapsible section** (`details`), **Remove
 * collapsible section** (`undetails`), **Page break** (`page-break`) and **Table caption**
 * (`table-caption`, pressed when the selected table has a caption). Expanding/collapsing a section
 * is a separate control.
 */
export function createSharedStructureControlsV4<P extends SharedSelectionPolicy="original">(core:{supportsSharedStructureV4():boolean}):readonly SharedToolbarControl<P>[]{
 if(!core.supportsSharedStructureV4())return Object.freeze([]);
 const controls:SharedToolbarControl<P>[]=[
  {id:"details",label:"Collapsible section",enabled:c=>sharedDetailsInterval(c.model)!==undefined,
   run:c=>{const r=sharedDetailsInterval(c.model);if(r)publish(c,[{kind:"wrap_details",data:{first:r.first,last:r.last,wrapper:c.allocate("details"),summary:c.allocate("summary"),open:true}}]);}},
  {id:"undetails",label:"Remove collapsible section",enabled:c=>sharedSelectedDetails(c.model)!==undefined,
   run:c=>{const n=sharedSelectedDetails(c.model);if(n)publish(c,[{kind:"unwrap_details",data:{wrapper:id(n)}}]);}},
  {id:"page-break",label:"Page break",enabled:c=>{const s=c.model.view.selection;return s!==null&&s?.kind!=="document"&&sharedRootBlockOfSelection(c.model)!==undefined;},
   run:c=>publish(c,[{kind:"insert_page_break",data:{block:c.allocate("page-break"),before:sharedPageBreakBefore(c.model)}}])},
  {id:"table-caption",label:"Table caption",enabled:c=>selectedTable(c.model)!==undefined,
   read:c=>{const table=selectedTable(c.model);return table?{kind:"uniform",pressed:sharedTableCaptionOf(table)!==undefined}:{kind:"unavailable"};},
   run:c=>{const table=selectedTable(c.model);if(!table)return;const caption=sharedTableCaptionOf(table);c.core.dispatch(captionRequest(c.model,id(table),caption?undefined:c.allocate("caption")),c.revision);}},
 ];
 return Object.freeze(controls.map(control=>Object.freeze({...control,owner:core as never})));
}

/**
 * Caret Backspace/Delete at a V4 section or caption boundary (the local rules): Backspace at a
 * summary start unwraps the section; Delete at a summary end moves into an open body; Backspace at
 * the first body start moves to the summary end; Backspace in an empty caption removes it; other
 * caption boundaries do nothing. `undefined` leaves every other boundary to the caller.
 */
export function sharedStructureBoundaryV4(c:SharedIntentContext,backward:boolean,node:ElementNode,parent:ElementNode):boolean|undefined{
 if(!supported(c))return undefined;
 if(parent.type==="breditor/table"){if(backward&&text(node)==="")c.core.dispatch(captionRequest(c.model,id(parent)),c.revision);return true;}
 const index=parent.children.indexOf(node),other=parent.children[index+(backward?-1:1)];
 if(node.type===summary){
  if(backward){publish(c,[{kind:"unwrap_details",data:{wrapper:id(parent)}}]);return true;}
  if(other?.kind==="element"&&isText(other)&&property(parent,"details-open")===true)c.core.select(caret(id(other),0),c.revision);
  return true;
 }
 if(backward&&other?.kind==="element"&&other.type===summary){const end={block:id(other),offset:String(text(other).length),affinity:"before" as const};c.core.select({kind:"text",anchor:end,focus:{...end}},c.revision);return true;}
 return undefined;
}
/**
 * Enter in a summary never splits it: a caret in a summary inserts one empty paragraph as the
 * first body block, expands a collapsed section in the same batch (`set_details_open`) and moves
 * the caret there with pending formats cleared — the local `enterDetailsBody`, as one guarded
 * dispatch and one writer-local Undo step. A range in a summary does nothing; so does a collapsed
 * section on an owner without the V4 block-field (open-state) command.
 * Enter in a table caption inserts a line break like an image caption. `undefined` elsewhere.
 */
export function sharedStructureEnterV4(c:SharedIntentContext):boolean|undefined{
 if(!supported(c))return undefined;
 const s=c.model.view.selection;if(s?.kind!=="text")return undefined;
 const node=selectedText(c.model)??c.model.nodes.get(s.focus.block),parent=node?c.model.parents.get(id(node)):undefined;if(!node||!parent)return undefined;
 if(parent.type==="breditor/table"&&s.anchor.block===s.focus.block){c.core.hardBreak(c.revision);return true;}
 if(node.type!==summary)return undefined;
 if(s.anchor.block!==s.focus.block||s.anchor.offset!==s.focus.offset)return true;
 const collapsed=property(parent,"details-open")!==true;
 if(collapsed&&(c.core as {supportsDetails?():boolean}).supportsDetails?.()!==true)return true;
 const first=parent.children.find((child,index)=>index>0&&child.kind==="element"),paragraph=c.allocate("p");
 const commands:SharedCommand[]=[{kind:"insert_blocks",data:{parent:id(parent),before:first?.kind==="element"?id(first):null,nodes:[emptyParagraph(paragraph)]}}];
 if(collapsed)commands.push({kind:"set_details_open",data:{block:id(parent),open:true}});
 c.core.dispatch({commands,selectionUpdate:{kind:"set",value:caret(paragraph)},pendingFormatsUpdate:{kind:"set",value:null}},c.revision);
 return true;
}
