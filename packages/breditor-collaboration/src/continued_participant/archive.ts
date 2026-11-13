import {
 checkRichAssetLimits,defaultAssetLimits,inspectRichRaster,MAX_ASSET_BACKUP_BYTES,
 readRichAssetBackup,RichAssetArchive,RichAssetStore,RichAssetStoreCustody,
} from '@breditor/experimental-rich-content';
import {prepareArchiveIntegrity,type ArchiveIntegrityContext} from '../archive_integrity/context.js';
import {archiveBlob,archiveFields,archiveInteger} from '../archive_integrity/policy.js';
import {readVerifiedArchiveHeader} from '../archive_integrity/verified_header.js';
import {assetBytesUtf8} from '../asset_bytes/format.js';
import {checkRasterManifest} from '../asset_bytes/raster_manifest.js';
import {resolveSelectedAssetBytes} from '../asset_bytes/resolve.js';
import {replayContinuedPairAssetReferences,type SharedContinuedPairAssetReferences} from '../continued_pair/asset_references.js';
import {ContinuedPairRecordRead,type ContinuedPairRecords} from '../continued_pair/read_records.js';
import {withContinuedPairReplay} from '../continued_pair/replay.js';
import {withContinuedPairAssetRead} from '../continued_pair/session.js';
import {freezeGeneration} from '../generation_source/identity.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {
 ContinuedParticipantCaptureOptions,ContinuedParticipantMetadata,ContinuedParticipantReadOptions,ContinuedParticipantSelection,
} from './contract.js';
import {continuedParticipantIdentity,continuedParticipantSelection,participantDigest,participantFailure as fail} from './policy.js';
import {
 MAX_CONTINUED_RECORDS_BYTES,packContinuedRecords,readContinuedRecordBodies,readContinuedRecordPins,readContinuedStates,
 type RecordPin,type ContinuedStatePins,
} from './records.js';

const format='breditor/shared-continued-participant-backup';
const mime='application/vnd.breditor.continued-participant-backup';
const magic='BREDITOR-CONTINUED-PARTICIPANT1\n',prefix=new TextEncoder().encode(magic);
const headerMaximum=48*1024*1024;
export const MAX_CONTINUED_PARTICIPANT_BYTES=
 prefix.length+4+headerMaximum+MAX_CONTINUED_RECORDS_BYTES+defaultAssetLimits.maxStoredBytes+MAX_ASSET_BACKUP_BYTES;
const framing={magic,maximumHeaderBytes:headerMaximum,invalid:()=>fail(),diverged:()=>fail(),budget:()=>fail('budget')};
const construction=Symbol();
const {captureBackup,acquireRecoveryCustody}=RichAssetStore.prototype;
const {check:checkCustody,close:closeCustody}=RichAssetStoreCustody.prototype;
const {check:checkRecords,metadata:readRecords,verify:verifyRecords}=ContinuedPairRecordRead.prototype;
const {backup:readUploadFile,blob:readUploadBlob,dispose:disposeUploads}=RichAssetArchive.prototype;

interface Header {
 format:typeof format;
 formatVersion:1;
 metadata:ContinuedParticipantMetadata;
 pins:readonly RecordPin[];
 states:ContinuedStatePins;
 uploads:RecordPin;
}
interface Contents {
 file:Blob;
 selection:ContinuedParticipantSelection;
 metadata:ContinuedParticipantMetadata;
 records:ContinuedPairRecords;
 references:SharedContinuedPairAssetReferences;
 payloads:ReadonlyMap<string,Blob>;
 uploads:RichAssetArchive;
}

