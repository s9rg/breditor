/** Internal machinery contracts. A family is an intrinsic sealed owner, not a
 * caller adapter or serialized capability. Concrete facades retain closed wire
 * formats and exact intent types while sharing native publication machinery. */
import type {SharedEditorError} from '../core.js';
import type {IndependentHistoryCut,IndependentHistoryStoredCut,IndependentHistoryHead} from '../independent_history/contract.js';
import type {SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import type {LocalOperationBackupSelection} from '../independent_local_operation/portable_contract.js';
import type {LocalPortableReplay} from '../independent_local_operation/portable_replay.js';
import type {RecoveryCleanupTicket} from '../participant_recovery/cleanup_scope.js';
import type {IndependentLocalOperationDriver} from '../independent_history/local_driver.js';
import type {NativeInputJournal} from './journal_kernel.js';

export interface NativeInputJournalChoice{
 readonly kind:string;readonly expected:LocalOperationBackupSelection;
 readonly database:string;readonly sourceDatabase:string;readonly names:readonly string[];
 readonly cohort?:Readonly<{parentDatabase:string;uploadsDatabase:string}>;
 readonly guard:()=>void;
 readonly read:Readonly<{options:Readonly<{session:SharedIndependentRecoveryFactory;signal?:AbortSignal|undefined}>}>;
}
/** Data identity, not a family/custody token or executable policy. */
export interface NativeInputJournalIdentity{readonly plan:string;readonly operation:string;readonly origin:string;readonly database:string;readonly sourceDatabase:string}
export interface NativeInputCutIntent{readonly format:string;readonly formatVersion:1;readonly plan:string;readonly operation:string;readonly sequence:string;readonly current:string|null;readonly pending:string|null}
export interface NativeInputJournalStored<R extends NativeInputCutIntent>{readonly record:R;readonly file:Blob;readonly rows:ReadonlyMap<string,unknown>}
export interface NativeInputJournalChecked<R extends NativeInputCutIntent> extends Omit<NativeInputJournalStored<R>,'rows'>{readonly rows:ReadonlyMap<string,IndependentHistoryCut>;readonly decoded:ReadonlyMap<string,IndependentHistoryStoredCut>}
/** A structural description of values returned only by the genuine facade
 * binding below. A caller-created object cannot select a family or owner. */
export interface NativeInputReadScope<R extends NativeInputCutIntent>{
 readonly identity:NativeInputJournalIdentity;readonly expected:LocalOperationBackupSelection;
 check():void;release():void;inputFile():Blob;originalFile():Blob;uploads():Blob;blob(asset:string,generation:string):Blob|undefined;
 readSource():SharedIndependentHistoryRecovery;
 readSnapshot():Promise<Readonly<{record:R;input:Blob;current:IndependentHistoryCut|null;pending:IndependentHistoryCut|null;observed:string|null}>>;
}
export interface NativeInputSourceBinding<R extends NativeInputCutIntent>{
 readonly expected:LocalOperationBackupSelection;readonly sourceDatabase:string;readonly driver:IndependentLocalOperationDriver;
 reserve():{claim(owner:object):void;abandon():void};readSource(owner:object):SharedIndependentHistoryRecovery;
 borrowRead(owner:object,guard:()=>void,signal?:AbortSignal,factory?:SharedIndependentRecoveryFactory):NativeInputReadScope<R>;
}

/** These functions are captured from the concrete codec/facade modules. They
 * are never read from an imported file, a host plugin or an options object. */
export interface NativeInputJournalIntrinsics<A,C extends NativeInputJournalChoice,O,R extends NativeInputCutIntent,F extends object>{
 readonly kind:C['kind'];readonly error:(suffix?:string)=>SharedEditorError;
 readonly snapshot:(provided:A)=>C;
 readonly input:Readonly<{
  read(file:Blob,choice:C):Promise<O>;check(owner:O):void;verifyFile(owner:O,file:Blob,guard:()=>void):Promise<void>;dispose(owner:O):void;
  identity(owner:O):NativeInputJournalIdentity;live(owner:O):SharedIndependentHistoryRecovery;
  targets(owner:O):readonly IndependentHistoryCut[];file(owner:O):Blob;originalFile(owner:O):Blob;
  uploads(owner:O):Blob;blob(owner:O,asset:string,generation:string):Blob|undefined;
  cohort(owner:O):Readonly<{parentDatabase:string;uploadsDatabase:string}>|undefined;
 }>;
 readonly head:Readonly<{read(input:string,id:NativeInputJournalIdentity):IndependentHistoryHead;wrap(input:string,id:NativeInputJournalIdentity):string}>;
 readonly initial:(id:NativeInputJournalIdentity)=>R;
 readonly database:Readonly<{
  existing(name:string,guard:()=>void):Promise<IDBDatabase>;
  input(db:IDBDatabase,guard:()=>void):Promise<Blob>;
  create(context:IDBFactory,name:string,record:R,file:Blob,guard:()=>void,signal?:AbortSignal):Promise<IDBDatabase>;
  read(db:IDBDatabase,id:NativeInputJournalIdentity,guard:()=>void):Promise<NativeInputJournalStored<R>>;
  write(db:IDBDatabase,id:NativeInputJournalIdentity,before:NativeInputJournalChecked<R>,next:R,candidate:Readonly<{id:string;cut:IndependentHistoryCut}>|undefined,guard:()=>void,signal?:AbortSignal):Promise<void>;
 }>;
 readonly admit:(stored:NativeInputJournalStored<R>,id:NativeInputJournalIdentity,selected:C['expected']['original'],factory:SharedIndependentRecoveryFactory,anchor:LocalPortableReplay,guard:()=>void)=>Promise<NativeInputJournalChecked<R>>;
 readonly delegate:(parent:unknown,context:IDBFactory,pair:readonly string[],names:readonly string[],cleanup:()=>Promise<void>)=>RecoveryCleanupTicket;
 readonly journal:Readonly<{
  binding(facade:F):NativeInputSourceBinding<R>;file(facade:F):Blob;blob(facade:F,asset:string,generation:string):Blob|undefined;
  progress(facade:F):Promise<Readonly<{sequence:string;current:string|null;pending:string|null}>>;close(facade:F):Promise<void>;
 }>;
 readonly facade:(kernel:NativeInputJournal<A,C,O,R,F>)=>F;
}
