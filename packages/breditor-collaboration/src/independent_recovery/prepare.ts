import {inheritActorLeaseInput} from '../persistence/actor_lease_input.js';
/** Normalize before awaits, but do not call host authority until the actual
 * namespace has been reserved. A historical identity chooses no live grant. */
import type {SharedSelectionPolicy} from '../types.js';
import {makeIndependentHistoryCut} from '../independent_history/cut.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {checkAssetBytesSignal} from '../asset_bytes/guards.js';
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {independentParticipantSelection} from '../independent_participant/policy.js';
import {checkIndependentRecords} from '../independent_source/records.js';
import {independentRecoveryArchive as archive} from './archive.js';
import {snapshotIndependentRecoveryFactory} from './factory_policy.js';
import {independentRecoveryFailure as fail,independentRecoveryName as name,independentRecoveryFields} from './policy.js';
import type {SharedIndependentParticipantResumeOptions,SharedIndependentParticipantRecoveryOptions} from './contract.js';
import type {IndependentRecoveryRecord} from './record.js';
import {independentRecoverySignal} from './signal.js';
const missing=()=>{throw fail('independent_recovery_missing');};
export function snapshotIndependentRecovery<P extends SharedSelectionPolicy>(provided:SharedIndependentParticipantResumeOptions<P>,begin:boolean){
 if(!provided||typeof provided!=='object')throw fail('independent_recovery_policy');const input={...provided};independentRecoveryFields(input,['database','expected','destinations','session','checkAuthority',...(begin?['backup']:[])],['signal','limits']);
 const database=name(input.database),expected=independentParticipantSelection(input.expected),d={...input.destinations};independentRecoveryFields(d,['source','uploads']);const destinations=Object.freeze({source:name(d.source),uploads:name(d.uploads)});if(new Set([database,...Object.values(destinations)]).size!==3)throw fail('independent_recovery_policy');
 const session=snapshotIndependentRecoveryFactory(expected,input.session),authority=participantAuthority(input.checkAuthority),signal=independentRecoverySignal(input.signal),options={database,expected,destinations,session,checkAuthority:input.checkAuthority,...(signal?{signal}:{}),limits:checkRichAssetLimits(input.limits)},guard=()=>{checkAssetBytesSignal(options.signal);authority();checkAssetBytesSignal(options.signal);};
 const plan=JSON.stringify({format:'breditor/shared-independent-participant-plan',formatVersion:1,expected,destinations});if(new TextEncoder().encode(plan).length>128*1024)throw fail('independent_recovery_policy');const record:IndependentRecoveryRecord={format:'breditor/shared-independent-participant-recovery',formatVersion:1,plan,phase:'preparing',source:'reserved',uploads:'reserved'},file=begin?archive.file.call((input as SharedIndependentParticipantRecoveryOptions<P>).backup):undefined;return{options,guard,record,file};
}
export async function prepareIndependentRecovery<P extends SharedSelectionPolicy>(base:ReturnType<typeof snapshotIndependentRecovery<P>>,file:Blob){
 const{options,guard,record}=base;guard();let backup:Awaited<ReturnType<typeof archive.read>>|undefined,complete=false;
 try{backup=await archive.read(file,options.expected,{limits:options.limits,...(options.signal?{signal:options.signal}:{})});guard();const recovery=await checkIndependentRecords(options.expected.identity.source,archive.records.call(backup));guard();const cut=await makeIndependentHistoryCut(recovery.documentCheckpoint,recovery.reviewCheckpoint,recovery.identity,recovery.versions);guard();const factory=inheritActorLeaseInput(options.session,{...options.session,database:options.destinations.source,create:missing});complete=true;return{options,guard,record,backup,recovery,cut,factory};}
 finally{if(!complete&&backup)archive.dispose.call(backup);}
}
export type PreparedIndependentRecovery<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Awaited<ReturnType<typeof prepareIndependentRecovery<P>>>;
