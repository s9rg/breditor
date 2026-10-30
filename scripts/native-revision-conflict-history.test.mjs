import test from 'node:test';import assert from 'node:assert/strict';
import {nativeSuggestionSession,families} from './fixtures/native-suggestion-delivery/session.mjs';
for(const family of families)test(family.name+': revision conflict discovery retains a real prior own Accept in its original queue and native Undo',{timeout:120000},()=>nativeSuggestionSession({family,scope:'document-v1',natural:true,owned:true,choice:null,withRevisions:true,prepare:family.kind!=='original'},async f=>{
 f.suggestions=f.openNative();await f.suggestions.connect();await f.suggestions.flushShared();f.suggestions.disconnect();
 const response=await f.doc.requestSuggestion({kind:'suggestionDecide',suggestionId:f.info.id,decision:'accept'});assert.equal(response.kind,'suggestionDecisionAdmission');assert.equal(response.admission.kind,'durable');const decision=response.admission.decision;assert.equal(decision.acceptingWriter,f.identity.documentWriter);
 await f.doc.refreshDocument();await f.doc.flush();assert.equal(f.queue.status(f.info.id).decision,null);assert.equal(f.source.core.adoptedSuggestion(f.info.id),null);assert.match(f.source.core.documentJson(),/Suggested once/);
 f.nativeRevision=f.openRevision();await f.nativeRevision.connect();assert.deepEqual(f.nativeRevision.status(f.revisionInfo.id).conflict.decision,decision);
 console.log('REVISION_CONFLICT_STATE '+JSON.stringify({family:family.name,queueDecisionRetained:f.queue.status(f.info.id).decision!==null,ownedHistoryRetained:f.source.core.adoptedSuggestion(f.info.id)!==null,undoDepth:f.source.core.view().undoDepth}));
 if(!f.queue.status(f.info.id).decision||!f.source.core.adoptedSuggestion(f.info.id))f.evidence('missing-owned-conflict-history');
 assert.deepEqual(f.queue.status(f.info.id).decision,decision,'A successful revision conflict pass must retain its authenticated predecessor winner');assert.ok(f.source.core.adoptedSuggestion(f.info.id),'The local accepting writer must retain the original owned Undo entry before completing conflict settlement');assert.equal(f.source.core.view().undoDepth,2);assert.equal(f.queue.status(f.info.id).localSaved,true);assert.equal(f.requests.filter(row=>row.kind==='suggestionDecide').length,1);
 await f.finishAndCold();assert.ok(f.source.core.adoptedSuggestion(f.info.id));f.evidence('owned-conflict-history');
}));
