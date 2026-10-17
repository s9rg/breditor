import {SharedSuggestionRevisions,createSharedSuggestionPanelSource,type SharedRichEditor,type SharedSelectionPolicy,type SharedSuggestionQueue,type SharedSuggestionSync,type SharedSuggestionFormatRebase,type SharedSuggestionFormatRebaseQueued} from "@breditor/editor/collaboration";
function formatting<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,queue:SharedSuggestionQueue<P>,sync:SharedSuggestionSync<P>,outbox:SharedSuggestionRevisions<P>):void {
 if(core.supportsSuggestionFormatRebase()){
  const result:SharedSuggestionFormatRebase=core.rebaseSuggestionFormat("original native packet","Rebased","0",core.view().revision);
  if(result.kind==="captured")core.verifySuggestionRevision("original native packet",result.revisionPacketJson);
 }
 const result:SharedSuggestionFormatRebaseQueued=outbox.rebaseFormat({previousSuggestionId:"id",title:"Rebased",createdAtMs:"0",revision:core.view().revision});
 if(result.kind==="queued")outbox.status(result.revision.id);
 const source=createSharedSuggestionPanelSource(queue,sync,outbox);source.rebaseFormat?.("id","Rebased","0",core.view().revision);
 // @ts-expect-error Original ranges and format witnesses come only from native source replay.
 outbox.rebaseFormat({previousSuggestionId:"id",title:"Rebased",createdAtMs:"0",characters:[]});
 // @ts-expect-error Rebasing cannot supply a different creator or accepted tree.
 core.rebaseSuggestionFormat("original","Rebased","0","revision","forged-author");
}
void formatting;
