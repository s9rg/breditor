/** Synchronous fresh read admission across all seven genuine operational
 * families. This never invokes old handoff verification or transfers custody.
 * Historical references are addresses, not provider availability or activation. */
import {SharedEditorError} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import {reserveProtectedOperationalHistoryRead,checkProtectedHistoryHeldCurrent,protectedHistoryUploads,protectedHistoryRecordPayloads,protectedHistoryNativeRetention,type ProtectedHistoryParticipant,type ProtectedHistoryGroupMetadata} from '../operation_read/protected_history_group.js';
import {recordReadMode,sourceRecordPayload,type OperationalRecordReadMode} from '../operation_read/record_payload.js';
import {OperationalIndependentLocalParticipant,reserveFreshIndependentLocalHistoryRead} from '../independent_local_operation/participant.js';
import type {FreshLocalParentHistoryOptions,FreshLocalParentHistoryMetadata} from '../independent_local_operation/fresh_parent_history.js';
import {OperationalIndependentDeliveryParticipant,reserveFreshIndependentDeliveryHistoryRead} from '../independent_operation/participant.js';
import type {FreshDeliveryParentHistoryOptions,FreshDeliveryParentHistoryMetadata} from '../independent_operation/fresh_parent_history.js';
import {RestoredOperationParticipant,reserveFreshRestoredDeliveryHistoryRead} from '../restored_participant/participant.js';
import type {FreshRestoredDeliveryHistoryOptions,FreshRestoredDeliveryHistoryMetadata} from '../restored_participant/fresh_parent_history.js';
import {OperationalRestoredLocalParticipant,reserveFreshSnapshotLocalHistoryRead} from '../restored_local_operation/participant.js';
import type {FreshSnapshotLocalHistoryOptions,FreshSnapshotLocalHistoryMetadata} from '../restored_local_operation/fresh_parent_history.js';
import {OperationalFlatLocalParticipant,reserveFreshFlatLocalHistoryRead} from '../flat_local_operation/participant.js';
import type {FreshFlatLocalHistoryOptions,FreshFlatLocalHistoryMetadata} from '../flat_local_operation/fresh_parent_history.js';
import {createFreshParentHistoryReservation,freshParentHistoryUploads,freshParentNativeRetention,type FreshParentHistoryReservation} from '../operation_read/fresh_parent_reservation.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {OperationalReadCancellation} from '../operation_read/cancellation.js';
import {snapshotReadFactoryData} from '../operation_read/read_factory_snapshot.js';
import {protectedHistoryGroupBudget} from '../operation_read/protected_history_budget.js';
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
export type CompleteHistoryParticipant<P extends SharedSelectionPolicy=SharedSelectionPolicy>=ProtectedHistoryParticipant<P>
 |Readonly<{id:string;family:'independent-local';operation:OperationalIndependentLocalParticipant<P>;read:FreshLocalParentHistoryOptions<P>}>
 |Readonly<{id:string;family:'independent-delivery';operation:OperationalIndependentDeliveryParticipant<P>;read:FreshDeliveryParentHistoryOptions<P>}>
 |Readonly<{id:string;family:'restored-graph';operation:RestoredOperationParticipant<P>;read:FreshRestoredDeliveryHistoryOptions<P>}>
 |Readonly<{id:string;family:'local-operation-snapshot';operation:OperationalRestoredLocalParticipant<P>;read:FreshSnapshotLocalHistoryOptions<P>}>
 |Readonly<{id:string;family:'local-operation-flat';operation:OperationalFlatLocalParticipant<P>;read:FreshFlatLocalHistoryOptions<P>}>;
