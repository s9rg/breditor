/** Distinct current source policy and read-only archive validation. No synthetic recovery
 * owner/plan or saved grant is used to select the actual writable source factory. */
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import {snapshotIndependentDeliveryFactory} from '../independent_delivery_recovery/factory_policy.js';
import {operationBackupSelection} from '../independent_operation/portable_identity.js';
import {operationDatabaseName} from '../independent_operation/journal_identity.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {checkAssetBytesSignal} from '../asset_bytes/guards.js';
import {operationJournalFailure as fail} from '../independent_operation/journal_failure.js';
import type {RestoredOperationInputOptions} from './input.js';
export function restoredOperationPolicy<P extends SharedSelectionPolicy>(input:RestoredOperationInputOptions<P>){
 if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['kind','expected','database','sourceDatabase','writerRecovery','session','checkAuthority','signal','limits'].includes(k))||!['snapshot-v1','lineage-v1'].includes(input.kind)||input.writerRecovery!=='host-reacquired')throw fail('restored_operation_policy');
 const expected=operationBackupSelection(input.expected),database=operationDatabaseName(input.database),sourceDatabase=operationDatabaseName(input.sourceDatabase);if(database===sourceDatabase)throw fail('restored_operation_policy');
 const session=snapshotIndependentDeliveryFactory(expected.original,input.session,false),authority=participantAuthority(input.checkAuthority),signal=input.signal,limits=checkRichAssetLimits(input.limits),guard=()=>{checkAssetBytesSignal(signal);authority();checkAssetBytesSignal(signal);};guard();
 const options={kind:input.kind,expected,database,sourceDatabase,writerRecovery:'host-reacquired' as const,session,checkAuthority:authority,...(signal?{signal}:{}),limits};
 return{options,guard,read:{session:{...session,readOnly:true,review:{...session.review,access:'read_only' as const}},checkAuthority:guard,...(signal?{signal}:{}),limits}};
}
