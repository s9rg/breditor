/** Real native alternate/older streams and genuine old-store factories; no fabricated prefix proof. */
import assert from "node:assert/strict";
import {offlineTransport} from "./participant.mjs";
export async function probeInventoryRefusals({api,rich,profile,fixture,inventory,templates,counts,tag}){
 const metadata=inventory.metadata(),room=metadata.room.document,author=templates[0],observer=templates[1];let serial=0;
 const refused=(pair,code)=>{pair.backup.verifySource(pair.source);assert.throws(()=>inventory.checkSources([pair]),e=>e.code===code);pair.backup.verifySource(pair.source);};
 async function document(template,checkpoint,prepare,run,principal=template.client.principal){
  const name=`${tag}-doc-${serial++}`,core=new api.SharedRichEditor(profile.restore(room,checkpoint));let uploads,backup,source;
  try{prepare?.(core);uploads=await rich.RichAssetStore.open(`${name}-uploads`);const result=await api.captureSharedParticipantBackup({identity:{participant:name,principal,source:template.sourceIdentity,stores:["document"],assets:"whole-store"},source:{core},assets:uploads,checkAuthority(){}});assert.equal(result.kind,"ready");backup=result.backup;source=api.captureSharedAssetReferences({core});await run({backup,source,core});}finally{source?.dispose();backup?.dispose();uploads?.close();core.dispose();}
 }
 async function paired(template,change,extraStore,run){
  const name=`${tag}-paired-${serial++}`,record=structuredClone(template.record);change?.(record);const {relay:_oldRelay,...old}=template.options,options={...old,review:{...old.review,access:record.relay?.reviewEditing==="read_only"?"read_only":"comment"},...(record.relay?{relay:record.relay}:{})};
  let session,uploads,versions,suggestions,revisions,backup,source;
  const transport=offlineTransport(counts),getToken=()=>{counts.networkCalls++;throw Error("No network in namespace refusal tests");};
  try{
   const encoded=await api.encodeSharedPairedSessionBackup(template.sourceIdentity,record);session=await api.SharedReviewPersistentSession.restoreBackup({...options,database:`${name}-session`,backupJson:encoded,writerRecovery:"host-reacquired"});uploads=await rich.RichAssetStore.open(`${name}-uploads`);
   if(extraStore==="version"){const identity={endpoint:template.options.relay.endpoint,principal:template.client.principal,room,binding:"0".repeat(64),documentWriter:template.client.writer,...(fixture.atomic?{writerTransport:"atomic-v2"}:{})};assert.notEqual(identity.binding,metadata.versionsBinding);versions=await api.SharedDocumentVersions.open({database:`${name}-versions`,identity,storage:session,autoConnect:false,getToken});}
   if(extraStore==="suggestion"||extraStore==="revision"){
    const identity={endpoint:template.options.relay.endpoint,principal:template.client.principal,room,binding:extraStore==="suggestion"?"0".repeat(64):metadata.suggestionsBinding,documentWriter:template.client.writer,effectWriter:metadata.serverAuthors.find(a=>a.kind==="suggestionEffect").clock.writer,writerTransport:"atomic-v2"};if(extraStore==="suggestion")assert.notEqual(identity.binding,metadata.suggestionsBinding);
    suggestions=await api.SharedSuggestionQueue.open({database:`${name}-suggestions`,identity,storage:session});if(extraStore==="revision"){assert.notEqual(metadata.revisionsBinding,"0".repeat(64));revisions=await api.SharedSuggestionRevisions.open({database:`${name}-revisions`,binding:"0".repeat(64),queue:suggestions,storage:session,transport,autoStart:false});}
   }
   const producers={core:session.core,session,...(versions?{versions}:{}),...(suggestions?{suggestions}:{}),...(revisions?{revisions}:{})},stores=["document","paired-session",...(versions?["version-catalog"]:[]),...(suggestions?["suggestions"]:[]),...(revisions?["suggestion-revisions"]:[])],result=await api.captureSharedParticipantBackup({identity:{participant:name,principal:template.client.principal,source:template.sourceIdentity,stores,assets:"whole-store"},source:producers,assets:uploads,checkAuthority(){}});assert.equal(result.kind,"ready");backup=result.backup;source=api.captureSharedAssetReferences(producers);await run({backup,source,core:session.core});
  }finally{source?.dispose();backup?.dispose();await revisions?.close();await suggestions?.close();await versions?.close();await session?.discardAndClose();uploads?.close();}
 }
 await document(author,author.client.baseCheckpoint,undefined,pair=>{const result=inventory.checkSources([pair]);assert.equal(result.kind,"pending");assert.equal(result.registeredStreamsCovered,false);assert.ok(result.missing.some(r=>r.kind==="document"&&r.writer===author.client.writer&&r.reason==="server_ahead"));counts.behindSourcePending++;});
 await document(author,author.client.forkCheckpoint,undefined,pair=>{const clock=fixture.atomic?pair.core.writerClockV2(author.client.writer):pair.core.writerClock(author.client.writer);assert.equal(clock.through,metadata.writers.find(r=>r.clock.writer===author.client.writer).clock.through);refused(pair,"inventory_fork");counts.documentForkRefusals++;});
 await document(observer,observer.client.documentCheckpoint,core=>{const p={block:"p",offset:"0",affinity:"after"};core.select({kind:"text",anchor:p,focus:p});core.type("Cannot promote this permanent observer");},pair=>{refused(pair,"inventory_source");counts.observerAuthorRefusals++;});
 await document(author,author.client.documentCheckpoint,undefined,pair=>{refused(pair,"inventory_source");counts.foreignPrincipalRefusals++;},"reader");
 await paired(author,r=>{delete r.relay;delete r.progress;r.format="breditor/shared-review-checkpoint-record";},undefined,pair=>{const result=inventory.checkSources([pair]);assert.equal(result.kind,"pending");assert.ok(result.missing.some(r=>r.kind==="unbound_review"&&r.actor===author.client.actor));counts.unboundReviewPending++;});
 await paired(author,r=>{r.reviewCheckpointJson=author.client.forkReviewCheckpoint;},undefined,pair=>{refused(pair,"inventory_fork");counts.reviewForkRefusals++;});
 await paired(author,r=>{r.reviewCheckpointJson=author.client.emptyReviewCheckpoint;},undefined,pair=>{const result=inventory.checkSources([pair]);assert.equal(result.kind,"pending");assert.ok(result.missing.some(r=>r.kind==="review"&&r.actor===author.client.actor&&r.reason==="server_ahead"));counts.behindReviewPending++;});
 await paired(author,r=>{assert.notEqual(r.relay.binding,"0".repeat(64));r.relay.binding="0".repeat(64);},undefined,pair=>{refused(pair,"inventory_source");counts.reviewBindingRefusals++;});
 await paired(observer,r=>{delete r.relay.reviewEditing;r.format="breditor/shared-review-relay-checkpoint-record";},undefined,pair=>{refused(pair,"inventory_source");counts.reviewObserverKindRefusals++;});
 await paired(author,undefined,"version",pair=>{refused(pair,"inventory_source");counts.versionBindingRefusals++;});
 if(fixture.atomic){await paired(author,undefined,"suggestion",pair=>{refused(pair,"inventory_source");counts.suggestionBindingRefusals++;});await paired(author,undefined,"revision",pair=>{refused(pair,"inventory_source");counts.revisionBindingRefusals++;});}
}
