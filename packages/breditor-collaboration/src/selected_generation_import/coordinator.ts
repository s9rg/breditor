/** SDK-private generation input preparation. No native import occurs here.
 * The separate generation executor requires durable progress, native ancestry
 * admission on every resume and retirement before releasing uncertain edits. */
import {withSelectedNativeRecovery,type RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import {generationRecoveryHostPort,type SharedServerLogGenerationRecoveryHost} from '../generation_recovery_control/host.js';
import type {SharedServerLogGenerationRecoveryAcceptedRequest} from '../generation_recovery_control/accepted_contract.js';
import {SelectedRoomCurrentArchive} from '../selected_room_current/archive.js';
import {decideFreshAssetChoice} from '../physical_room_asset_approval/decision.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {database} from '../physical_room_asset_adoption/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {fields,fail,MAX_GENERATION_NATIVE_IMPORT_BYTES,MAX_GENERATION_NATIVE_IMPORT_PAGES} from './policy.js';
import {generationNativeImportChoice} from './manifest.js';
import {encodeSelectedGenerationNativeImport} from './archive.js';
import {SelectedGenerationNativeImportArchive} from './archive.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {OperationalReadCancellation} from '../operation_read/cancellation.js';
import {recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {GenerationNativeImportInputResources} from './resources.js';
import type {SelectedGenerationNativeImportChoice,SelectedGenerationNativeImportFile,SelectedGenerationNativeImportPage,SelectedGenerationNativeImportPreview} from './contract.js';
const before={read:SelectedRoomCurrentArchive.read,manifest:SelectedRoomCurrentArchive.prototype.manifest,dispose:SelectedRoomCurrentArchive.prototype.dispose},add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,key=Object.freeze({});
const inputResources={open:GenerationNativeImportInputResources.prototype.open,existing:GenerationNativeImportInputResources.prototype.openExisting,file:GenerationNativeImportInputResources.prototype.file,verify:GenerationNativeImportInputResources.prototype.verifyFresh,consume:GenerationNativeImportInputResources.prototype.consume,close:GenerationNativeImportInputResources.prototype.close};
const inputArchive={read:SelectedGenerationNativeImportArchive.read,dispose:SelectedGenerationNativeImportArchive.prototype.dispose};
let own:(choice:SelectedGenerationNativeImportChoice,resources:GenerationNativeImportInputResources)=>RetainedGenerationNativeImportInput;
let inputPort:(owner:RetainedGenerationNativeImportInput)=>Readonly<{choice:SelectedGenerationNativeImportChoice;check():void;file():SelectedGenerationNativeImportFile;verify(authority:()=>void,signal?:AbortSignal):Promise<SelectedGenerationNativeImportFile>}>;
/** Trusted coordinator port. Public methods and copied data cannot substitute
 * the actual input namespace, complete file or current store connection. */
export const retainedGenerationNativeImportInputPort=(owner:RetainedGenerationNativeImportInput)=>inputPort(owner);
export class RetainedGenerationNativeImportInput{
 readonly #choice;readonly #resources;
 private constructor(token:object,choice:SelectedGenerationNativeImportChoice,resources:GenerationNativeImportInputResources){if(token!==key)throw fail('generation_native_import_policy');this.#choice=choice;this.#resources=resources;Object.freeze(this);}
 choice():SelectedGenerationNativeImportChoice{return this.#choice;}
 file():SelectedGenerationNativeImportFile{return inputResources.file.call(this.#resources);}
 verifyFresh(authority:()=>void,signal?:AbortSignal):Promise<SelectedGenerationNativeImportFile>{const grant=participantAuthority(authority);return inputResources.verify.call(this.#resources,grant,signal);}
 close():Promise<void>{return inputResources.close.call(this.#resources);}
 static{own=(choice,resources)=>new RetainedGenerationNativeImportInput(key,choice,resources);inputPort=owner=>{if(!owner||typeof owner!=='object'||!(#resources in owner))throw fail('generation_native_import_policy');const resources=owner.#resources;resources.check();return Object.freeze({choice:owner.#choice,check:resources.check,file:()=>inputResources.file.call(resources),verify:(authority:()=>void,signal?:AbortSignal)=>inputResources.verify.call(resources,participantAuthority(authority),signal)});};}
}
/** Existing-only cold data reopening. Independent explicit hashing runtime and
 * fresh read permission replace the expired preparation job, not native policy.
 * The full archive is re-admitted; this still grants no native writer or host. */
export async function openRetainedGenerationNativeImportInput(options:SharedArchiveIntegrityOptions&Readonly<{expected:SelectedGenerationNativeImportChoice}>):Promise<RetainedGenerationNativeImportInput>{
 const factory=recoveryOpeningContext(),locks=navigator.locks,raw=fields(options,['expected','wasm','checkAuthority'],['signal']),choice=generationNativeImportChoice(raw['expected']),authority=participantAuthority(raw['checkAuthority'] as ()=>void),signal=raw['signal'] as AbortSignal|undefined,observation=new OperationalReadCancellation(signal);let resources:GenerationNativeImportInputResources|undefined,archive:SelectedGenerationNativeImportArchive|undefined,complete=false;
 const check=()=>{if(globalThis.indexedDB!==factory||globalThis.navigator?.locks!==locks)throw fail('generation_native_import_closed');resources?.check();observation.check(()=>fail('generation_native_import_aborted'));authority();resources?.check();observation.check(()=>fail('generation_native_import_aborted'));};
 try{check();resources=new GenerationNativeImportInputResources();const integrity:SharedArchiveIntegrityOptions={wasm:raw['wasm'] as SharedArchiveIntegrityOptions['wasm'],checkAuthority:check,...(signal?{signal}:{})};await inputResources.existing.call(resources,choice,integrity);const file=inputResources.file.call(resources);archive=await inputArchive.read.call(SelectedGenerationNativeImportArchive,file.file,file.selection,integrity);inputArchive.dispose.call(archive);archive=undefined;check();inputResources.consume.call(resources);complete=true;return own(choice,resources);
 }finally{try{if(archive)inputArchive.dispose.call(archive);if(!complete&&resources)await inputResources.close.call(resources);}finally{observation.close();}}
}
async function inspect(scope:SelectedNativeRecoveryScope,host:SharedServerLogGenerationRecoveryHost,name:string){
 const port=generationRecoveryHostPort(host),initial=await scope.readGenerationReconciliation(host),streams=initial.native.ownStreams,unbound=new Set(streams.participants.filter(row=>row.review?.binding===null).map(row=>JSON.stringify([row.principal,row.review!.actor])));
 // Unknown own accepted suffixes must refuse BEFORE the first member changes.
 // Unbound local comments stay explicitly unbound for their separate adoption.
 if(streams.unreconciledParticipants.length||streams.missing.some(row=>row.kind!=='unbound_review'&&!(row.kind==='review'&&row.reason==='missing'&&unbound.has(JSON.stringify([row.principal,row.actor]))))||streams.participants.some(row=>BigInt(row.document.localThrough)<BigInt(row.document.acceptedThrough)||row.review?.acceptedThrough!==null&&row.review?.acceptedThrough!==undefined&&BigInt(row.review.localThrough)<BigInt(row.review.acceptedThrough)))throw fail('generation_native_import_policy');
 const retained=await scope.retainCurrent(),admitted=await before.read.call(SelectedRoomCurrentArchive,retained.current.file,retained.current.selection,retained.integrity);let basis;try{basis=before.manifest.call(admitted);}finally{before.dispose.call(admitted);}
 const pages:SelectedGenerationNativeImportPage[]=[];let request:SharedServerLogGenerationRecoveryAcceptedRequest={document:'include',review:{kind:initial.native.reviewAuthors.length?'start':'absent'}},bytes=retained.current.file.size;
 for(;;){scope.check();if(pages.length>=MAX_GENERATION_NATIVE_IMPORT_PAGES)throw fail('generation_native_import_budget');const accepted=await port.readAcceptedNative(request,scope.signal),file=new Blob([JSON.stringify(accepted)]);bytes+=file.size;if(bytes>MAX_GENERATION_NATIVE_IMPORT_BYTES)throw fail('generation_native_import_budget');pages.push(Object.freeze({request,file}));if(!accepted.review?.more)break;request={document:'omit',review:{kind:'after',cursor:accepted.review.cursor}};}
 const input=await encodeSelectedGenerationNativeImport({server:port.selection,before:retained.current,pages},retained.integrity),choice=generationNativeImportChoice({format:'breditor/selected-generation-native-import-choice',formatVersion:1,database:name,input:input.selection});
 const verify=async()=>{const actual=await scope.readGenerationReconciliation(host);if(JSON.stringify(actual.provider.current)!==JSON.stringify(basis.current))throw fail();const selected=actual.provider.uploads.filter(row=>row.role==='selected');if(selected.length!==basis.uploads.length||basis.uploads.some(row=>!selected.some(value=>value.id===row.id&&value.bytes===row.bytes&&value.sha256===row.sha256)))throw fail();scope.check();};await verify();return{preview:Object.freeze({choice,input}),integrity:retained.integrity,verify};
}
/** Data-only preview. It creates no input database and changes no source. */
export async function previewSelectedGenerationNativeImport<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,host:SharedServerLogGenerationRecoveryHost,reads:PhysicalOperationV3HistoryReadOptions<P>,options:Readonly<{database:string}>):Promise<SelectedGenerationNativeImportPreview>{generationRecoveryHostPort(host);return withSelectedNativeRecovery(owner,reads,async scope=>{const raw=fields(options,['database']),name=database(raw['database']);return(await inspect(scope,host,name)).preview;});}
/** A new affirmative decision is required even for exact existing input. The
 * full file commits before this returns; it is not an import-complete marker. */
export async function retainSelectedGenerationNativeImport<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,host:SharedServerLogGenerationRecoveryHost,reads:PhysicalOperationV3HistoryReadOptions<P>,options:Readonly<{expected:SelectedGenerationNativeImportChoice;approve:(choice:SelectedGenerationNativeImportChoice)=>boolean|Promise<boolean>}>):Promise<RetainedGenerationNativeImportInput>{
 let resources:GenerationNativeImportInputResources|undefined,complete=false;
 try{generationRecoveryHostPort(host);const result=await withSelectedNativeRecovery(owner,reads,async scope=>{const raw=fields(options,['expected','approve']),expected=generationNativeImportChoice(raw['expected']);if(typeof raw['approve']!=='function')throw fail('generation_native_import_policy');const approve=raw['approve'] as typeof options.approve,inspected=await inspect(scope,host,expected.database);if(JSON.stringify(inspected.preview.choice)!==JSON.stringify(expected))throw fail();
   await decideFreshAssetChoice(frozen(expected),approve,{check:scope.check,signal:scope.signal,watchClosing:notify=>{add.call(scope.signal,'abort',notify,{once:true});return()=>remove.call(scope.signal,'abort',notify);}});await inspected.verify();scope.check();resources=new GenerationNativeImportInputResources();await inputResources.open.call(resources,expected,inspected.preview.input,inspected.integrity);await inspected.verify();scope.check();return own(expected,resources);
  });inputResources.consume.call(resources!);complete=true;return result;
 }finally{if(!complete&&resources)await inputResources.close.call(resources);}
}
