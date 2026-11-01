/** Detach the complete closed packet-recovery envelope after owner admission.
 * Historical reconciliation stays recorded DATA; its copied flags never supply
 * Native custody, current permissions, upload ACKs or activation authority. */
import {fields,rows} from '../physical_room_record_cut/policy.js';
import {metadataData} from '../selected_local_metadata_delivery/data.js';
import {detachLocalMetadataReferenceBundle} from '../selected_local_metadata_assets/portable_bundle.js';
import {packetArchiveFiles} from '../metadata_packet_retention/archive.js';
import {packetAssetFiles} from './asset_archive.js';
import {detachServerPacketSourceFiles} from './source_files.js';
import {generationAssetContent} from '../generation_recovery_control/asset_requirements.js';
import {fail} from '../metadata_packet_retention/policy.js';
import type {ServerPacketRecoveryBundle,ServerPacketAssetOutcome} from './contract.js';
import type {LocalMetadataReceiptContainmentRead} from '../metadata_receipt_containment/contract.js';
function containment(input:unknown):LocalMetadataReceiptContainmentRead{
 const r=fields(input,['format','formatVersion','scope','kind','reconciliation','catalog','points','pending']);
 if(r['format']!=='breditor/selected-local-metadata-receipt-containment'||r['formatVersion']!==1||r['scope']!=='same-held-native-original-local-receipts-in-current-server-catalogs'||!['contained','pending'].includes(r['kind'] as string))throw fail();
 const c=fields(r['reconciliation'],['format','formatVersion','scope','kind','legacy','assets','reviews','pending']),a=fields(c['assets'],['format','formatVersion','references','availability']);
 if(c['format']!=='breditor/selected-local-metadata-reconciliation-read'||c['formatVersion']!==1||c['scope']!=='same-held-native-room-local-review-bindings-all-metadata-and-provider'||!['checked','pending'].includes(c['kind'] as string)||a['format']!=='breditor/selected-local-metadata-asset-availability-bundle'||a['formatVersion']!==1)throw fail();
 const ordinary=metadataData({format:r['format'],formatVersion:r['formatVersion'],scope:r['scope'],kind:r['kind'],catalog:r['catalog'],points:r['points'],pending:r['pending'],reconciliation:{format:c['format'],formatVersion:c['formatVersion'],scope:c['scope'],kind:c['kind'],legacy:c['legacy'],reviews:c['reviews'],pending:c['pending']}}) as Omit<LocalMetadataReceiptContainmentRead,'reconciliation'>&{reconciliation:Omit<LocalMetadataReceiptContainmentRead['reconciliation'],'assets'>};
 const assets={format:'breditor/selected-local-metadata-asset-availability-bundle' as const,formatVersion:1 as const,references:detachLocalMetadataReferenceBundle(a['references']),availability:metadataData(a['availability']) as LocalMetadataReceiptContainmentRead['reconciliation']['assets']['availability']};
 return Object.freeze({...ordinary,reconciliation:Object.freeze({...ordinary.reconciliation,assets:Object.freeze(assets)})});
}
function assets(input:unknown):ServerPacketAssetOutcome{
 const r=fields(input,['kind'],['files','missing']);
 if(r['kind']==='retained'){const row=fields(input,['kind','files']);return Object.freeze({kind:'retained',files:packetAssetFiles(row['files'])});}
 if(r['kind']!=='pending')throw fail();const row=fields(input,['kind','missing']),missing=rows(row['missing'],100000).map(value=>{const raw=fields(value,['kind'],['asset']);if(raw['kind']==='bytes'){const exact=fields(value,['kind','asset']);return Object.freeze({kind:'bytes' as const,asset:generationAssetContent(exact['asset'])});}fields(value,['kind']);if(raw['kind']!=='native-source'&&raw['kind']!=='opaque-mapping')throw fail();return Object.freeze({kind:raw['kind']});});
 if(!missing.length)throw fail();return Object.freeze({kind:'pending',missing:Object.freeze(missing)});
}
export function detachServerPacketRecoveryBundle(input:unknown):ServerPacketRecoveryBundle{
 const r=fields(input,['format','formatVersion','scope','packets','dependencies','closure','assets','server','inventory']);if(r['format']!=='breditor/selected-local-server-packet-recovery-bundle'||r['formatVersion']!==1||r['scope']!=='client-history-original-packets-complete-server-native-and-selected-files')throw fail();
 const p=fields(r['packets'],['format','formatVersion','scope','references','containment','packets','requirements']);if(p['format']!=='breditor/selected-local-metadata-packet-retention-bundle'||p['formatVersion']!==1||p['scope']!=='held-original-packet-bytes-and-native-dependency-read')throw fail();
 const packets=Object.freeze({format:'breditor/selected-local-metadata-packet-retention-bundle' as const,formatVersion:1 as const,scope:'held-original-packet-bytes-and-native-dependency-read' as const,references:detachLocalMetadataReferenceBundle(p['references']),containment:containment(p['containment']),packets:packetArchiveFiles(p['packets']),requirements:metadataData(p['requirements']) as ServerPacketRecoveryBundle['packets']['requirements']});
 return Object.freeze({format:'breditor/selected-local-server-packet-recovery-bundle',formatVersion:1,scope:'client-history-original-packets-complete-server-native-and-selected-files',packets,...detachServerPacketSourceFiles({server:r['server'],inventory:r['inventory'],dependencies:r['dependencies']}),closure:metadataData(r['closure']) as ServerPacketRecoveryBundle['closure'],assets:assets(r['assets'])});
}
