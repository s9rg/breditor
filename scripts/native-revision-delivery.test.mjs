/** Actual authenticated revision supersession, native-held bridge, exact reopen
 * and owned/unowned future histories across every already-bound source family. */
import test from 'node:test';import assert from 'node:assert/strict';
import {nativeSuggestionSession,families} from './fixtures/native-suggestion-delivery/session.mjs';
import {createNativeRevisionDelivery} from '../packages/breditor-collaboration/dist/suggestion_revisions/native_delivery.js';
const busy=e=>['native_recovery_busy','suggestion_recovery_in_use','native_revision_outbox_in_use'].includes(e?.code);
for(const family of families)for(const scope of ['original','general-v1','document-v1'])for(const natural of [false,true])for(const owned of [false,true])test(family.name+' / '+scope+' / '+(natural?'typing-v1':'explicit')+' / '+(owned?'owned':'unowned')+': original revision supersedes once and cold-reopens accepting child history',{timeout:120000},()=>nativeSuggestionSession({family,scope,natural,owned,choice:null,prepare:family.kind!=='original',withRevisions:true},async f=>{
 f.suggestions=f.openNative();
 assert.throws(()=>createNativeRevisionDelivery({...f.outbox},f.suggestions));
 assert.throws(()=>createNativeRevisionDelivery(f.outbox,{...f.suggestions}),e=>e.code==='native_suggestion_parent');
 assert.throws(()=>f.openRevision({autoStart:true}),e=>e.code==='native_revision_options');
 const before=f.source.core.documentJson(),calls=f.oldTransportCalls;f.faults.oldTransport=true;
 f.nativeRevision=f.openRevision();assert.throws(()=>f.openRevision(),busy);
 f.shadow(f.source,['save','flush']);f.shadow(f.outbox,['synchronize','connect','flush','packet','status','entries','revisions']);
 await f.nativeRevision.connect();await f.nativeRevision.flushLocal();
 const revised=f.nativeRevision.status(f.revisionInfo.id);assert.equal(revised.localSaved,true);assert.equal(revised.retry,false);assert.equal(revised.conflict,null);assert.equal(revised.receipt.revision.id,f.revisionInfo.id);
 assert.equal(f.nativeRevision.packet(f.revisionInfo.id),f.revisionPacket);assert.equal(f.queue.packet(f.revisionInfo.suggestion.id),f.childPacket);assert.equal(f.queue.status(f.info.id).decision.decision,'reject');assert.equal(f.queue.status(f.revisionInfo.suggestion.id).publication.suggestion.id,f.revisionInfo.suggestion.id);assert.equal(f.source.core.documentJson(),before);assert.equal(f.oldTransportCalls,calls);
 assert.equal(f.requests.filter(r=>r.kind==='suggestionRevisionPublish').length,1);assert.equal(f.requests.filter(r=>r.kind==='suggestionPublish'&&r.packet===f.childPacket).length,0);
 assert.throws(()=>f.source.core.select(null),busy);assert.throws(()=>f.outbox.stopRetrying(f.revisionInfo.id),busy);
 await f.queueChildAcceptAndHold();f.suggestions=f.openNative();f.faults.oldTransport=true;const callsAgain=f.oldTransportCalls;f.nativeRevision=f.openRevision();
 await f.suggestions.connect();await f.suggestions.flushShared();await f.nativeRevision.connect();assert.equal(f.oldTransportCalls,callsAgain);
 assert.equal(f.requests.filter(r=>r.kind==='suggestionRevisionPublish').length,1);assert.equal(f.requests.filter(r=>r.kind==='suggestionDecide').length,1);assert.equal(f.queue.status(f.revisionInfo.suggestion.id).decision.decision,'accept');assert.equal((f.source.core.documentJson().match(/Revised once /g)??[]).length,1);
 if(owned)assert.ok(f.source.core.adoptedSuggestion(f.revisionInfo.suggestion.id));else assert.equal(f.source.core.adoptedSuggestion(f.revisionInfo.suggestion.id),null);
 await f.finishAndCold();const accepted=f.source.core.documentJson();assert.equal(f.source.core.undo(),true);if(owned){assert.ok(!f.source.core.documentJson().includes('Revised once '));assert.match(f.source.core.documentJson(),/Keep ordinary history/);}else{assert.match(f.source.core.documentJson(),/Revised once/);assert.ok(!f.source.core.documentJson().includes('Keep ordinary history '));}assert.equal(f.source.core.redo(),true);assert.equal(f.source.core.documentJson(),accepted);assert.equal(f.outbox.exportRecovery().retained[0].packet,f.revisionPacket);f.evidence();
}));
