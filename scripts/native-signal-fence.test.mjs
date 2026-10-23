/** Cancellation input is observed before a callback-free native handoff fence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {observeIndependentRecoveryAbort as observe} from '../packages/breditor-collaboration/dist/independent_recovery/signal.js';
const hold=()=>{let finish;const lifetime=new Promise(resolve=>{finish=resolve;});return{lifetime,finish};};
test('absent cancellation input needs no host access',async()=>{
 const h=hold(),value=observe(undefined,h.lifetime);assert.equal(value.aborted(),false);value.release();h.finish();await h.lifetime;assert.equal(value.aborted(),false);
});
test('canonical observation ignores caller overrides but observes real cancellation',async()=>{
 const c=new AbortController(),h=hold();let calls=0;
 for(const key of ['aborted','addEventListener','removeEventListener'])Object.defineProperty(c.signal,key,{get(){calls++;throw Error('Caller override must not run');}});
 const value=observe(c.signal,h.lifetime);assert.equal(value.aborted(),false);c.abort();assert.equal(value.aborted(),true);value.release();h.finish();await h.lifetime;assert.equal(calls,0);
});
test('proxy admission and deferred cleanup never make final reads or release executable',async()=>{
 const c=new AbortController(),h=hold();let reads=0;
 const signal=new Proxy(c.signal,{get(target,key,receiver){reads++;return Reflect.get(target,key,receiver);}}),value=observe(signal,h.lifetime);
 const admitted=reads;assert.ok(admitted>0);for(let i=0;i<4;i++)assert.equal(value.aborted(),false);assert.equal(reads,admitted);
 c.abort();assert.equal(value.aborted(),true);const cancelled=reads;value.release();assert.equal(value.aborted(),true);assert.equal(reads,cancelled);
 h.finish();await h.lifetime;assert.ok(reads>cancelled,'native removal is deferred beyond synchronous consumption');
});
test('a forged abort event neither cancels nor detaches the actual observer',async()=>{
 const c=new AbortController(),h=hold(),value=observe(c.signal,h.lifetime);c.signal.dispatchEvent(new Event('abort'));assert.equal(value.aborted(),false);c.abort();assert.equal(value.aborted(),true);value.release();h.finish();await h.lifetime;
});
test('an imitation signal is refused without running its supplied getter',()=>{
 const h=hold();let read=false;const fake={get aborted(){read=true;return false;}};
 assert.throws(()=>observe(fake,h.lifetime),error=>error.code==='independent_recovery_policy');assert.equal(read,false);h.finish();
});
test('a signal already cancelled before admission remains cancelled after release',async()=>{
 const c=new AbortController(),h=hold();c.abort();const value=observe(c.signal,h.lifetime);assert.equal(value.aborted(),true);value.release();h.finish();await h.lifetime;assert.equal(value.aborted(),true);
});
