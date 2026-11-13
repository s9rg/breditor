import assert from 'node:assert/strict';
import {deliveryDraft} from '../independent-delivery/session.mjs';
import {beforeTimeout} from './lost-metadata-ack.mjs';

const acceptedText='Accepted suggestion survived the relay crash ';
const revisedText='Revised suggestion stays pending ';

export async function observeUnacknowledgedDecision(api,session,document,socket){
 const queue=await session.openSuggestionQueue();
 const sync=new api.SharedSuggestionSync(queue,document,{autoStart:false});
 try{
  const proposal=queue.propose('Recover accepted suggestion','6',deliveryDraft(acceptedText));
  await sync.connect();
  await sync.flushShared();
  const packet=queue.packet(proposal.id);
  const prepared=session.core.prepareSuggestion(packet);
  assert.equal(prepared.kind,'ready');
  const gate=socket.arm('suggestionDecide');
  try{assert.equal(queue.queueDecision(proposal.id,'accept','7',prepared.preview),true);}
  finally{prepared.preview.dispose();}
  await queue.flush();
  const pending=sync.flushShared().then(()=>null,error=>error);
  const {result}=await beforeTimeout(gate.reply,'suggestion decision');
  assert.equal(result.kind,'suggestionDecisionAdmission');
  const {admission}=result;
  assert.equal(admission.kind,'durable');
  assert.equal(admission.duplicate,false);
  assert.equal(gate.submitted.length,1);
  assert.equal(admission.decision.suggestionId,proposal.id);
  assert.equal(admission.decision.decision,'accept');
  assert.ok(admission.decision.effect);
  assert.equal(queue.status(proposal.id).decision,null);
  return {packet,decision:admission.decision,async afterCrash(){
   assert.ok(await pending,'The original decision flush must fail without its reply');
   assert.equal(queue.status(proposal.id).decision,null);
   assert.equal(queue.status(proposal.id).intent.retry,true);
  },stop};
 }catch(error){sync.dispose();throw error;}

 async function stop(){
  sync.disconnect();
  try{await sync.waitForDisconnected();}finally{sync.dispose();}
 }
}

export async function observeUnacknowledgedRevision(session,document,socket){
 const queue=await session.openSuggestionQueue();
 const revisions=await session.openSuggestionRevisions({transport:document});
 const root=queue.propose('Recover revision predecessor','8',deliveryDraft('Superseded proposal '));
 const revision=revisions.revise({previousSuggestionId:root.id,title:'Recover saved revision',createdAtMs:'9',
  draft:deliveryDraft(revisedText)});
 await revisions.flush();
 const gate=socket.arm('suggestionRevisionPublish');
 const pending=revisions.connect().then(()=>null,error=>error);
 const {result}=await beforeTimeout(gate.reply,'suggestion revision');
 assert.equal(result.kind,'suggestionRevisionAdmission');
 const {admission}=result;
 assert.equal(admission.kind,'durable');
 assert.equal(admission.duplicate,false);
 assert.equal(gate.submitted.length,1);
 assert.equal(admission.revision.revision.id,revision.id);
 assert.equal(admission.revision.previousDecision.decision,'reject');
 const {packet}=revisions.status(revision.id);
 return {packet,previousPacket:queue.packet(root.id),receipt:admission.revision,async afterCrash(){
  assert.ok(await pending,'The original revision sync must fail without its reply');
  const status=revisions.status(revision.id);
  assert.equal(status.retry,true);
  assert.equal(status.receipt,null);
  assert.equal(queue.status(root.id).decision,null);
  await revisions.close();
 }};
}

export function checkLostSuggestionEffect(core,decision){
 assert.equal(core.documentJson().split(acceptedText).length-1,1);
 assert.equal(core.documentJson().includes(revisedText),false);
 assert.equal(core.retainedWriterReceiptV2(decision.effect.writerGroup).kind,'verified');
}
