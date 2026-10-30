/** Dependency DATA only. No upload, database, provider grant or activation is
 * created by these records. Pending never contains a partial ready reference set. */
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import type {SharedAssetCapturePending} from '../asset_references_capture.js';
import type {SharedPacketAssetIdentity} from '../packet_asset_references.js';
export interface LocalMetadataRecordAssetReferences {
 readonly format:'breditor/local-metadata-record-asset-references';
 readonly formatVersion:1;
 readonly scope:'native-histories-source-versions-and-exact-local-metadata-packets';
 readonly state:Readonly<{revision:number;bytes:number;sha256:string}>;
 readonly lane:string;
 readonly document:string;
 readonly nativeRevision:string;
 readonly packets:readonly SharedPacketAssetIdentity[];
 readonly outcome:
  |Readonly<{kind:'ready';references:readonly RichRetainedAssetReference[]}>
  |Readonly<{kind:'pending';pending:readonly SharedAssetCapturePending[]}>;
}
