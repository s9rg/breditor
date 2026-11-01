
/** Complete server Native knowledge, not client custody, provider bytes or activation. */
import type {SharedServerLogGenerationBackupIdentity} from '../server_generation_inventory/contract.js';
import type {SharedPacketAssetIdentity} from '../packet_asset_references.js';
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
export const MAX_SERVER_NATIVE_DEPENDENCY_RESPONSE_BYTES=16*1024*1024;
export const MAX_SERVER_NATIVE_DEPENDENCY_ITEMS=100000;
export interface ServerNativePacketSource {readonly sequence:string;readonly packet:SharedPacketAssetIdentity}
export interface ServerNativeDependencyInventory {
 readonly format:'breditor/server-log-generation-asset-references';readonly formatVersion:1;
 readonly source:SharedServerLogGenerationBackupIdentity;
 readonly scope:'native-causal-and-complete-physical-generation-packets';
 readonly sources:readonly ServerNativePacketSource[];
 readonly outcome:Readonly<{kind:'ready';references:readonly RichRetainedAssetReference[]}>|Readonly<{kind:'pending';packets:readonly Readonly<{source:ServerNativePacketSource;missing:readonly Readonly<{writer:string;counter:string}>[]}>[]}>;
}
export interface SelectedServerNativeDependencies<S> {
 readonly format:'breditor/server-log-generation-recovery-native-dependencies-read'|'breditor/physical-room-recovery-native-dependencies-read';readonly formatVersion:1;
 readonly selection:S;readonly requestSha256:string;
 readonly scope:'selected-server-native-causal-and-complete-physical-packet-dependencies';
 readonly native:ServerNativeDependencyInventory;
}
