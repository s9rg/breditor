/** Genuine whole-upload ownership shared by closed native-input families.
 * Input identity comes from its actual intrinsic owner, never a ready-shaped
 * object. Restore preserves every row and receipt and starts no upload job. */
import {RichAssetStore,RichAssetStoreCustody,RichAssetArchive,checkRichAssetLimits,type RichAssetArchiveEntry,type AssetLimits} from '@breditor/experimental-rich-content';
import {SharedEditorError} from '../core.js';
import {independentRecoveryName} from '../independent_recovery/policy.js';import {independentRecoverySignal} from '../independent_recovery/signal.js';
import {participantAuthority} from '../participant_backup/policy.js';import {checkAssetBytesSignal} from '../asset_bytes/guards.js';import {assetBytesDigest} from '../asset_bytes/format.js';
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {nativeInputJournalFamily,type NativeInputJournalFamily} from './journal_families.js';
import type {NativeInputJournalChoice,NativeInputCutIntent,NativeInputJournalIdentity} from './journal_contract.js';
import {nativeInputUploadsOpening} from './participant_opening.js';
export interface NativeInputUploadsOptions{readonly database:string;readonly checkAuthority:()=>void;readonly signal?:AbortSignal;readonly limits?:Partial<AssetLimits>}
interface State{readonly family:object;readonly fail:(suffix?:string)=>SharedEditorError;readonly identity:NativeInputJournalIdentity;readonly cohort:Readonly<{parentDatabase:string;uploadsDatabase:string}>|undefined;readonly store:RichAssetStore;readonly custody:RichAssetStoreCustody;readonly baseline:readonly RichAssetArchiveEntry[];readonly file:Blob;readonly digest:string;readonly context:IDBFactory;readonly locks:LockManager;readonly limits:Readonly<AssetLimits>;exposed:boolean;closing?:Promise<void>}
const key=Object.freeze({}),states=new WeakMap<NativeInputParticipantUploads,State>(),read=RichAssetArchive.read,entries=RichAssetArchive.prototype.entries,dispose=RichAssetArchive.prototype.dispose;
const restore=RichAssetStore.restoreBackupHeld,open=RichAssetStore.openRetained,capture=RichAssetStore.prototype.captureBackup,acquire=RichAssetStore.prototype.acquireRecoveryCustody,checkStore=RichAssetStore.prototype.checkOpen,closeStore=RichAssetStore.prototype.close;
const checkCustody=RichAssetStoreCustody.prototype.check,releaseCustody=RichAssetStoreCustody.prototype.release,closeCustody=RichAssetStoreCustody.prototype.close;
function state(owner:NativeInputParticipantUploads,admitting=false):State{const s=states.get(owner);if(!s)throw new SharedEditorError('native_input_uploads_closed','A genuine native-input upload owner is required');if(!s.exposed&&!admitting)throw s.fail('uploads_closed');if(globalThis.indexedDB!==s.context||globalThis.navigator?.locks!==s.locks)throw s.fail('uploads_storage_changed');checkStore.call(s.store);checkCustody.call(s.custody);return s;}
async function verifyOwner(owner:NativeInputParticipantUploads,provided:()=>void,initial:boolean,admitting=false):Promise<void>{
 const s=state(owner,admitting),authorize=participantAuthority(provided),guard=()=>{state(owner,admitting);authorize();state(owner,admitting);};guard();const actual=await capture.call(s.store,()=>{guard();return undefined;});guard();
 if(initial){const bytes=await actual.backup.arrayBuffer();guard();if(await assetBytesDigest(new Uint8Array(bytes))!==s.digest)throw s.fail('uploads_diverged');guard();return;}
 const archive=await read.call(RichAssetArchive,actual.backup,{limits:s.limits});try{guard();const rows=new Map(entries.call(archive).map(r=>[r.asset,r]));for(const before of s.baseline){const now=rows.get(before.asset);if(!now||now.mime!==before.mime||now.bytes!==before.bytes||now.width!==before.width||now.height!==before.height||now.epoch<before.epoch||now.attempts<before.attempts||before.status==='uploaded'&&(now.status!=='uploaded'||now.storageRef!==before.storageRef))throw s.fail('uploads_diverged');}guard();}finally{dispose.call(archive);}guard();
}
let openForParent:<A,C extends NativeInputJournalChoice,O,R extends NativeInputCutIntent,F extends object>(family:NativeInputJournalFamily<A,C,O,R,F>,parent:unknown,input:O,options:NativeInputUploadsOptions,resume:boolean)=>Promise<NativeInputParticipantUploads>;
export class NativeInputParticipantUploads{
 readonly #constructorKey=key;
 private constructor(token:object,value:State){if(token!==this.#constructorKey)throw new SharedEditorError('native_input_uploads_policy','Use an actual intrinsic upload opener');states.set(this,value);Object.freeze(this);}
 static begin<A,C extends NativeInputJournalChoice,O,R extends NativeInputCutIntent,F extends object>(family:NativeInputJournalFamily<A,C,O,R,F>,input:O,options:NativeInputUploadsOptions){if(this!==NativeInputParticipantUploads)throw nativeInputJournalFamily(family).error('uploads_policy');return NativeInputParticipantUploads.#open(family,input,options,false);}
 static resume<A,C extends NativeInputJournalChoice,O,R extends NativeInputCutIntent,F extends object>(family:NativeInputJournalFamily<A,C,O,R,F>,input:O,options:NativeInputUploadsOptions){if(this!==NativeInputParticipantUploads)throw nativeInputJournalFamily(family).error('uploads_policy');return NativeInputParticipantUploads.#open(family,input,options,true);}
 static async #open<A,C extends NativeInputJournalChoice,O,R extends NativeInputCutIntent,F extends object>(family:NativeInputJournalFamily<A,C,O,R,F>,input:O,provided:NativeInputUploadsOptions,resume:boolean,parent?:unknown,delegated=false):Promise<NativeInputParticipantUploads>{
  const intrinsic=nativeInputJournalFamily(family),fail=intrinsic.error,context=recoveryOpeningContext(),locks=navigator.locks;intrinsic.input.check(input);if(!provided||typeof provided!=='object')throw fail('uploads_policy');const selected={...provided};if(!Object.hasOwn(selected,'database')||!Object.hasOwn(selected,'checkAuthority')||Object.keys(selected).some(k=>!['database','checkAuthority','signal','limits'].includes(k)))throw fail('uploads_policy');
  const database=independentRecoveryName(selected.database),identity=intrinsic.input.identity(input),cohort=intrinsic.input.cohort(input);if([identity.database,identity.sourceDatabase].includes(database)||cohort&&cohort.uploadsDatabase!==database||!!cohort!==delegated)throw fail('uploads_parent_required');
  if(selected.limits!==undefined&&(!selected.limits||typeof selected.limits!=='object'||Array.isArray(selected.limits)))throw fail('uploads_policy');const limits=checkRichAssetLimits(selected.limits),signal=independentRecoverySignal(selected.signal),authorize=participantAuthority(selected.checkAuthority),file=intrinsic.input.uploads(input);
  const guard=()=>{if(globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw fail('uploads_storage_changed');checkAssetBytesSignal(signal);authorize();checkAssetBytesSignal(signal);if(globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw fail('uploads_storage_changed');intrinsic.input.check(input);};
  let store:RichAssetStore|undefined,custody:RichAssetStoreCustody|undefined,archive:RichAssetArchive|undefined;
  const cleanup=async()=>{if(custody)await closeCustody.call(custody);if(store)closeStore.call(store);if(archive)dispose.call(archive);};
  const opening=delegated?nativeInputUploadsOpening(parent,family,context,[database],[identity.database,identity.sourceDatabase,cohort!.parentDatabase,cohort!.uploadsDatabase],cleanup):await RecoveryOpeningCustody.reserve(context,[database],cleanup,{policy:()=>fail('uploads_policy'),busy:()=>fail('uploads_busy'),storage:()=>fail('uploads_cleanup')});
  try{guard();archive=await read.call(RichAssetArchive,file,{limits,...(signal?{signal}:{})});guard();const baseline=Object.freeze(entries.call(archive).map(row=>Object.freeze({...row}))),bytes=await file.arrayBuffer();guard();const digest=await assetBytesDigest(new Uint8Array(bytes));guard();
   if(resume){store=await open.call(RichAssetStore,database,{limits});guard();custody=await acquire.call(store);}else{const actual=await restore.call(RichAssetStore,database,file,{limits,uploadState:'preserve',checkAuthority:guard,...(signal?{signal}:{})});store=actual.store;custody=actual.custody;}
   guard();const value:State={family,fail,identity,cohort,store,custody,baseline,file,digest,context,locks,limits,exposed:false},result=new NativeInputParticipantUploads(key,value);await verifyOwner(result,guard,!resume,true);guard();dispose.call(archive);archive=undefined;guard();opening.complete();value.exposed=true;return result;
  }catch(error){await opening.rollback();throw error;}
 }
 check():void{state(this);}
 identity():NativeInputJournalIdentity{return structuredClone(state(this).identity);}
 cohort(){return structuredClone(state(this).cohort);}
 file():Blob{return state(this).file;}
 verify(guard:()=>void,initial=false):Promise<void>{return verifyOwner(this,guard,initial);}
 release():RichAssetStore{const s=state(this);releaseCustody.call(s.custody);states.delete(this);return s.store;}
 close():Promise<void>{const s=states.get(this);if(!s)return Promise.resolve();if(!s.exposed)throw s.fail('uploads_closed');if(s.closing)return s.closing;const closing=Promise.resolve().then(async()=>{await closeCustody.call(s.custody);closeStore.call(s.store);states.delete(this);}).finally(()=>{delete s.closing;});s.closing=closing;return closing;}
 static{openForParent=(family,parent,input,options,resume)=>NativeInputParticipantUploads.#open(family,input,options,resume,parent,true);}
}
const p=NativeInputParticipantUploads.prototype;
export const nativeInputUploads=Object.freeze({belongs:(owner:unknown,family:object):owner is NativeInputParticipantUploads=>{const s=states.get(owner as NativeInputParticipantUploads);return !!s&&s.exposed&&s.family===family;},check:p.check,identity:p.identity,cohort:p.cohort,file:p.file,verify:p.verify,release:p.release,close:p.close});
export function openNativeInputUploadsForParticipant<A,C extends NativeInputJournalChoice,O,R extends NativeInputCutIntent,F extends object>(family:NativeInputJournalFamily<A,C,O,R,F>,parent:unknown,input:O,options:NativeInputUploadsOptions,resume:boolean){return openForParent(family,parent,input,options,resume);}
/** Actual internal store borrow without releasing its preheld recovery custody. */
export function readNativeInputUploadStore(owner:NativeInputParticipantUploads):RichAssetStore{return state(owner).store;}
