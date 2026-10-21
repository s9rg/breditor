/** Portable complete local participant: exact two-lane source, selected raster bytes and all uploads. */
import {RichAssetStore,readRichAssetBackup,checkRichAssetLimits,inspectRichRaster,type RichAssetArchive} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
import {SharedIndependentSourceCapture,independentSourceSnapshot} from '../independent_source/capture.js';
import {checkIndependentRecords} from '../independent_source/records.js';
import type {SharedIndependentSourceRecord} from '../independent_source/contract.js';
import {checkAssetBytesSignal,assetBytesKey} from '../asset_bytes/guards.js';
import {resolveSelectedAssetBytes} from '../asset_bytes/resolve.js';
import type {SharedAssetBytesOptions,SharedAssetBytesPending} from '../asset_bytes/types.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {freezeGeneration} from '../generation_source/identity.js';
import {independentParticipantIdentity,independentParticipantSelection,independentParticipantFailure as fail} from './policy.js';
import {encodeIndependentParticipant,independentParticipantDigest,readIndependentParticipantHeader,independentParticipantBody,INDEPENDENT_PARTICIPANT_MAGIC,INDEPENDENT_PARTICIPANT_MIME,INDEPENDENT_PARTICIPANT_PREFIX_BYTES,MAX_INDEPENDENT_PARTICIPANT_HEADER_BYTES,MAX_INDEPENDENT_PARTICIPANT_BYTES,type IndependentParticipantHeader} from './codec.js';
import type {SharedIndependentParticipantCaptureOptions,SharedIndependentParticipantSelection} from './contract.js';
interface State {file:Blob;header:IndependentParticipantHeader;selection:SharedIndependentParticipantSelection;records:readonly SharedIndependentSourceRecord[];recovery:SharedIndependentHistoryRecovery;payloads:ReadonlyMap<string,Blob>;uploads:RichAssetArchive}
const key=Object.freeze({}),states=new WeakMap<SharedIndependentParticipantBackup,State>(),captureStore=RichAssetStore.prototype.captureBackup,captureSource=SharedIndependentSourceCapture.capture,checkSource=SharedIndependentSourceCapture.prototype.check;
const state=(owner:SharedIndependentParticipantBackup)=>{const value=states.get(owner);if(!value)throw fail('independent_participant_closed');return value;};
export class SharedIndependentParticipantBackup {
 readonly #selection:SharedIndependentParticipantSelection;
 private constructor(token:object,value:State){if(token!==key)throw fail();this.#selection=value.selection;states.set(this,value);Object.freeze(this);}
 selection():SharedIndependentParticipantSelection{return this.#selection;}
 metadata(){return state(this).header.metadata;}
 file():Blob{return state(this).file;}
 records():readonly SharedIndependentSourceRecord[]{return state(this).records;}
 sourceRecovery():SharedIndependentHistoryRecovery{return structuredClone(state(this).recovery);}
 uploadBackup():Blob{return state(this).uploads.backup();}
 uploadEntries(){return state(this).uploads.entries();}
 uploadBlob(asset:string):Blob|undefined{return state(this).uploads.blob(asset);}
 blob(asset:string,generation:string):Blob|undefined{const s=state(this),id=assetBytesKey(asset,generation),binding=s.header.metadata.bindings.find(value=>assetBytesKey(value.asset,value.generation)===id);return binding?s.payloads.get(binding.contentAsset):undefined;}
 verifySource(source:SharedIndependentSourceCapture):void{
  const s=state(this),selected=independentSourceSnapshot(source),metadata=selected.metadata;
  if(metadata.document!==s.header.metadata.document||metadata.revision!==s.header.metadata.revision||JSON.stringify(metadata.identity)!==JSON.stringify(s.header.metadata.identity.source)||metadata.outcome.kind!=='ready'||JSON.stringify(metadata.outcome.references)!==JSON.stringify(s.header.metadata.bindings.map(({asset,generation})=>({asset,generation})))||selected.records.length!==s.records.length||selected.records.some((row,index)=>{const original=s.records[index]!;return row.kind!==original.kind||row.index!==original.index||row.json!==original.json;}))throw fail('independent_participant_source');selected.check();
 }
 async verifyRecovered(source:SharedIndependentSourceCapture,uploads:RichAssetStore,options:Pick<SharedAssetBytesOptions,'signal'>={}):Promise<void>{
  const s=state(this),check=()=>{checkAssetBytesSignal(options.signal);if(states.get(this)!==s)throw fail('independent_participant_closed');SharedIndependentParticipantBackup.prototype.verifySource.call(this,source);};check();const cut=await captureStore.call(uploads,()=>{check();return undefined;},options);check();const sha=await independentParticipantDigest(cut.backup,options.signal);check();if(sha!==s.header.uploads.sha256)throw fail('independent_participant_integrity');
 }
 dispose():void{const s=states.get(this);if(!s)return;states.delete(this);s.uploads.dispose();}
 static async capture<P extends SharedSelectionPolicy>(input:SharedIndependentParticipantCaptureOptions<P>):Promise<{kind:'ready';backup:SharedIndependentParticipantBackup}|{kind:'pending';pending:readonly SharedAssetBytesPending[]}>{
  const {participant,principal,source:provided,assets,checkAuthority,resolveAsset,signal,limits:supplied}={...input},source={...provided},authority=participantAuthority(checkAuthority),limits=checkRichAssetLimits(supplied),abort=signal??new AbortController().signal;
  let captured:SharedIndependentSourceCapture|undefined,uploads:RichAssetArchive|undefined;
  const check=()=>{checkAssetBytesSignal(abort);authority();if(captured)checkSource.call(captured);};
  try{
   check();const cut=await captureStore.call(assets,()=>{check();captured=captureSource(source);check();return undefined;},signal?{signal}:{});check();const snapshot=independentSourceSnapshot(captured!),identity=independentParticipantIdentity({participant,principal,source:snapshot.metadata.identity,assets:'whole-store'});
   if(snapshot.metadata.outcome.kind==='pending')return{kind:'pending',pending:freezeGeneration([{kind:'source' as const,pending:snapshot.metadata.outcome.pending}])};
   await checkIndependentRecords(snapshot.metadata.identity,snapshot.records);check();uploads=await readRichAssetBackup(cut.backup,{limits,...(signal?{signal}:{})});check();const local=uploads;
   const resolved=await resolveSelectedAssetBytes(snapshot.metadata.outcome.references,async(reference,requestedSignal)=>{check();const blob=local.blob(reference.asset);if(blob)return{asset:reference.asset,generation:reference.generation,identity:'content-addressed',blob,check(){check();local.backup();}};return resolveAsset?await resolveAsset(reference,requestedSignal):undefined;},limits,check,abort);check();
   if(resolved.missing.length)return{kind:'pending',pending:resolved.missing};
   const live=()=>{check();resolved.check();check();},sourceBytes=snapshot.records.reduce((n,row)=>n+new TextEncoder().encode(row.json).length,0),metadata=freezeGeneration({format:'breditor/shared-independent-participant-bytes' as const,formatVersion:1 as const,identity,document:snapshot.metadata.document,revision:snapshot.metadata.revision,bindings:resolved.bindings,assets:resolved.assets,sourceBytes,assetBytes:resolved.assetBytes});
   const file=await encodeIndependentParticipant(metadata,snapshot.records,resolved.payloads,cut.backup,live,signal);live();const sha256=await independentParticipantDigest(file,signal);live();const backup=await SharedIndependentParticipantBackup.read(file,{identity,sha256},{limits,...(signal?{signal}:{})});try{live();SharedIndependentParticipantBackup.prototype.verifySource.call(backup,captured!);live();return{kind:'ready',backup};}catch(error){backup.dispose();throw error;}
  }finally{captured?.dispose();uploads?.dispose();}
 }
 static async read(input:Blob,supplied:SharedIndependentParticipantSelection,options:SharedAssetBytesOptions={}):Promise<SharedIndependentParticipantBackup>{
  const expected=independentParticipantSelection(supplied),{signal,limits:provided}={...options},limits=checkRichAssetLimits(provided),check=()=>checkAssetBytesSignal(signal);check();
  if(!(input instanceof Blob)||input.size<INDEPENDENT_PARTICIPANT_PREFIX_BYTES||input.size>MAX_INDEPENDENT_PARTICIPANT_BYTES)throw fail('independent_participant_budget');const file=new Blob([input],{type:INDEPENDENT_PARTICIPANT_MIME});if(await independentParticipantDigest(file,signal)!==expected.sha256)throw fail('independent_participant_integrity');
  const prefix=new Uint8Array(await file.slice(0,INDEPENDENT_PARTICIPANT_PREFIX_BYTES).arrayBuffer());check();if(INDEPENDENT_PARTICIPANT_MAGIC.some((byte,index)=>prefix[index]!==byte))throw fail();const length=new DataView(prefix.buffer).getUint32(INDEPENDENT_PARTICIPANT_MAGIC.length),offset=INDEPENDENT_PARTICIPANT_PREFIX_BYTES+length;if(length<1||length>MAX_INDEPENDENT_PARTICIPANT_HEADER_BYTES||offset>file.size)throw fail('independent_participant_budget');
  const encoded=new Uint8Array(await file.slice(INDEPENDENT_PARTICIPANT_PREFIX_BYTES,offset).arrayBuffer());check();let raw:unknown;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(encoded));}catch{throw fail();}
  const header=readIndependentParticipantHeader(raw,file.size-offset,limits),body=independentParticipantBody(header.metadata,header.records,header.assets,header.uploads);if(JSON.stringify(header.metadata.identity)!==JSON.stringify(expected.identity)||await independentParticipantDigest(new Blob([JSON.stringify(body)]),signal)!==header.sha256||new TextDecoder().decode(encoded)!==JSON.stringify(header))throw fail('independent_participant_integrity');check();
  const records:SharedIndependentSourceRecord[]=[],payloads=new Map<string,Blob>();for(const row of header.records){const part=file.slice(offset+row.offset,offset+row.offset+row.bytes);if(await independentParticipantDigest(part,signal)!==row.sha256)throw fail('independent_participant_integrity');check();let json:string;try{json=new TextDecoder('utf-8',{fatal:true}).decode(await part.arrayBuffer());}catch{throw fail();}check();records.push(Object.freeze({kind:row.kind,index:row.index,json}));}
  const recovery=await checkIndependentRecords(header.metadata.identity.source,records);check();
  for(const asset of header.assets){const raster=await inspectRichRaster(file.slice(offset+asset.offset,offset+asset.offset+asset.bytes,asset.mime),{limits,...(signal?{signal}:{})});check();if(raster.asset!==asset.contentAsset||raster.bytes!==asset.bytes||raster.width!==asset.width||raster.height!==asset.height||raster.mime!==asset.mime)throw fail('independent_participant_integrity');payloads.set(asset.contentAsset,raster.blob);}
  const uploadFile=file.slice(offset+header.uploads.offset);if(await independentParticipantDigest(uploadFile,signal)!==header.uploads.sha256)throw fail('independent_participant_integrity');let uploads:RichAssetArchive|undefined;
  try{uploads=await readRichAssetBackup(uploadFile,{limits,...(signal?{signal}:{})});check();return new SharedIndependentParticipantBackup(key,{file,header,selection:expected,records:Object.freeze(records),recovery,payloads,uploads});}catch(error){uploads?.dispose();throw error;}
 }
}
export const captureSharedIndependentParticipant=<P extends SharedSelectionPolicy>(input:SharedIndependentParticipantCaptureOptions<P>)=>SharedIndependentParticipantBackup.capture(input);
export const readSharedIndependentParticipant=(file:Blob,expected:SharedIndependentParticipantSelection,options:SharedAssetBytesOptions={})=>SharedIndependentParticipantBackup.read(file,expected,options);
