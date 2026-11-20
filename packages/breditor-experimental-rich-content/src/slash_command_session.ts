/**
 * Opt-in slash-command suggestion session. Browser routing and presentation only:
 * the trigger is read from admitted Rust views, and choosing an item publishes, through the
 * borrowed DOM coordinator, one native `replaceTriggerThen` composite (one Undo step) when the
 * owner supports it and the item's command is allowlisted, or else two existing typed commands
 * (trigger removal, then the command). No DOM text is edited.
 * The session itself is the shared typed-trigger session (`suggestion_session.ts`).
 */
import type {RichCommand,RichCommandOutcome,RichCoreEditor,RichEditorView,RichSelection,RichSelectionPolicy,RichTriggerCompositeCommand,RichTriggerCompositeKind} from "./core.js";
import type {RichSearchHostState} from "./search_host.js";
import type {RichUiLocale} from "./ui_locale.js";
import {filterRichSlashItems,requireRichSlashItems,type RichSlashItem} from "./slash_command_items.js";
import {RichSuggestionSession,type RichSuggestionContext,type RichSuggestionRun,type RichSuggestionSpec} from "./suggestion_session.js";

/** Structural port satisfied by `RichDomEditor` (local or document scope). */
export interface RichSlashCommandHost {
 readonly surface:HTMLElement;
 /** The existing post-publication read channel; listeners never publish reentrantly. */
 searchState():Pick<RichSearchHostState,"revision"|"closed"|"busy"|"composing"|"readOnly">;
 subscribeSearch(listener:()=>void):()=>void;
 view():RichEditorView<RichSelectionPolicy>;
 execute(command:RichCommand,focus?:boolean,expectedRevision?:string):RichCommandOutcome|"queued";
 focus():void;
 /** Optional chrome catalog: menu strings, standard item labels and the menu's `dir`/`lang`. */
 uiLocale?():RichUiLocale;
 /** Optional native capability probe. When true, an allowlisted item runs as one `replaceTriggerThen`. */
 supportsTriggerComposite?():boolean;
}
export type RichSlashCancelReason=
 |"dismissed"|"composition"|"trigger-invalidated"|"selection-left"|"query-ended"|"blur"|"read-only"|"editor-closed"|"disposed";
export interface RichSlashProviderRequest {readonly signal:AbortSignal;readonly revision:string;readonly session:number}
/** Synchronous list (filtered locally) or a cancellable provider. Aborted/stale results are discarded. */
export type RichSlashProvider=readonly RichSlashItem[]|((query:string,request:RichSlashProviderRequest)=>readonly RichSlashItem[]|Promise<readonly RichSlashItem[]>);
/**
 * `composite`: true when the trigger removal and the command were one native `replaceTriggerThen`
 * publication (one Undo step; `removal` and `outcome` are then that same outcome). False for the
 * two-step fallback (older owners, or a command outside the native allowlist).
 */
