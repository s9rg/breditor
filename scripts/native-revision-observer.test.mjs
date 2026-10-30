/** Permanent observers may publish creator revisions without authored document
 * groups or Accept. Original comment history remains independent. */
import test from 'node:test';import assert from 'node:assert/strict';
import {nativeSuggestionSession,families} from './fixtures/native-suggestion-delivery/session.mjs';
for(const family of families)for(const scope of ['original','general-v1','document-v1'])for(const natural of [false,true])test(family.name+' / '+scope+' / '+(natural?'typing-v1':'explicit')+': native observer revises through its original outbox and stays a zero-prefix observer',{timeout:120000},()=>nativeSuggestionSession({family,scope,natural,owned:false,observer:true,choice:null,prepare:family.kind!=='original',withRevisions:true},async f=>{
 f.suggestions=f.openNative();const before=f.source.core.documentJson(),calls=f.oldTransportCalls;f.faults.oldTransport=true;f.nativeRevision=f.openRevision();
 await f.nativeRevision.connect();await f.nativeRevision.flushLocal();assert.equal(f.oldTransportCalls,calls);const status=f.nativeRevision.status(f.revisionInfo.id);assert.equal(status.receipt.revision.id,f.revisionInfo.id);assert.equal(status.retry,false);assert.equal(status.localSaved,true);assert.equal(status.conflict,null);
 assert.equal(f.queue.packet(f.revisionInfo.suggestion.id),f.childPacket);assert.equal(f.queue.status(f.info.id).decision.decision,'reject');assert.equal(f.source.core.documentJson(),before);assert.equal(f.source.core.writerClockV2(f.identity.documentWriter).through,'0');assert.equal(f.doc.suggestionState().permissions.canAccept,false);
 assert.equal(f.requests.filter(r=>r.testPrincipal===f.identity.principal&&['register','resume','submit','suggestionDecide'].includes(r.kind)).length,0);assert.equal(f.requests.filter(r=>r.kind==='suggestionPublish'&&r.packet===f.childPacket).length,0);
 await f.finishAndCold();assert.equal(f.outbox.exportRecovery().retained[0].packet,f.revisionPacket);f.evidence('observer');
}));
