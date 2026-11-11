/** The handover family retains the complete sealed path with the original
 * continuation pins. Its parsed value is data for inspection and storage. */
import type {SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection} from '../generation_delivery_path_control/handover.js';
import type {SharedServerLogGenerationDeliveryPathRecoveryHost} from '../generation_delivery_path_control/host.js';
import type {MetadataContinuationChoice,MetadataContinuationResult} from './contract.js';
import type {MetadataContinuationInspectionInput} from './inputs.js';

export interface HandoverMetadataContinuationChoice {
 readonly format:'breditor/selected-local-metadata-continuation-across-handover';
 readonly formatVersion:1;
 readonly continuation:MetadataContinuationChoice;
 readonly handover:SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection;
}

export interface HandoverMetadataContinuationInspectionInput extends Omit<MetadataContinuationInspectionInput,'host'> {
 readonly path:SharedServerLogGenerationDeliveryPathRecoveryHost;
}

export interface HandoverMetadataContinuationInput extends HandoverMetadataContinuationInspectionInput {
 readonly expected:HandoverMetadataContinuationChoice;
 readonly approve:(choice:HandoverMetadataContinuationChoice)=>boolean|Promise<boolean>;
}

export interface HandoverMetadataContinuationResult extends Omit<MetadataContinuationResult,'format'|'choice'> {
 readonly format:'breditor/selected-local-metadata-continued-across-handover';
 readonly choice:HandoverMetadataContinuationChoice;
}
