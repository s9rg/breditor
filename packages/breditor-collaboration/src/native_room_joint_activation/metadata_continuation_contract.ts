/** Joint actions deliberately have no caller-supplied origin slot. */
import type {MetadataContinuationInspectionInput,MetadataContinuationInput} from '../selected_local_metadata_continuation/coordinator.js';
export type JointMetadataContinuationInspectionInput=Omit<MetadataContinuationInspectionInput,'origin'>;
export type JointMetadataContinuationInput=Omit<MetadataContinuationInput,'origin'>;
