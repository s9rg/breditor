/** Request/lifetime laws only. Live Rust endpoint coverage runs separately. */
import test from 'node:test';import assert from 'node:assert/strict';
import {SharedDurableNativeActivationHost as Host} from '../packages/breditor-collaboration/dist/index.js';
import {nativeActivationHostPort} from '../packages/breditor-collaboration/dist/native_activation_control/host.js';
import {nativeActivationSelection as select} from '../packages/breditor-collaboration/dist/native_activation_control/identity.js';
import {options,selection,receipt,using,json,code,endpoint,token} from './fixtures/native-activation/transport.mjs';
import {SharedServerLogGenerationRecoveryHost as Inspection,generationRecoveryHostPort} from '../packages/breditor-collaboration/dist/generation_recovery_control/host.js';
import {generationControlSelection as selectGeneration} from '../packages/breditor-collaboration/dist/generation_recovery_control/identity.js';
import {confirmOrdinaryColdNative} from '../packages/breditor-collaboration/dist/native_room_joint_activation/cold_variant.js';
import {transportFixture} from './fixtures/server-generation-archive/transport.mjs';
test('configuration performs no IO; commit uses exact detached pins and separate authentication',async()=>{
 let calls=0;const input=options(),gold=select(input.expected);await using(async(url,init)=>{calls++;assert.equal(url,endpoint);assert.equal(init.method,'POST');assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+token);assert.equal(new Headers(init.headers).get('x-breditor-principal'),'operator');assert.deepEqual(JSON.parse(init.body),gold);return json(receipt(gold));},async()=>{
  const host=Host.configure(input);assert.equal(calls,0);input.expected.checkpointSha256[0]=1;const out=await host.commit();assert.deepEqual(out.selection,gold);assert.ok(Object.isFrozen(out.selection.current.server));await host.commit();assert.equal(calls,2);host.close();assert.deepEqual(host.selection(),gold);await assert.rejects(host.commit(),code('activation_closed'));
 });
});
test('activation transport retains the coordinated authority revision', async () => {
 const expected = selection();
 expected.previous.identity.formatVersion = 2;
 expected.planned.identity.formatVersion = 2;
 const confirmed = select(expected);
 await using(async (_url, init) => {
  assert.deepEqual(JSON.parse(init.body), confirmed);
  return json(receipt(confirmed));
 }, async () => {
  const host = Host.configure(options({expected}));
  try {
   assert.deepEqual((await host.commit()).selection, confirmed);
  } finally {
   host.close();
  }
 });
 expected.planned.identity.formatVersion = 1;
 assert.throws(() => select(expected), code('activation_policy'));
 expected.previous.identity.formatVersion = expected.planned.identity.formatVersion = 3;
 assert.throws(() => select(expected), code('activation_policy'));
});
for(const[label,change]of[
 ['unknown field',v=>{v.ready=true;}],['wrong family',v=>{v.format='breditor/server-log-generation-recovery-control';}],['version',v=>{v.formatVersion=2;}],['sparse digest',v=>{v.checkpointSha256=Array(32);} ],['inode witness',v=>{v.checkpoint={inode:2n**63n};}],['wrong epoch',v=>{v.planned.generation='4';}],['numeric epoch',v=>{v.previous.generation=2;}],['leading-zero epoch',v=>{v.planned.generation='03';}],['authority change',v=>{v.planned.identity.authority='e'.repeat(64);}],['zero prior',v=>{v.previous.generation='0';v.previous.owner=null;v.planned.generation='1';}],['counter ceiling',v=>{v.previous.generation='1048576';v.planned.generation='1048577';}],['wrong inventory',v=>{v.current.participants.source.manifest[0]^=1;}]
])test('closed checkpoint selection refuses '+label,()=>{const value=selection();change(value);assert.throws(()=>select(value),code('activation_policy'));});
test('invalid endpoints, options and signals refuse without contacting a server',async()=>{let calls=0;await using(()=>{calls++;throw 0;},async()=>{for(const extra of[{endpoint:'http://example.com/recovery/native-activation/v1/commit'},{endpoint:endpoint+'?token=TEST_PRIVATE'},{endpoint:endpoint+'#TEST_PRIVATE'},{endpoint:'https://user:TEST_PRIVATE@example.com/recovery/native-activation/v1/commit'},{endpoint:'https://example.com/ws'},{requestTimeoutMs:0},{requestTimeoutMs:60001},{principal:'\nTEST_PRIVATE'},{getToken:null},{signal:{}},{unexpected:true}])assert.throws(()=>Host.configure(options(extra)),code('activation_policy'));});assert.equal(calls,0);});
for(const status of[400,403,409,429,500,503])test('HTTP '+status+' leaves the commit outcome explicitly unknown',async()=>{let calls=0;await using(async()=>{calls++;return json('TEST_PRIVATE',status);},async()=>{const host=Host.configure(options());await assert.rejects(host.commit(),code('activation_outcome_unknown'));host.close();});assert.equal(calls,1);});
for(const[label,change]of[
 ['wrong instance',s=>{const v=JSON.parse(receipt(s));v.selection.instance='e'.repeat(64);return JSON.stringify(v);} ],['wrong digest',s=>{const v=JSON.parse(receipt(s));v.selection.checkpointSha256[0]^=1;return JSON.stringify(v);} ],['ready flag',s=>{const v=JSON.parse(receipt(s));v.ready=true;return JSON.stringify(v);} ],['wrong scope',s=>receipt(s).replace('actual-held-native-service-only','whole-room-ready')],['pretty JSON',s=>JSON.stringify(JSON.parse(receipt(s)),null,2)],['BOM',s=>'\ufeff'+receipt(s)],['duplicate field',s=>receipt(s).replace('"formatVersion":1','"formatVersion":1,"formatVersion":1')]
])test('incomplete or mismatched receipt keeps uncertainty: '+label,async()=>{const input=options();await using(async()=>json(change(select(input.expected))),async()=>{const host=Host.configure(input);await assert.rejects(host.commit(),code('activation_outcome_unknown'));host.close();});});
test('stream bounds, MIME, truncation and invalid UTF-8 never publish a receipt',async()=>{for(const response of[json('x',200,{'content-length':'65537'}),json('x'.repeat(65537)),json('x',200,{'content-length':'2'}),json('TEST_PRIVATE{'),new Response(Uint8Array.of(255),{headers:{'content-type':'application/json'}}),new Response('{}',{headers:{'content-type':'text/html'}})])await using(async()=>response,async()=>{const host=Host.configure(options());await assert.rejects(host.commit(),code('activation_outcome_unknown'));host.close();});});
test('authority and token callbacks observe the actual busy reservation',async()=>{for(const mode of['authority','token']){let host,armed=true,hits=0;const pending=[];const reenter=()=>{if(!armed)return;armed=false;hits++;pending.push(assert.rejects(host.commit(),code('activation_busy')));};const input=options({checkAuthority(){if(mode==='authority')reenter();},getToken(){if(mode==='token')reenter();return token;}});await using(async()=>json(receipt(select(input.expected))),async()=>{host=Host.configure(input);await host.commit();await Promise.all(pending);host.close();});assert.equal(hits,1);}});
test('held source revocation inside token acquisition refuses before fetch',async()=>{let allowed=true,calls=0;await using(async()=>{calls++;throw 0;},async()=>{const host=Host.configure(options({getToken(){allowed=false;return token;}}));await assert.rejects(nativeActivationHostPort(host).commit(()=>{if(!allowed)throw Error('TEST_PRIVATE');}),code('activation_authority'));host.close();});assert.equal(calls,0);});
test('cancellation before token resolution is definite; cancellation after submission is uncertain',async()=>{
 const stop=new AbortController();let calls=0;await using(async()=>{calls++;throw 0;},async()=>{const host=Host.configure(options({signal:stop.signal,getToken:()=>new Promise(()=>{})})),work=host.commit();stop.abort();await assert.rejects(work,code('activation_cancelled'));host.close();});assert.equal(calls,0);
 const after=new AbortController();await using(async(_url,init)=>{calls++;after.abort();throw Error('TEST_PRIVATE');},async()=>{const host=Host.configure(options({signal:after.signal}));await assert.rejects(host.commit(),code('activation_outcome_unknown'));host.close();});assert.equal(calls,1);
});
test('held job cancellation aborts the actual request and retains uncertainty',async()=>{const stop=new AbortController();let entered;const started=new Promise(resolve=>{entered=resolve;});await using((_url,init)=>new Promise((_resolve,reject)=>{init.signal.addEventListener('abort',()=>reject(Error('TEST_PRIVATE')),{once:true});entered();}),async()=>{const host=Host.configure(options()),work=nativeActivationHostPort(host).commit(()=>{},stop.signal);await started;stop.abort();await assert.rejects(work,code('activation_outcome_unknown'));host.close();});});
test('unread response cleanup cannot clear another live request reservation',async()=>{let host,nested,cancelled=0;await using(async()=>new Response(new ReadableStream({cancel(){cancelled++;nested=assert.rejects(host.commit(),code('activation_busy'));}}),{status:403,headers:{'content-type':'application/json'}}),async()=>{host=Host.configure(options());await assert.rejects(host.commit(),code('activation_outcome_unknown'));await nested;host.close();});assert.equal(cancelled,1);});
test('genuine internal port ignores public prototype overrides and refuses copied handles',async()=>{const input=options(),original=Host.prototype.commit;let calls=0;await using(async()=>{calls++;return json(receipt(select(input.expected)));},async()=>{const host=Host.configure(input);try{Host.prototype.commit=()=>Promise.resolve({ready:true});await nativeActivationHostPort(host).commit();assert.throws(()=>nativeActivationHostPort(Object.create(Host.prototype)),code('activation_policy'));assert.throws(()=>nativeActivationHostPort({...host}),code('activation_policy'));}finally{Host.prototype.commit=original;host.close();}});assert.equal(calls,1);});

