/** Admit literal snapshot/flat input, exact parent plans, actual namespace
 * identity, and all CURRENT/PENDING/observed records before DATA reconstruction.
 * Genuine detached input readers select their own protocol; ready JSON never
 * creates a source, writer lease, save acknowledgement or room authority. */
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import type {SharedAssetBytesOptions} from '../asset_bytes/types.js';
import type {IndependentHistoryCut} from '../independent_history/contract.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import {DetachedRestoredLocalInput as Snapshot,restoredLocalInput as snapshot} from '../restored_local_operation/input.js';
import {DetachedFlatLocalInput as Flat,flatLocalInput as flat} from '../flat_local_operation/input.js';
import {restoredLocalParentRecord,readRestoredLocalParentRecord} from '../restored_local_operation/participant_record.js';
import {makeFlatLocalParentRecord,readFlatLocalParentRecord} from '../flat_local_operation/participant_record.js';
import {readRestoredLocalIntent} from '../restored_local_operation/intent.js';
import {readFlatLocalIntent} from '../flat_local_operation/intent.js';
import {readRestoredLocalHead} from '../restored_local_operation/head.js';
import {readFlatLocalHead} from '../flat_local_operation/head.js';
import {readOperationCut,operationCutDigest,sameOperationCut,copyOperationCut} from '../independent_operation/cut_codec.js';
import {rows} from '../selected_native_execution/policy.js';
import {LoadedNativeReconstructionCurrent as Loaded} from './loaded_current.js';
import {fields,fail} from './policy.js';
const root=PhysicalRoomRecordCutArchive.prototype.root,inputs=PhysicalRoomRecordCutArchive.prototype.inputs,same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export async function admitLocalInputReconstructionRecords(source:Loaded,id:string,session:SharedIndependentRecoveryFactory,options:SharedAssetBytesOptions,check:()=>void){
 source.check();const entry=source.participant(id);if(entry.family!=='local-operation-snapshot'&&entry.family!=='local-operation-flat')throw fail('native_reconstruction_policy');
 const payload=fields(await source.records(id),['parent','source']),data=fields(payload['source'],['format','formatVersion','inputKind','identity','original','snapshot','live','retainedReferences','inputBindings']);check();
 const isSnapshot=entry.family==='local-operation-snapshot',kind=isSnapshot?'snapshot-v1':'flat-local-v1';
 if(data['format']!=='breditor/input-source-record-payload'||data['formatVersion']!==1||data['inputKind']!==kind||!same(data['original'],entry.selection))throw fail();
 const cut=source.nativeCut(),member=root.call(cut).participants.find(row=>row.id===id);if(!member||member.family!==entry.family)throw fail();
 const namespace=(role:string)=>{const row=member.namespaces.find(row=>row.role===role);if(!row)throw fail();return row.database;},names=['operation','journal','source','uploads'].map(namespace);if(new Set(names).size!==4)throw fail();
 const files=inputs.call(cut,id);if(files.length!==1||files[0]?.role!=='parent-input')throw fail();const file=files[0].file;
 const policy={expected:entry.selection,database:namespace('journal'),sourceDatabase:namespace('source'),sourceFactory:session,writerRecovery:'host-reacquired' as const,checkAuthority:check,cohort:{parentDatabase:namespace('operation'),uploadsDatabase:namespace('uploads')},...options};
 // Both closures below come only from actual branded readers. This normalized
 // DATA port is private output, never accepted from a caller or serialized file.
 const input=isSnapshot?await(async()=>{const owner=await snapshot.read.call(Snapshot,file,{...policy,kind:'snapshot-v1'});return{identity:snapshot.identity.call(owner),targets:snapshot.targets.call(owner),bindings:snapshot.bindings.call(owner),entries:snapshot.entries.call(owner),verify:(f:Blob)=>snapshot.verifyFile.call(owner,f,check),parent:()=>restoredLocalParentRecord(owner),blob:(a:string,g:string)=>snapshot.blob.call(owner,a,g),append:(s:Blob,e:readonly Blob[],c:()=>void)=>snapshot.append.call(owner,s,e,c),close:()=>snapshot.dispose.call(owner)};})():await(async()=>{const owner=await flat.read.call(Flat,file,{...policy,kind:'flat-local-v1'});return{identity:flat.identity.call(owner),targets:flat.targets.call(owner),bindings:flat.bindings.call(owner),entries:flat.entries.call(owner),verify:(f:Blob)=>flat.verifyFile.call(owner,f,check),parent:()=>makeFlatLocalParentRecord(owner),blob:(a:string,g:string)=>flat.blob.call(owner,a,g),append:(s:Blob,e:readonly Blob[],c:()=>void)=>flat.append.call(owner,s,e,c),close:()=>flat.dispose.call(owner)};})();
 let complete=false;
 try{
  check();await input.verify(source.participantFile(id));check();if(!same(input.identity,data['identity'])||!same(input.bindings,data['inputBindings']))throw fail();
  const parent=fields(payload['parent'],['format','formatVersion','parent','selection','file']),witness=fields(parent['file'],isSnapshot?['role','bytes','sha256']:['role','bytes','manifestSha256']),expected=await input.parent();check();
  const record=isSnapshot?readRestoredLocalParentRecord(parent['parent'],expected as Awaited<ReturnType<typeof restoredLocalParentRecord>>):readFlatLocalParentRecord(parent['parent'],expected as Awaited<ReturnType<typeof makeFlatLocalParentRecord>>);
  if(parent['format']!==(isSnapshot?'breditor/fresh-snapshot-local-parent-records':'breditor/fresh-flat-local-parent-records')||parent['formatVersion']!==1||record.phase!=='operational'||!same(parent['selection'],entry.selection)||witness['role']!=='parent-input'||witness['bytes']!==file.size)throw fail();
  if(isSnapshot?witness['sha256']!==JSON.parse(input.identity.plan).input.fileSha256:witness['manifestSha256']!==entry.selection.manifestSha256)throw fail();
  const readHead=isSnapshot?readRestoredLocalHead:readFlatLocalHead,decode=async(value:IndependentHistoryCut)=>{const c=await readOperationCut(value,h=>readHead(h,input.identity));check();return{format:'breditor/shared-independent-history-recovery' as const,formatVersion:1 as const,identity:c.record.identity,documentCheckpoint:c.documentCheckpoint,reviewCheckpoint:c.reviewCheckpoint,versions:c.record.versions};};
  const captured=fields(data['snapshot'],['record','current','pending','observed','retained']),intent=(isSnapshot?readRestoredLocalIntent:readFlatLocalIntent)(captured['record'],input.identity),cuts=new Map<string,IndependentHistoryCut>();
  for(const value of rows(captured['retained'],2)){const row=fields(value,['id','cut']),hash=row['id'];if(typeof hash!=='string'||cuts.has(hash))throw fail();const selected=row['cut'] as IndependentHistoryCut;await decode(selected);if(await operationCutDigest(selected)!==hash)throw fail();check();cuts.set(hash,copyOperationCut(selected));}
  // Both genuine operational parents require an acknowledged bootstrap cut.
  // Empty or first-prepare-only intents cannot belong to that parent phase.
  if(intent.current===null)throw fail();
  const named=new Set([intent.current,intent.pending].filter((value):value is string=>value!==null));if(cuts.size!==named.size||[...cuts.keys()].some(hash=>!named.has(hash)))throw fail();
  for(const[slot,hash]of[['current',intent.current],['pending',intent.pending]]as const)if(hash===null?captured[slot]!==null:!cuts.has(hash)||!sameOperationCut(captured[slot],cuts.get(hash)!))throw fail();
  if(captured['observed']===null?intent.current!==null:typeof captured['observed']!=='string'||!named.has(captured['observed']))throw fail();
  const references=new Map<string,unknown>();for(const value of rows(data['retainedReferences'],2)){const row=fields(value,['id','references','pending']);if(typeof row['id']!=='string'||references.has(row['id'])||!cuts.has(row['id']))throw fail();references.set(row['id'],{references:row['references'],pending:row['pending']});}if(references.size!==cuts.size)throw fail();
  check();complete=true;return{input,intent,current:intent.current===null?null:cuts.get(intent.current)!,pending:intent.pending===null?null:cuts.get(intent.pending)!,observed:captured['observed'] as string|null,references,decode,live:data['live'],close:input.close};
 }finally{if(!complete)input.close();}
}
