
import {SelectedNativeDeliveryJournal as Journal} from '../../../packages/breditor-collaboration/dist/selected_delivery_journal/coordinator.js';
import type {DeliveryJournalResumeInput,DeliveryJournalResumeChoice} from '../../../packages/breditor-collaboration/dist/selected_delivery_journal/resume_contract.js';
import type {SelectedNativeRecoveryScope} from '../../../packages/breditor-collaboration/dist/selected_native_recovery/contract.js';
import {resumePreparedSelectedNativeDelivery} from '../../../packages/breditor-collaboration/dist/selected_delivery_preparation/coordinator.js';
declare const scope:SelectedNativeRecoveryScope,input:DeliveryJournalResumeInput,choice:DeliveryJournalResumeChoice;
const pending:Promise<Journal>=Journal.resume(scope,input);void pending;
// @ts-expect-error a detached choice is not a runtime native/source admission
void resumePreparedSelectedNativeDelivery(scope,choice);
// @ts-expect-error saved pins do not provide fresh operator hosts/approval
void Journal.resume(scope,{identity:choice.journal,expected:choice});
// @ts-expect-error independently selected pins are deeply readonly
choice.head.sequence=3;
// @ts-expect-error opening is asynchronous and must finish before construction
pending.createDelivery({},'comment');
