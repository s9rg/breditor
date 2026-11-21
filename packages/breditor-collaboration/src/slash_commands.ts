/**
 * Opt-in slash commands for shared editors. Browser routing and presentation are the local
 * typed-trigger session (`RichSuggestionSession`): the same trigger detection, cancellation,
 * async providers, accessible menu and catalog strings. Only execution differs: choosing an item
 * publishes ONE guarded shared dispatch `{commands:[delete_text(trigger), ...item commands]}` at the
 * checked revision. Shared dispatch treats one ordered batch as one writer-local history group, so
 * one Undo restores the typed `/query` and the original block (see
 * crates/breditor-collaboration/tests/shared_slash_batch_contracts.rs). No DOM text is edited.
 */
import {RichSuggestionSession,filterRichSlashItems,defaultRichUi,type RichEditorView,type RichSelectionPolicy,type RichSearchHostState,type RichUiLocale,
 type RichSuggestionContext,type RichSuggestionRun,type RichSuggestionSpec,type RichSlashCancelReason,type RichSlashCommandState,type RichSlashProviderRequest} from "@breditor/experimental-rich-content";
import type {RichModel} from "@breditor/experimental-rich-content/rendering";
import type {ActionContext,SharedToolbarControl} from "./actions.js";
import type {SharedCommand,SharedDispatch,SharedEditorView,SharedSelectionPolicy} from "./types.js";

/** Structural port satisfied by `SharedDomEditor` (original or document scope). */
export interface SharedSlashCommandHost {
 readonly surface:HTMLElement;
 /** The existing post-publication read channel (local and remote publications); listeners never publish reentrantly. */
 searchState():Pick<RichSearchHostState,"revision"|"closed"|"busy"|"composing"|"readOnly">;
 subscribeSearch(listener:()=>void):()=>void;
 view():SharedEditorView<SharedSelectionPolicy>;
 /** Guarded queue publication; throws when Rust refuses the batch. */
 execute(request:SharedDispatch,focus?:boolean,revision?:string):void;
 focus():void;
 /** Optional chrome catalog: menu strings, standard item labels and the menu's `dir`/`lang`. */
 uiLocale?():RichUiLocale;
}
/** Read-only preparation context: the checked shared view's model, its revision and fresh ids. */
export interface SharedSlashContext {readonly model:RichModel<RichSelectionPolicy>;readonly revision:string;allocate(kind:string):string}
/** The follow-up part of one slash batch. Commands address blocks by identity (see `sharedSlashCommandKinds`). */
export interface SharedSlashPreparation {readonly commands:readonly SharedCommand[];readonly selectionUpdate?:SharedDispatch["selectionUpdate"]}
export interface SharedSlashItem {
 readonly id:string;readonly label:string;readonly keywords?:readonly string[];readonly description?:string;
 enabled(context:SharedSlashContext):boolean;
 /** Prepared from the checked pre-removal view; null when the item no longer applies. */
 prepare(context:SharedSlashContext):SharedSlashPreparation|null;
}
/** Adapt one existing shared toolbar control. Values/fields are fixed at definition time. */
export interface SharedSlashPick {
 readonly id:string;readonly control:string;readonly label?:string;readonly keywords?:readonly string[];readonly description?:string;
 readonly value?:string;readonly fields?:Readonly<Record<string,string>>;
}
export type SharedSlashProvider=readonly SharedSlashItem[]|((query:string,request:RichSlashProviderRequest)=>readonly SharedSlashItem[]|Promise<readonly SharedSlashItem[]>);
/** One guarded publication: `request` is the exact batch, published at the checked `revision`. */
export interface SharedSlashExecution {readonly item:string;readonly request:SharedDispatch;readonly revision:string}
export interface SharedSlashCommandOptions {
 items:SharedSlashProvider;
 /** Query length after the slash; longer queries end the session. Default 32, maximum 64. */
 maxQueryLength?:number;
 /** Displayed item limit. Default 10, maximum 50. */
 maxItems?:number;
 /** Overrides the host catalog's slashLabel. */
 label?:string;
 /** Menu parent; defaults to the surface document body. Must be outside the editing surface. */
 container?:HTMLElement;
 onOpen?:(state:RichSlashCommandState)=>void;
 onCancel?:(reason:RichSlashCancelReason)=>void;
 onExecute?:(execution:SharedSlashExecution)=>void;
 onError?:(error:unknown)=>void;
}
export interface SharedSlashCommands {
 state():RichSlashCommandState;
 move(delta:number):void;
 /** Remove the typed trigger and run the chosen item in one guarded shared batch (one Undo step). */
 choose(index?:number):SharedSlashExecution;
 cancel(reason?:RichSlashCancelReason):void;
 dispose():void;
}

