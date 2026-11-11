/** These exercise transport boundaries. Actual Native serving is a separate functional workset. */
import test from 'node:test';import assert from 'node:assert/strict';
import {SharedNativeRoomPublicationHost as Host,nativePublicationHostPort} from '../packages/breditor-collaboration/dist/native_publication_control/host.js';
import {nativePublicationRequest} from '../packages/breditor-collaboration/dist/native_publication_control/identity.js';
import {options,selection,joint,token,endpoint,receipt,json,code,using} from './fixtures/native-publication/transport.mjs';
import {decideColdActivation,nativePublicationWaits} from '../packages/breditor-collaboration/dist/native_room_joint_activation/cold_variant.js';
import {holdMetadataContinuation} from '../packages/breditor-collaboration/dist/selected_local_metadata_continuation/lifetime.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
test('configuration makes no request or policy callback and snapshots independent Native choices',async()=>{
 let callbacks=0,calls=0;const expected=selection();const host=Host.configure(options({expected,getToken(){callbacks++;return token;},checkAuthority(){callbacks++;}}));expected.activation.checkpointSha256[0]=99;expected.listener='forged';assert.equal(host.selection().listener,'127.0.0.1:4190');assert.equal(Object.isFrozen(host.selection().activation.checkpointSha256),true);await using(()=>{calls++;throw Error('no IO');},async()=>{assert.equal(callbacks,0);assert.equal(calls,0);});host.close();
});
for(const url of ['http://remote.example/recovery/native-publication/v1/publish','https://u:p@example.test/recovery/native-publication/v1/publish','https://example.test/recovery/native-publication/v1/publish?q=1','https://example.test/recovery/native-publication/v1/publish#x','https://example.test/recovery/native-activation/v1/commit'])test('publication rejects independently configured unsafe/wrong endpoint '+url.replace('u:p@','credentials@'),()=>{assert.throws(()=>Host.configure(options({endpoint:url})),code('publication_policy'));});
test('copied and prototype-shaped descriptions cannot supply an actual SDK requester port',()=>{for(const copy of [{...options()},Object.create(Host.prototype),null])assert.throws(()=>nativePublicationHostPort(copy),code('publication_policy'));});
test('publication sends only selected association with explicit authenticated request policy',async()=>{
 const host=Host.configure(options());let calls=0;await using(async(url,init)=>{calls++;assert.equal(url,endpoint);assert.equal(init.method,'POST');assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.deepEqual(init.headers,{Authorization:'Bearer '+token,'X-Breditor-Principal':'operator','Content-Type':'application/json'});const request=JSON.parse(init.body);assert.deepEqual(request,nativePublicationRequest(host.selection(),joint()));return json(receipt(request));},async()=>{const result=await host.publish(joint());assert.equal(result.scope,'actual-held-native-service-and-bound-listener; joint-association-only');assert.deepEqual(result.selection,host.selection());assert.equal(calls,1);});host.close();
});
test('malformed joint associations refuse before token retrieval or HTTP',async()=>{
 let calls=0;const host=Host.configure(options({getToken(){calls++;return token;}}));for(const body of [{bytes:0,sha256:Array(32).fill(1)},{bytes:1024**3+1,sha256:Array(32).fill(1)},{bytes:1,sha256:Array(31).fill(1)},{bytes:1,sha256:Array(32).fill(256)},{...joint(),ready:true},null])await assert.rejects(host.publish(body),code('publication_policy'));assert.equal(calls,0);host.close();
});
test('binding accessors never run and reentrant reflection finds an already reserved request',async()=>{
 let getters=0;const host=Host.configure(options());await assert.rejects(host.publish({get bytes(){getters++;return 1;},sha256:Array(32).fill(1)}),code('publication_policy'));assert.equal(getters,0);
 const nested=[];const input=new Proxy(joint(),{ownKeys(target){nested.push(assert.rejects(host.publish(joint()),code('publication_busy')));return Reflect.ownKeys(target);}});await using(async(_url,init)=>json(receipt(JSON.parse(init.body))),async()=>{await host.publish(input);await Promise.all(nested);assert.ok(nested.length>0);});host.close();
});
for(const status of[400,403,503])test('post-submission HTTP '+status+' stays unknown without retry',async()=>{const host=Host.configure(options());let calls=0;await using(async()=>{calls++;return json('{}',status);},async()=>{await assert.rejects(host.publish(joint()),code('publication_outcome_unknown'));assert.equal(calls,1);});host.close();});
test('foreign, malformed and noncanonical complete receipts stay unknown',async()=>{
 const host=Host.configure(options());for(const variant of ['instance','joint','activation','scope','extra','trailing'])await using(async(_url,init)=>{const request=JSON.parse(init.body),value=JSON.parse(receipt(request));if(variant==='instance')value.selection.instance='f'.repeat(64);if(variant==='joint')value.joint.sha256[0]^=1;if(variant==='activation')value.selection.activation.planned.owner='f'.repeat(64);if(variant==='scope')value.scope='whole-room-ready';if(variant==='extra')value.ready=true;return json(JSON.stringify(value)+(variant==='trailing'?'\n':''));},async()=>assert.rejects(host.publish(joint()),code('publication_outcome_unknown')));host.close();
});
test('short, oversized, wrong MIME and invalid UTF8 responses never become receipts',async()=>{
 const host=Host.configure(options());for(const response of [()=>json('{}',200,{'content-length':'3'}),()=>json(' '.repeat(65537)),()=>json('{}',200,{'content-type':'text/plain'}),()=>new Response(new Uint8Array([0xff]),{headers:{'content-type':'application/json'}})])await using(async()=>response(),async()=>assert.rejects(host.publish(joint()),code('publication_outcome_unknown')));host.close();
});
test('token refusal and early authority loss make zero network requests',async()=>{
 let calls=0;await using(async()=>{calls++;throw Error('not reached');},async()=>{const tokenHost=Host.configure(options({getToken(){throw Error('TEST_PRIVATE token failure');}}));await assert.rejects(tokenHost.publish(joint()),code('publication_transfer'));tokenHost.close();const authorityHost=Host.configure(options({checkAuthority(){throw Error('TEST_PRIVATE policy');}}));await assert.rejects(authorityHost.publish(joint()),code('publication_authority'));authorityHost.close();assert.equal(calls,0);});
});
test('late token work cannot submit after actual source authority is revoked',async()=>{
 const gate=deferred(),entered=deferred();let active=true,calls=0;const host=Host.configure(options({getToken(){entered.resolve();return gate.promise;},checkAuthority(){if(!active)throw Error('TEST_PRIVATE revoked');}}));await using(async()=>{calls++;throw Error('not reached');},async()=>{const pending=host.publish(joint());await entered.promise;active=false;gate.resolve(token);await assert.rejects(pending,code('publication_authority'));assert.equal(calls,0);});host.close();
});
test('before-submit cancellation differs from uncertain cancellation after fetch begins',async()=>{
 const early=new AbortController();early.abort();const host=Host.configure(options({signal:early.signal}));await assert.rejects(host.publish(joint()),code('publication_cancelled'));host.close();
 const queued=new AbortController();let scheduled=false,tokenCalls=0,requests=0;
 const pendingToken=Host.configure(options({
  signal:queued.signal,
  checkAuthority(){if(!scheduled){scheduled=true;queueMicrotask(()=>queued.abort());}},
  getToken(){tokenCalls++;return token;}
 }));
 try{
  await using(async()=>{requests++;throw Error('Cancelled publication must not fetch');},async()=>{
   await assert.rejects(pendingToken.publish(joint()),code('publication_cancelled'));
   assert.equal(requests,0);
   assert.equal(tokenCalls,0,'Cancellation before token invocation must skip the host callback');
  });
 }finally{pendingToken.close();}
 const controller=new AbortController(),entered=deferred();const late=Host.configure(options({signal:controller.signal}));await using(async(_url,init)=>{entered.resolve();return new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('TEST_PRIVATE disconnected')),{once:true}));},async()=>{const pending=late.publish(joint());await entered.promise;controller.abort();await assert.rejects(pending,code('publication_outcome_unknown'));});late.close();
});
test('one actual requester owns in-flight work and closing cannot imply rollback',async()=>{
 const gate=deferred(),entered=deferred(),host=Host.configure(options());await using(async(_url,init)=>{entered.resolve();await gate.promise;return json(receipt(JSON.parse(init.body)));},async()=>{const pending=host.publish(joint());await entered.promise;await assert.rejects(host.publish(joint()),code('publication_busy'));host.close();gate.resolve();await assert.rejects(pending,code('publication_outcome_unknown'));await assert.rejects(host.publish(joint()),code('publication_closed'));});
});
test('held coordinator signal and policy are checked by the genuine private requester port',async()=>{
 const host=Host.configure(options()),port=nativePublicationHostPort(host),controller=new AbortController();let calls=0;controller.abort();await using(async()=>{calls++;throw Error('not reached');},async()=>{await assert.rejects(port.publish(joint(),()=>{},controller.signal),code('publication_cancelled'));await assert.rejects(port.publish(joint(),()=>{throw Error('TEST_PRIVATE held authority');}),code('publication_authority'));assert.equal(calls,0);});host.close();
});

