/** Two-family fresh barrier. The other five families are deliberately not inferred. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {reserveProtectedOperationalHistoryRead as reserve} from '../packages/breditor-collaboration/dist/operation_read/protected_history_group.js';
import {protectedHistoryGroupFixture} from './fixtures/original-operational-read/protected_group_session.mjs';
import {nativeProfile,insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
import {originalOperationalFixture} from './fixtures/original-operational-read/session.mjs';
import {change} from './fixtures/independent-delivery-recovery/storage.mjs';
import {RecoveryLease} from '../packages/breditor-collaboration/dist/participant_recovery/lease.js';
let profile,sequence=0;before(async()=>{const native=await import('../target/promoted-shared-web/breditor_shared.js');await native.default({module_or_path:readFileSync(new URL('../target/promoted-shared-web/breditor_shared_bg.wasm',import.meta.url))});profile=nativeProfile(native,3,true);});after(()=>profile?.free());
const fixture=(extra={})=>protectedHistoryGroupFixture({api,rich,profile,tag:'protected-history-group-'+sequence++,...extra});
test('all genuine parents are synchronously reserved before the first fresh callback',async()=>{
 const f=await fixture();let group,calls=0;const attempts=[];
 try{for(const m of f.members)m.grant.allowed=false;const before=await snapshotReadDatabases();group=reserve(f.rows,()=>{calls++;if(calls===1)for(const m of f.members)attempts.push(assert.rejects(m.parent.intoParts(),e=>['operation_in_use','generation_operation_busy'].includes(e.code)));});assert.equal(calls,0);await group.prepare();await Promise.all(attempts);assert.equal(group.metadata().participants.length,2);assert.equal(group.metadata().kind,'ready');await group.verify();group.check();group.checkCurrent();assert.equal('sources'in group,false);assert.equal('participants'in group,false);assert.deepEqual(await snapshotReadDatabases(),before);for(const m of f.members)for(const suffix of['-operation','-recovery'])await assert.rejects(RecoveryLease.acquire(JSON.stringify(m.tag+suffix)),e=>e.code==='recovery_in_use');group.close();for(const m of f.members){for(const suffix of['-operation','-recovery'])await assert.rejects(RecoveryLease.acquire(JSON.stringify(m.tag+suffix)),e=>e.code==='recovery_in_use');m.grant.allowed=true;await m.parent.check();}}
 finally{group?.close();await f.close();}
});
test('bad later family admission unwinds earlier reservations without invoking permission',async()=>{
 const f=await fixture();let calls=0;
 try{for(const last of[{},f.members[0].parent])assert.throws(()=>reserve([f.rows[0],{...f.rows[1],operation:last}],()=>{calls++;}));assert.equal(calls,0);for(const m of f.members)await m.parent.check();const g=reserve(f.rows,()=>{});g.close();for(const m of f.members)await m.parent.check();}
 finally{await f.close();}
});
test('a failed prepare releases all partial reference and parent borrows',async()=>{
 const f=await fixture();let group;
 try{group=reserve([f.rows[0],{...f.rows[1],read:{restoreSegmented(){throw Error('Late second native factory failed');}}}],()=>{});await assert.rejects(group.prepare());group.close();for(const m of f.members)await m.parent.check();const next=reserve(f.rows,()=>{});try{await next.prepare();await next.verify();}finally{next.close();}}
 finally{group?.close();await f.close();}
});
test('a late authority callback changing an earlier source invalidates the whole held cut',async()=>{
 const f=await fixture();let group,calls=0,at=Infinity,changed=false;
 try{group=reserve(f.rows,()=>{if(++calls===at){changed=true;insertCleanupText(f.source.core,'Changed at the final grant callback ');}});await group.prepare();const before=calls;await group.verify();const count=calls-before;at=calls+count;await assert.rejects(group.verify());assert.equal(changed,true);assert.throws(()=>group.checkCurrent());group.close();await f.source.flush();const next=reserve(f.rows,()=>{});try{await next.prepare();await next.verify();}finally{next.close();}}
 finally{at=Infinity;group?.close();await f.close();}
});
test('fresh cancellation and reentrant callbacks cannot release writer custody',async()=>{
 const f=await fixture();let group,reenter=false;const abort=new AbortController();
 try{group=reserve(f.rows,()=>{if(reenter)group.check();},abort.signal);await group.prepare();reenter=true;assert.throws(()=>group.check());await assert.rejects(group.verify());reenter=false;await group.verify();abort.abort();assert.throws(()=>group.checkCurrent());group.close();for(const m of f.members)await m.parent.check();}
 finally{reenter=false;group?.close();await f.close();}
});
test('row and array getters, duplicate sources and unknown source selectors refuse before callbacks',async()=>{
 const f=await fixture();let calls=0;
 try{for(const input of[[f.rows[0],f.rows[0]],[{...f.rows[0],read:{...f.rows[0].read,source:{}}}]])assert.throws(()=>reserve(input,()=>{calls++;}));for(const field of['operation','read','family']){const row={...f.rows[0]};Object.defineProperty(row,field,{enumerable:true,get(){calls++;throw Error('Getter');}});assert.throws(()=>reserve([row],()=>{calls++;}));}const rows=[f.rows[0]];Object.defineProperty(rows,'0',{get(){calls++;throw Error('Array getter');}});assert.throws(()=>reserve(rows,()=>{calls++;}));assert.equal(calls,0);for(const m of f.members)await m.parent.check();}
 finally{await f.close();}
});
test('cancelled old jobs cannot revoke a freshly authorized protected group read',async()=>{
 const a=new AbortController(),b=new AbortController(),f=await fixture({oldSignals:[a.signal,b.signal]});let group;
 try{a.abort();b.abort();for(const m of f.members)m.grant.allowed=false;const calls=f.members.map(m=>m.grant.calls),before=await snapshotReadDatabases();group=reserve(f.rows,()=>{});await group.prepare();await group.verify();group.checkCurrent();assert.deepEqual(f.members.map(m=>m.grant.calls),calls);assert.deepEqual(await snapshotReadDatabases(),before);group.close();for(const m of f.members)await assert.rejects(m.parent.progress());}
 finally{group?.close();await f.close();}
});
for(const index of[0,1])test(`single protected family and idempotent close ${index}`,async()=>{
 const f=await fixture();let group;
 try{group=reserve([f.rows[index]],()=>{});await group.prepare();await assert.rejects(group.prepare());assert.deepEqual(group.metadata().participants.map(row=>row.id),[f.rows[index].id]);await group.verify();group.close();group.close();assert.throws(()=>group.checkCurrent());for(const m of f.members)await m.parent.check();}
 finally{group?.close();await f.close();}
});
test('three real parents in mixed order retain independent same-family stores and future history',async()=>{
 const f=await fixture();let group;
 try{const third=await originalOperationalFixture({api,rich,profile,tag:'protected-group-third-'+sequence++,writer:'303',actor:'third-comments',retained:true,sharedHost:true});f.members.push(third);const rows=[f.rows[1],{id:'third',family:'original',operation:third.parent,read:{restore:s=>profile.restore_document('room',s)}},f.rows[0]];group=reserve(rows,()=>{});await group.prepare();assert.deepEqual(group.metadata().participants.map(row=>row.id),['generation','third','original']);await group.verify();group.close();for(const row of rows){const parts=await row.operation.intoParts();try{const core=parts.session?.core??parts.source.session.core;assert.equal(core.redo(),true);assert.equal(core.undo(),true);assert.equal(core.redoReview().kind,'committed');assert.equal(core.undoReview().kind,'committed');}finally{await parts.sources?.revisions?.close();await parts.sources?.suggestions?.close();await parts.sources?.versions?.close();await(parts.session??parts.source.session).close();parts.uploads.close();}}}
 finally{group?.close();await f.close();}
});
for(const index of[0,1])test(`actual member archive tampering invalidates the group ${index}`,async()=>{
 const f=await fixture();let group,old;const m=f.members[index],store=index?'generation_origin':'origin';
 try{group=reserve(f.rows,()=>{});await group.prepare();await change(m.tag+'-operation',store,s=>{const q=s.get('participant');q.onsuccess=()=>{old=q.result;s.put(new Blob(['changed protected group member']),'participant');};});group.checkCurrent();await assert.rejects(group.verify());await change(m.tag+'-operation',store,s=>s.put(old,'participant'));old=undefined;await group.verify();}
 finally{if(old)await change(m.tag+'-operation',store,s=>s.put(old,'participant'));group?.close();await f.close();}
});
test('asynchronous and non-void permission checks release every reserved parent',async()=>{
 const f=await fixture();let group;
 try{for(const guard of[async()=>{},()=>42]){group=reserve(f.rows,guard);await assert.rejects(group.prepare());group.close();for(const m of f.members)await m.parent.check();}assert.throws(()=>reserve([{...f.rows[0],id:'a'},{...f.rows[0],id:'b'}],()=>{}));}
 finally{group?.close();await f.close();}
});
test('mutation while constructing the report fails the final pure fence and returns no ready metadata',async()=>{
 const f=await fixture(),freeze=Object.freeze;let group,changed=false;
 try{group=reserve(f.rows,()=>{});Object.freeze=value=>{if(!changed&&value?.format==='breditor/protected-operational-history-group-read'){changed=true;insertCleanupText(f.source.core,'Changed during metadata construction ');}return freeze(value);};await assert.rejects(group.prepare());Object.freeze=freeze;assert.equal(changed,true);assert.throws(()=>group.metadata());group.close();await f.source.flush();for(const m of f.members)await m.parent.check();}
 finally{Object.freeze=freeze;group?.close();await f.close();}
});
