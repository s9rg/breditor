/** Exact closed formats and native selection policies; no structural owner DTOs. */
import {NativeInputJournal} from '../../../packages/breditor-collaboration/dist/native_input_operation/journal_kernel.js';
import {flatLocalJournalFamily,restoredLocalJournalFamily} from '../../../packages/breditor-collaboration/dist/native_input_operation/journal_families.js';
import {FlatLocalOperationJournal,flatLocalJournalBinding} from '../../../packages/breditor-collaboration/dist/flat_local_operation/journal.js';
import {openFlatLocalHistory} from '../../../packages/breditor-collaboration/dist/flat_local_operation/open_source.js';
import {NativeInputParticipantWitness} from '../../../packages/breditor-collaboration/dist/native_input_operation/participant_witness.js';
import {DetachedFlatLocalInput} from '../../../packages/breditor-collaboration/dist/flat_local_operation/input.js';
import {FlatLocalArchive} from '../../../packages/breditor-collaboration/dist/flat_local_operation/archive.js';
import {FlatLocalProvenance} from '../../../packages/breditor-collaboration/dist/flat_local_operation/framing.js';
import type {FlatLocalInputOptions} from '../../../packages/breditor-collaboration/dist/flat_local_operation/policy.js';
import type {SharedIndependentHistorySessionOptions,SharedIndependentHistoryPersistentSession} from '@breditor/collaboration';
declare const options:FlatLocalInputOptions<'document-v1'>,file:Blob,sourceOptions:SharedIndependentHistorySessionOptions<'document-v1'>,provenance:FlatLocalProvenance,archive:FlatLocalArchive;
const journal:FlatLocalOperationJournal=await NativeInputJournal.open(flatLocalJournalFamily,options);
const session:SharedIndependentHistoryPersistentSession<'document-v1'>=await openFlatLocalHistory(sourceOptions,journal);
const view:'breditor/shared-document-view'=session.core.view().format;
void view;
const scope=flatLocalJournalBinding(journal).borrowRead(session,()=>{});
try{const snapshot=await scope.readSnapshot();const exact:'breditor/shared-flat-local-input-intent'=snapshot.record.format;void exact;}finally{scope.release();}
// @ts-expect-error The snapshot family cannot adopt a flat input choice.
NativeInputJournal.open(restoredLocalJournalFamily,options);
// @ts-expect-error The flat family cannot widen its kind through caller inference.
NativeInputJournal.open(flatLocalJournalFamily,{...options,kind:'snapshot-v1'});
// @ts-expect-error An ordinary descriptor is not a private native facade.
openFlatLocalHistory(sourceOptions,{ready:true});
// @ts-expect-error Literal provenance is data, not executable source ownership.
openFlatLocalHistory(sourceOptions,provenance);
// @ts-expect-error A file archive cannot grant source ownership either.
openFlatLocalHistory(sourceOptions,archive);
// @ts-expect-error No caller may construct an admitted native input owner.
new DetachedFlatLocalInput({ready:true});
// @ts-expect-error A complete handoff witness is privately constructed.
new NativeInputParticipantWitness({ready:true});
// @ts-expect-error Exact native selection policy survives the writable source opener.
const wrong:SharedIndependentHistoryPersistentSession<'original'>=session;
void wrong;
