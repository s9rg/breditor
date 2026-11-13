import assert from 'node:assert/strict';

const comment='Relay saved this comment before its reply';
const versionName='Relay saved this version before its reply';
function versionPublishUrl(endpoint){
 const url=new URL('/document-versions/v1/publish',endpoint);
 url.protocol=url.protocol==='wss:'?'https:':'http:';
 return url.href;
}

export async function beforeTimeout(reply,label){
 let timer;
 try{
  return await Promise.race([reply,new Promise((_,reject)=>{
   timer=setTimeout(()=>reject(Error('Expected a real durable '+label+' reply')),5000);
  })]);
 }finally{clearTimeout(timer);}
}

/** Test-owned HTTP boundary for exactly the immutable packet this client published. */
export function interceptVersionAcknowledgement(endpoint,packet){
 const url=versionPublishUrl(endpoint);
 const fetch=globalThis.fetch,reply=Promise.withResolvers();
 let requests=0;
 globalThis.fetch=async(input,options)=>{
  if(String(input)!==url||options?.method!=='POST'||options.body!==packet)return fetch(input,options);
  requests++;
  const response=await fetch(input,options);
  if(response.status!==200){
   reply.reject(Error('Expected successful version publication, received HTTP '+response.status));
   return response;
  }
  reply.resolve((await response.json()).admission);
  throw Error('Controlled loss of the real version acknowledgement');
 };
 return {reply:reply.promise,check(){assert.equal(requests,1);},restore(){globalThis.fetch=fetch;}};
}

export async function observeUnacknowledgedComment(session,review,socket){
 const original=session.exportDeliveryRecovery().relay;
 await review.connect();
 assert.equal(review.state().pending,false);
 const {core}=session,gate=socket.arm('reviewSubmit');
 assert.equal(core.dispatchReview({kind:'create_thread',data:{
  anchorJson:core.captureReviewAnchor({kind:'document'}),body:comment,
 }}).kind,'committed');
 await session.flush();
 const pending=review.flush().then(()=>null,error=>error);
 const {request,result}=await beforeTimeout(gate.reply,'comment');
 const {admission}=result;
 assert.equal(result.kind,'reviewAdmission');
 assert.equal(admission.kind,'durable');
 assert.equal(admission.duplicate,false);
 assert.equal(gate.submitted.length,1);
 assert.ok(BigInt(admission.sequence)>BigInt(original.reviewReceipt.sequence));
 const clock=core.localReviewClock();
 const source=original.binding.review;
 const expected=core.retainedReviewReceipt(request.frame,{
  actor:source.actor,principal:source.principal,access:'read_only',
 });
 assert.deepEqual(admission.receipt,expected);
 assert.equal(expected.through,clock.through);
 assert.equal(expected.prefixDigest,clock.prefixDigest);
 assert.deepEqual(session.exportDeliveryRecovery().relay.review.accepted,original.review.accepted);
 return {clock,async afterCrash(){
  const error=await pending;
  assert.ok(error?.code==='connection_lost'||error?.code==='request_timeout');
  const relay=session.exportDeliveryRecovery().relay;
  assert.deepEqual(relay.review.accepted,original.review.accepted);
  assert.deepEqual(relay.reviewReceipt,original.reviewReceipt);
 }};
}

export async function observeUnacknowledgedVersion(session,common,endpoint){
 const versions=await session.openVersionCatalog(common);
 const version=versions.saveVersion(versionName,'5');
 await versions.flush();
 const packet=versions.versionPacket(version.id);
 assert.equal(versions.versionStatus(version.id).queued,true);
 const gate=interceptVersionAcknowledgement(endpoint,packet);
 try{
  const connected=versions.connect().then(()=>null,error=>error);
  const admission=await beforeTimeout(gate.reply,'version');
  assert.equal(admission.kind,'durable');
  assert.equal(admission.duplicate,false);
  assert.equal(admission.entry.version.id,version.id);
  assert.equal((await connected)?.code,'version_transfer_failed');
  gate.check();
  assert.equal(versions.versionStatus(version.id).accepted,null);
  assert.equal(versions.versionStatus(version.id).queued,true);
  return {packet,entry:admission.entry};
 }finally{
  gate.restore();
  await versions.close();
 }
}

export function checkLostComment(core){
 const matches=core.reviewSnapshot().view.threads.filter(({thread})=>!thread.hidden&&
  thread.messages.some(message=>message.versions.some(version=>version.text===comment)));
 assert.equal(matches.length,1);
}

export function countVersionSubmissions(endpoint,packet){
 const url=versionPublishUrl(endpoint);
 const fetch=globalThis.fetch;
 let sent=0;
 globalThis.fetch=(input,options)=>{
  if(String(input)===url&&options?.method==='POST'&&options.body===packet)sent++;
  return fetch(input,options);
 };
 return {check(){assert.equal(sent,0,'A version confirmed by the restarted catalog must not be submitted again');},
  restore(){globalThis.fetch=fetch;}};
}
