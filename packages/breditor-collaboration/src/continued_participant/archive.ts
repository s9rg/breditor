import {
 checkRichAssetLimits,defaultAssetLimits,inspectRichRaster,MAX_ASSET_BACKUP_BYTES,
 readRichAssetBackup,RichAssetArchive,RichAssetStore,RichAssetStoreCustody,
} from '@breditor/experimental-rich-content';
import {prepareArchiveIntegrity,type ArchiveIntegrityContext} from '../archive_integrity/context.js';
import {archiveBlob,archiveFields,archiveInteger,MAX_SHARED_ARCHIVE_DIGEST_BYTES} from '../archive_integrity/policy.js';
import {readVerifiedArchiveHeader} from '../archive_integrity/verified_header.js';
import {assetBytesUtf8} from '../asset_bytes/format.js';
import {checkRasterManifest} from '../asset_bytes/raster_manifest.js';
import {resolveSelectedAssetBytes} from '../asset_bytes/resolve.js';
import {replayContinuedPairAssetReferences,replayContinuedDeliveryAssetReferences,type SharedContinuedPairAssetReferences} from '../continued_pair/asset_references.js';
import {ContinuedPairRecordRead,type ContinuedPairRecords} from '../continued_pair/read_records.js';
import {withContinuedPairReplay} from '../continued_pair/replay.js';
import type {SharedAssetCapturePending} from '../asset_references_capture.js';
import type {ContinuedDeliveryRecords} from '../continued_delivery/contract.js';
import {withContinuedPairAssetRead,withContinuedDeliveryAssetRead} from '../continued_pair/session.js';
import {freezeGeneration} from '../generation_source/identity.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {
 ContinuedDeliveryParticipantSelection,ContinuedParticipantCaptureOptions,ContinuedParticipantMetadata,ContinuedParticipantReadOptions,ContinuedParticipantSelection,
} from './contract.js';
import {continuedDeliveryParticipantSelection,continuedParticipantIdentity,continuedParticipantSelection,participantDigest,participantFailure as fail} from './policy.js';
import {
 MAX_CONTINUED_RECORDS_BYTES,packContinuedRecords,readContinuedRecordBodies,readContinuedRecordPins,readContinuedStates,
 type RecordPin,type ContinuedStatePins,
} from './records.js';

import {deliveryPairRecords,packDeliveryRecords,readDeliveryPins,readDeliveryRecords,type DeliveryPins} from './delivery_records.js';

const format='breditor/shared-continued-participant-backup';
const mime='application/vnd.breditor.continued-participant-backup';
const magic='BREDITOR-CONTINUED-PARTICIPANT1\n',prefix=new TextEncoder().encode(magic);
export const MAX_CONTINUED_DELIVERY_PARTICIPANT_BYTES=MAX_SHARED_ARCHIVE_DIGEST_BYTES;
const headerMaximum=48*1024*1024;
export const MAX_CONTINUED_PARTICIPANT_BYTES=
 prefix.length+4+headerMaximum+MAX_CONTINUED_RECORDS_BYTES+defaultAssetLimits.maxStoredBytes+MAX_ASSET_BACKUP_BYTES;
const deliveryMagic='BREDITOR-CONTINUED-PARTICIPANT2\n',deliveryPrefix=new TextEncoder().encode(deliveryMagic);
const framing={magic,maximumHeaderBytes:headerMaximum,invalid:()=>fail(),diverged:()=>fail(),budget:()=>fail('budget')};
const deliveryFraming={...framing,magic:deliveryMagic};
const construction=Symbol();
const {captureBackup,acquireRecoveryCustody}=RichAssetStore.prototype;
const {check:checkCustody,close:closeCustody}=RichAssetStoreCustody.prototype;
const {check:checkRecords,metadata:readRecords,verify:verifyRecords}=ContinuedPairRecordRead.prototype;
const {backup:readUploadFile,blob:readUploadBlob,dispose:disposeUploads}=RichAssetArchive.prototype;

interface Header {
 format:typeof format;
 formatVersion:1|2;
 metadata:ContinuedParticipantMetadata;
 pins:readonly RecordPin[];
 states:ContinuedStatePins;
 uploads:RecordPin;
 delivery?:DeliveryPins;
}
interface Contents<Records,Selection> {
 file:Blob;
 selection:Selection;
 metadata:ContinuedParticipantMetadata;
 records:Records;
 references:SharedContinuedPairAssetReferences;
 payloads:ReadonlyMap<string,Blob>;
 uploads:RichAssetArchive;
}