/**
 * Shared command kinds a slash batch may carry after the trigger removal. Each addresses blocks by
 * identity, never by text offsets, so removing the trigger text first cannot retarget it (mirrors the
 * local `replaceTriggerThen` allowlist).
 */
export const sharedSlashCommandKinds:readonly SharedCommand["kind"][]=Object.freeze(["set_heading","set_code_block","wrap_list","set_list_kind","wrap_task_list","wrap_blockquote","insert_horizontal_rule","insert_blocks","wrap_details","insert_page_break"]);
const allowed:ReadonlySet<string>=new Set(sharedSlashCommandKinds);
const maxCommands=16;
/**
 * Default shared menu: the local standard picks mapped onto shared toolbar control ids. The rich V4
 * items (Collapsible section, Page break) map onto the shared V4 structure controls, so they appear
 * only with a V4 toolbar. Picks whose control is absent from the supplied toolbar (structural items
 * on a V1 toolbar, V4 items on V1–V3 toolbars) are omitted.
 */
export const standardSharedSlashPicks:readonly SharedSlashPick[]=Object.freeze([
 {id:"paragraph",control:"paragraph",label:"Text",keywords:["paragraph","plain","body"]},
 {id:"heading-1",control:"h1",label:"Heading 1",keywords:["h1","title"]},
 {id:"heading-2",control:"h2",label:"Heading 2",keywords:["h2","subtitle"]},
 {id:"heading-3",control:"h3",label:"Heading 3",keywords:["h3"]},
 {id:"bullet-list",control:"bullet",label:"Bullet list",keywords:["ul","unordered","list"]},
 {id:"numbered-list",control:"numbered",label:"Numbered list",keywords:["ol","ordered","list"]},
 {id:"task-list",control:"tasks",label:"Task list",keywords:["todo","checkbox","check"]},
 {id:"blockquote",control:"blockquote",label:"Quote",keywords:["blockquote","citation"]},
 {id:"code-block",control:"code-block",label:"Code block",keywords:["code","pre","snippet"],fields:{language:"",policy:"reject_formatted"}},
 {id:"horizontal-rule",control:"horizontal-rule",label:"Divider",keywords:["hr","rule","separator","line"]},
 {id:"table",control:"table",label:"Table",keywords:["grid","cells"]},
 {id:"details",control:"details",label:"Collapsible section",keywords:["details","summary","toggle","collapse","disclosure"]},
 {id:"page-break",control:"page-break",label:"Page break",keywords:["page","break","print","new page"]},
].map(pick=>Object.freeze(pick)));

