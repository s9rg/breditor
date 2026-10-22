/** Snapshot fresh readonly replay factories and independently selected original
 * before callbacks. Storage/lock context is captured by the actual opener. */
import type {SharedSelectionPolicy} from '../types.js';
import type {AssetLimits} from '@breditor/experimental-rich-content';
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import type {SharedIndependentParticipantSelection} from '../independent_participant/contract.js';
import type {SharedIndependentParticipantBackup} from '../independent_participant/backup.js';
import {independentParticipantSelection} from '../independent_participant/policy.js';
import {snapshotIndependentRecoveryFactory} from '../independent_recovery/factory_policy.js';
import {independentRecoverySignal} from '../independent_recovery/signal.js';
import {independentRecoveryName} from '../independent_recovery/policy.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {requireBackupRecovery} from '../backups/identity.js';
import {checkAssetBytesSignal} from '../asset_bytes/guards.js';
import {SharedIndependentParticipantBackup as Backup} from '../independent_participant/backup.js';
import {localJournalFailure as fail} from './journal_failure.js';
export interface LocalOperationJournalResumeOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>{readonly database:string;readonly sourceDatabase:string;readonly expected:SharedIndependentParticipantSelection;readonly session:SharedIndependentRecoveryFactory<P>;readonly checkAuthority:()=>void;readonly writerRecovery:'host-reacquired';readonly signal?:AbortSignal;readonly limits?:Partial<AssetLimits>}
export interface LocalOperationJournalBeginOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends LocalOperationJournalResumeOptions<P>{readonly backup:SharedIndependentParticipantBackup}
const readFile=Backup.prototype.file;
export function snapshotLocalJournal<P extends SharedSelectionPolicy>(provided:LocalOperationJournalResumeOptions<P>,begin:boolean){
 if(!provided||typeof provided!=='object')throw fail('independent_local_operation_policy');const input={...provided},required=['database','sourceDatabase','expected','session','checkAuthority','writerRecovery',...(begin?['backup']:[])],allowed=[...required,'signal','limits'];if(required.some(key=>!Object.hasOwn(input,key))||Object.keys(input).some(key=>!allowed.includes(key)))throw fail('independent_local_operation_policy');requireBackupRecovery(input.writerRecovery);const database=independentRecoveryName(input.database),sourceDatabase=independentRecoveryName(input.sourceDatabase);if(database===sourceDatabase)throw fail('independent_local_operation_policy');const expected=independentParticipantSelection(input.expected),session=snapshotIndependentRecoveryFactory(expected,input.session),authority=participantAuthority(input.checkAuthority),signal=independentRecoverySignal(input.signal),limits=checkRichAssetLimits(input.limits),file=begin?readFile.call((input as LocalOperationJournalBeginOptions<P>).backup):undefined;return{database,sourceDatabase,expected,session,signal,limits,file,guard(){checkAssetBytesSignal(signal);authority();checkAssetBytesSignal(signal);}};
}