function header(metadata:ContinuedParticipantMetadata,pins:readonly RecordPin[],states:ContinuedStatePins,uploads:RecordPin,delivery?:DeliveryPins):Header{
 return {format,formatVersion:delivery?2:1,metadata,pins,states,uploads,...(delivery?{delivery}:{})};
}
function frame(value:Header):Blob{
 const encoded=assetBytesUtf8(JSON.stringify(value),headerMaximum);
 const marker=value.formatVersion===2?deliveryPrefix:prefix;
 const lead=new Uint8Array(marker.length+4);
 lead.set(marker);
 new DataView(lead.buffer).setUint32(marker.length,encoded.byteLength,true);
 return new Blob([lead,encoded]);
}

function checkCoverage(metadata:ContinuedParticipantMetadata,references:SharedContinuedPairAssetReferences):void{
 if(metadata.bindings.length!==references.references.length||metadata.bindings.some((binding,index)=>{
  const reference=references.references[index]!;
  return binding.asset!==reference.asset||binding.generation!==reference.generation;
 }))throw fail('coverage');
}

async function decode(
 input:Blob,selection:ContinuedParticipantSelection,
 limits:ReturnType<typeof checkRichAssetLimits>,context:ArchiveIntegrityContext,signal?:AbortSignal,delivery=false,
){
 const file=archiveBlob(input,delivery?MAX_SHARED_ARCHIVE_DIGEST_BYTES:MAX_CONTINUED_PARTICIPANT_BYTES);
 const {text,offset}=await readVerifiedArchiveHeader(file,selection.sha256,context,delivery?deliveryFraming:framing);
 const raw=archiveFields(JSON.parse(text),delivery?'format,formatVersion,metadata,pins,states,uploads,delivery':'format,formatVersion,metadata,pins,states,uploads');
 if(raw['format']!==format||raw['formatVersion']!==(delivery?2:1))throw fail();
 const value=archiveFields(raw['metadata'],'identity,bindings,assets,assetBytes');
 const identity=continuedParticipantIdentity(value['identity']);
 if(JSON.stringify(identity)!==JSON.stringify(selection.identity))throw fail('policy');
 const assetBytes=archiveInteger(value['assetBytes'],0,limits.maxStoredBytes);
 const metadata=freezeGeneration({identity,...checkRasterManifest(value['bindings'],value['assets'],assetBytes,limits),assetBytes});
 const {pins,bytes}=readContinuedRecordPins(raw['pins']),states=readContinuedStates(raw['states'],pins,identity.source);
 const companions=delivery?readDeliveryPins(raw['delivery']):undefined;
 const upload=archiveFields(raw['uploads'],'bytes,sha256'),length=archiveInteger(upload['bytes'],1,MAX_ASSET_BACKUP_BYTES);
 if(!participantDigest(upload['sha256'])||offset+bytes+(companions?.bytes??0)+assetBytes+length!==file.size||
    JSON.stringify(header(metadata,pins,states,{bytes:length,sha256:upload['sha256']},companions?.pins))!==text)throw fail();
 const records=await readContinuedRecordBodies(file,offset,pins,states,identity.source,context);
 const deliveryRecords=companions?await readDeliveryRecords(file,offset+bytes,companions.pins,records,context):undefined;
 let cursor=offset+bytes+(companions?.bytes??0);
 const payloads=new Map<string,Blob>();
 for(const asset of metadata.assets){
  context.guard();
  const raster=await inspectRichRaster(file.slice(cursor,cursor+asset.bytes,asset.mime),{limits,...(signal?{signal}:{})});
  if(raster.asset!==asset.contentAsset||raster.bytes!==asset.bytes||raster.mime!==asset.mime||
     raster.width!==asset.width||raster.height!==asset.height)throw fail();
  payloads.set(asset.contentAsset,raster.blob);
  cursor+=asset.bytes;
 }
 const uploads=file.slice(cursor);
 if(await context.digest(uploads)!==upload['sha256'])throw fail();
 context.guard();
 return {file,selection,metadata,records,deliveryRecords,payloads,uploads};
}

/** A portable local participant cut with all interrupted-save states and upload records. */
export type ContinuedDeliveryParticipantBackup=SharedContinuedParticipantBackup<ContinuedDeliveryRecords,ContinuedDeliveryParticipantSelection>;

