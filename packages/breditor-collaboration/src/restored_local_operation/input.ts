/** Detached genuine incoming provenance. An actual journal must own its own
 * admission, not borrow a caller's mutable facade or reset input to original. */
import type {SharedSelectionPolicy} from '../types.js';
import type {IndependentHistoryCut} from '../independent_history/contract.js';
import {makeIndependentHistoryCut} from '../independent_history/cut.js';
import {IndependentLocalOperationBackup,portableLocalOperationArchive as archive} from '../independent_local_operation/portable_backup.js';
import {localPortableCutRecovery} from '../independent_local_operation/portable_cut.js';
import {copyOperationCut,sameOperationCut} from '../independent_operation/cut_codec.js';
import {assetBytesDigest} from '../asset_bytes/format.js';
import {segmentedDigest} from '../persistence/segmented_checkpoint.js';
import {freezeGeneration} from '../generation_source/identity.js';
import {snapshotRestoredLocalPolicy,type RestoredLocalInputOptions} from './policy.js';
import {wrapRestoredLocalHead,type RestoredLocalIdentity} from './head.js';
import {restoredLocalFailure as fail} from './failure.js';
const key=Object.freeze({});
interface State{readonly policy:ReturnType<typeof snapshotRestoredLocalPolicy>;readonly owner:IndependentLocalOperationBackup;readonly file:Blob;readonly fileSha256:string;readonly identity:RestoredLocalIdentity;readonly original:ReturnType<typeof archive.originalRecovery>;readonly live:ReturnType<typeof archive.live>;readonly targets:readonly IndependentHistoryCut[]}
const states=new WeakMap<DetachedRestoredLocalInput,State>(),state=(owner:DetachedRestoredLocalInput)=>{const value=states.get(owner);if(!value||archive.file.call(value.owner)!==value.file)throw fail('restored_local_operation_input_closed');return value;};
export class DetachedRestoredLocalInput{
 private constructor(token:object,value:State){if(token!==key)throw fail();states.set(this,value);Object.freeze(this);}
 static async read<P extends SharedSelectionPolicy>(file:Blob,options:RestoredLocalInputOptions<P>):Promise<DetachedRestoredLocalInput>{
  if(this!==DetachedRestoredLocalInput)throw fail();const policy=snapshotRestoredLocalPolicy(options),guard=policy.guard;guard();let owner:IndependentLocalOperationBackup|undefined,complete=false;
  try{owner=await archive.read.call(IndependentLocalOperationBackup,file,policy.expected,{session:policy.read.options.session,checkAuthority:guard,limits:policy.read.options.limits,...(policy.read.options.signal?{signal:policy.read.options.signal}:{})});guard();const bytes=archive.file.call(owner),fileSha256=await assetBytesDigest(new Uint8Array(await bytes.arrayBuffer()));guard();const plan=JSON.stringify({format:'breditor/shared-restored-local-operation-plan',formatVersion:1,input:{kind:policy.kind,selection:policy.expected,fileSha256},journal:policy.database,source:policy.sourceDatabase,...(policy.cohort?{cohort:policy.cohort}:{})});if(new TextEncoder().encode(plan).length>128*1024)throw fail();const identity=Object.freeze({plan,operation:await segmentedDigest('breditor/restored-local-operation/1\0'+plan),origin:policy.expected.original.sha256,database:policy.database,sourceDatabase:policy.sourceDatabase});guard();
   const original=freezeGeneration(archive.originalRecovery(owner)),live=freezeGeneration(archive.live.call(owner)),metadata=archive.metadata.call(owner),recoveries=[original];for(const cut of[archive.current.call(owner),archive.pending.call(owner)])if(cut)recoveries.push(await localPortableCutRecovery(metadata.operation,cut));recoveries.push(live);guard();const targets:IndependentHistoryCut[]=[];
   for(const recovery of recoveries){const native=await makeIndependentHistoryCut(recovery.documentCheckpoint,recovery.reviewCheckpoint,recovery.identity,recovery.versions);guard();const target={head:wrapRestoredLocalHead(native.head,identity),files:native.files};if(!targets.length||!sameOperationCut(target,targets[targets.length-1]!))targets.push(target);}guard();
   const result=new DetachedRestoredLocalInput(key,{policy,owner,file:bytes,fileSha256,identity,original,live,targets:Object.freeze(targets.map(cut=>Object.freeze(copyOperationCut(cut))))});complete=true;return result;
  }finally{if(owner&&!complete)archive.dispose.call(owner);}
 }
 checkReadable():void{state(this);}
 /** This format owns its literal-file digest rule. Sharing journal mechanics
  * must not teach another format to parse a snapshot-v1 operation plan. */
 async verifyFile(file:Blob,guard:()=>void):Promise<void>{
  const value=state(this);guard();if(!(file instanceof Blob)||file.size!==value.file.size||file.type!==value.file.type)throw fail('restored_local_operation_input_changed');
  const bytes=await file.arrayBuffer();guard();if(await assetBytesDigest(new Uint8Array(bytes))!==value.fileSha256)throw fail('restored_local_operation_input_changed');guard();state(this);
 }
 file():Blob{return state(this).file;}
 originalFile():Blob{return archive.originalFile.call(state(this).owner);}
 selection(){return structuredClone(state(this).policy.expected);}
 identity(){return structuredClone(state(this).identity);}
 original(){return structuredClone(state(this).original);}
 live(){return structuredClone(state(this).live);}
 targets():readonly IndependentHistoryCut[]{return state(this).targets.map(copyOperationCut);}
 uploadBackup():Blob{return archive.uploads.call(state(this).owner);}
 blob(asset:string,generation:string):Blob|undefined{return archive.blob.call(state(this).owner,asset,generation);}
 dispose():void{const value=states.get(this);if(!value)return;states.delete(this);archive.dispose.call(value.owner);}
}
const p=DetachedRestoredLocalInput.prototype;
/** Actual private state, not a structural ready object. Journal code separately
 * reserves storage names and transfers this freshly admitted input lifetime. */
export const restoredLocalInput=Object.freeze({owns:(owner:unknown):owner is DetachedRestoredLocalInput=>states.has(owner as DetachedRestoredLocalInput),read:DetachedRestoredLocalInput.read,check:p.checkReadable,verifyFile:p.verifyFile,file:p.file,originalFile:p.originalFile,selection:p.selection,identity:p.identity,original:p.original,live:p.live,targets:p.targets,uploads:p.uploadBackup,blob:p.blob,dispose:p.dispose});
