import assert from 'node:assert/strict';

const count=(text,marker)=>text.split(marker).length-1;

function visibleComments(core,body){
 return core.reviewSnapshot().view.threads.filter(({thread})=>!thread.hidden&&
  thread.messages.some(message=>message.versions.some(version=>version.text===body))).length;
}

function checkWork(core,{text,comment},expected){
 assert.equal(count(core.documentJson(),text),expected);
 assert.equal(visibleComments(core,comment),expected);
}

/** Both writers use the original native actor and the same paragraph while the relay is down. */
export async function queueOutageWork(api,cohort,names,health){
 await assert.rejects(fetch(health,{signal:AbortSignal.timeout(1000)}),{name:'TypeError'});
 const queued=new Map();
 for(const [index,{id,options}] of cohort.slice(0,2).entries()){
  const open={...options,database:names.get(id)};
  const session=await api.SharedContinuedPairSession.openDelivery(open);
  const work={text:`Relay outage edit ${index+1} `,comment:`Relay outage comment ${index+1}`};
  let retained;
  try{
   const {core}=session,before=session.exportDeliveryRecovery();
   assert.equal(core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:work.text}}]}),true);
   assert.equal(core.dispatchReview({kind:'create_thread',data:{
    anchorJson:core.captureReviewAnchor({kind:'document'}),body:work.comment,
   }}).kind,'committed');
   checkWork(core,work,1);
   assert.equal(core.undo(),true);
   assert.equal(core.undoReview().kind,'committed');
   checkWork(core,work,0);
   assert.equal(core.redo(),true);
   assert.equal(core.redoReview().kind,'committed');
   checkWork(core,work,1);
   const versions=await session.openVersionCatalog({getToken(){assert.fail('Outage edits must not request a token');}});
   const version=versions.saveVersion(`Relay outage version ${index+1}`,'4');
   await versions.flush();
   assert.equal(versions.versionStatus(version.id).queued,true);
   await versions.close();
   await session.flush();
   retained=session.exportDeliveryRecovery();
   assert.deepEqual(retained.relay,before.relay,'Offline work cannot acknowledge itself');
   queued.set(id,{...work,versionId:version.id,packet:retained.retained.versions.packets.find(
    row=>row.origin==='local'&&core.readVersion(row.packet).id===version.id).packet});
  }finally{await session.close();}

  const cold=await api.SharedContinuedPairSession.openDelivery(open);
  try{
   assert.deepEqual(cold.exportDeliveryRecovery(),retained);
   checkWork(cold.core,work,1);
   for(const peer of queued.values())if(peer.text!==work.text)checkWork(cold.core,peer,0);
  }finally{await cold.close();}
 }
 return queued;
}

/** Verify exact old acknowledgements plus this author's new outage packets. */
export function checkOutageAcknowledgements(session,previous,accepted,work){
 const {core}=session;
 const clock=core.writerClockV2(previous.document.accepted.writer);
 const comments=core.localReviewClock();
 assert.deepEqual(accepted.document.accepted,clock);
 assert.equal(accepted.document.receipt.receipt.through,clock.through);
 assert.equal(accepted.review.receipt.through,comments.through);
 assert.equal(accepted.review.receipt.prefixDigest,comments.prefixDigest);
 assert.ok(BigInt(clock.through)>BigInt(previous.document.accepted.through));
 assert.ok(BigInt(comments.through)>BigInt(previous.review.receipt.through));
 assert.deepEqual(accepted.suggestions,previous.suggestions);
 assert.deepEqual(accepted.revisions,previous.revisions);
 assert.deepEqual(accepted.versions.filter(row=>row.packet!==work.packet),previous.versions);
 const next=accepted.versions.filter(row=>row.packet===work.packet);
 assert.equal(next.length,1);
 assert.equal(next[0].accepted?.version.id,work.versionId);
}

export function checkOutageConvergence(core,queued){
 for(const work of queued.values())checkWork(core,work,1);
}