export class SharedContinuedParticipantBackup<Records=ContinuedPairRecords,Selection=ContinuedParticipantSelection> {
 #contents:Contents<Records,Selection>|undefined;
 private constructor(token:symbol,contents:Contents<Records,Selection>){
  if(token!==construction)throw fail('policy');
  this.#contents=contents;
  Object.freeze(this);
 }
 #live():Contents<Records,Selection>{if(!this.#contents)throw fail('closed');return this.#contents;}
 file():Blob{return this.#live().file;}
 selection():Selection{return this.#live().selection;}
 metadata():ContinuedParticipantMetadata{return this.#live().metadata;}
 records():Records{return this.#live().records;}
 assetReferences():SharedContinuedPairAssetReferences{return this.#live().references;}
 uploadBackup():Blob{return readUploadFile.call(this.#live().uploads);}
 blob(asset:string,generation:string):Blob|undefined{
  const {metadata,payloads}=this.#live();
  const row=metadata.bindings.find(row=>row.asset===asset&&row.generation===generation);
  return row?payloads.get(row.contentAsset):undefined;
 }
 dispose():void{
  const current=this.#contents;
  this.#contents=undefined;
  if(current)disposeUploads.call(current.uploads);
 }

 static async capture<P extends SharedSelectionPolicy>(input:ContinuedParticipantCaptureOptions<P>){
  const result=await this.#capture<P,ContinuedPairRecords,ContinuedParticipantSelection>(
   input,withContinuedPairAssetRead,records=>records,undefined,continuedParticipantSelection);
  if(result.kind==='source-pending')throw fail('coverage');
  return result;
 }

 static captureDelivery<P extends SharedSelectionPolicy>(input:ContinuedParticipantCaptureOptions<P>){
  return this.#capture<P,ContinuedDeliveryRecords,ContinuedDeliveryParticipantSelection>(input,(session,check,signal,use)=>withContinuedDeliveryAssetRead(session,check,signal,
   (read,{references,missing})=>use(read,references,missing)),
   deliveryPairRecords,packDeliveryRecords,deliverySelection);
 }

 static async #capture<P extends SharedSelectionPolicy,R,S>(
  input:ContinuedParticipantCaptureOptions<P>,
  hold:<T>(session:ContinuedParticipantCaptureOptions<P>['session'],check:()=>void,signal:AbortSignal,
   use:(read:ContinuedPairRecordRead<R>,references:SharedContinuedPairAssetReferences,
    pending?:readonly SharedAssetCapturePending[])=>Promise<T>)=>Promise<T>,
  pairs:(records:R)=>Parameters<typeof packContinuedRecords>[0],
  companions:((records:R,context:ArchiveIntegrityContext)=>ReturnType<typeof packDeliveryRecords>)|undefined,
  select:(selection:ContinuedParticipantSelection)=>S,
 ):Promise<Readonly<{kind:'ready';backup:SharedContinuedParticipantBackup<R,S>}>|
   Readonly<{kind:'pending';pending:Awaited<ReturnType<typeof resolveSelectedAssetBytes>>['missing']}>|
   Readonly<{kind:'source-pending';pending:readonly SharedAssetCapturePending[]}>>{
  const {participant,principal,session,uploads,resolveAsset,limits:provided,signal,checkAuthority,wasm}=input;
  const limits=checkRichAssetLimits(provided),abort=signal??new AbortController().signal;
  const context=prepareArchiveIntegrity({wasm,checkAuthority,signal:abort});
  const custody=await acquireRecoveryCustody.call(uploads);
  let completed:SharedContinuedParticipantBackup<R,S>|undefined;
  try{
   const check=()=>{context.guard();checkCustody.call(custody);};
   return await hold(session,check,abort,async(read,references,pending)=>{
    if(pending?.length){
     await verifyRecords.call(read);
     return {kind:'source-pending' as const,pending};
    }
    const verify=()=>checkRecords.call(read);
    const integrity=prepareArchiveIntegrity({wasm,checkAuthority:verify,signal:abort});
    const identity=continuedParticipantIdentity({participant,principal,source:references.identity,assets:'whole-store'});
    const records=readRecords.call(read) as R;
    const cut=await captureBackup.call(uploads,()=>{verify();return undefined;},{signal:abort});
    const uploadArchive=await readRichAssetBackup(cut.backup,{limits,signal:abort});
    let waits:NativeReconstructionWaits|undefined;
    let transfer=false;
    try{
     const active=new NativeReconstructionWaits(verify,[abort]);
     waits=active;
     const resolved=await resolveSelectedAssetBytes(references.references,async(reference,requestedSignal)=>{
      const blob=readUploadBlob.call(uploadArchive,reference.asset);
      if(blob)return {...reference,identity:'content-addressed',blob,check:verify};
      return resolveAsset?await active.call(()=>resolveAsset(reference,requestedSignal)):undefined;
     },limits,verify,abort);
     if(resolved.missing.length){
      await verifyRecords.call(read);
      return {kind:'pending' as const,pending:resolved.missing};
     }
     const {bindings,assets,assetBytes}=resolved;
     const metadata=freezeGeneration({identity,bindings,assets,assetBytes});
     checkCoverage(metadata,references);
     const {parts,pins,states}=await packContinuedRecords(pairs(records),integrity);
     const extra=companions?await companions(records,integrity):undefined;
     const uploadPin={bytes:cut.backup.size,sha256:await integrity.digest(cut.backup)};
     const file=new Blob([frame(header(metadata,pins,states,uploadPin,extra?.pins)),...parts,...(extra?.parts??[]),
      ...assets.map(asset=>resolved.payloads.get(asset.contentAsset)!),cut.backup],{type:mime});
     if(file.size>(extra?MAX_SHARED_ARCHIVE_DIGEST_BYTES:MAX_CONTINUED_PARTICIPANT_BYTES))throw fail('budget');
     const selection=select({identity,sha256:await integrity.digest(file)});
     await verifyRecords.call(read);
     resolved.check();
     verify();
     const backup=completed=new SharedContinuedParticipantBackup(construction,{
      file,selection,metadata,records,references,payloads:resolved.payloads,uploads:uploadArchive,
     });
     transfer=true;
     return {kind:'ready' as const,backup};
    }finally{
     try{waits?.close();}finally{if(!transfer)disposeUploads.call(uploadArchive);}
    }
   });
  }finally{
   try{await closeCustody.call(custody);}
   catch(error){if(completed)disposeParticipant.call(completed);throw error;}
  }
 }

 static async readDelivery<P extends SharedSelectionPolicy>(
  file:Blob,expected:ContinuedDeliveryParticipantSelection,options:ContinuedParticipantReadOptions<P>,
 ):Promise<SharedContinuedParticipantBackup<ContinuedDeliveryRecords,ContinuedDeliveryParticipantSelection>>{
  const selection=continuedDeliveryParticipantSelection(expected);
  const {wasm,checkAuthority,signal,limits:provided,restoreDocument}=options;
  if(typeof restoreDocument!=='function')throw fail('policy');
  const context=prepareArchiveIntegrity({wasm,checkAuthority,...(signal?{signal}:{})});
  const limits=checkRichAssetLimits(provided),decoded=await decode(file,selection,limits,context,signal,true);
  const records=decoded.deliveryRecords;
  if(!records)throw fail('delivery');
  const {references,missing}=await withContinuedPairReplay(selection.identity.source,restoreDocument,context.guard,signal,
   replay=>replayContinuedDeliveryAssetReferences(records,replay,context.guard));
  if(missing.length)throw fail('coverage');
  checkCoverage(decoded.metadata,references);
  const uploads=await readRichAssetBackup(decoded.uploads,{limits,...(signal?{signal}:{})});
  try{
   context.guard();
   return new SharedContinuedParticipantBackup(construction,{...decoded,selection,records,references,uploads});
  }catch(error){disposeUploads.call(uploads);throw error;}
 }

 static async read<P extends SharedSelectionPolicy>(
  file:Blob,expected:ContinuedParticipantSelection,options:ContinuedParticipantReadOptions<P>,
 ):Promise<SharedContinuedParticipantBackup>{
  const selection=continuedParticipantSelection(expected);
  const {wasm,checkAuthority,signal,limits:provided,restoreDocument}=options;
  if(typeof restoreDocument!=='function')throw fail('policy');
  const context=prepareArchiveIntegrity({wasm,checkAuthority,...(signal?{signal}:{})});
  const limits=checkRichAssetLimits(provided),decoded=await decode(file,selection,limits,context,signal);
  const references=await withContinuedPairReplay(selection.identity.source,restoreDocument,context.guard,signal,
   replay=>replayContinuedPairAssetReferences(decoded.records,replay,context.guard));
  checkCoverage(decoded.metadata,references);
  const uploads=await readRichAssetBackup(decoded.uploads,{limits,...(signal?{signal}:{})});
  try{
   context.guard();
   return new SharedContinuedParticipantBackup(construction,{...decoded,references,uploads});
  }catch(error){disposeUploads.call(uploads);throw error;}
 }
}

const disposeParticipant=SharedContinuedParticipantBackup.prototype.dispose;

const deliverySelection=(selection:ContinuedParticipantSelection):ContinuedDeliveryParticipantSelection=>
 freezeGeneration({...continuedParticipantSelection(selection),formatVersion:2 as const});