export interface RichSlashExecution {readonly item:string;readonly removal:RichCommandOutcome;readonly outcome:RichCommandOutcome|null;readonly composite:boolean}
export interface RichSlashCommandOptions {
 items:RichSlashProvider;
 /** Optional owner exposed to item preparation, for controls that check owner binding. */
 core?:RichCoreEditor<RichSelectionPolicy>;
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
 onExecute?:(execution:RichSlashExecution)=>void;
 onError?:(error:unknown)=>void;
}
export interface RichSlashCommandState {
 readonly open:boolean;readonly disposed:boolean;readonly session:number|null;
 readonly trigger:Readonly<{block:string;start:number}>|null;readonly query:string;
 readonly items:readonly Readonly<{id:string;label:string}>[];readonly active:number;readonly loading:boolean;
 readonly error:string|null;readonly lastCancel:RichSlashCancelReason|null;
}
export interface RichSlashCommands {
 state():RichSlashCommandState;
 move(delta:number):void;
 /** Remove the typed trigger, then run the chosen item's existing command. */
 choose(index?:number):RichSlashExecution;
 cancel(reason?:RichSlashCancelReason):void;
 dispose():void;
}
/** Follow-up kinds the native `replaceTriggerThen` admits (mirrors the Rust allowlist). */
export const richTriggerCompositeKinds:readonly RichTriggerCompositeKind[]=Object.freeze(["setHeading","setCodeBlock","wrapList","setListKind","wrapTaskList","wrapBlockquote","wrapDetails","insertHorizontalRule","insertTable","insertBlocks"]);
const compositeKinds:ReadonlySet<string>=new Set(richTriggerCompositeKinds);
const isRichTriggerCompositeCommand=(command:RichCommand):command is RichTriggerCompositeCommand=>compositeKinds.has(command.kind);
const surfaces=new WeakSet<HTMLElement>();
const slashSpec:RichSuggestionSpec<RichSlashItem,RichSlashExecution>=Object.freeze({
 trigger:"/",attributes:Object.freeze({root:"breditorSlash",status:"slashStatus",index:"slashIndex",item:"slashItem"}),idPrefix:"breditor-slash",surfaces,
 strings:Object.freeze({label:"slashLabel",loading:"slashLoading",countOne:"slashCountOne",count:"slashCount",empty:"slashEmpty"} as const),
 messages:Object.freeze({live:"Slash commands require a live document",duplicate:"This editing surface already has slash commands",limits:"Expected bounded slash-command query and item limits",container:"Slash-command menus must be mounted outside the editing surface",closed:"Use an open editor for slash commands",
  disposed:"Slash commands are disposed",none:"No slash-command session is open",loading:"Slash-command suggestions are still loading",choose:"Choose an available slash command",busy:"Slash commands wait for the current editor operation",invalid:"The slash-command trigger is no longer valid"}),
 admit:(items:unknown,ui:RichUiLocale)=>requireRichSlashItems(items,Number.MAX_SAFE_INTEGER).map(item=>ui.slashItem(item)),
 filter:filterRichSlashItems,
 enabled:(item:RichSlashItem,context:RichSuggestionContext)=>item.enabled(context),
 unavailable:(item:RichSlashItem,ui:RichUiLocale)=>ui.text("slashUnavailable",{label:item.label}),
 execute(item:RichSlashItem,run:RichSuggestionRun):RichSlashExecution{
  const {check,trigger,host}=run,block=trigger.block,selection:Extract<RichSelection,{kind:"text"}>={kind:"text",anchor:{block,offset:String(trigger.start),affinity:"after"},focus:{block,offset:String(check.caret),affinity:check.affinity}};
  if(host.supportsTriggerComposite?.()===true){
   // Allowlisted commands address blocks by identity, so the command prepared from the checked view
   // is exactly the one the removal leaves applicable; Rust re-validates it after the removal.
   const command=item.command(run.context(check.view));
   if(command&&isRichTriggerCompositeCommand(command)){
    const result=host.execute({kind:"replaceTriggerThen",data:{selection,command}},true,check.view.revision);
    if(result==="queued")throw Error("The slash composite was queued instead of published");
    return Object.freeze({item:item.id,removal:result,outcome:result,composite:true});
   }
  }
  const removal:RichCommand=check.view.rangeEditing==="general-v1"?{kind:"replaceGeneralRangePlainText",data:{selection,text:"",prefix:run.allocate("range")}}:{kind:"replaceTextRange",data:{selection,text:""}};
  const removed=host.execute(removal,true,check.view.revision);
  if(removed==="queued")throw Error("The slash trigger removal was queued; its command was not run");
  const after=host.view(),command=item.command(run.context(after));
  let outcome:RichCommandOutcome|null=null;
  if(command){const result=host.execute(command,true,after.revision);if(result==="queued")throw Error("The slash command was queued after its trigger was removed");outcome=result;}
  return Object.freeze({item:item.id,removal:removed,outcome,composite:false});
 },
 report:(item:RichSlashItem,execution:RichSlashExecution,ui:RichUiLocale)=>execution.outcome===null?Error(ui.text("slashInapplicable",{label:item.label})):undefined,
});
/** Mount one opt-in slash-command controller for a borrowed DOM coordinator. */
export function mountRichSlashCommands(host:RichSlashCommandHost,options:RichSlashCommandOptions):RichSlashCommands{return new RichSuggestionSession(host,options,slashSpec);}
