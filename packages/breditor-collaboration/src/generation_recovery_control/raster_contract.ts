/** Immutable raster DATA from the selected inactive or active recovery host.
 * No mapping resolution, queue settlement, cache write or service activation. */
import type {SharedServerLogGenerationRecoveryControlSelection} from './contract.js';
import type {SharedServerLogGenerationRecoveryAssetInfo} from './asset_contract.js';
export const MAX_SERVER_GENERATION_RECOVERY_RASTER_REQUEST_BYTES=64*1024;
export const MAX_SERVER_GENERATION_RECOVERY_RASTER_RESPONSE_BYTES=16*1024*1024;
export const MAX_SERVER_GENERATION_RECOVERY_RASTER_BYTES=10*1024*1024;
export interface SharedServerLogGenerationRecoveryRasterRead {
 readonly format:'breditor/server-log-generation-recovery-raster-read';readonly formatVersion:1;
 readonly selection:SharedServerLogGenerationRecoveryControlSelection;
 readonly requestSha256:string;readonly scope:'selected-server-stored-raster-bytes';
 /** Null is an absent file, never a proof of complete recovery. A known corrupt file refuses. */
 readonly raster:Readonly<{info:SharedServerLogGenerationRecoveryAssetInfo;blob:Blob}>|null;
}
