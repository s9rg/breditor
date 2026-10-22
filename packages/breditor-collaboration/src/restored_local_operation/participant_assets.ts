/** Genuine whole uploads restored from admitted
 * local input, with actual exclusion and immutable independent baseline data.
 * The parent separately verifies its durable cohort; this owner grants no activation. */
import {RichAssetStore,RichAssetStoreCustody,RichAssetArchive,checkRichAssetLimits,type RichAssetArchiveEntry,type AssetLimits} from '@breditor/experimental-rich-content';
import {restoredLocalInput as input,type DetachedRestoredLocalInput} from './input.js';
import {independentRecoveryName} from '../independent_recovery/policy.js';
import {independentRecoverySignal} from '../independent_recovery/signal.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {checkAssetBytesSignal} from '../asset_bytes/guards.js';
import {assetBytesDigest} from '../asset_bytes/format.js';
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {restoredLocalFailure as fail} from './failure.js';
import {restoredLocalAssetsOpening,type RestoredLocalParticipantOpening} from './participant_opening.js';
export interface RestoredLocalUploadsOptions{readonly database:string;readonly checkAuthority:()=>void;readonly signal?:AbortSignal;readonly limits?:Partial<AssetLimits>}
const key=Object.freeze({}),read=RichAssetArchive.read,entries=RichAssetArchive.prototype.entries,dispose=RichAssetArchive.prototype.dispose;
const restore=RichAssetStore.restoreBackupHeld,open=RichAssetStore.openRetained,capture=RichAssetStore.prototype.captureBackup,acquire=RichAssetStore.prototype.acquireRecoveryCustody,checkStore=RichAssetStore.prototype.checkOpen,closeStore=RichAssetStore.prototype.close;
const checkCustody=RichAssetStoreCustody.prototype.check,releaseCustody=RichAssetStoreCustody.prototype.release,closeCustody=RichAssetStoreCustody.prototype.close;
interface State{readonly store:RichAssetStore;readonly custody:RichAssetStoreCustody;readonly baseline:readonly RichAssetArchiveEntry[];readonly file:Blob;readonly digest:string;readonly inputIdentity:ReturnType<typeof input.identity>;readonly context:IDBFactory;readonly locks:LockManager;readonly limits:Readonly<AssetLimits>;closing?:Promise<void>}
let openForParent:(parent:RestoredLocalParticipantOpening,owner:DetachedRestoredLocalInput,provided:RestoredLocalUploadsOptions,resume:boolean)=>Promise<RestoredLocalParticipantUploads>;
const states=new WeakMap<RestoredLocalParticipantUploads,State>();
const state=(owner:RestoredLocalParticipantUploads)=>{const value=states.get(owner);if(!value)throw fail('restored_local_uploads_closed');if(globalThis.indexedDB!==value.context||globalThis.navigator?.locks!==value.locks)throw fail('restored_local_uploads_storage_changed');checkStore.call(value.store);checkCustody.call(value.custody);return value;};
export class RestoredLocalParticipantUploads{
 private constructor(token:object,value:State){if(token!==key)throw fail();states.set(this,value);Object.freeze(this);}
 static begin(owner:DetachedRestoredLocalInput,provided:RestoredLocalUploadsOptions){if(this!==RestoredLocalParticipantUploads)throw fail();return RestoredLocalParticipantUploads.#open(owner,provided,false);}
 static resume(owner:DetachedRestoredLocalInput,provided:RestoredLocalUploadsOptions){if(this!==RestoredLocalParticipantUploads)throw fail();return RestoredLocalParticipantUploads.#open(owner,provided,true);}
 static async #open(owner:DetachedRestoredLocalInput,provided:RestoredLocalUploadsOptions,resume:boolean,parent?:RestoredLocalParticipantOpening,delegated=false){
  if(!input.owns(owner)||!provided||typeof provided!=='object')throw fail();const selected={...provided};
  if(!Object.hasOwn(selected,'database')||!Object.hasOwn(selected,'checkAuthority'))throw fail();
  if(Object.keys(selected).some(k=>!['database','checkAuthority','signal','limits'].includes(k)))throw fail();
  const context=recoveryOpeningContext(),locks=navigator.locks,database=independentRecoveryName(selected.database),identity=input.identity.call(owner);
  if([identity.database,identity.sourceDatabase].includes(database))throw fail();
  const plan=JSON.parse(identity.plan),cohort=plan.cohort;if(cohort&&cohort.uploadsDatabase!==database)throw fail();
  if(!!cohort!==delegated)throw fail('restored_local_uploads_parent_required');
  if(selected.limits!==undefined&&(!selected.limits||typeof selected.limits!=='object'||Array.isArray(selected.limits)))throw fail();
  const limits=checkRichAssetLimits(selected.limits),signal=independentRecoverySignal(selected.signal),authority=participantAuthority(selected.checkAuthority),file=input.uploads.call(owner);
  const guard=()=>{if(globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw fail('restored_local_uploads_storage_changed');checkAssetBytesSignal(signal);authority();checkAssetBytesSignal(signal);if(globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw fail('restored_local_uploads_storage_changed');};
  let store:RichAssetStore|undefined,custody:RichAssetStoreCustody|undefined,archive:RichAssetArchive|undefined;
  const cleanup=async()=>{if(custody)await closeCustody.call(custody);if(store)closeStore.call(store);if(archive)dispose.call(archive);};
  const opening=delegated?restoredLocalAssetsOpening(parent!,context,[database],[identity.database,identity.sourceDatabase,cohort.parentDatabase,cohort.uploadsDatabase],cleanup):await RecoveryOpeningCustody.reserve(context,[database],cleanup,{policy:()=>fail(),busy:()=>fail('restored_local_uploads_busy'),storage:()=>fail('restored_local_uploads_cleanup')});
  try{guard();archive=await read.call(RichAssetArchive,file,{limits,...(signal===undefined?{}:{signal})});guard();const baseline=Object.freeze(entries.call(archive).map(row=>Object.freeze({...row}))),digest=await assetBytesDigest(new Uint8Array(await file.arrayBuffer()));guard();
   if(resume){store=await open.call(RichAssetStore,database,{limits});guard();custody=await acquire.call(store);}else{const actual=await restore.call(RichAssetStore,database,file,{limits,uploadState:'preserve',checkAuthority:guard,...(signal===undefined?{}:{signal})});store=actual.store;custody=actual.custody;}
   guard();const result=new RestoredLocalParticipantUploads(key,{store,custody,baseline,file,digest,inputIdentity:identity,context,locks,limits});await verify.call(result,guard,!resume);guard();dispose.call(archive);archive=undefined;guard();opening.complete();return result;
  }catch(error){await opening.rollback();throw error;}
 }
 check():void{state(this);}
 identity(){return structuredClone(state(this).inputIdentity);}
 file():Blob{return state(this).file;}
 async verify(provided:()=>void,initial=false):Promise<void>{
  const s=state(this),authority=participantAuthority(provided),guard=()=>{state(this);authority();state(this);};guard();const actual=await capture.call(s.store,()=>{guard();return undefined;});guard();
  if(initial){if(await assetBytesDigest(new Uint8Array(await actual.backup.arrayBuffer()))!==s.digest)throw fail('restored_local_uploads_diverged');guard();return;}
  const archive=await read.call(RichAssetArchive,actual.backup,{limits:s.limits});
  try{guard();const current=new Map(entries.call(archive).map(row=>[row.asset,row]));for(const before of s.baseline){const now=current.get(before.asset);if(!now||now.mime!==before.mime||now.bytes!==before.bytes||now.width!==before.width||now.height!==before.height||now.epoch<before.epoch||now.attempts<before.attempts||before.status==='uploaded'&&(now.status!=='uploaded'||now.storageRef!==before.storageRef))throw fail('restored_local_uploads_diverged');}guard();}finally{dispose.call(archive);}
 }
 release():RichAssetStore{const s=state(this);releaseCustody.call(s.custody);states.delete(this);return s.store;}
 close():Promise<void>{const s=states.get(this);if(!s)return Promise.resolve();if(s.closing)return s.closing;const work=Promise.resolve().then(async()=>{await closeCustody.call(s.custody);closeStore.call(s.store);states.delete(this);}).finally(()=>{delete s.closing;});s.closing=work;return work;}
 static{openForParent=(parent,owner,provided,resume)=>RestoredLocalParticipantUploads.#open(owner,provided,resume,parent,true);}
}
const p=RestoredLocalParticipantUploads.prototype,verify=p.verify;
export const restoredLocalUploads=Object.freeze({owns:(owner:unknown):owner is RestoredLocalParticipantUploads=>states.has(owner as RestoredLocalParticipantUploads),check:p.check,identity:p.identity,file:p.file,verify,release:p.release,close:p.close});
export const openRestoredLocalUploadsForParticipant=(parent:RestoredLocalParticipantOpening,owner:DetachedRestoredLocalInput,provided:RestoredLocalUploadsOptions,resume:boolean)=>openForParent(parent,owner,provided,resume);
