/** Delivery records extend each exact local pair slot with a separately pinned companion. */
import {archiveFields,archiveInteger} from '../archive_integrity/policy.js';
import type {ArchiveIntegrityContext} from '../archive_integrity/context.js';
import {readVerifiedArchiveText} from '../archive_integrity/verified_text.js';
import {assetBytesUtf8} from '../asset_bytes/format.js';
import {ContinuedDeliveryCompanion} from '../continued_delivery/companion.js';
import type {ContinuedDeliveryRecords,SharedContinuedDeliveryRecovery} from '../continued_delivery/contract.js';
import {makeContinuedPairCut} from '../continued_pair/cut.js';
import type {ContinuedPairRecords} from '../continued_pair/read_records.js';
import type {SharedContinuedPairRecovery} from '../continued_pair/contract.js';
import {freezeGeneration} from '../generation_source/identity.js';
import {participantDigest,participantFailure as fail} from './policy.js';
import type {RecordPin} from './records.js';

const maxRecordBytes=100*1024*1024;
export const maxDeliveryRecordBytes=4*maxRecordBytes;
type Companion=Omit<SharedContinuedDeliveryRecovery,'source'>;
type Slots=Readonly<{committed:number;attempt:number|null;pending:number|null;live:number}>;
export interface DeliveryPins {readonly records:readonly RecordPin[];readonly slots:Slots}

export function deliveryPairRecords(records:ContinuedDeliveryRecords){
 const {committed,attempt,pending,live}=records;
 return {
  committed:{head:committed.head,recovery:committed.recovery.source},
  attempt:attempt?{capture:attempt.capture.source,cut:attempt.preparedHead===null?null:{head:attempt.preparedHead}}:null,
  pending:pending?.source??null,live:live.source,
 };
}

export async function packDeliveryRecords(input:ContinuedDeliveryRecords,context:ArchiveIntegrityContext){
 const records:RecordPin[]=[],parts:Blob[]=[],ids=new Map<string,number>();
 const add=async (recovery:SharedContinuedDeliveryRecovery)=>{
  const {source:_,...companion}=recovery,text=JSON.stringify(companion);
  const existing=ids.get(text);
  if(existing!==undefined)return existing;
  const part=new Blob([assetBytesUtf8(text,maxRecordBytes)]),id=parts.length;
  records.push({bytes:part.size,sha256:await context.digest(part)});
  parts.push(part);ids.set(text,id);
  return id;
 };
 const slots={committed:await add(input.committed.recovery),attempt:input.attempt?await add(input.attempt.capture):null,
  pending:input.pending?await add(input.pending):null,live:await add(input.live)};
 return {pins:{records,slots},parts};
}

export function readDeliveryPins(input:unknown){
 const value=archiveFields(input,'records,slots'),rows=value['records'];
 if(!Array.isArray(rows)||rows.length<1||rows.length>4)throw fail('delivery');
 const digests=new Set<string>();
 const records=rows.map(row=>{
  const value=archiveFields(row,'bytes,sha256'),bytes=archiveInteger(value['bytes'],1,maxRecordBytes),sha256=value['sha256'];
  if(!participantDigest(sha256)||digests.has(sha256))throw fail('delivery');
  digests.add(sha256);
  return {bytes,sha256};
 });
 const raw=archiveFields(value['slots'],'attempt,committed,live,pending'),used=new Set<number>();
 const select=(value:unknown)=>{
  const id=archiveInteger(value,0,records.length-1);
  if(!used.has(id)&&id!==used.size)throw fail('delivery');
  used.add(id);return id;
 };
 const slots={committed:select(raw['committed']),attempt:raw['attempt']===null?null:select(raw['attempt']),
  pending:raw['pending']===null?null:select(raw['pending']),live:select(raw['live'])};
 if(used.size!==records.length)throw fail('delivery');
 return {pins:{records,slots},bytes:records.reduce((total,record)=>total+record.bytes,0)};
}

export async function readDeliveryRecords(file:Blob,offset:number,pins:DeliveryPins,pairs:ContinuedPairRecords,context:ArchiveIntegrityContext){
 const entries:Companion[]=[];
 const {records,slots}=pins;
 if((slots.attempt===null)!==(pairs.attempt===null)||(slots.pending===null)!==(pairs.pending===null))throw fail('delivery');
 for(const pin of records){
  const text=await readVerifiedArchiveText(file.slice(offset,offset+pin.bytes),pin,maxRecordBytes,context,()=>fail('delivery'));
  const entry=JSON.parse(text);
  archiveFields(entry,'format,formatVersion,relay,retainedBinding,retained');
  if(JSON.stringify(entry)!==text)throw fail('delivery');
  entries.push(entry);offset+=pin.bytes;
 }
 const committed=pairs.committed.recovery,identity=committed.identity;
 const initial=entries[slots.committed]!;
 const progress=archiveFields(initial.relay,'binding,document,review,reviewReceipt');
 archiveFields(progress['binding'],'document,review');
 const {document,review}=initial.relay.binding;
 if(!review)throw fail('delivery');
 const bind={database:'portable-continued-delivery',...identity,review:{...identity.review,access:'read_only' as const},
  readOnly:true,binding:{document,review},retained:initial.retainedBinding,restoreDocument(){throw fail('delivery');}};
 const admit=async (source:SharedContinuedPairRecovery,index:number)=>{
  context.guard();
  const recovered={...entries[index]!,source},companion=new ContinuedDeliveryCompanion(bind,recovered);
  const canonical=companion.recovery(source);
  const {source:_,...rest}=canonical;
  if(JSON.stringify(rest)!==JSON.stringify(entries[index]))throw fail('delivery');
  const cut=await makeContinuedPairCut(source.documentCheckpoint,source.reviewCheckpoint,source.identity,source.versions);
  const head=companion.wrap(cut,companion.capture()).head;
  context.guard();
  return {head,recovery:canonical};
 };
 const saved=await admit(committed,slots.committed);
 const attempted=pairs.attempt?await admit(pairs.attempt.capture,slots.attempt!):null;
 const data:ContinuedDeliveryRecords={
  format:'breditor/persistent-continued-delivery-record-read',formatVersion:1,
  scope:'atomic-continued-delivery-committed-attempt-pending-live',
  committed:saved,
  attempt:attempted?{capture:attempted.recovery,preparedHead:pairs.attempt!.cut?attempted.head:null}:null,
  pending:pairs.pending?(await admit(pairs.pending,slots.pending!)).recovery:null,
  live:(await admit(pairs.live,slots.live)).recovery,
 };
 return freezeGeneration(data);
}
