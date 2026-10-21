// Archival capability is not a permission grant or an implicit old-store migration.
import {SharedRichEditor,SharedSegmentedPersistentSession,SharedSegmentedRelaySession} from '@breditor/collaboration';
import {SharedEditorOwner,SharedObservation} from '@breditor/collaboration/wasm';
declare const core:SharedRichEditor<'document-v1'>;
declare const session:SharedSegmentedPersistentSession<'document-v1'>;
declare const relay:SharedSegmentedRelaySession<'document-v1'>;
declare const owner:SharedEditorOwner;
declare const observed:SharedObservation;
const supported:boolean=core.supportsReadOnlyHistoryLifecycle();
core.enableReadOnlySegmentedHistory('root','active');
core.sealReadOnlyHistoryGeneration('next');
const saved:Promise<void>=session.sealReadOnlyGeneration('next');
const relayed:Promise<void>=relay.sealReadOnlyGeneration('next');
const documentVersion:string=owner.read_only_history_lifecycle_version();
const reviewVersion:string=owner.read_only_review_history_lifecycle_version();
owner.enable_read_only_segmented_history(observed,'root','active');
owner.seal_read_only_history_segment(observed,'next');
owner.enable_read_only_review_history_generations(observed,'root','active');
owner.seal_read_only_review_history_generation(observed,'next');
// @ts-expect-error Generation identities are exact strings, not lossy counters.
core.enableReadOnlySegmentedHistory(1,2);
// @ts-expect-error Retained JSON cannot manufacture a live native observation.
owner.seal_read_only_review_history_generation('serialized observation','next');
// @ts-expect-error An archive boundary is not a way to select a current role.
session.sealReadOnlyGeneration('next',{readOnly:false});
void[supported,saved,relayed,documentVersion,reviewVersion];
