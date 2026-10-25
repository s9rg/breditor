/** SDK-private immutable input preparation. No native import occurs here.
 * The future executor still needs a durable progress journal, native lineage
 * admission on every resume and retirement before releasing uncertain edits. */
import {withSelectedNativeRecovery,type RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import {physicalRecoveryHostPort,type SharedPhysicalRoomRecoveryHost} from '../physical_recovery_control/host.js';
import type {SharedPhysicalRecoveryAcceptedRequest} from '../physical_recovery_control/accepted_contract.js';
import {SelectedRoomCurrentArchive} from '../selected_room_current/archive.js';
import {decideFreshAssetChoice} from '../physical_room_asset_approval/decision.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {database} from '../physical_room_asset_adoption/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {fields,fail,MAX_NATIVE_IMPORT_BYTES,MAX_NATIVE_IMPORT_PAGES} from './policy.js';
import {nativeImportChoice} from './manifest.js';
import {encodeSelectedNativeImport} from './archive.js';
import {SelectedNativeImportArchive} from './archive.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {OperationalReadCancellation} from '../operation_read/cancellation.js';
import {recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {NativeImportInputResources} from './resources.js';
import type {SelectedNativeImportChoice,SelectedNativeImportFile,SelectedNativeImportPage,SelectedNativeImportPreview} from './contract.js';
const before={read:SelectedRoomCurrentArchive.read,manifest:SelectedRoomCurrentArchive.prototype.manifest,dispose:SelectedRoomCurrentArchive.prototype.dispose},add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,key=Object.freeze({});
const inputResources={open:NativeImportInputResources.prototype.open,existing:NativeImportInputResources.prototype.openExisting,file:NativeImportInputResources.prototype.file,verify:NativeImportInputResources.prototype.verifyFresh,consume:NativeImportInputResources.prototype.consume,close:NativeImportInputResources.prototype.close};
const inputArchive={read:SelectedNativeImportArchive.read,dispose:SelectedNativeImportArchive.prototype.dispose};
let own:(choice:SelectedNativeImportChoice,resources:NativeImportInputResources)=>RetainedNativeImportInput;
let inputPort:(owner:RetainedNativeImportInput)=>Readonly<{choice:SelectedNativeImportChoice;check():void;file():SelectedNativeImportFile;verify(authority:()=>void,signal?:AbortSignal):Promise<SelectedNativeImportFile>}>;
/** Trusted coordinator port. Public methods and copied data cannot substitute
 * the actual input namespace, complete file or current store connection. */
export const retainedNativeImportInputPort=(owner:RetainedNativeImportInput)=>inputPort(owner);
export class RetainedNativeImportInput{
 readonly #choice;readonly #resources;
 private constructor(token:object,choice:SelectedNativeImportChoice,resources:NativeImportInputResources){if(token!==key)throw fail('native_import_policy');this.#choice=choice;this.#resources=resources;Object.freeze(this);}
 choice():SelectedNativeImportChoice{return this.#choice;}
 file():SelectedNativeImportFile{return inputResources.file.call(this.#resources);}
 verifyFresh(authority:()=>void,signal?:AbortSignal):Promise<SelectedNativeImportFile>{const grant=participantAuthority(authority);return inputResources.verify.call(this.#resources,grant,signal);}
 close():Promise<void>{return inputResources.close.call(this.#resources);}
 static{own=(choice,resources)=>new RetainedNativeImportInput(key,choice,resources);inputPort=owner=>{if(!owner||typeof owner!=='object'||!(#resources in owner))throw fail('native_import_policy');const resources=owner.#resources;resources.check();return Object.freeze({choice:owner.#choice,check:resources.check,file:()=>inputResources.file.call(resources),verify:(authority:()=>void,signal?:AbortSignal)=>inputResources.verify.call(resources,participantAuthority(authority),signal)});};}
}
/** Existing-only cold data reopening. Independent explicit hashing runtime and
 * fresh read permission replace the expired preparation job, not native policy.
 * The full archive is re-admitted; this still grants no native writer or host. */
export async function openRetainedNativeImportInput(options:SharedArchiveIntegrityOptions&Readonly<{expected:SelectedNativeImportChoice}>):Promise<RetainedNativeImportInput>{
 const factory=recoveryOpeningContext(),locks=navigator.locks,raw=fields(options,['expected','wasm','checkAuthority'],['signal']),choice=nativeImportChoice(raw['expected']),authority=participantAuthority(raw['checkAuthority'] as ()=>void),signal=raw['signal'] as AbortSignal|undefined,observation=new OperationalReadCancellation(signal);let resources:NativeImportInputResources|undefined,archive:SelectedNativeImportArchive|undefined,complete=false;
 const check=()=>{if(globalThis.indexedDB!==factory||globalThis.navigator?.locks!==locks)throw fail('native_import_closed');resources?.check();observation.check(()=>fail('native_import_aborted'));authority();resources?.check();observation.check(()=>fail('native_import_aborted'));};
 try{check();resources=new NativeImportInputResources();const integrity:SharedArchiveIntegrityOptions={wasm:raw['wasm'] as SharedArchiveIntegrityOptions['wasm'],checkAuthority:check,...(signal?{signal}:{})};await inputResources.existing.call(resources,choice,integrity);const file=inputResources.file.call(resources);archive=await inputArchive.read.call(SelectedNativeImportArchive,file.file,file.selection,integrity);inputArchive.dispose.call(archive);archive=undefined;check();inputResources.consume.call(resources);complete=true;return own(choice,resources);
 }finally{try{if(archive)inputArchive.dispose.call(archive);if(!complete&&resources)await inputResources.close.call(resources);}finally{observation.close();}}
}
async function inspect(scope:SelectedNativeRecoveryScope,host:SharedPhysicalRoomRecoveryHost,name:string){
 const port=physicalRecoveryHostPort(host),initial=await scope.readReconciliation(host),streams=initial.native.ownStreams,unbound=new Set(streams.participants.filter(row=>row.review?.binding===null).map(row=>JSON.stringify([row.principal,row.review!.actor])));
 // Unknown own accepted suffixes must refuse BEFORE the first member changes.
 // Unbound local comments stay explicitly unbound for their separate adoption.
 if(streams.unreconciledParticipants.length||streams.missing.some(row=>row.kind!=='unbound_review'&&!(row.kind==='review'&&row.reason==='missing'&&unbound.has(JSON.stringify([row.principal,row.actor]))))||streams.participants.some(row=>BigInt(row.document.localThrough)<BigInt(row.document.acceptedThrough)||row.review?.acceptedThrough!==null&&row.review?.acceptedThrough!==undefined&&BigInt(row.review.localThrough)<BigInt(row.review.acceptedThrough)))throw fail('native_import_policy');
 const retained=await scope.retainCurrent(),admitted=await before.read.call(SelectedRoomCurrentArchive,retained.current.file,retained.current.selection,retained.integrity);let basis;try{basis=before.manifest.call(admitted);}finally{before.dispose.call(admitted);}
 const pages:SelectedNativeImportPage[]=[];let request:SharedPhysicalRecoveryAcceptedRequest={document:'include',review:{kind:initial.native.reviewAuthors.length?'start':'absent'}},bytes=retained.current.file.size;
 for(;;){scope.check();if(pages.length>=MAX_NATIVE_IMPORT_PAGES)throw fail('native_import_budget');const accepted=await port.readAcceptedNative(request,scope.signal),file=new Blob([JSON.stringify(accepted)]);bytes+=file.size;if(bytes>MAX_NATIVE_IMPORT_BYTES)throw fail('native_import_budget');pages.push(Object.freeze({request,file}));if(!accepted.review?.more)break;request={document:'omit',review:{kind:'after',cursor:accepted.review.cursor}};}
 const input=await encodeSelectedNativeImport({server:port.selection,before:retained.current,pages},retained.integrity),choice=nativeImportChoice({format:'breditor/selected-native-import-choice',formatVersion:1,database:name,input:input.selection});
 const verify=async()=>{const actual=await scope.readReconciliation(host);if(JSON.stringify(actual.provider.current)!==JSON.stringify(basis.current))throw fail();const selected=actual.provider.uploads.filter(row=>row.role==='selected');if(selected.length!==basis.uploads.length||basis.uploads.some(row=>!selected.some(value=>value.id===row.id&&value.bytes===row.bytes&&value.sha256===row.sha256)))throw fail();scope.check();};await verify();return{preview:Object.freeze({choice,input}),integrity:retained.integrity,verify};
}
/** Data-only preview. It creates no input database and changes no source. */
export function previewSelectedNativeImport<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,host:SharedPhysicalRoomRecoveryHost,reads:PhysicalOperationV3HistoryReadOptions<P>,options:Readonly<{database:string}>):Promise<SelectedNativeImportPreview>{return withSelectedNativeRecovery(owner,reads,async scope=>{const raw=fields(options,['database']),name=database(raw['database']);return(await inspect(scope,host,name)).preview;});}
/** A new affirmative decision is required even for exact existing input. The
 * full file commits before this returns; it is not an import-complete marker. */
export async function retainSelectedNativeImport<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,host:SharedPhysicalRoomRecoveryHost,reads:PhysicalOperationV3HistoryReadOptions<P>,options:Readonly<{expected:SelectedNativeImportChoice;approve:(choice:SelectedNativeImportChoice)=>boolean|Promise<boolean>}>):Promise<RetainedNativeImportInput>{
 let resources:NativeImportInputResources|undefined,complete=false;
 try{const result=await withSelectedNativeRecovery(owner,reads,async scope=>{const raw=fields(options,['expected','approve']),expected=nativeImportChoice(raw['expected']);if(typeof raw['approve']!=='function')throw fail('native_import_policy');const approve=raw['approve'] as typeof options.approve,inspected=await inspect(scope,host,expected.database);if(JSON.stringify(inspected.preview.choice)!==JSON.stringify(expected))throw fail();
   await decideFreshAssetChoice(frozen(expected),approve,{check:scope.check,signal:scope.signal,watchClosing:notify=>{add.call(scope.signal,'abort',notify,{once:true});return()=>remove.call(scope.signal,'abort',notify);}});await inspected.verify();scope.check();resources=new NativeImportInputResources();await inputResources.open.call(resources,expected,inspected.preview.input,inspected.integrity);await inspected.verify();scope.check();return own(expected,resources);
  });inputResources.consume.call(resources!);complete=true;return result;
 }finally{if(!complete&&resources)await inputResources.close.call(resources);}
}
