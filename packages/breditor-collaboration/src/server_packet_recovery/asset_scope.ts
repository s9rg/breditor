/** Private raster IO input. Structural requirements do not relabel an older
 * closure or claim current cache, queue, receipt or Native ownership. */
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
export interface ServerPacketAssetRequirements {
 readonly outcome:Readonly<{kind:'ready';references:readonly RichRetainedAssetReference[]}>|Readonly<{kind:'pending'}>;
}
