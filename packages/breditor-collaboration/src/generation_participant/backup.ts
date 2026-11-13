/** Complete participant capture/read. Recovery factories and operational activation remain explicit. */
import {RichAssetStore,readRichAssetBackup,type RichAssetArchive} from "@breditor/experimental-rich-content";
import {captureSharedGenerationSource,type SharedGenerationSourceCapture} from "../generation_source/capture.js";
import {captureSharedGenerationAssets,exportSharedGenerationAssetBackup,type SharedGenerationAssetCapture} from "../generation_assets/capture.js";
import {readSharedGenerationAssetBackup,SharedGenerationAssetArchive} from "../generation_assets/read.js";
import {checkAssetBytesSignal} from "../asset_bytes/guards.js";
import {participantAuthority} from "../participant_backup/policy.js";
import type {SharedAssetBytesPending} from "../asset_bytes/types.js";
import type {SharedSelectionPolicy} from "../types.js";
import {generationParticipantIdentity,generationParticipantSelection,generationParticipantFailure} from "./policy.js";
import {encodeGenerationParticipant,generationParticipantDigest,generationParticipantBody,readGenerationParticipantHeader,GENERATION_PARTICIPANT_MAGIC,GENERATION_PARTICIPANT_PREFIX_BYTES,GENERATION_PARTICIPANT_MIME,generationParticipantLimit,MAX_GENERATION_PARTICIPANT_HEADER_BYTES,type GenerationParticipantHeader} from "./codec.js";
import type {SharedGenerationParticipantCaptureOptions,SharedGenerationParticipantSelection,SharedGenerationParticipantOptions} from "./contract.js";
interface State{file:Blob;header:GenerationParticipantHeader;selection:SharedGenerationParticipantSelection;selected:SharedGenerationAssetArchive;uploads:RichAssetArchive}
const key=Object.freeze({}),states=new WeakMap<SharedGenerationParticipantBackup,State>(),captureStore=RichAssetStore.prototype.captureBackup,closed=()=>generationParticipantFailure("generation_participant_closed");
export class SharedGenerationParticipantBackup {
 readonly #selection:SharedGenerationParticipantSelection;
 private constructor(token:object,s:State){if(token!==key)throw closed();this.#selection=generationParticipantSelection(s.selection);states.set(this,s);Object.freeze(this);}
 selection():SharedGenerationParticipantSelection{return this.#selection;}
 file():Blob{const s=states.get(this);if(!s)throw closed();return s.file;}
 records(){const s=states.get(this);if(!s)throw closed();return s.selected.records();}
 sourceRecovery(){const s=states.get(this);if(!s)throw closed();return s.selected.recovery();}
 uploadBackup():Blob{const s=states.get(this);if(!s)throw closed();return s.uploads.backup();}
 uploadEntries(){const s=states.get(this);if(!s)throw closed();return s.uploads.entries();}
 uploadBlob(asset:string):Blob|undefined{const s=states.get(this);if(!s)throw closed();return s.uploads.blob(asset);}
 blob(asset:string,generation:string):Blob|undefined{const s=states.get(this);if(!s)throw closed();return s.selected.blob(asset,generation);}
 verifySource(source:SharedGenerationSourceCapture):void{const s=states.get(this);if(!s)throw closed();s.selected.verifySource(source);}
 async verifyRecovered(source:SharedGenerationSourceCapture,uploads:RichAssetStore,options:Pick<SharedGenerationParticipantOptions,"signal">={}):Promise<void>{
  const s=states.get(this);if(!s)throw closed();const check=()=>{checkAssetBytesSignal(options.signal);if(states.get(this)!==s)throw closed();s.selected.verifySource(source);};check();const cut=await captureStore.call(uploads,()=>{check();return undefined;},options);check();const sha=await generationParticipantDigest(cut.backup,options.signal);check();if(sha!==s.header.uploads.sha256)throw generationParticipantFailure("generation_participant_integrity");
 }
 dispose():void{const s=states.get(this);if(!s)return;states.delete(this);s.selected.dispose();s.uploads.dispose();}
 static async capture<P extends SharedSelectionPolicy>(input:SharedGenerationParticipantCaptureOptions<P>):Promise<{kind:"ready";backup:SharedGenerationParticipantBackup}|{kind:"pending";pending:readonly SharedAssetBytesPending[]}>{
  const {source:provided,participant,principal,assets,checkAuthority,resolveAsset,signal,limits}={...input},source={...provided},authority=participantAuthority(checkAuthority),check=()=>{checkAssetBytesSignal(signal);authority();},options={...(signal?{signal}:{}),...(limits?{limits}:{})};let native:SharedGenerationSourceCapture|undefined,bytes:SharedGenerationAssetCapture|undefined,uploads:RichAssetArchive|undefined,selected:SharedGenerationAssetArchive|undefined,complete=false;
  try{
   check();const cut=await captureStore.call(assets,()=>{check();native=captureSharedGenerationSource(source);check();return native;},signal?{signal}:{});check();native!.check();const identity=generationParticipantIdentity({participant,principal,source:native!.metadata().identity,assets:"whole-store"});
   const outcome=native!.metadata().outcome;if(outcome.kind==="pending")return {kind:"pending",pending:[{kind:"source",pending:outcome.pending}]};
   uploads=await readRichAssetBackup(cut.backup,options);check();native!.check();const local=uploads,result=await captureSharedGenerationAssets({source:native!,...options,resolveAsset:async(reference,abort)=>{check();native!.check();const blob=local.blob(reference.asset);if(blob)return {asset:reference.asset,generation:reference.generation,identity:"content-addressed",blob,check(){check();local.backup();}};return resolveAsset?await resolveAsset(reference,abort):undefined;}});check();native!.check();if(result.kind==="pending")return result;bytes=result.capture;
   const file=await exportSharedGenerationAssetBackup(bytes,signal?{signal}:{});check();native!.check();selected=await readSharedGenerationAssetBackup(file,options);check();native!.check();const encoded=await encodeGenerationParticipant(identity,file,cut.backup,signal);check();native!.check();const backup=new SharedGenerationParticipantBackup(key,{...encoded,selected,uploads});complete=true;return {kind:"ready",backup};
  }finally{bytes?.dispose();native?.dispose();if(!complete){selected?.dispose();uploads?.dispose();}}
 }
 static async read(input:Blob,supplied:SharedGenerationParticipantSelection,options:SharedGenerationParticipantOptions={}):Promise<SharedGenerationParticipantBackup>{
  const expected=generationParticipantSelection(supplied),{signal}=options,check=()=>checkAssetBytesSignal(signal);check();if(!(input instanceof Blob)||input.size<GENERATION_PARTICIPANT_PREFIX_BYTES||input.size>generationParticipantLimit(expected.identity))throw generationParticipantFailure("generation_participant_budget");const file=new Blob([input],{type:GENERATION_PARTICIPANT_MIME});if(await generationParticipantDigest(file,signal)!==expected.sha256)throw generationParticipantFailure("generation_participant_integrity");
  const prefix=new Uint8Array(await file.slice(0,GENERATION_PARTICIPANT_PREFIX_BYTES).arrayBuffer());check();if(GENERATION_PARTICIPANT_MAGIC.some((b,i)=>prefix[i]!==b))throw generationParticipantFailure("generation_participant_format");const length=new DataView(prefix.buffer).getUint32(GENERATION_PARTICIPANT_MAGIC.length),offset=GENERATION_PARTICIPANT_PREFIX_BYTES+length;if(length<1||length>MAX_GENERATION_PARTICIPANT_HEADER_BYTES||offset>file.size)throw generationParticipantFailure("generation_participant_budget");
  const encoded=new Uint8Array(await file.slice(GENERATION_PARTICIPANT_PREFIX_BYTES,offset).arrayBuffer());check();let raw:unknown;try{raw=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(encoded));}catch{throw generationParticipantFailure("generation_participant_format");}const header=readGenerationParticipantHeader(raw,expected,file.size-offset),body=generationParticipantBody(header.identity,header.selected,header.uploads);if(await generationParticipantDigest(new Blob([JSON.stringify(body)]),signal)!==header.sha256||new TextDecoder().decode(encoded)!==JSON.stringify(header))throw generationParticipantFailure("generation_participant_integrity");
  const selectedFile=file.slice(offset,offset+header.selected.bytes),uploadFile=file.slice(offset+header.uploads.offset);if(await generationParticipantDigest(selectedFile,signal)!==header.selected.sha256||await generationParticipantDigest(uploadFile,signal)!==header.uploads.sha256)throw generationParticipantFailure("generation_participant_integrity");let selected:SharedGenerationAssetArchive|undefined,uploads:RichAssetArchive|undefined,complete=false;
  try{selected=await readSharedGenerationAssetBackup(selectedFile,options);uploads=await readRichAssetBackup(uploadFile,options);check();if(JSON.stringify(selected.metadata().identity)!==JSON.stringify(header.identity.source))throw generationParticipantFailure("generation_participant_policy");const backup=new SharedGenerationParticipantBackup(key,{file,header,selection:expected,selected,uploads});complete=true;return backup;}finally{if(!complete){selected?.dispose();uploads?.dispose();}}
 }
}
export const captureSharedGenerationParticipant=<P extends SharedSelectionPolicy>(options:SharedGenerationParticipantCaptureOptions<P>)=>SharedGenerationParticipantBackup.capture(options);
export const readSharedGenerationParticipant=(file:Blob,expected:SharedGenerationParticipantSelection,options:SharedGenerationParticipantOptions={})=>SharedGenerationParticipantBackup.read(file,expected,options);
const selectedMetadata=SharedGenerationAssetArchive.prototype.metadata;
/** Use the admitted archive's exact content-address and generation bindings. */
export function generationParticipantAssetMetadata(backup:SharedGenerationParticipantBackup){
 const state=states.get(backup);
 if(!state)throw closed();
 return selectedMetadata.call(state.selected);
}