const identity=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
/** Throws on malformed or duplicate identities before any menu state changes. */
export function requireSharedSlashItems(items:unknown,limit=50):readonly SharedSlashItem[]{
 if(!Array.isArray(items))throw new TypeError("Slash-command providers must return an array of items");
 const seen=new Set<string>(),out:SharedSlashItem[]=[];
 for(const item of items as unknown[]){
  const value=item as Partial<SharedSlashItem>|null;
  if(!value||typeof value.id!=="string"||!identity.test(value.id)||typeof value.label!=="string"||!value.label.trim()||value.label.length>120||typeof value.enabled!=="function"||typeof value.prepare!=="function"||value.keywords!==undefined&&(!Array.isArray(value.keywords)||value.keywords.some(word=>typeof word!=="string"))||value.description!==undefined&&typeof value.description!=="string")throw new TypeError("Expected shared slash-command items with a stable id, label, enabled() and prepare()");
  if(seen.has(value.id))throw Error(`Duplicate slash-command item identity ${value.id}`);seen.add(value.id);
  if(out.length<limit)out.push(value as SharedSlashItem);
 }
 return Object.freeze(out);
}
/** Admit one preparation: bounded, allowlisted, JSON-frozen. Throws on anything else. */
function admitPreparation(value:SharedSlashPreparation|null):SharedSlashPreparation|null{
 if(value===null)return null;
 const commands=value?.commands;
 if(!Array.isArray(commands)||!commands.length||commands.length>maxCommands)throw new TypeError("Expected 1 to 16 prepared shared commands");
 for(const command of commands as readonly SharedCommand[])if(!command||!allowed.has(command.kind))throw Error(`Shared slash batches cannot carry ${String(command?.kind)}`);
 if(value.selectionUpdate!==undefined&&value.selectionUpdate.kind!=="map"&&value.selectionUpdate.kind!=="set")throw new TypeError("Expected a shared selection update");
 return JSON.parse(JSON.stringify({commands,...(value.selectionUpdate?{selectionUpdate:value.selectionUpdate}:{})})) as SharedSlashPreparation;
}
/**
 * Capture what one toolbar control would publish, without publishing: the control runs against a
 * port whose only operation is `dispatch`, which records the request. A control that needs any
 * other owner operation, publishes twice, or publishes a non-allowlisted command is not
 * representable as a slash batch (null).
 */
function port(dispatch?:(request:SharedDispatch)=>void):object{
 return new Proxy(Object.create(null) as object,{get(_target,name){
  if(name==="dispatch"&&dispatch)return (request:SharedDispatch)=>{dispatch(request);return true;};
  return ()=>{throw Error(`Slash batches cannot call the shared owner's ${String(name)}`);};
 }});
}
const actionContext=(context:SharedSlashContext,core:object)=>({core,model:context.model,revision:context.revision,allocate:(kind:string)=>context.allocate(kind)}) as unknown as ActionContext<SharedSelectionPolicy>;
function capture(control:SharedToolbarControl<SharedSelectionPolicy>,context:SharedSlashContext,value?:string,fields?:Readonly<Record<string,string>>):SharedSlashPreparation|null{
 let captured:SharedDispatch|undefined,count=0;
 try{control.run(actionContext(context,port(request=>{count++;captured=request;})),value,fields);}catch{return null;}
 if(count!==1||!captured||captured.pendingFormatsUpdate!==undefined)return null;
 try{return admitPreparation({commands:captured.commands,...(captured.selectionUpdate?{selectionUpdate:captured.selectionUpdate}:{})});}catch{return null;}
}
/**
 * Map existing shared toolbar controls into slash items; never creates a new command family.
 * `ui` (an editor's `uiLocale()`) relabels standard item ids.
 */
