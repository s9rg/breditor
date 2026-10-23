/** Explicit current factories, independently selected from normal test hosts.
 * Incoming metadata never chooses executable factories or a writer grant. */
import * as api from '../../../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {makePhysicalCatalogV2Participant} from '../physical-catalog-v2/fixture.mjs';
import {recoveryFactory} from '../independent-delivery-recovery/session.mjs';
import {localRecoveryOptions} from '../independent-recovery/session.mjs';
import {captureLocalOperationBackup} from '../../../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js';
import {captureIndependentOperationBackup} from '../../../packages/breditor-collaboration/dist/independent_operation/portable_capture.js';
import {captureRestoredGraph} from '../../../packages/breditor-collaboration/dist/restored_graph/capture.js';
const factory=options=>Object.fromEntries(Object.entries(options).filter(([key])=>!['database','create'].includes(key)));
export async function currentV3Participant({source,h,local},family,tag='v3-selected',extra={}){
 const entry=source.metadata.participants.find(row=>row.family===family),saved=source.clients.get(entry.id),checkAuthority=extra.checkAuthority??(()=>{}),signal=extra.signal;
 if(family==='local-operation-snapshot'||family==='local-operation-flat')return{id:entry.id,family,options:{kind:family==='local-operation-flat'?'flat-local-v1':'snapshot-v1',expected:entry.selection,database:tag+' journal',sourceDatabase:tag+' source',sourceFactory:factory(local.options),writerRecovery:'host-reacquired',checkAuthority,...(signal?{signal}:{}),cohort:{parentDatabase:tag+' parent',uploadsDatabase:tag+' uploads'}}};
 if(family==='restored-graph')return{id:entry.id,family,options:{kind:'lineage-v2',expected:entry.selection,database:tag+' parent',journalDatabase:tag+' journal',sourceDatabase:tag+' source',uploadsDatabase:tag+' uploads',session:recoveryFactory(h.current.options,{readOnly:h.current.options.readOnly,access:h.current.options.review.access}),writerRecovery:'host-reacquired',checkAuthority,...(signal?{signal}:{})}};
 const kind=family==='generation'?'generation-retained':family,template=await makePhysicalCatalogV2Participant(kind,{api,rich,profile:h.profile,fixture:h.fixture,metadata:source.inventory.metadata().native,client:h.fixture.clients[0],documentSegmented:true,reviewSegmented:true,tag:tag+'-factory-template'},h.counts);
 try{
  if(family==='original'){
   const{backup,expected,checkAuthority:old,signal:oldSignal,destinations,...recovery}=template.recovery;return{id:entry.id,family,operationDatabase:tag+' operation',recovery:{...recovery,database:tag+' recovery',destinations:Object.fromEntries(Object.keys(destinations).map(key=>[key,tag+' '+key]))},currentPolicy:{documentReadOnly:false,reviewAccess:'comment'},checkAuthority,...(signal?{signal}:{})};
  }
  if(family==='generation'){
   const{database,create,initialGenerations,initialReviewCheckpoint,binding,retained,...native}=template.options;return{id:entry.id,family,operationDatabase:tag+' operation',recovery:{database:tag+' recovery',destinations:{source:tag+' recovery source',uploads:tag+' uploads'},session:{kind:'retained',options:{...native,binding,retained}}},currentPolicy:{documentReadOnly:false,reviewAccess:'comment'},checkAuthority,...(signal?{signal}:{})};
  }
  if(family==='independent-local'){
   const recovery={...localRecoveryOptions(template.options,saved.backup,tag+'-recovery'),checkAuthority,...(signal?{signal}:{})};return{id:entry.id,family,options:{database:tag+' parent',journalDatabase:tag+' journal',sourceDatabase:tag+' source',session:{...template.options,database:tag+' source'},recovery,writerRecovery:'host-reacquired'}};
  }
  const current=recoveryFactory(template.options,{readOnly:false,access:'comment'});return{id:entry.id,family,stagingSession:recoveryFactory(template.options),options:{database:tag+' operation',sourceDatabase:tag+' source',writerRecovery:'host-reacquired',recovery:{database:tag+' recovery',expected:entry.selection,destinations:{source:tag+' recovery source',uploads:tag+' uploads'},session:current,checkAuthority,...(signal?{signal}:{})}}};
 }finally{await template.close();}
}
export function v3CatalogReadOptions({source,h,local}){return{...h.options,localPolicies:source.metadata.participants.filter(row=>row.family==='local-operation-flat'||row.family==='local-operation-snapshot').map(row=>({id:row.id,family:row.family,original:row.selection.original,options:local.readOptions}))};}
export async function closeV3FixtureWriters({h,local}){await local.close();await h.current.close();await h.older.close();}
export async function verifyV3RecoveredParticipant(selected,source,parts){
 const backup=source.clients.get(selected.id).backup,family=selected.family,bytes=async file=>Buffer.from(await file.arrayBuffer());let capture,portable;
 try{
  if(family==='original'){capture=api.captureSharedAssetReferences(parts.sources);await backup.verifyRecovered(capture,parts.uploads);}
  else if(family==='generation'){capture=api.captureSharedGenerationSource(parts.source);await backup.verifyRecovered(capture,parts.uploads);}
  else if(family==='independent-local'||family==='independent-delivery'){
   const assert=(await import('node:assert/strict')).default;if(family==='independent-local')assert.deepEqual(parts.source.session.exportRecovery(),backup.sourceRecovery());assertBytes(await bytes(await parts.uploads.exportBackup()),await bytes(backup.uploadBackup()));
   const result=await(family==='independent-local'?captureLocalOperationBackup:captureIndependentOperationBackup)({source:parts.source.session,assets:parts.uploads,session:family==='independent-local'?selected.options.recovery.session:selected.stagingSession,checkAuthority(){}});assert.equal(result.kind,'ready');portable=result.backup;assert.deepEqual(portable.liveSource(),backup.sourceRecovery());assertBytes(await bytes(portable.originalFile()),await bytes(backup.file()));if(family==='independent-local')assertBytes(await bytes(parts.original.file()),await bytes(backup.file()));
  }
  else if(family==='restored-graph'){
   const assert=(await import('node:assert/strict')).default,session={...selected.options.session,readOnly:true,review:{...selected.options.session.review,access:'read_only'}},result=await captureRestoredGraph({source:parts.source.session,assets:parts.uploads,session,checkAuthority(){}});assert.equal(result.kind,'ready');portable=result.archive;assert.deepEqual(portable.liveSource(),backup.liveSource());assertBytes(await bytes(await parts.uploads.exportBackup()),await bytes(backup.uploadBackup()));assert.ok(portable.metadata().nodes.length>=backup.metadata().nodes.length);
  }else{
   const native=family==='local-operation-flat'?backup.live():backup.liveSource();const assert=(await import('node:assert/strict')).default;assert.deepEqual(parts.source.session.exportRecovery(),native);assertBytes(await bytes(await parts.uploads.exportBackup()),await bytes(family==='local-operation-flat'?backup.uploads():backup.uploadBackup()));if(family!=='restored-graph')assertBytes(await bytes(parts.input.file()),await bytes(backup.file()));
  }
 }finally{portable?.dispose();capture?.dispose();}
}
function assertBytes(a,b){if(!a.equals(b))throw Error('Exact retained file/upload bytes changed');}