test('nested Native choice and digest accessors are inert policy refusals',async()=>{
 let calls=0;const expected=selection();Object.defineProperty(expected.activation,'current',{enumerable:true,get(){calls++;throw Error('TEST_PRIVATE getter');}});assert.throws(()=>Host.configure(options({expected})),code('publication_policy'));const host=Host.configure(options()),digest=joint();Object.defineProperty(digest.sha256,'0',{enumerable:true,get(){calls++;return 1;}});await assert.rejects(host.publish(digest),code('publication_policy'));assert.equal(calls,0);host.close();
});

test('revoked publication requesters release a pending approval before any request starts',{timeout:5000},async()=>{
 for(const revoke of ['close','abort']){
  const parent=new AbortController();
  const host=Host.configure(options({signal:parent.signal}));
  const port=nativePublicationHostPort(host);
  const waits=nativePublicationWaits(port,()=>{},[]);
  const entered=deferred(),late=deferred();
  let requests=0,approved=0,timer;
  try{
   await using(async()=>{requests++;throw Error('Unexpected publication request');},async()=>{
    const result=decideColdActivation(joint(),()=>{
     entered.resolve();
     return late.promise;
    },waits).then(async()=>{
     approved++;
     await port.publish(joint(),waits.check,waits.signal);
    });
    const cancelled=assert.rejects(result,code('asset_adoption_aborted'));
    await entered.promise;
    if(revoke==='close')host.close();else parent.abort();
    try{
     await Promise.race([cancelled,new Promise((_resolve,reject)=>{
      timer=setTimeout(()=>reject(Error('Revoked requester kept the decision pending')),1000);
     })]);
    }finally{clearTimeout(timer);}
    if(revoke==='close')late.resolve(true);else late.reject(Error('Late approval rejection'));
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(approved,0);
    assert.equal(requests,0);
   });
  }finally{late.resolve(true);waits.close();host.close();}
 }
});

test('publication revocation also cancels approval during metadata replay',{timeout:5000},async()=>{
 const host=Host.configure(options()),port=nativePublicationHostPort(host);
 const owner=new AbortController(),delivery=new AbortController();
 const parent=nativePublicationWaits(port,()=>{},[owner.signal]);
 const lifetime=holdMetadataContinuation({signal:owner.signal,check(){}},{
  signals:[delivery.signal],guard(){assert.equal(delivery.signal.aborted,false);},
 },parent.check,parent.signal);
 const entered=deferred(),late=deferred();
 let writes=0,timer;
 try{
  const pending=decideColdActivation(joint(),()=>{
   entered.resolve();
   return late.promise;
  },lifetime).then(()=>{writes++;});
  const cancelled=assert.rejects(pending,code('asset_adoption_aborted'));
  await Promise.race([entered.promise,cancelled]);
  host.close();
  try{
   await Promise.race([cancelled,new Promise((_resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('Publication revocation kept metadata approval pending')),750);
   })]);
  }finally{clearTimeout(timer);}
  late.resolve(true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(owner.signal.aborted,false);
  assert.equal(delivery.signal.aborted,false);
  assert.equal(writes,0);
 }finally{late.resolve(false);lifetime.close();parent.close();host.close();}
});
