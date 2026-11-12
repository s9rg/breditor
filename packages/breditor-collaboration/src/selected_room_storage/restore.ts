/** Data restoration only, with a fresh independently pinned archive and
 * observed destination choice. Existing selected values are never replaced;
 * partial commits survive failure for a newly approved complete retry. Native
 * constructors and current editing/transport approval follow separately. */
import {SelectedRoomStorageArchive,selectedRoomStorageLifetime,selectedRoomStorageData,storageSelection} from './archive.js';import {StorageDatabaseJob} from './database.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {fields,integer,hash,rows,fail,equal,MAX_STORAGE_DATABASES,MAX_STORAGE_RECORDS} from './policy.js';
import {selectedRoomCurrentSelection} from '../selected_room_current/manifest.js';import {participantAuthority} from '../participant_backup/policy.js';import {decideFreshAssetChoice} from '../physical_room_asset_approval/decision.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';import type {StorageRestoreChoice,StorageRestoreResult,StorageDestination} from './contract.js';
const active=new WeakSet<object>(),select=SelectedRoomStorageArchive.prototype.selection,io={reserve:StorageDatabaseJob.prototype.reserve,observe:StorageDatabaseJob.prototype.observe,restore:StorageDatabaseJob.prototype.restore,close:StorageDatabaseJob.prototype.close};
export interface SelectedStorageRestoreOptions extends SharedArchiveIntegrityOptions{readonly expected:StorageRestoreChoice;readonly approve:(choice:StorageRestoreChoice)=>boolean|Promise<boolean>}
export function storageRestoreChoice(input:unknown):StorageRestoreChoice{const r=fields(input,['format','formatVersion','archive','current','destinations']);if(r['format']!=='breditor/selected-room-storage-restore'||r['formatVersion']!==1)throw fail();let previous='';const destinations=rows(r['destinations'],MAX_STORAGE_DATABASES).map((value):StorageDestination=>{const d=fields(value,['database','kind','present','missing','sha256']),database=d['database'],kind=d['kind'];if(typeof database!=='string'||!database||database<=previous||(typeof kind!=='string'||!['absent','missing','partial','identical'].includes(kind)))throw fail();previous=database;return{database,kind:kind as StorageDestination['kind'],present:integer(d['present'],MAX_STORAGE_RECORDS*32),missing:integer(d['missing'],MAX_STORAGE_RECORDS*32),sha256:hash(d['sha256'])};});return frozen({format:'breditor/selected-room-storage-restore',formatVersion:1,archive:storageSelection(r['archive']),current:selectedRoomCurrentSelection(r['current']),destinations});}
async function operate(
 archive:SelectedRoomStorageArchive,
 provided:SharedArchiveIntegrityOptions|SelectedStorageRestoreOptions,
 restore:boolean,
):Promise<StorageRestoreChoice>{
 if(!archive||typeof archive!=='object')throw fail('room_storage_policy');
 if(active.has(archive))throw fail('room_storage_busy');
 active.add(archive);
 let job:StorageDatabaseJob|undefined;
 try{
  const lifetime=selectedRoomStorageLifetime(archive),archiveSelection=select.call(archive);
  const r=fields(provided,['wasm','checkAuthority',...(restore?['expected','approve']:[])],['signal']);
  const authority=participantAuthority(r['checkAuthority'] as ()=>void),signal=r['signal'] as AbortSignal|undefined;
  const expected=restore?storageRestoreChoice(r['expected']):undefined,approve=r['approve'] as SelectedStorageRestoreOptions['approve'];
  if(restore&&typeof approve!=='function')throw fail('room_storage_policy');
  const checkAuthority=()=>{
   lifetime.check();
   authority();
   lifetime.check();
  };
  const options={wasm:r['wasm'] as SharedArchiveIntegrityOptions['wasm'],checkAuthority,...(signal?{signal}:{})};
  const guard=()=>{
   if(signal?.aborted)throw fail('room_storage_aborted');
   checkAuthority();
   job?.check();
   if(signal?.aborted)throw fail('room_storage_aborted');
  };

  const content=await selectedRoomStorageData(archive);
  guard();
  job=new StorageDatabaseJob(options);
  await io.reserve.call(job,content.plans.map(row=>row.database));
  const inspect=async()=>{
   const destinations:StorageDestination[]=[];
   for(let i=0;i<content.plans.length;i++)destinations.push(await io.observe.call(job!,content.plans[i]!,content.data.databases[i]!));
   guard();
   return storageRestoreChoice({format:'breditor/selected-room-storage-restore',formatVersion:1,archive:archiveSelection,current:content.data.current.selection,destinations});
  };
  const before=await inspect();
  if(!restore)return before;
  if(!equal(before,expected))throw fail('room_storage_stale');
  await decideFreshAssetChoice(expected!,approve,{check:guard,signal,watchClosing:lifetime.watchClosing});
  if(!equal(await inspect(),expected))throw fail('room_storage_stale');

  for(let i=0;i<content.plans.length;i++){
   await io.restore.call(job,content.plans[i]!,content.data.databases[i]!,expected!.destinations[i]!);
   guard();
  }
  for(let i=0;i<content.plans.length;i++){
   const actual=await io.observe.call(job,content.plans[i]!,content.data.databases[i]!);
   if(actual.kind!=='identical')throw fail();
  }
  await selectedRoomStorageData(archive);
  guard();
  return before;
 }finally{
  try{if(job)await io.close.call(job);}
  finally{active.delete(archive);}
 }
}
export function previewSelectedRoomStorageRestore(archive:SelectedRoomStorageArchive,options:SharedArchiveIntegrityOptions):Promise<StorageRestoreChoice>{return operate(archive,options,false);}
export async function restoreSelectedRoomStorageData(archive:SelectedRoomStorageArchive,options:SelectedStorageRestoreOptions):Promise<StorageRestoreResult>{const choice=await operate(archive,options,true);return Object.freeze({format:'breditor/selected-room-storage-restored',formatVersion:1,choice});}
