import {SharedSuggestionRevisions,createSharedSuggestionPanelSource,type SharedRichEditor,type SharedSelectionPolicy,type SharedSuggestionQueue,type SharedSuggestionSync,type SharedSuggestionTextRebase,type SharedSuggestionTextRebaseQueued,type SharedSuggestionTextRebasePolicy,type SharedCommand,type SharedSuggestionCommand} from "@breditor/editor/collaboration";
function text<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,queue:SharedSuggestionQueue<P>,sync:SharedSuggestionSync<P>,outbox:SharedSuggestionRevisions<P>,policy:SharedSuggestionTextRebasePolicy):void {
 if(core.supportsSuggestionTextRebase()){
  const result:SharedSuggestionTextRebase=core.rebaseSuggestionText("original native packet","Rebased","0","durable-namespace",policy,core.view().revision);
  if(result.kind==="captured")core.verifySuggestionRevision("original native packet",result.revisionPacketJson);
 }
 const result:SharedSuggestionTextRebaseQueued=outbox.rebaseText({previousSuggestionId:"id",title:"Rebased",createdAtMs:"0",prefix:"durable-namespace",policy,revision:core.view().revision});
 if(result.kind==="queued")outbox.status(result.revision.id);
 const source=createSharedSuggestionPanelSource(queue,sync,outbox);source.rebaseText?.("id","Rebased","0","durable-namespace",policy,core.view().revision);
 // @ts-expect-error Text policy is explicit, never a default.
 outbox.rebaseText({previousSuggestionId:"id",title:"Rebased",createdAtMs:"0",prefix:"reserved"});
 // @ts-expect-error Host-owned fresh namespace is required even for deleting-only intent.
 outbox.rebaseText({previousSuggestionId:"id",title:"Rebased",createdAtMs:"0",policy});
 // @ts-expect-error Scalar IDs and range witnesses come only from native historical replay.
 outbox.rebaseText({previousSuggestionId:"id",title:"Rebased",createdAtMs:"0",prefix:"reserved",policy,characters:[]});
 // @ts-expect-error No inferred automatic policy is admitted.
 core.rebaseSuggestionText("original","Rebased","0","reserved","automatic");
 // @ts-expect-error Rebase cannot choose a new author.
 outbox.rebaseText({previousSuggestionId:"id",title:"Rebased",createdAtMs:"0",prefix:"reserved",policy,author:"mallory"});
}
function masks(command:Extract<SharedSuggestionCommand,{kind:"replace_masked_general_text_range_v1"}>):void {
 const proposed:SharedSuggestionCommand=command;void proposed;
 // @ts-expect-error Proposal-only masked compound does not widen ordinary dispatch DTOs.
 const ordinary:SharedCommand=command;void ordinary;
}
void text;void masks;
