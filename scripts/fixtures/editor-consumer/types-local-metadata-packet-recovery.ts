
import type {LocalMetadataPacketRetentionInput,LocalMetadataPacketRetentionBundle,LocalMetadataPacketRecoveryInput,LocalMetadataPacketRecoveryOutcome,LocalMetadataPacketRecoveryBundle,MetadataPacketAssetOutcome,MetadataPacketArchiveFiles} from '@breditor/collaboration';
import {SelectedLocalMetadataDelivery} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
declare const owner:SelectedLocalMetadataDelivery,input:LocalMetadataPacketRecoveryInput,retentionInput:LocalMetadataPacketRetentionInput,result:LocalMetadataPacketRecoveryOutcome;
void owner.capturePacketRecovery(input).then(value=>{
 const kind:'retained'|'pending'=value.kind;void kind;
 const bundle:LocalMetadataPacketRecoveryBundle=value.bundle;
 const scope:'client-metadata-first-server-packets-and-selected-recovery-files'=bundle.scope;void scope;
 const packets:LocalMetadataPacketRetentionBundle=bundle.packets;const files:MetadataPacketArchiveFiles=packets.packets;void files;
 const assets:MetadataPacketAssetOutcome=bundle.assets;
 if(assets.kind==='retained')for(const chunk of assets.files.chunks){const file:Blob=chunk.file;void file;}
 else for(const row of assets.missing){if(row.kind==='bytes'){const asset:string=row.asset;void asset;}}
 const preservedServer:Blob=bundle.server.file,preservedInventory:Blob=bundle.inventory.file;void preservedServer;void preservedInventory;
 // @ts-expect-error Retained bytes cannot activate a room.
 bundle.activate();
 // @ts-expect-error The original reconciliation retains its separate scope.
 const activated:'ready'=bundle.packets.containment.reconciliation.kind;void activated;
 // @ts-expect-error Retained records are immutable.
 bundle.packets.requirements.references.push({});
});
void owner.capturePacketRetention(retentionInput);
// @ts-expect-error Copied selection data cannot replace the genuine continuation controller.
void owner.capturePacketRecovery({...input,host:result.bundle.packets.containment.catalog.selection});
// @ts-expect-error Caller Native factories are not accepted.
void owner.capturePacketRecovery({...input,wasm:{}});