type DeliveryMetadata=FreshLocalParentHistoryMetadata|FreshDeliveryParentHistoryMetadata|FreshRestoredDeliveryHistoryMetadata|FreshSnapshotLocalHistoryMetadata|FreshFlatLocalHistoryMetadata;
type HistoryMetadata=ProtectedHistoryGroupMetadata['participants'][number]['history']|DeliveryMetadata;
export interface CompleteOperationalHistoryMetadata{readonly format:'breditor/complete-operational-history-read';readonly formatVersion:1;readonly scope:'held-seven-family-protected-history-records';readonly participants:readonly Readonly<{id:string;family:CompleteHistoryParticipant['family'];history:HistoryMetadata}>[];readonly kind:'ready'|'pending';readonly references:readonly RichRetainedAssetReference[]}
type Read={prepare():Promise<void>;check():void;checkCurrent():void;verify():Promise<void>;close():void};
const fail=(kind:string)=>new SharedEditorError('complete_history_read_'+kind,'Hold distinct genuine operational parents with fresh explicit read factories and permission');
const families=['original','generation','independent-local','independent-delivery','restored-graph','local-operation-snapshot','local-operation-flat'];
function snapshot<P extends SharedSelectionPolicy>(input:readonly CompleteHistoryParticipant<P>[]):CompleteHistoryParticipant<P>[]{
 if(!Array.isArray(input))throw fail('policy');const length=Object.getOwnPropertyDescriptor(input,'length')?.value;if(!Number.isSafeInteger(length)||length<1||length>1024)throw fail('policy');const result:CompleteHistoryParticipant<P>[]=[];
 for(let i=0;i<length;i++){const d=Object.getOwnPropertyDescriptor(input,String(i));if(!d||!('value'in d))throw fail('policy');const row=d.value;if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).sort().join(',')!=='family,id,operation,read')throw fail('policy');const value:Record<string,unknown>={};for(const key of['id','family','operation','read']){const field=Object.getOwnPropertyDescriptor(row,key);if(!field||!('value'in field))throw fail('policy');value[key]=field.value;}if(typeof value['id']!=='string'||!value['id']||value['id'].length>200||!families.includes(value['family'] as string))throw fail('policy');value['read']=snapshotReadFactoryData(value['read']);result.push(value as unknown as CompleteHistoryParticipant<P>);}
 if(new Set(result.map(row=>row.id)).size!==result.length||new Set(result.map(row=>row.operation)).size!==result.length)throw fail('policy');return result;
}
/** Trusted composition with optional actual-upload inspection. Existing history
 * callers receive only read and acquire no additional whole-upload locks. */