test('reassociation cancels suspended confirmation when held custody ends',{timeout:5000},async()=>{
 const expected=transportFixture().expected;
 for(const revoke of ['activation','inspection','journal']){
  const host=Host.configure(options()),journal=new AbortController(),scope=new AbortController();
  const entered=Promise.withResolvers(),late=Promise.withResolvers();
  let requests=0,started=0,observed=0,inspections=0,timer;
  const selected={
   format:'breditor/server-log-generation-recovery-control',formatVersion:1,
   instance:'a'.repeat(64),source:{
    origin:structuredClone(expected),server:structuredClone(expected),
    participants:{source:structuredClone(expected.native),sha256:Array(32).fill(9)},
   },
  };
  const endpoint='http://127.0.0.1:4187/recovery/generations/v1/check';
  const read={
   format:'breditor/server-log-generation-recovery-control-read',formatVersion:1,
   selection:selectGeneration(selected),scope:'native-server-generation-and-server-provider',
  };
  let inspector;
  try{
   await using(async url=>{
    if(url===endpoint)return json(JSON.stringify(read));
    requests++;
    throw Error('Unexpected activation request');
   },async()=>{
    inspector=await Inspection.open({endpoint,expected:selected,principal:'operator',getToken:()=>token,checkAuthority(){}});
    const confirmation=confirmOrdinaryColdNative(scope,{
     check(){if(journal.signal.aborted)throw Error('Journal closed');},
     revocations:[journal.signal],
     async observeNativeStarted(){started++;},
     async observeNativeReceipt(){observed++;},
    },nativeActivationHostPort(host),generationRecoveryHostPort(inspector),()=>{
     entered.resolve();
     return late.promise;
    },()=>{},async()=>{inspections++;});
    const cancelled=assert.rejects(confirmation,code('asset_adoption_aborted'));
    await Promise.race([entered.promise,cancelled]);
    if(revoke==='activation')host.close();
    else if(revoke==='inspection')inspector.close();
    else journal.abort();
    try{
     await Promise.race([cancelled,new Promise((_resolve,reject)=>{
      timer=setTimeout(()=>reject(Error('Revoked custody kept confirmation pending')),750);
     })]);
    }finally{clearTimeout(timer);}
    late.resolve(true);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(inspections,1);
    assert.equal(started,0);
    assert.equal(observed,0);
    assert.equal(requests,0);
   });
  }finally{late.resolve(false);host.close();inspector?.close();}
 }
});
