/** Original V2 inventory family remains explicit; only component preparation is shared. */
import {prepareMixedCatalogStage,type MixedCatalogStagePolicy} from "../mixed_catalog_stage/prepare.js";
import {MAX_CATALOG_V2_PLAN_BYTES} from "./record.js";
import type {CatalogV2ArchiveState} from "./archive.js";
import type {SharedRoomRecoveryCatalogV2Participant} from "./contract.js";
export {snapshotMixedCatalogParticipant as snapshotCatalogV2Participant} from "../mixed_catalog_stage/prepare.js";
export type V2StagedPolicy=MixedCatalogStagePolicy;
export function prepareCatalogV2Stage(input:readonly SharedRoomRecoveryCatalogV2Participant[],state:CatalogV2ArchiveState,database:string,guard:()=>void,signal?:AbortSignal):Promise<{plan:string;policies:V2StagedPolicy[]}>{
 return prepareMixedCatalogStage(input,state.participants,state.inventory.metadata(),[database],MAX_CATALOG_V2_PLAN_BYTES,guard,signal);
}