function header(metadata:ContinuedParticipantMetadata,pins:readonly RecordPin[],states:ContinuedStatePins,uploads:RecordPin):Header{
 return {format,formatVersion:1,metadata,pins,states,uploads};
}
function frame(value:Header):Blob{
 const encoded=assetBytesUtf8(JSON.stringify(value),headerMaximum);
 const lead=new Uint8Array(prefix.length+4);
 lead.set(prefix);
 new DataView(lead.buffer).setUint32(prefix.length,encoded.byteLength,true);
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
 limits:ReturnType<typeof checkRichAssetLimits>,context:ArchiveIntegrityContext,signal?:AbortSignal,
){
 const file=archiveBlob(input,MAX_CONTINUED_PARTICIPANT_BYTES);
 const {text,offset}=await readVerifiedArchiveHeader(file,selection.sha256,context,framing);
 const raw=archiveFields(JSON.parse(text),'format,formatVersion,metadata,pins,states,uploads');
 if(raw['format']!==format||raw['formatVersion']!==1)throw fail();
 const value=archiveFields(raw['metadata'],'identity,bindings,assets,assetBytes');
 const identity=continuedParticipantIdentity(value['identity']);
 if(JSON.stringify(identity)!==JSON.stringify(selection.identity))throw fail('policy');
 const assetBytes=archiveInteger(value['assetBytes'],0,limits.maxStoredBytes);
 const metadata=freezeGeneration({identity,...checkRasterManifest(value['bindings'],value['assets'],assetBytes,limits),assetBytes});
 const {pins,bytes}=readContinuedRecordPins(raw['pins']),states=readContinuedStates(raw['states'],pins,identity.source);
 const upload=archiveFields(raw['uploads'],'bytes,sha256'),length=archiveInteger(upload['bytes'],1,MAX_ASSET_BACKUP_BYTES);
 if(!participantDigest(upload['sha256'])||offset+bytes+assetBytes+length!==file.size||
    JSON.stringify(header(metadata,pins,states,{bytes:length,sha256:upload['sha256']}))!==text)throw fail();
 const records=await readContinuedRecordBodies(file,offset,pins,states,identity.source,context);
 let cursor=offset+bytes;
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
 return {file,selection,metadata,records,payloads,uploads};
}

/** A portable local participant cut with all interrupted-save states and upload records. */
export class SharedContinuedParticipantBackup {
 #contents:Contents|undefined;
 private constructor(token:symbol,contents:Contents){
  if(token!==construction)throw fail('policy');
  this.#contents=contents;
  Object.freeze(this);
 }
 #live():Contents{if(!this.#contents)throw fail('closed');return this.#contents;}
 file():Blob{return this.#live().file;}
 selection():ContinuedParticipantSelection{return this.#live().selection;}
 metadata():ContinuedParticipantMetadata{return this.#live().metadata;}
 records():ContinuedPairRecords{return this.#live().records;}
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
  const {participant,principal,session,uploads,resolveAsset,limits:provided,signal,checkAuthority,wasm}=input;
  const limits=checkRichAssetLimits(provided),abort=signal??new AbortController().signal;
  const context=prepareArchiveIntegrity({wasm,checkAuthority,signal:abort});
  const custody=await acquireRecoveryCustody.call(uploads);
  let completed:SharedContinuedParticipantBackup|undefined;
  try{
   const check=()=>{context.guard();checkCustody.call(custody);};
   return await withContinuedPairAssetRead(session,check,abort,async(read,references)=>{
    const verify=()=>checkRecords.call(read);
    const integrity=prepareArchiveIntegrity({wasm,checkAuthority:verify,signal:abort});
    const identity=continuedParticipantIdentity({participant,principal,source:references.identity,assets:'whole-store'});
    const records=readRecords.call(read);
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
     const {parts,pins,states}=await packContinuedRecords(records,integrity);
     const uploadPin={bytes:cut.backup.size,sha256:await integrity.digest(cut.backup)};
     const file=new Blob([frame(header(metadata,pins,states,uploadPin)),...parts,
      ...assets.map(asset=>resolved.payloads.get(asset.contentAsset)!),cut.backup],{type:mime});
     if(file.size>MAX_CONTINUED_PARTICIPANT_BYTES)throw fail('budget');
     const selection=continuedParticipantSelection({identity,sha256:await integrity.digest(file)});
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
