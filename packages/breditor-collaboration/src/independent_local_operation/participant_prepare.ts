/** Snapshot all host factories and names before reservation, without calling
 * authority. Lifetime policy never captures parent closed/retired recovery state. */
import type {SharedSelectionPolicy} from '../types.js';
import {recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {snapshotIndependentRecovery} from '../independent_recovery/prepare.js';
import {independentRecoveryName} from '../independent_recovery/policy.js';
import {requireBackupRecovery} from '../backups/identity.js';
import {snapshotLocalOperationFactory} from './factory_policy.js';
import {independentDeliveryCompanion} from '../independent_history/driver.js';
import {selectedLocalOperationDriver} from '../independent_history/local_driver.js';
import {independentBootstrapPolicy,independentBootstrapSignal} from '../independent_history/bootstrap_policy.js';
import {independentLocalHistoryCapturePolicy} from './source_policy.js';
import {localJournalFailure as fail} from './journal_failure.js';
import type {LocalOperationParticipantOptions,LocalOperationParticipantBeginOptions} from './participant_contract.js';
export function snapshotLocalParticipant<P extends SharedSelectionPolicy>(provided:LocalOperationParticipantOptions<P>|LocalOperationParticipantBeginOptions<P>,begin:boolean){
 const context=recoveryOpeningContext(),locks=navigator.locks;
 if(!provided||typeof provided!=='object')throw fail('independent_local_participant_policy');const input={...provided},fields=['database','journalDatabase','sourceDatabase','recovery','session','writerRecovery',...(begin?['recovered']:[])];
 if(fields.some(key=>!Object.hasOwn(input,key))||Object.keys(input).some(key=>!fields.includes(key)))throw fail('independent_local_participant_policy');requireBackupRecovery(input.writerRecovery);
 const recovery={...input.recovery};for(const factory of [input.session,recovery.session])if(factory&&typeof factory==='object'&&(independentDeliveryCompanion(factory)||selectedLocalOperationDriver(factory)||independentLocalHistoryCapturePolicy(factory)||independentBootstrapPolicy(factory)||independentBootstrapSignal(factory)))throw fail('independent_local_participant_policy');
 const database=independentRecoveryName(input.database),journalDatabase=independentRecoveryName(input.journalDatabase),sourceDatabase=independentRecoveryName(input.sourceDatabase),base=snapshotIndependentRecovery(recovery,false),session=snapshotLocalOperationFactory(base.options.expected,input.session);
 const names=Object.freeze([database,journalDatabase,sourceDatabase,base.options.database,...Object.values(base.options.destinations)].sort());if(new Set(names).size!==6||session.database!==sourceDatabase)throw fail('independent_local_participant_policy');
 const life={changed:false},current=()=>{if(globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw fail('independent_local_participant_storage_changed');},lifetime=()=>{current();base.guard();current();},guard=()=>{if(life.changed)throw fail('independent_local_participant_storage_changed');lifetime();if(life.changed)throw fail('independent_local_participant_storage_changed');};
 const readCurrent=()=>{if(life.changed)throw fail('independent_local_participant_storage_changed');current();};
 return{database,journalDatabase,sourceDatabase,context,names,session,life,lifetime,guard,readCurrent,base:{...base,guard},recovered:begin?(input as LocalOperationParticipantBeginOptions<P>).recovered:undefined};
}
export type LocalParticipantChoice<P extends SharedSelectionPolicy=SharedSelectionPolicy>=ReturnType<typeof snapshotLocalParticipant<P>>;
