/** Pure current-policy snapshot. Storage opening must reserve the actual names
 * before invoking guard; serialized files choose neither factories nor grants. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentHistorySessionOptions} from '../independent_history/contract.js';
import type {LocalOperationBackupSelection} from '../independent_local_operation/portable_contract.js';
import {localOperationBackupSelection} from '../independent_local_operation/portable_identity.js';
import {snapshotLocalOperationFactory} from '../independent_local_operation/factory_policy.js';
import {localPortableReadPolicy} from '../independent_local_operation/portable_policy.js';
import {independentRecoveryName} from '../independent_recovery/policy.js';
import {independentDeliveryCompanion} from '../independent_history/driver.js';
import {selectedLocalOperationDriver} from '../independent_history/local_driver.js';
import {independentBootstrapPolicy,independentBootstrapSignal} from '../independent_history/bootstrap_policy.js';
import {independentLocalHistoryCapturePolicy} from '../independent_local_operation/source_policy.js';
import {requireBackupRecovery} from '../backups/identity.js';
import {generationFields} from '../generation_source/identity.js';
import type {AssetLimits} from '@breditor/experimental-rich-content';
import {restoredLocalFailure as fail} from './failure.js';
export type RestoredLocalSourceFactory<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Omit<SharedIndependentHistorySessionOptions<P>,'database'|'create'>;
export interface RestoredLocalInputOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly kind:'snapshot-v1';readonly expected:LocalOperationBackupSelection;
 readonly database:string;readonly sourceDatabase:string;readonly sourceFactory:RestoredLocalSourceFactory<P>;
 readonly writerRecovery:'host-reacquired';readonly checkAuthority:()=>void;readonly signal?:AbortSignal;readonly limits?:Partial<AssetLimits>;
 readonly cohort?:Readonly<{parentDatabase:string;uploadsDatabase:string}>;
}
const missing=()=>{throw fail('restored_local_operation_create');};
export function snapshotRestoredLocalPolicy<P extends SharedSelectionPolicy>(provided:RestoredLocalInputOptions<P>){
 if(!provided||typeof provided!=='object')throw fail();const input={...provided},required=['kind','expected','database','sourceDatabase','sourceFactory','writerRecovery','checkAuthority'];if(required.some(key=>!Object.hasOwn(input,key))||Object.keys(input).some(key=>![...required,'signal','limits','cohort'].includes(key))||input.kind!=='snapshot-v1')throw fail();requireBackupRecovery(input.writerRecovery);
 const expected=localOperationBackupSelection(input.expected),database=independentRecoveryName(input.database),sourceDatabase=independentRecoveryName(input.sourceDatabase),factory=input.sourceFactory;
 if(!factory||typeof factory!=='object'||Object.hasOwn(factory,'database')||Object.hasOwn(factory,'create')||independentDeliveryCompanion(factory)||selectedLocalOperationDriver(factory)||independentBootstrapPolicy(factory)||independentBootstrapSignal(factory)||independentLocalHistoryCapturePolicy(factory))throw fail();
 const source=snapshotLocalOperationFactory(expected.original,{...factory,database:sourceDatabase,create:missing});let cohort:RestoredLocalInputOptions['cohort'];
 if(input.cohort!==undefined){const selected={...input.cohort};if(!generationFields(selected,'parentDatabase,uploadsDatabase'))throw fail();cohort=Object.freeze({parentDatabase:independentRecoveryName(selected.parentDatabase),uploadsDatabase:independentRecoveryName(selected.uploadsDatabase)});}
 const names=Object.freeze([database,sourceDatabase,...(cohort?Object.values(cohort):[])].sort());if(new Set(names).size!==names.length)throw fail();
 const{database:_database,create:_create,...replayFactories}=source,read=localPortableReadPolicy(expected.original,{session:{...replayFactories,readOnly:true,review:{...source.review,access:'read_only'}},checkAuthority:input.checkAuthority,...(input.signal===undefined?{}:{signal:input.signal}),...(input.limits===undefined?{}:{limits:input.limits})});
 return Object.freeze({kind:input.kind,expected,database,sourceDatabase,source,names,...(cohort?{cohort}:{}),read,guard:read.guard});
}

/** Reconstruct only the already-snapshotted admission options. An opening may
 * call this after authorization without re-reading the caller's policy getters. */
export function restoredLocalInputOptions<P extends SharedSelectionPolicy>(choice:ReturnType<typeof snapshotRestoredLocalPolicy<P>>):RestoredLocalInputOptions<P>{
 const{database:_database,create:_create,...sourceFactory}=choice.source;
 return{kind:choice.kind,expected:choice.expected,database:choice.database,sourceDatabase:choice.sourceDatabase,sourceFactory,writerRecovery:'host-reacquired',checkAuthority:choice.guard,...(choice.read.options.signal===undefined?{}:{signal:choice.read.options.signal}),limits:choice.read.options.limits,...(choice.cohort?{cohort:choice.cohort}:{})};
}
