import type * as root from '@breditor/collaboration';
import {PhysicalRoomCatalogV2Archive} from '../../../packages/breditor-collaboration/dist/physical_room_catalog_v2/archive.js';
import {PhysicalRoomCatalogV2} from '../../../packages/breditor-collaboration/dist/physical_room_catalog_v2/catalog.js';
import type {PhysicalRoomCatalogV2CaptureOptions,PhysicalRoomCatalogV2Source,PhysicalRoomCatalogV2GraphPolicy} from '../../../packages/breditor-collaboration/dist/physical_room_catalog_v2/contract.js';
declare const input:PhysicalRoomCatalogV2CaptureOptions;
declare const archive:PhysicalRoomCatalogV2Archive;
declare const catalog:PhysicalRoomCatalogV2;
declare const source:PhysicalRoomCatalogV2Source;
declare const policy:PhysicalRoomCatalogV2GraphPolicy;
void PhysicalRoomCatalogV2Archive.capture({...input,graphPolicies:[policy]});
void archive.checkSources([source]);void catalog.checkSources([source]);
// @ts-expect-error Private data admission is not a public room API.
type PublicCatalog=root.PhysicalRoomCatalogV2;
// @ts-expect-error A detached manifest cannot construct an owner.
new PhysicalRoomCatalogV2({});
// @ts-expect-error A detached manifest cannot construct its admitted archive.
new PhysicalRoomCatalogV2Archive({});
// @ts-expect-error No editable participant handoff belongs to this data catalog.
catalog.intoParts();
// @ts-expect-error Data admission does not activate a server.
catalog.activate();
// @ts-expect-error Ready flags cannot supply a native source capture.
archive.checkSources([{id:'fake',family:'restored-graph',source:{ready:true}}]);
// @ts-expect-error Graph factories and the independently selected original are explicit.
const discovered:PhysicalRoomCatalogV2GraphPolicy={id:'fake',options:policy.options};
void discovered;