export function reserveCompleteHistoryWithUploads<P extends SharedSelectionPolicy>(provided:readonly CompleteHistoryParticipant<P>[],providedAuthority:()=>void,signal?:AbortSignal,mode?:OperationalRecordReadMode){
 recordReadMode(mode);
 const rows=snapshot(provided),authority=participantAuthority(providedAuthority),scopes:Read[]=[],pending=new Set<Read>(),delivery=new Map<string,FreshParentHistoryReservation<DeliveryMetadata>>();let protectedRead:ReturnType<typeof reserveProtectedOperationalHistoryRead<P>>|undefined,protectedPrepared=false,observation:OperationalReadCancellation|undefined,closed=false;
 const current=()=>{if(closed)throw fail('closed');observation?.check(()=>fail('aborted'));if(protectedRead)checkProtectedHistoryHeldCurrent(protectedRead);for(const read of delivery.values())read.checkCurrent();},check=()=>{current();authority();current();};
 const release=()=>{if(closed)return;let error:unknown;for(const read of [...pending].reverse())try{read.close();pending.delete(read);}catch(cause){error??=cause;}if(pending.size)throw error??fail('cleanup');observation?.close();closed=true;};
 try{
  const selected=rows.filter((row):row is ProtectedHistoryParticipant<P>=>row.family==='original'||row.family==='generation');if(selected.length){protectedRead=reserveProtectedOperationalHistoryRead(selected,check,signal,mode);scopes.push(protectedRead);pending.add(protectedRead);}
  // These constructors reserve private flags only. All real parents are held
  // before prepare() installs cancellation or invokes any fresh read grant.
  for(const row of rows){let read:FreshParentHistoryReservation<DeliveryMetadata>|undefined;
   switch(row.family){case'original':case'generation':continue;case'independent-local':read=reserveFreshIndependentLocalHistoryRead(row.operation,row.read,check,signal,mode);break;case'independent-delivery':read=reserveFreshIndependentDeliveryHistoryRead(row.operation,row.read,check,signal,mode);break;case'restored-graph':read=reserveFreshRestoredDeliveryHistoryRead(row.operation,row.read,check,signal,mode);break;case'local-operation-snapshot':read=reserveFreshSnapshotLocalHistoryRead(row.operation,row.read,check,signal,mode);break;case'local-operation-flat':read=reserveFreshFlatLocalHistoryRead(row.operation,row.read,check,signal,mode);break;}
   delivery.set(row.id,read);scopes.push(read);pending.add(read);
  }
  const read=createFreshParentHistoryReservation({current,release,open:async()=>{observation=new OperationalReadCancellation(signal);check();if(protectedRead){await protectedRead.prepare();protectedPrepared=true;current();}for(const read of delivery.values()){await read.prepare();current();}check();
   const protectedRows=new Map(protectedRead?.metadata().participants.map(row=>[row.id,row.history])??[]),budget=protectedHistoryGroupBudget(),union=new Map<string,RichRetainedAssetReference>(),participants=rows.map(row=>{const history:HistoryMetadata|undefined=row.family==='original'||row.family==='generation'?protectedRows.get(row.id):delivery.get(row.id)?.metadata();if(!history)throw fail('source');budget.add(history);for(const reference of history.references)union.set(JSON.stringify([reference.asset,reference.generation]),reference);return{id:row.id,family:row.family,history};}),metadata:CompleteOperationalHistoryMetadata={format:'breditor/complete-operational-history-read',formatVersion:1,scope:'held-seven-family-protected-history-records',participants,kind:participants.some(row=>row.history.kind==='pending')?'pending':'ready',references:[...union.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0)};
   current();return{metadata:()=>metadata,check:()=>{check();for(const read of scopes)read.check();current();},checkCurrent:current,verify:async()=>{check();for(const read of scopes){await read.verify();current();}check();},dispose:release};
  }});
  return Object.freeze({read,records:()=>{current();if(!mode)throw fail('source');const legacy=new Map(protectedRead?protectedHistoryRecordPayloads(protectedRead).map(row=>[row.id,row.payload]):[]);return Object.freeze(rows.map(row=>{const payload=row.family==='original'||row.family==='generation'?legacy.get(row.id)!:sourceRecordPayload(delivery.get(row.id)!);if(!payload||payload.family!==row.family)throw fail('source');current();return Object.freeze({id:row.id,family:row.family,payload});}));},native:()=>{current();if(!mode)throw fail('source');const legacy=new Map(protectedRead?protectedHistoryNativeRetention(protectedRead).map(row=>[row.id,row.source]):[]);return Object.freeze(rows.map(row=>{const source=row.family==='original'||row.family==='generation'?legacy.get(row.id)!:freshParentNativeRetention(delivery.get(row.id)!);current();return Object.freeze({id:row.id,family:row.family,source});}));},legacyUploads:()=>protectedRead?protectedHistoryUploads(protectedRead).map(row=>row.store):[],uploads:()=>{current();const legacy=new Map(protectedRead?protectedHistoryUploads(protectedRead).map(row=>[row.id,row.store]):[]);return Object.freeze(rows.map(row=>Object.freeze({id:row.id,family:row.family,store:row.family==='original'||row.family==='generation'?legacy.get(row.id)!:freshParentHistoryUploads(delivery.get(row.id)!)})));}});
 }catch(error){release();throw error;}
}
/** Original reference-only behavior: no asset acquisition or whole-file I/O. */
export function reserveCompleteOperationalHistoryRead<P extends SharedSelectionPolicy>(provided:readonly CompleteHistoryParticipant<P>[],providedAuthority:()=>void,signal?:AbortSignal):FreshParentHistoryReservation<CompleteOperationalHistoryMetadata>{return reserveCompleteHistoryWithUploads(provided,providedAuthority,signal).read;}
