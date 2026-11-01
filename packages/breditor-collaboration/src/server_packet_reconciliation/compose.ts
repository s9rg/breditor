/** Join already admitted current facts. Retained/local bytes cannot supply
 * current provider availability; original cache and outbox facts stay literal. */
import type {LocalMetadataReconciliationRead} from '../selected_local_metadata_assets/reconciliation_contract.js';
import type {CurrentServerPacketSourceRead,ServerPacketReconciliationRead,ServerPacketReconciliationPending} from './contract.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {fail,same} from '../metadata_packet_retention/policy.js';
export function composeServerPacketReconciliation(original:LocalMetadataReconciliationRead,sources:CurrentServerPacketSourceRead,currentProvider:ServerPacketReconciliationRead['currentProvider']):ServerPacketReconciliationRead{
 const pending:ServerPacketReconciliationPending[]=[];for(const requirement of original.pending){if(requirement.kind==='head'||requirement.kind==='registration'||requirement.kind==='review-progress'||requirement.kind==='metadata')pending.push({kind:'original',requirement});else if(requirement.kind!=='references'&&requirement.kind!=='provider')throw fail();}
 if(sources.outcome.kind==='pending'){if(currentProvider!==null)throw fail();pending.push({kind:'sources'});}else if(currentProvider===null||!same(currentProvider.requirements.references,sources.outcome.references))throw fail();
 if(currentProvider===null||currentProvider.read.missing.length)pending.push({kind:'provider'});
 return frozen({format:'breditor/selected-local-server-packet-reconciliation-read',formatVersion:1,scope:'current-held-native-all-metadata-complete-server-source-and-provider',kind:pending.length?'pending':'checked',original,sources,currentProvider,pending});
}
