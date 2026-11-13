import {inheritActorLeaseInput} from '../persistence/actor_lease_input.js';
/** Snapshot explicit host factories/policy before awaiting; historical identity grants nothing. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentDeliveryOptions,SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
import {makeIndependentHistoryCut} from '../independent_history/cut.js';
import {IndependentDeliveryCompanion} from '../independent_delivery/companion.js';
import {generationFields,freezeGeneration} from '../generation_source/identity.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {checkAssetBytesSignal} from '../asset_bytes/guards.js';
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {independentDeliveryParticipantSelection} from '../independent_delivery_participant/policy.js';
import {checkIndependentDeliveryRecords} from '../independent_delivery_source/records.js';
import {deliveryRecoveryArchive as archive} from './archive.js';
import {independentDeliveryRecoveryFailure as fail,independentDeliveryRecoveryName as name} from './policy.js';
import type {SharedIndependentDeliveryParticipantResumeOptions} from './contract.js';
import {snapshotIndependentDeliveryFactory} from './factory_policy.js';
import type {IndependentDeliveryRecoveryRecord} from './record.js';
const missing=()=>{throw fail('independent_delivery_recovery_missing');};
export function snapshotIndependentDeliveryRecovery<P extends SharedSelectionPolicy>(provided:SharedIndependentDeliveryParticipantResumeOptions<P>,begin:boolean,requireReadOnly=true){
 if(!provided||typeof provided!=='object'||Object.keys(provided).some(k=>!['database','expected','destinations','session','checkAuthority','signal','limits',...(begin?['backup']:[])].includes(k)))throw fail('independent_delivery_recovery_policy');
 const input={...provided},database=name(input.database),expected=independentDeliveryParticipantSelection(input.expected),d=input.destinations;if(!generationFields(d,'source,uploads'))throw fail('independent_delivery_recovery_policy');const destinations=freezeGeneration({source:name(d.source),uploads:name(d.uploads)});if(new Set([database,...Object.values(destinations)]).size!==3)throw fail('independent_delivery_recovery_policy');
 const session=snapshotIndependentDeliveryFactory(expected,input.session,requireReadOnly);
 const authority=participantAuthority(input.checkAuthority),options={database,expected,destinations,session,checkAuthority:input.checkAuthority,...(input.signal?{signal:input.signal}:{}),limits:checkRichAssetLimits(input.limits)},guard=()=>{checkAssetBytesSignal(options.signal);authority();checkAssetBytesSignal(options.signal);};guard();
 const plan=JSON.stringify({format:'breditor/shared-independent-delivery-participant-plan',formatVersion:1,expected,destinations});if(new TextEncoder().encode(plan).length>128*1024)throw fail('independent_delivery_recovery_policy');
 const record:IndependentDeliveryRecoveryRecord={format:'breditor/shared-independent-delivery-participant-recovery',formatVersion:1,plan,phase:'preparing',source:'reserved',uploads:'reserved'};return{options,guard,record};
}
export async function prepareIndependentDeliveryRecovery<P extends SharedSelectionPolicy>(base:ReturnType<typeof snapshotIndependentDeliveryRecovery<P>>,file:Blob){
 const {options,guard,record}=base;guard();let backup:Awaited<ReturnType<typeof archive.read>>|undefined,complete=false;
 try{backup=await archive.read(file,options.expected,{limits:options.limits,...(options.signal?{signal:options.signal}:{})});guard();const recovery=await checkIndependentDeliveryRecords(options.expected.identity.source,archive.records.call(backup));guard();const factory=inheritActorLeaseInput(options.session,{...options.session,database:options.destinations.source,create:missing}) as SharedIndependentDeliveryOptions<P>;const {companion,cut}=await makeDeliveryRecoveryCut(factory,recovery,guard);complete=true;return{options,guard,record,backup,recovery,cut,companion,factory};}
 finally{if(!complete&&backup)archive.dispose.call(backup);}
}
export type PreparedIndependentDeliveryRecovery<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Awaited<ReturnType<typeof prepareIndependentDeliveryRecovery<P>>>;

/** Encode the unchanged native pair together with the actual delivery companion. */
export async function makeDeliveryRecoveryCut<P extends SharedSelectionPolicy>(
 factory:SharedIndependentDeliveryOptions<P>,recovery:SharedIndependentDeliveryRecovery,guard:()=>void,
){
 const companion=new IndependentDeliveryCompanion(factory,recovery);
 const {documentCheckpoint,reviewCheckpoint,identity,versions}=recovery.source;
 const native=await makeIndependentHistoryCut(documentCheckpoint,reviewCheckpoint,identity,versions);
 guard();
 return {companion,cut:{head:companion.wrap(JSON.parse(native.head),companion.capture()),files:native.files}};
}
