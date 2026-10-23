/** Nominal V3 owners and explicitly separate local/delivery file identities.
 * These private imports qualify distribution, not new package-root API. */
import * as api from '../../../packages/breditor-collaboration/dist/index.js';
import {PhysicalRoomCatalogV3Archive} from '../../../packages/breditor-collaboration/dist/physical_room_catalog_v3/archive.js';
import {PhysicalRoomCatalogV3} from '../../../packages/breditor-collaboration/dist/physical_room_catalog_v3/catalog.js';
import type {PhysicalRoomCatalogV3Input,PhysicalRoomCatalogV3LocalPolicy,PhysicalRoomCatalogV3Source,PhysicalRoomCatalogV3Metadata} from '../../../packages/breditor-collaboration/dist/physical_room_catalog_v3/contract.js';
import type {PhysicalRoomCatalogV2Input,PhysicalRoomCatalogV2Metadata} from '../../../packages/breditor-collaboration/dist/physical_room_catalog_v2/contract.js';
import type {LocalOperationBackupSelection} from '../../../packages/breditor-collaboration/dist/independent_local_operation/portable_contract.js';
import type {LocalOperationReadOptions} from '../../../packages/breditor-collaboration/dist/independent_local_operation/portable_policy.js';
import type {IndependentOperationBackupSelection} from '../../../packages/breditor-collaboration/dist/independent_operation/portable_contract.js';
import type {NativeInputIncomingSourceCapture} from '../../../packages/breditor-collaboration/dist/native_input_operation/incoming_source.js';
import type {SharedAssetReferenceCapture} from '../../../packages/breditor-collaboration/dist/asset_references_capture.js';
declare const local:LocalOperationBackupSelection,delivery:IndependentOperationBackupSelection,file:Blob,read:LocalOperationReadOptions,capture:NativeInputIncomingSourceCapture,original:SharedAssetReferenceCapture,metadata:PhysicalRoomCatalogV3Metadata;
const snapshot:PhysicalRoomCatalogV3Input={id:'snapshot',family:'local-operation-snapshot',expected:local,file};
const flat:PhysicalRoomCatalogV3Input={id:'flat',family:'local-operation-flat',expected:local,file};
const policy:PhysicalRoomCatalogV3LocalPolicy={id:'flat',family:'local-operation-flat',original:local.original,options:read};
const source:PhysicalRoomCatalogV3Source={id:'flat',family:'local-operation-flat',source:capture};
void [snapshot,flat,policy,source];
// @ts-expect-error The five-family contract is closed to both new local kinds.
const oldInput:PhysicalRoomCatalogV2Input=snapshot;
// @ts-expect-error Local original history is not delivery-bound original identity.
const wrongDelivery:PhysicalRoomCatalogV3Input={id:'bad',family:'restored-graph',expected:local,file};
// @ts-expect-error A delivery graph cannot be relabelled as a local flat file.
const wrongLocal:PhysicalRoomCatalogV3Input={id:'bad',family:'local-operation-flat',expected:delivery,file};
// @ts-expect-error An original capture does not own an incoming-source read scope.
const wrongSource:PhysicalRoomCatalogV3Source={id:'bad',family:'local-operation-flat',source:original};
// @ts-expect-error Native input capture does not become an original-family capture.
const wrongOriginal:PhysicalRoomCatalogV3Source={id:'bad',family:'original',source:capture};
// @ts-expect-error V3 metadata cannot be stored under the existing version-two protocol.
const wrongVersion:PhysicalRoomCatalogV2Metadata=metadata;
// @ts-expect-error The actual archive constructor is private.
new PhysicalRoomCatalogV3Archive({},{});
// @ts-expect-error The actual catalog constructor is private.
new PhysicalRoomCatalogV3({},{});
// @ts-expect-error A prototype/metadata descriptor is not a nominal archive owner.
const fakeArchive:PhysicalRoomCatalogV3Archive={};
// @ts-expect-error No V3 catalog is promoted through the package root.
api.PhysicalRoomCatalogV3;
// @ts-expect-error No V3 archive is promoted through the package root.
api.PhysicalRoomCatalogV3Archive;
// @ts-expect-error Native final witnesses remain private implementation details.
api.capturedNativeHistoryFinalCheck;
void [oldInput,wrongDelivery,wrongLocal,wrongSource,wrongOriginal,wrongVersion,fakeArchive];
