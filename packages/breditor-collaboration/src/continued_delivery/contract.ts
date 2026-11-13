import type {ContinuedPairRecordRead} from '../continued_pair/read_records.js';
import type {SharedContinuedPairOptions,SharedContinuedPairRecovery} from '../continued_pair/contract.js';
import type {SharedIndependentDeliveryOptions} from '../independent_delivery/contract.js';
import type {SharedSegmentedRelayProgress} from '../segmented_relay/contract.js';
import type {SharedSegmentedRetainedBinding,SegmentedRetainedRecords} from '../segmented_relay/retained_contract.js';
import type {SharedSelectionPolicy} from '../types.js';

export type SharedContinuedDeliveryOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=
 SharedContinuedPairOptions<P>&Pick<SharedIndependentDeliveryOptions<P>,'binding'|'retained'>;

export interface SharedContinuedDeliveryRecovery {
 readonly format:'breditor/shared-continued-delivery-recovery';
 readonly formatVersion:1;
 readonly source:SharedContinuedPairRecovery;
 readonly relay:SharedSegmentedRelayProgress;
 readonly retainedBinding:SharedSegmentedRetainedBinding;
 readonly retained:SegmentedRetainedRecords;
}

/** Exact delivery state for each slot held by one paired storage observation. */
export interface ContinuedDeliveryRecords {
 readonly format:'breditor/persistent-continued-delivery-record-read';
 readonly formatVersion:1;
 readonly scope:'atomic-continued-delivery-committed-attempt-pending-live';
 readonly committed:Readonly<{head:string;recovery:SharedContinuedDeliveryRecovery}>;
 readonly attempt:Readonly<{capture:SharedContinuedDeliveryRecovery;preparedHead:string|null}>|null;
 readonly pending:SharedContinuedDeliveryRecovery|null;
 readonly live:SharedContinuedDeliveryRecovery;
}

export type ContinuedDeliveryRecordRead=ContinuedPairRecordRead<ContinuedDeliveryRecords>;
