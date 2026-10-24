/** Explicit readonly factories for SDK-selected genuine children. This is not
 * a source selector, current provider coverage, server grant or activation. */
import type {SharedSelectionPolicy} from '../types.js';
import type {CompleteHistoryParticipant,CompleteOperationalHistoryMetadata} from '../complete_operation_cohort/history_read.js';
import type {PhysicalRoomCatalogV3Selection} from '../physical_room_catalog_v3/contract.js';
export interface PhysicalOperationV3HistoryReadOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>{readonly reads:readonly Readonly<{id:string;read:CompleteHistoryParticipant<P>['read']}>[];readonly checkAuthority:()=>void;readonly signal?:AbortSignal}
export interface PhysicalOperationV3HistoryRead{
 readonly format:'breditor/physical-operation-v3-history-read';readonly formatVersion:1;
 readonly scope:'held-client-history-and-retained-catalog-bytes';
 readonly selection:PhysicalRoomCatalogV3Selection;
 readonly catalogFilesVerified:number;
 readonly history:CompleteOperationalHistoryMetadata;
 readonly unreconciledParticipants:readonly string[];
}
