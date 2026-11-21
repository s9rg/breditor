/**
 * Agent tool contract over a shared editor (docs/AI_AGENT_TOOLS.md, "Shared editors"). Same tools, validation,
 * bounds and stale rules as local editors. An applied plan is ONE guarded shared dispatch (one explicit writer-local
 * history group, never joined with typing) submitted with the exact verified revision; peers converge on it like any
 * other edit. With a suggestion queue the default review files each agent change as one native proposal instead.
 */
import {createRichAgentTools,RichAgentError,type RichAgentPlan,type RichAgentToolsHost,type RichAgentTools,type RichAgentToolsOptions,type RichCommandOutcome} from "@breditor/experimental-rich-content";
import type {SharedAiEditorPort} from "./ai_tools.js";
import type {SharedCommand,SharedDispatch,SharedNode} from "./types.js";
import type {SharedDocumentSuggestionDraft} from "./suggestion_types.js";

/** Structural shape satisfied by `SharedDomEditor` (both selection policies). The editor stays owned elsewhere. */
export interface SharedAgentEditorPort extends Pick<SharedAiEditorPort,"surface"|"searchState"|"subscribeSearch"|"view"|"focus"> {
 execute(request:SharedDispatch,focus?:boolean,revision?:string):void;
}
/** Review-system port: `SharedSuggestionQueue.propose` (pure native capture; accepted content is unchanged). */
export interface SharedAgentProposalQueue {propose(title:string,createdAtMs:string,draft:SharedDocumentSuggestionDraft):{readonly id:string}}
export interface SharedAgentToolsHostOptions {
 /** File reviewable agent changes as native proposals in this queue (the shared review system). */
 proposals?:SharedAgentProposalQueue;
 /** Clock for proposal creation times (milliseconds). */
 now?:()=>number;
}
/** Lower a validated plan to shared semantic commands (one dispatch). */
export function sharedAgentCommands(plan:RichAgentPlan):SharedCommand[]{
 const commands:SharedCommand[]=[];
 for(const step of plan.steps){
  switch(step.kind){
   case "replaceText":
    if(step.end>step.start)commands.push({kind:"delete_text",data:{block:step.block,offset:step.start,length:step.end-step.start}});
    if(step.text)commands.push({kind:"insert_text",data:{block:step.block,offset:step.start,text:step.text}});
    break;
   case "setFormat":commands.push({kind:"set_format",data:{block:step.block,offset:step.start,length:step.end-step.start,format:{type:step.format,properties:{}},enabled:step.enabled}});break;
   case "setHeading":commands.push({kind:"set_heading",data:{block:step.block,level:step.level}});break;
   case "insertBlocks":{
    const nodes:SharedNode[]=step.blocks.map(b=>({kind:"element",type:b.level===null?"breditor/paragraph":"breditor/heading",entityId:null,properties:{"breditor/block-id":b.block,...(b.level===null?{}:{"breditor/level":b.level})},children:b.text?[{kind:"text",text:b.text,formats:[]}]:[]}) as SharedNode);
    commands.push({kind:"insert_blocks",data:{parent:step.parent?.block??null,before:step.before,nodes}});break;
   }
   case "deleteBlock":commands.push({kind:"delete_block",data:{block:step.block}});break;
  }
 }
 return commands;
}
/** Adapt a shared DOM editor to the agent tools port. */
export function sharedAgentToolsHost(editor:SharedAgentEditorPort,options:SharedAgentToolsHostOptions={}):RichAgentToolsHost{
 for(const name of ["searchState","subscribeSearch","view","execute"] as const)if(typeof editor?.[name]!=="function")throw new TypeError("Expected a shared DOM editor");
 const queue=options.proposals;if(queue!==undefined&&typeof queue?.propose!=="function")throw new TypeError("Expected a suggestion queue");
 const now=options.now??(()=>Date.now());
 const namespace=`br:agent:${globalThis.crypto.randomUUID()}`;let counter=0n;
 return Object.freeze({
  agentKind:"shared" as const,
  agentState:()=>{const s=editor.searchState();return Object.freeze({revision:s.revision,closed:s.closed,busy:s.busy,composing:s.composing,readOnly:s.readOnly});},
  subscribeAgent:(listener:()=>void)=>editor.subscribeSearch(listener),
  agentView:()=>{const v=editor.view();return Object.freeze({revision:v.revision,documentJson:v.documentJson,selection:v.selection,rangeEditing:v.rangeEditing,readOnly:v.readOnly});},
  applyAgentPlan:(plan:RichAgentPlan,revision:string):RichCommandOutcome|"queued"=>{
   const before=editor.view().documentJson;
   editor.execute({commands:sharedAgentCommands(plan),selectionUpdate:{kind:"map"}},false,revision);
   const state=editor.searchState();if(state.busy||state.composing)return "queued";
   if(editor.view().documentJson===before)throw new RichAgentError("native_refused","The shared owner refused the change; nothing was published");
   return "content";
  },
  ...(queue?{proposeAgentPlan:(plan:RichAgentPlan,title:string,revision:string):string=>{
   if(editor.view().revision!==revision)throw new RichAgentError("stale_revision","The document changed; read it again");
   return queue.propose(title,String(now()),{scope:"commands",edit:{kind:"commands",data:sharedAgentCommands(plan)}}).id;
  }}:{}),
  allocateAgentBlock:()=>`${namespace}:p:${counter++}`,
 });
}
/** Create the agent tools over a shared DOM editor (review mode by default; proposals when a queue is given). */
export function createSharedAgentTools(editor:SharedAgentEditorPort,options:RichAgentToolsOptions&SharedAgentToolsHostOptions={}):RichAgentTools{
 const {proposals,now,...rest}=options;
 return createRichAgentTools(sharedAgentToolsHost(editor,{...(proposals?{proposals}:{}),...(now?{now}:{})}),{...rest,...(now?{now}:{})});
}
