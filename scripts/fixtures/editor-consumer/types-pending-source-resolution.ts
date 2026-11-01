import type {SelectedLocalMetadataDelivery} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import type {SharedServerLogGenerationRecoveryHost,ServerPacketRecoveryInput,ResolvedServerPacketRecoveryBundle,ResolvedServerPacketRecoveryOutcome,ResolvedServerPacketRecoveryInspection,PacketSourceRequirement} from '@breditor/collaboration';
declare const owner:SelectedLocalMetadataDelivery,host:SharedServerLogGenerationRecoveryHost,input:ServerPacketRecoveryInput,bundle:ResolvedServerPacketRecoveryBundle;
const capture:Promise<ResolvedServerPacketRecoveryOutcome>=owner.captureResolvedServerPacketRecovery(input);void capture;
const inspect:Promise<ResolvedServerPacketRecoveryInspection>=owner.inspectResolvedServerPacketRecovery(bundle,host);void inspect;
declare const result:ResolvedServerPacketRecoveryInspection,requirement:PacketSourceRequirement;
const scope:'verified-source-resolution-with-original-client-pending-and-queues-preserved'=result.scope;void scope;
if(requirement.kind==='retained-body'){const missing:string=requirement.attempts[0]!.missing[0]!.writer;void missing;}
else {const kind:'source'|'uncached_version'=requirement.pending.kind;void kind;}
if(result.resolution.outcome.kind==='ready'){const asset:string=result.resolution.outcome.references[0]!.asset;void asset;}
if(result.rasters.kind==='retained'){const roles:readonly unknown[]=result.rasters.uploads;void roles;}
// @ts-expect-error The new source-resolution envelope is not the older scope.
owner.inspectServerPacketRecovery(bundle,host);
// @ts-expect-error This immutable source inspection never activates a room.
result.activate();
// @ts-expect-error Source availability does not acknowledge client downloads.
result.original.recordedReconciliation.acknowledgeDownloads();
// @ts-expect-error Complete original packet Pending diagnostics stay readonly.
result.original.requirements.pending.pop();
// @ts-expect-error Saved Native source-version reads cannot install a writer.
result.resolution.nativeVersions.createWriter();
// @ts-expect-error A saved server identity is DATA, not a genuine held host.
owner.inspectResolvedServerPacketRecovery(bundle,bundle.original.server.identity);
