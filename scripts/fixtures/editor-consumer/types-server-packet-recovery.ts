import type {ServerPacketRecoveryInput,ServerPacketRecoveryOutcome,ServerPacketRecoveryBundle,ServerPacketClosure} from '@breditor/collaboration';
import type {SelectedLocalMetadataDelivery} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
declare const owner:SelectedLocalMetadataDelivery,input:ServerPacketRecoveryInput;
const task:Promise<ServerPacketRecoveryOutcome>=owner.captureServerPacketRecovery(input);void task;
declare const bundle:ServerPacketRecoveryBundle;
const closure:ServerPacketClosure=bundle.closure;
if(closure.outcome.kind==='ready'){const ref:string=closure.outcome.references[0]!.asset;void ref;}
else {const reason:string=closure.outcome.missing[0]!.kind;void reason;}
// @ts-expect-error This data cannot activate a server or client.
bundle.activate();
// @ts-expect-error Exact Pending client diagnostics cannot be rewritten as queue acknowledgements.
bundle.packets.requirements.pending=[];
// @ts-expect-error Parent selection is DATA, not a branded operator host.
owner.captureServerPacketRecovery({...input,host:bundle.server.identity});
