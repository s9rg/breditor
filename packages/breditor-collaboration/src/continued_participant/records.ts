/** Frame each exact native string once, shared across all four save slots. */
import {archiveFields,archiveInteger} from '../archive_integrity/policy.js';
import type {ArchiveIntegrityContext} from '../archive_integrity/context.js';
import {readVerifiedArchiveText} from '../archive_integrity/verified_text.js';
import {assetBytesUtf8} from '../asset_bytes/format.js';
import {makeContinuedPairCut} from '../continued_pair/cut.js';
import type {ContinuedPairHistoryKind,ContinuedPairIdentity,SharedContinuedPairRecovery} from '../continued_pair/contract.js';
import type {ContinuedPairRecords} from '../continued_pair/read_records.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {participantDigest,participantFailure as fail} from './policy.js';

const MIB=1024*1024;
const maxParts=4*(2+32);
export const MAX_CONTINUED_RECORDS_BYTES=640*MIB;
export interface RecordPin {bytes:number;sha256:string}
interface StatePin {document:number;review:number;versions:readonly number[]}
export interface ContinuedStatePins {
 committed:StatePin;
 attempt:Readonly<{state:StatePin;prepared:boolean}>|null;
 pending:StatePin|null;
 live:StatePin;
}
const checkpointLimit=(kind:ContinuedPairHistoryKind)=>
 kind==='continued-v2'?256*MIB:kind==='segmented-v1'?64*MIB:16*MIB;

type PackableSlots=Pick<ContinuedPairRecords,'committed'|'pending'|'live'>&{
 readonly attempt:Readonly<{capture:SharedContinuedPairRecovery;cut:object|null}>|null;
};
export async function packContinuedRecords(records:PackableSlots,context:ArchiveIntegrityContext){
 const parts:Blob[]=[],pins:RecordPin[]=[],index=new Map<string,number>();
 let bytes=0;
 const add=async(text:string,maximum:number)=>{
  context.guard();
  const existing=index.get(text);
  if(existing!==undefined){
   if(pins[existing]!.bytes>maximum)throw fail('budget');
   return existing;
  }
  const data=assetBytesUtf8(text,maximum);
  if(!data.byteLength||(bytes+=data.byteLength)>MAX_CONTINUED_RECORDS_BYTES)throw fail('budget');
  const blob=new Blob([data]),sha256=await context.digest(blob),id=parts.length;
  parts.push(blob);
  pins.push({bytes:blob.size,sha256});
  index.set(text,id);
  return id;
 };
 const cut=async(state:SharedContinuedPairRecovery):Promise<StatePin>=>{
  const document=await add(state.documentCheckpoint,checkpointLimit(state.identity.documentHistory));
  const review=await add(state.reviewCheckpoint,checkpointLimit(state.identity.reviewHistory));
  const versions:number[]=[];
  for(const version of state.versions)versions.push(await add(version,4*MIB));
  return {document,review,versions};
 };
 const states:ContinuedStatePins={
  committed:await cut(records.committed.recovery),
  attempt:records.attempt?{state:await cut(records.attempt.capture),prepared:records.attempt.cut!==null}:null,
  pending:records.pending?await cut(records.pending):null,
  live:await cut(records.live),
 };
 return {states,pins,parts};
}

export function readContinuedRecordPins(value:unknown):{pins:RecordPin[];bytes:number}{
 if(!Array.isArray(value)||value.length<2||value.length>maxParts)throw fail();
 const unique=new Set<string>();
 let bytes=0;
 const pins=value.map(input=>{
  const row=archiveFields(input,'bytes,sha256'),length=archiveInteger(row['bytes'],1,256*MIB),sha256=row['sha256'];
  if(!participantDigest(sha256)||unique.has(sha256)||(bytes+=length)>MAX_CONTINUED_RECORDS_BYTES)throw fail('budget');
  unique.add(sha256);
  return {bytes:length,sha256};
 });
 return {pins,bytes};
}

/** The header must refer to every entry in first-use order and pin each slot independently. */
export function readContinuedStates(input:unknown,pins:readonly RecordPin[],identity:ContinuedPairIdentity):ContinuedStatePins{
 const row=archiveFields(input,'committed,attempt,pending,live');
 const used=new Set<number>();
 const read=(value:unknown,maximum:number)=>{
  const index=archiveInteger(value,0,pins.length-1);
  if(pins[index]!.bytes>maximum||!used.has(index)&&index!==used.size)throw fail();
  used.add(index);
  return index;
 };
 const state=(value:unknown):StatePin=>{
  const raw=archiveFields(value,'document,review,versions');
  if(!Array.isArray(raw['versions'])||raw['versions'].length>32)throw fail();
  return {document:read(raw['document'],checkpointLimit(identity.documentHistory)),
   review:read(raw['review'],checkpointLimit(identity.reviewHistory)),
   versions:raw['versions'].map(index=>read(index,4*MIB))};
 };
 const committed=state(row['committed']);
 let attempt:ContinuedStatePins['attempt']=null;
 if(row['attempt']!==null){
  const raw=archiveFields(row['attempt'],'state,prepared');
  if(typeof raw['prepared']!=='boolean')throw fail();
  attempt={state:state(raw['state']),prepared:raw['prepared']};
 }
 const pending=row['pending']===null?null:state(row['pending']),live=state(row['live']);
 if(used.size!==pins.length)throw fail();
 return {committed,attempt,pending,live};
}

export async function readContinuedRecordBodies(
 file:Blob,offset:number,pins:readonly RecordPin[],states:ContinuedStatePins,
 identity:ContinuedPairIdentity,context:ArchiveIntegrityContext,
):Promise<ContinuedPairRecords>{
 const entries:string[]=[];
 for(const pin of pins){
  entries.push(await readVerifiedArchiveText(file.slice(offset,offset+pin.bytes),pin,256*MIB,context,fail));
  offset+=pin.bytes;
 }
 const recovery=(state:StatePin):SharedContinuedPairRecovery=>({
  format:'breditor/shared-independent-history-recovery',formatVersion:2,identity,
  documentCheckpoint:entries[state.document]!,reviewCheckpoint:entries[state.review]!,
  versions:state.versions.map(index=>entries[index]!),
 });
 const prepare=async(state:SharedContinuedPairRecovery)=>{
  context.guard();
  const cut=await makeContinuedPairCut(state.documentCheckpoint,state.reviewCheckpoint,identity,state.versions);
  context.guard();
  return cut;
 };
 const committed=recovery(states.committed),head=(await prepare(committed)).head;
 const pending=states.pending?recovery(states.pending):null,live=recovery(states.live);
 let attempt:ContinuedPairRecords['attempt']=null;
 if(states.attempt){
  const capture=recovery(states.attempt.state),cut=await prepare(capture);
  attempt={capture,cut:states.attempt.prepared?cut:null};
 }
 if(pending)await prepare(pending);
 await prepare(live);
 return frozen({format:'breditor/persistent-continued-pair-record-read',formatVersion:1,
  scope:'atomic-continued-pair-committed-attempt-pending-live',committed:{head,recovery:committed},attempt,pending,live});
}
