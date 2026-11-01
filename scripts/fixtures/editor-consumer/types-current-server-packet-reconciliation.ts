import type {SelectedLocalMetadataDelivery} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import type {ServerPacketReconciliationInput,ServerPacketReconciliationRead} from '@breditor/collaboration';
declare const owner:SelectedLocalMetadataDelivery,input:ServerPacketReconciliationInput,result:ServerPacketReconciliationRead;
const task:Promise<ServerPacketReconciliationRead>=owner.captureServerPacketReconciliation(input);void task;
const scope:'current-held-native-all-metadata-complete-server-source-and-provider'=result.scope;void scope;
if(result.currentProvider){const missing:string|undefined=result.currentProvider.read.missing[0]?.kind;void missing;}
for(const item of result.pending)if(item.kind==='original'){const kind:'head'|'registration'|'review-progress'|'metadata'=item.requirement.kind;void kind;}
// @ts-expect-error The new current read cannot alter preserved original cache/queue diagnostics.
result.original.pending.pop();
// @ts-expect-error Retained local bytes do not provide a server upload acknowledgement.
result.currentProvider?.read.acknowledge();
// @ts-expect-error Current reconciliation DATA cannot start a serving epoch.
result.activate();
