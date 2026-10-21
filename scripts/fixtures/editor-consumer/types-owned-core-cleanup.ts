/** Public terminal operations keep their types; retained UI metadata is not live native custody. */
import {SharedRichEditor,SharedReviewPersistentSession,SharedIndependentHistoryPersistentSession,type SharedReviewSaveState,type SharedIndependentHistorySaveState,type SharedRustOwner} from '@breditor/collaboration';
declare const raw:SharedRustOwner,paired:SharedReviewPersistentSession<'document-v1'>,independent:SharedIndependentHistoryPersistentSession<'document-v1'>;
const core=new SharedRichEditor(raw);core.dispose();const terminal:void=core.retire();void terminal;
const pairedState:SharedReviewSaveState=paired.state(),independentState:SharedIndependentHistorySaveState=independent.state();void pairedState;void independentState;
const a:Promise<void>=paired.discardAndClose(),b:Promise<void>=independent.discardAndClose();await a;await b;
// @ts-expect-error owning cores remain read-only bindings, not replacement slots
paired.core=core;
// @ts-expect-error status metadata cannot be supplied as a native checkpoint or live source
independent.core.checkpointJson(independentState);
// @ts-expect-error canonical terminal ownership helpers remain internal
import {retireOwnedCore} from '@breditor/collaboration';
// @ts-expect-error retained publication clocks remain internal metadata, not public native proof
import {managedCoreRetainedRevisions} from '@breditor/collaboration';
void retireOwnedCore;void managedCoreRetainedRevisions;
