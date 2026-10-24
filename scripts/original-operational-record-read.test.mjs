/** Fresh parent reads never invoke old writer grants or consume coordinator custody. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {captureOriginalOperationalRecords as capture} from '../packages/breditor-collaboration/dist/participant_operation/operation.js';
import {originalOperationalFixture} from './fixtures/original-operational-read/session.mjs';
import {nativeProfile} from './fixtures/owned-core-cleanup/session.mjs';
import {insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
import {change} from './fixtures/independent-delivery-recovery/storage.mjs';
let profile,sequence=0;before(async()=>{const native=await import('../target/promoted-shared-web/breditor_shared.js');await native.default({module_or_path:readFileSync(new URL('../target/promoted-shared-web/breditor_shared_bg.wasm',import.meta.url))});profile=nativeProfile(native,3,true);});after(()=>profile?.free());
const fixture=(extra={})=>originalOperationalFixture({api,rich,profile,tag:'original-operational-read-'+sequence++,...extra});
for(const paired of[false,true])for(const scope of[0,1,2])for(const mask of[0,1,2,3,4,5,6,7].filter(m=>paired||!(m&2)))test(`fresh original parent read preserves actual records ${paired}/${scope}/${mask}`,async()=>{
 const f=await fixture({paired,scope,mask});let read,refs,parts;
 try{const before=await snapshotReadDatabases();f.grant.allowed=false;const oldCalls=f.grant.calls;read=await capture(f.parent,()=>{});assert.equal(f.grant.calls,oldCalls);assert.equal(read.metadata().scope,'held-original-parent-marker-and-archive');assert.equal(read.metadata().operation.phase,'operational');assert.equal(read.metadata().recovery.phase,'ready');assert.equal(read.files().length,1);assert.deepEqual(Buffer.from(await read.files()[0].file.arrayBuffer()),Buffer.from(await f.backup.file().arrayBuffer()));assert.deepEqual(read.metadata().selection,f.backup.selection());refs=await read.captureReferences({restore:s=>f.selected.restore(s),checkAuthority(){}});await refs.verify();await read.verify();refs.checkCurrent();read.checkCurrent();assert.equal(f.grant.calls,oldCalls);assert.deepEqual(await snapshotReadDatabases(),before);assert.equal('intoParts'in read,false);assert.equal('markReleased'in read,false);await assert.rejects(f.parent.intoParts(),e=>e.code==='operation_in_use');refs.dispose();refs=undefined;read.dispose();read=undefined;await assert.rejects(f.parent.progress(),e=>e.code==='recovery_authority');f.grant.allowed=true;parts=await f.parent.intoParts();assert.equal(parts.session.core.redo(),true);assert.equal(parts.session.core.undo(),true);if(paired){assert.equal(parts.session.core.redoReview().kind,'committed');assert.equal(parts.session.core.undoReview().kind,'committed');}await parts.session.flush();await parts.session.discardAndClose();parts.uploads.close();parts=undefined;}
 finally{refs?.dispose();read?.dispose();if(parts){await parts.session.discardAndClose();parts.uploads.close();}await f.close();}
});
test('parent verification reads the actual retained archive and marker, not cached readiness',async()=>{
 const f=await fixture();let read,origin,marker;
 try{read=await capture(f.parent,()=>{});await change(f.tag+'-operation','origin',store=>{const q=store.get('participant');q.onsuccess=()=>{origin=q.result;store.put(new Blob(['changed archive']),'participant');};});read.checkCurrent();await assert.rejects(read.verify());await change(f.tag+'-operation','origin',store=>store.put(origin,'participant'));origin=undefined;await read.verify();await change(f.tag+'-recovery','attempts',store=>{const q=store.get('attempt');q.onsuccess=()=>{marker=q.result;store.put({...marker,phase:'preparing'},'attempt');};});read.checkCurrent();await assert.rejects(read.verify());await change(f.tag+'-recovery','attempts',store=>store.put(marker,'attempt'));marker=undefined;await read.verify();}
 finally{if(origin)await change(f.tag+'-operation','origin',s=>s.put(origin,'participant'));if(marker)await change(f.tag+'-recovery','attempts',s=>s.put(marker,'attempt'));read?.dispose();await f.close();}
});
test('fresh read revocation, cancellation and reentry release only the read reservation',async()=>{
 const f=await fixture();let read,allowed=true,reenter=false;const guard=()=>{if(!allowed)throw Error('Read ended');if(reenter)read.check();};
 try{for(const value of[null,{},'read',0])await assert.rejects(capture(f.parent,value));allowed=false;await assert.rejects(capture(f.parent,guard));allowed=true;read=await capture(f.parent,guard);reenter=true;assert.throws(()=>read.check());await assert.rejects(read.verify());reenter=false;allowed=false;assert.throws(()=>read.files());allowed=true;await read.verify();const m=read.metadata();read.dispose();assert.equal(read.metadata(),m);assert.throws(()=>read.sources());const abort=new AbortController();read=await capture(f.parent,()=>{},abort.signal);abort.abort();assert.throws(()=>read.checkCurrent());read.dispose();read=await capture(f.parent,()=>{});await read.verify();}
 finally{reenter=false;allowed=true;read?.dispose();await f.close();}
});
test('parent lookalikes refuse before reading properties or authorizing anything',async()=>{
 let calls=0;for(const parent of[{},Object.create(api.OperationalSharedParticipant.prototype)]){Object.defineProperty(parent,'origin',{get(){calls++;throw Error('Fake');}});await assert.rejects(capture(parent,()=>{calls++;}));}assert.equal(calls,0);
});
test('ended old job cancellation does not revoke fresh read permission or release held parents',async()=>{
 const old=new AbortController(),f=await fixture({oldSignal:old.signal,retained:true});let read,refs;
 try{old.abort();const calls=f.grant.calls,before=await snapshotReadDatabases();read=await capture(f.parent,()=>{});refs=await read.captureReferences({restore:s=>f.selected.restore(s),checkAuthority(){}});await refs.verify();await read.verify();refs.checkCurrent();read.checkCurrent();assert.equal(f.grant.calls,calls);assert.deepEqual(await snapshotReadDatabases(),before);refs.dispose();refs=undefined;read.dispose();read=undefined;await assert.rejects(f.parent.progress(),e=>e.code==='recovery_aborted');}
 finally{refs?.dispose();read?.dispose();await f.close();}
});
for(const paired of[false,true])for(const scope of[0,1,2])test(`held parent and all retained-store reads compose once ${paired}/${scope}`,async()=>{
 const f=await fixture({paired,scope,retained:true});let read,refs;
 try{f.grant.allowed=false;const calls=f.grant.calls,before=await snapshotReadDatabases();read=await capture(f.parent,()=>{});refs=await read.captureReferences({restore:s=>f.selected.restore(s),checkAuthority(){}});assert.equal(refs.metadata().kind,'ready');assert.deepEqual([...new Set(refs.metadata().states.map(s=>s.source))],['native','versions','suggestions','revisions']);await read.verify();await refs.verify();read.checkCurrent();refs.checkCurrent();assert.equal(f.grant.calls,calls);assert.equal(f.counts.networkCalls,0);assert.deepEqual(await snapshotReadDatabases(),before);}
 finally{refs?.dispose();read?.dispose();await f.close();}
});
test('a parent read cannot expose an editable child while the old grant is revoked',async()=>{
 const f=await fixture();let read;
 try{f.grant.allowed=false;read=await capture(f.parent,()=>{});let changed=false;if(typeof read.sources==='function'){const source=read.sources(),before=source.session.core.checkpointJson();insertCleanupText(source.session.core,'A read must not expose this edit path ');await source.session.flush();changed=source.session.core.checkpointJson()!==before;}assert.equal(changed,false,'The read handle exposed an editable child while its old parent grant was revoked');assert.equal('sources'in read,false);assert.equal('core'in read,false);}
 finally{read?.dispose();await f.close();}
});
test('closing a parent read closes its opaque child and releases catalog/queue gates before handoff',async()=>{
 const f=await fixture({retained:true});let read,refs,parts;
 try{read=await capture(f.parent,()=>{});refs=await read.captureReferences({restore:s=>f.selected.restore(s),checkAuthority(){}});const metadata=refs.metadata();await assert.rejects(read.captureReferences({restore:s=>f.selected.restore(s),checkAuthority(){}}),e=>e.code==='operational_parent_read_busy');read.dispose();assert.throws(()=>refs.checkCurrent());assert.equal(refs.metadata(),metadata);parts=await f.parent.intoParts();assert.equal(parts.sources.suggestions.proposals().length,1);await parts.sources.revisions.discardAndClose();await parts.sources.suggestions.discardAndClose();await parts.sources.versions.discardAndClose();await parts.session.discardAndClose();parts.uploads.close();parts=undefined;}
 finally{refs?.dispose();read?.dispose();if(parts){await parts.sources.revisions.discardAndClose();await parts.sources.suggestions.discardAndClose();await parts.sources.versions.discardAndClose();await parts.session.discardAndClose();parts.uploads.close();}await f.close();}
});
test('reference options cannot replace held children or evaluate caller getters',async()=>{
 const f=await fixture({retained:true});let read,refs,calls=0;
 try{read=await capture(f.parent,()=>{});const options={restore:s=>{calls++;return f.selected.restore(s);},checkAuthority(){calls++;}};for(const key of['source','versions','suggestions','revisions','kind'])await assert.rejects(read.captureReferences({...options,[key]:{}}),e=>e.code==='operational_parent_reference_policy');for(const key of['restore','checkAuthority','editor']){const value={...options};Object.defineProperty(value,key,{enumerable:true,get(){calls++;throw Error('Do not invoke');}});await assert.rejects(read.captureReferences(value),e=>e.code==='operational_parent_reference_policy');}assert.equal(calls,0);refs=await read.captureReferences({restore:s=>f.selected.restore(s),checkAuthority(){}});await refs.verify();}
 finally{refs?.dispose();read?.dispose();await f.close();}
});
test('a parent disposed by a late native factory cannot return a live child or orphan read gates',async()=>{
 const f=await fixture({retained:true});let read;
 try{read=await capture(f.parent,()=>{});await assert.rejects(read.captureReferences({restore:s=>{const raw=f.selected.restore(s);read.dispose();return raw;},checkAuthority(){}}));await f.parent.check();const next=await capture(f.parent,()=>{});try{const refs=await next.captureReferences({restore:s=>f.selected.restore(s),checkAuthority(){}});refs.dispose();await next.verify();}finally{next.dispose();}}
 finally{read?.dispose();await f.close();}
});
