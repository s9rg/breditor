import {SharedPhysicalRoomRecoveryHost,type SharedPhysicalRecoveryControlSelection,type SharedPhysicalRecoveryAssetRequirements,type SharedPhysicalRecoveryAssetRead,type SharedPhysicalRoomClientOperation,type SharedPhysicalRoomNativeAssetsCheck,MAX_PHYSICAL_RECOVERY_ASSET_BYTES,MAX_PHYSICAL_RECOVERY_ASSET_REQUIREMENTS} from '@breditor/collaboration';
declare const expected:SharedPhysicalRecoveryControlSelection,operation:SharedPhysicalRoomClientOperation,host:SharedPhysicalRoomRecoveryHost;
const requirements:SharedPhysicalRecoveryAssetRequirements={references:[{asset:'opaque',generation:'exact-generation'}],uploads:['sha256:'+'a'.repeat(64)]};
const check:Promise<SharedPhysicalRecoveryAssetRead>=host.checkAssets(requirements);
const joint:Promise<SharedPhysicalRoomNativeAssetsCheck>=operation.checkNativeAssets(host);
void [check,joint,MAX_PHYSICAL_RECOVERY_ASSET_BYTES,MAX_PHYSICAL_RECOVERY_ASSET_REQUIREMENTS];
// @ts-expect-error A binding has its exact native generation; content-only uploads are separate.
host.checkAssets({references:[{asset:'opaque'}],uploads:[]});
// @ts-expect-error Detached metadata cannot supply the genuine branded native checker.
operation.checkNativeAssets(expected);
// @ts-expect-error A provider read cannot promote queue state or grant an upload receipt.
joint.then(result=>result.assets.uploads[0]!.records[0]!.status='uploaded');
// @ts-expect-error No activation or transfer capability is exposed.
joint.then(result=>result.activate());
// @ts-expect-error Read metadata and requirements are immutable.
requirements.references.push({asset:'other',generation:'g'});
