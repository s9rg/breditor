/** Fixed representative native profile/history/input coverage. All five normal
 * profiles and four history pairs use both real input families. Scope/masks
 * rotate across the forty cases; this is NOT their full Cartesian product.
 * No archive data, prefix result or read borrow grants room activation. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {nativeProfile,insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {localParticipantFixture} from './fixtures/independent-local-operation/participant.mjs';
import {restoredLocalFixture} from './fixtures/restored-local-operation/session.mjs';
import {flatLocalFixture} from './fixtures/flat-local-operation/session.mjs';

export async function probeNativeInputIncomingSource({api,rich,internals,runtime,fixture}){
 const {OperationalIndependentLocalParticipant:OldParent,OperationalRestoredLocalParticipant:SnapshotParent,OperationalFlatLocalParticipant:FlatParent,captureLocalOperationBackup,captureNativeInputIncomingSource,readNativeInputIncomingSource,disposeNativeInputIncomingSource,checkCapturedNativeHistoryRead,IndependentLocalOperationBackup,portableLocalOperationArchive,FlatLocalArchive,flatLocalArchive}=internals;
 const native=await import(pathToFileURL(resolve(runtime,'breditor_shared.js')));await native.default({module_or_path:readFileSync(resolve(runtime,'breditor_shared_bg.wasm'))});
 const root=JSON.parse(readFileSync(fixture,'utf8')),bytes=async value=>Buffer.from(await value.arrayBuffer());
 const counts={cases:0,profiles:0,prefixReads:0,writerGrantRefusals:0,exactNativeRecoveries:0,versionCatalogs:0,wholeUploads:0,originalPixels:0,readGrantRefusals:0,staleNativeRefusals:0,disposedReaderRefusals:0,distinctArchiveHandleRefusals:0,futureUndoPairs:0,networkCalls:0};
 const kinds={'snapshot-v1':0,'flat-local-v1':0},histories={'original/original':0,'original/segmented-v1':0,'segmented-v1/original':0,'segmented-v1/segmented-v1':0},scopes=new Set(),masks=new Set();
 assert.equal('NativeInputIncomingSourceCapture'in api,false);assert.equal('nativeInputIncomingSource'in api,false);
 for(const [language,standard]of[[1,false],[2,false],[2,true],[3,false],[3,true]]){
  const profile=nativeProfile(native,language,standard);counts.profiles++;
  try{for(const documentSegmented of[false,true])for(const reviewSegmented of[false,true])for(const kind of['snapshot-v1','flat-local-v1']){
   const scope=counts.cases%3,mask=counts.cases%8,host={fixture:extra=>localParticipantFixture({api,rich,Participant:OldParent,profile,root,tag:'incoming-source-'+counts.cases,language,scope,mask,...extra})};
   const f=kind==='snapshot-v1'?await restoredLocalFixture(host,captureLocalOperationBackup,{documentSegmented,reviewSegmented}):await flatLocalFixture(host,{documentSegmented,reviewSegmented});
   const value=kind==='snapshot-v1'?f.value:f.original.value,Parent=kind==='snapshot-v1'?SnapshotParent:FlatParent,input={kind,backup:f.backup};let parent,parts,owner,alias,writerAllowed=true,readAllowed=true;
   const fetchDescriptor=Object.getOwnPropertyDescriptor(globalThis,'fetch'),fetch=globalThis.fetch;
   try{
    Object.defineProperty(globalThis,'fetch',{configurable:true,value(resource,...rest){const url=typeof resource==='string'?resource:resource?.url??String(resource);if(url.startsWith('blob:')||url.startsWith('data:'))return fetch.call(this,resource,...rest);counts.networkCalls++;throw Error('A native prefix borrow cannot activate a peer or upload');}});
    parent=await Parent.begin(f.file,{...f.options,checkAuthority(){if(!writerAllowed)throw Error('Writer grant ended');},cohort:{parentDatabase:value.f.tag+'-incoming-parent',uploadsDatabase:value.f.tag+'-incoming-uploads'}});parts=await parent.intoParts();const source=parts.source.session;
    insertCleanupText(source.core,'Later incoming-source edit ');source.core.dispatchReview({kind:'create_thread',data:{anchorJson:source.core.captureReviewAnchor({kind:'document'}),body:'Later incoming-source review'}});await source.retainVersion(source.core.captureVersion('Incoming source version','alice','80'));await source.flush();
    const live=source.exportRecovery(),view=source.core.view(),uploads=await bytes(await parts.uploads.exportBackup()),pixel=await bytes(parts.input.blob(value.f.reference.asset,value.f.reference.generation));assert.equal(live.versions.length,3);
    writerAllowed=false;assert.throws(()=>source.save());counts.writerGrantRefusals++;
    owner=await captureNativeInputIncomingSource({source,input,...value.readOptions,checkAuthority(){if(!readAllowed)throw Error('Fresh read grant ended');}});
    const read=readNativeInputIncomingSource({input,source:owner});assert.equal(read.kind,kind);assert.deepEqual(read.selected,f.backup.selection());assert.deepEqual(read.capture.metadata.identity,live.identity);
    const records=[{kind:'document',index:0,json:live.documentCheckpoint},{kind:'review',index:0,json:live.reviewCheckpoint},...live.versions.map((json,index)=>({kind:'version',index,json}))];assert.deepEqual(read.capture.records,records);counts.versionCatalogs++;
    checkCapturedNativeHistoryRead(read.lanes);assert.equal(read.lanes.document.checkpointJson(),live.documentCheckpoint);assert.equal(read.lanes.review.checkpointJson(),live.reviewCheckpoint);assert.deepEqual(source.exportRecovery(),live);assert.deepEqual(source.core.view(),view);counts.exactNativeRecoveries++;counts.prefixReads++;
    assert.deepEqual(await bytes(await parts.uploads.exportBackup()),uploads);counts.wholeUploads++;assert.deepEqual(await bytes(parts.input.blob(value.f.reference.asset,value.f.reference.generation)),pixel);counts.originalPixels++;
    if(counts.cases<2){
     const codec=kind==='snapshot-v1'?portableLocalOperationArchive:flatLocalArchive,Class=kind==='snapshot-v1'?IndependentLocalOperationBackup:FlatLocalArchive;
     alias=await codec.read.call(Class,f.file,f.backup.selection(),value.readOptions);assert.deepEqual(codec.selection.call(alias),f.backup.selection());assert.throws(()=>readNativeInputIncomingSource({input:{kind,backup:alias},source:owner}));counts.distinctArchiveHandleRefusals++;codec.dispose.call(alias);alias=undefined;assert.ok(readNativeInputIncomingSource({input,source:owner}));
    }
    readAllowed=false;assert.throws(()=>readNativeInputIncomingSource({input,source:owner}));assert.throws(()=>read.lanes.check());counts.readGrantRefusals+=2;readAllowed=true;writerAllowed=true;
    assert.equal(source.core.undo(),true);assert.equal(source.core.undoReview().kind,'committed');counts.futureUndoPairs++;assert.throws(()=>readNativeInputIncomingSource({input,source:owner}));counts.staleNativeRefusals++;
    disposeNativeInputIncomingSource(owner);owner=undefined;assert.throws(()=>read.lanes.document.checkpointJson());assert.throws(()=>checkCapturedNativeHistoryRead(read.lanes));counts.disposedReaderRefusals+=2;await source.flush();
    kinds[kind]++;histories[(documentSegmented?'segmented-v1':'original')+'/'+(reviewSegmented?'segmented-v1':'original')]++;scopes.add(scope);masks.add(mask);counts.cases++;
   }catch(error){throw new Error(`Incoming native source language=${language} standard=${standard} scope=${scope} mask=${mask} kind=${kind} document=${documentSegmented} review=${reviewSegmented} case=${counts.cases}`,{cause:error});}
   finally{writerAllowed=true;readAllowed=true;if(owner)disposeNativeInputIncomingSource(owner);if(alias)(kind==='snapshot-v1'?portableLocalOperationArchive:flatLocalArchive).dispose.call(alias);await parts?.source.session.discardAndClose();parts?.uploads.close();await parent?.discardAndClose();if(fetchDescriptor)Object.defineProperty(globalThis,'fetch',fetchDescriptor);else delete globalThis.fetch;await f.close();}
  }}finally{profile.free();}
 }
 for(const[key,expected]of Object.entries({cases:40,profiles:5,prefixReads:40,writerGrantRefusals:40,exactNativeRecoveries:40,versionCatalogs:40,wholeUploads:40,originalPixels:40,readGrantRefusals:80,staleNativeRefusals:40,disposedReaderRefusals:80,distinctArchiveHandleRefusals:2,futureUndoPairs:40,networkCalls:0}))assert.equal(counts[key],expected,key);
 assert.deepEqual(kinds,{'snapshot-v1':20,'flat-local-v1':20});for(const count of Object.values(histories))assert.equal(count,10);assert.deepEqual([...scopes].sort(),[0,1,2]);assert.deepEqual([...masks].sort(),[0,1,2,3,4,5,6,7]);
 return{format:'breditor/native-input-incoming-source-probe',formatVersion:1,passed:true,...counts,kinds,histories,selectionScopes:[...scopes].sort(),capabilityMasks:[...masks].sort(),fullCartesianDomain:false,sharedWasmSha256:createHash('sha256').update(readFileSync(resolve(runtime,'breditor_shared_bg.wasm'))).digest('hex'),scope:'Forty fixed representative cases: each of five normal native profiles, four document/comment history pairs and both actual local input families. Selection scopes and capability masks rotate, not a full Cartesian matrix. Fresh read after ended writer grant; exact captured native records and versions; unchanged whole uploads/pixels; same-metadata distinct real archive refusal; real future Undo; stale/revoked/disposed refusal. No room adoption, authenticated activation, physical durability, sustainable history or V1 approval.'};
}
