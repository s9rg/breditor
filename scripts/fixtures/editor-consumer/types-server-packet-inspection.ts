import type {SelectedLocalMetadataDelivery} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import type {SharedServerLogGenerationRecoveryHost,ServerPacketRecoveryBundle,ServerPacketRecoveryInspection} from '@breditor/collaboration';
declare const owner:SelectedLocalMetadataDelivery,host:SharedServerLogGenerationRecoveryHost,bundle:ServerPacketRecoveryBundle;
const task:Promise<ServerPacketRecoveryInspection>=owner.inspectServerPacketRecovery(bundle,host);void task;
declare const inspected:ServerPacketRecoveryInspection;
const scope:'native-client-cut-exact-original-packets-complete-server-source-and-raster-data'=inspected.scope;void scope;
if(inspected.rasters.kind==='retained'){const mime:'image/png'|'image/jpeg'|'image/webp'=inspected.rasters.payloads[0]!.mime;void mime;}
else {const missing:string=inspected.rasters.missing[0]!.kind;void missing;}
// @ts-expect-error Inspection DATA cannot activate a recovered room.
inspected.activate();
// @ts-expect-error Preserved Native Pending cannot become a queue acknowledgement.
inspected.requirements.pending=[];
// @ts-expect-error Recorded reconciliation does not grant editing.
inspected.recordedReconciliation.createWriter();
// @ts-expect-error Saved server identity is DATA, not a genuine selected host.
owner.inspectServerPacketRecovery(bundle,bundle.server.identity);
// @ts-expect-error The opaque Native source read is readonly.
inspected.source.native.sources.push({});
