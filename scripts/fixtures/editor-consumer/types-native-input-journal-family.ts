/** Private positive declarations and closed-family negative contracts. */
import {NativeInputJournal, nativeInputJournalBinding} from '../../../packages/breditor-collaboration/dist/native_input_operation/journal_kernel.js';
import {NativeInputJournalFamily,restoredLocalJournalFamily} from '../../../packages/breditor-collaboration/dist/native_input_operation/journal_families.js';
import {RestoredLocalOperationJournal,createRestoredLocalJournalFacade,restoredLocalJournalBinding} from '../../../packages/breditor-collaboration/dist/restored_local_operation/journal.js';
import type {RestoredLocalInputOptions} from '../../../packages/breditor-collaboration/dist/restored_local_operation/policy.js';
declare const options:RestoredLocalInputOptions;
const ready:Promise<RestoredLocalOperationJournal>=NativeInputJournal.open(restoredLocalJournalFamily,options);
void ready;
// @ts-expect-error The intrinsic family constructor is closed.
new NativeInputJournalFamily({},{});
// @ts-expect-error The actual kernel constructor is closed.
new NativeInputJournal({});
// @ts-expect-error A structural descriptor is not an intrinsic family.
NativeInputJournal.open({kind:'snapshot-v1'},options);
// @ts-expect-error Snapshot entry points cannot select another format kind.
NativeInputJournal.open(restoredLocalJournalFamily,{...options,kind:'flat-graph-v1'});
// @ts-expect-error A ready-shaped descriptor is not an actual kernel.
createRestoredLocalJournalFacade({ready:true});
// @ts-expect-error A structural facade cannot borrow actual kernel custody.
nativeInputJournalBinding({},{});
declare const journal:RestoredLocalOperationJournal;
async function exactIntent(){const scope=restoredLocalJournalBinding(journal).borrowRead({},()=>{});try{const snapshot=await scope.readSnapshot();const exact:'breditor/shared-restored-local-operation-cut-intent'=snapshot.record.format;return exact;}finally{scope.release();}}
void exactIntent;