export function createSharedSlashCommands<P extends SharedSelectionPolicy>(controls:readonly SharedToolbarControl<P>[],picks:readonly SharedSlashPick[]=standardSharedSlashPicks,ui?:RichUiLocale):readonly SharedSlashItem[]{
 const byId=new Map(controls.map(control=>[control.id,control as unknown as SharedToolbarControl<SharedSelectionPolicy>]));
 const items:SharedSlashItem[]=[];
 for(const pick of picks){
  const control=byId.get(pick.control);if(!control)continue;
  const fields=pick.fields?Object.freeze({...pick.fields}):undefined,value=pick.value;
  items.push(Object.freeze({id:pick.id,label:pick.label??control.label,...(pick.keywords?{keywords:Object.freeze([...pick.keywords])}:{}),...(pick.description?{description:pick.description}:{}),
   enabled:(context:SharedSlashContext)=>{if(context.model.view.readOnly===true)return false;try{if(!control.enabled(actionContext(context,port())))return false;}catch{return false;}return capture(control,context,value,fields)!==null;},
   prepare:(context:SharedSlashContext)=>capture(control,context,value,fields)}));
 }
 return requireSharedSlashItems(ui?items.map(item=>ui.slashItem(item)):items,Number.MAX_SAFE_INTEGER);
}
/** The shared view under the rendering format tag the presentation model reads (scope, AST and guards unchanged). */
function presentationView(view:SharedEditorView<SharedSelectionPolicy>):RichEditorView<RichSelectionPolicy>{
 const document=view.format==="breditor/shared-document-view";
 if(!document&&view.format!=="breditor/shared-rich-view")throw Error("Use the explicitly selected native shared view family");
 return {...view,format:document?"breditor/rich-document-view":"breditor/rich-view"} as unknown as RichEditorView<RichSelectionPolicy>;
}
const contextOf=(context:RichSuggestionContext):SharedSlashContext=>Object.freeze({model:context.model,revision:context.model.view.revision,allocate:(kind:string)=>context.allocate(kind)});
const surfaces=new WeakSet<HTMLElement>();
function spec(host:SharedSlashCommandHost):RichSuggestionSpec<SharedSlashItem,SharedSlashExecution>{
 return Object.freeze({
  trigger:"/",attributes:Object.freeze({root:"breditorSlash",status:"slashStatus",index:"slashIndex",item:"slashItem"}),idPrefix:"breditor-slash",surfaces,
  strings:Object.freeze({label:"slashLabel",loading:"slashLoading",countOne:"slashCountOne",count:"slashCount",empty:"slashEmpty"} as const),
  messages:Object.freeze({live:"Slash commands require a live document",duplicate:"This editing surface already has slash commands",limits:"Expected bounded slash-command query and item limits",container:"Slash-command menus must be mounted outside the editing surface",closed:"Use an open editor for slash commands",
   disposed:"Slash commands are disposed",none:"No slash-command session is open",loading:"Slash-command suggestions are still loading",choose:"Choose an available slash command",busy:"Slash commands wait for the current editor operation",invalid:"The slash-command trigger is no longer valid"}),
  admit:(items:unknown,ui:RichUiLocale)=>requireSharedSlashItems(items,Number.MAX_SAFE_INTEGER).map(item=>ui.slashItem(item)),
  filter:(items:readonly SharedSlashItem[],query:string)=>filterRichSlashItems(items as never,query) as unknown as readonly SharedSlashItem[],
  enabled:(item:SharedSlashItem,context:RichSuggestionContext)=>item.enabled(contextOf(context)),
  unavailable:(item:SharedSlashItem,ui:RichUiLocale)=>ui.text("slashUnavailable",{label:item.label}),
  execute(item:SharedSlashItem,run:RichSuggestionRun):SharedSlashExecution{
   const {check,trigger}=run,revision=check.view.revision;
   // Prepared from the checked pre-removal view: every allowlisted command addresses blocks by
   // identity, and Rust validates the whole ordered batch atomically (a refusal publishes nothing).
   const prepared=admitPreparation(item.prepare(contextOf(run.context(check.view))));
   if(!prepared)throw Error((host.uiLocale?.()??defaultRichUi).text("slashUnavailable",{label:item.label}));
   const removal:SharedCommand={kind:"delete_text",data:{block:trigger.block,offset:trigger.start,length:check.caret-trigger.start}};
   const request:SharedDispatch={commands:[removal,...prepared.commands],...(prepared.selectionUpdate?{selectionUpdate:prepared.selectionUpdate}:{})};
   host.execute(request,true,revision);
   return Object.freeze({item:item.id,request,revision});
  },
 });
}
/** Mount one opt-in slash-command controller for a borrowed shared DOM coordinator. */
export function mountSharedSlashCommands(host:SharedSlashCommandHost,options:SharedSlashCommandOptions):SharedSlashCommands{
 const port=Object.freeze({
  surface:host.surface,searchState:()=>host.searchState(),subscribeSearch:(listener:()=>void)=>host.subscribeSearch(listener),
  view:()=>presentationView(host.view()),
  execute:()=>{throw Error("Shared slash commands publish one shared dispatch batch");},
  focus:()=>host.focus(),...(host.uiLocale?{uiLocale:()=>host.uiLocale!()}:{}),
 });
 return new RichSuggestionSession<SharedSlashItem,SharedSlashExecution>(port,{...options},spec(host));
}
