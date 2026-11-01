/** DATA composition after genuine Native reads. The owner supplies the real
 * source association. No Native or client custody can be minted by this helper. */
import type {LocalMetadataReferenceCut} from '../selected_local_metadata_assets/room_contract.js';
import type {MetadataPacketArchiveHeader,MetadataPacketRequirements} from '../metadata_packet_retention/contract.js';
import type {ServerNativeDependencyInventory,ServerNativePacketSource} from '../server_native_dependencies/contract.js';
import type {ServerPacketClosure,ServerPacketCoverage} from './contract.js';
import {compareAssetReference} from '../generation_recovery_control/asset_requirements.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {fail,same} from '../metadata_packet_retention/policy.js';
export function composeServerPacketClosure(base:LocalMetadataReferenceCut,header:MetadataPacketArchiveHeader,packets:MetadataPacketRequirements,server:ServerNativeDependencyInventory,parent:Readonly<{bytes:number;sha256:string}>):ServerPacketClosure{
 if(!same(header.parent,parent)||packets.document!==server.source.source.document)throw fail();
 const bodies=new Map(header.bodies.map(row=>[row.key,row])),byIdentity=new Map<string,ServerNativePacketSource>(),children=new Map<string,ServerNativePacketSource>();
 for(const row of server.sources){const key=JSON.stringify(row.packet);if(!byIdentity.has(key))byIdentity.set(key,row);if(row.packet.kind==='suggestion_revision'&&!children.has(row.packet.suggestionId))children.set(row.packet.suggestionId,row);}
 const covered:ServerPacketCoverage[]=[],missing:Extract<ServerPacketClosure['outcome'],{kind:'pending'}>['missing'][number][]=[],seen=new Set<string>();
 if(base.outcome.kind!=='ready')missing.push({kind:'base-history'});
 if(server.outcome.kind!=='ready')missing.push({kind:'server-native'});
 for(const pending of packets.pending){const body=bodies.get(pending.body);if(!body||seen.has(body.key)||body.kind==='version')throw fail();seen.add(body.key);
  const original=byIdentity.get(JSON.stringify(body.native)),child=body.native.kind==='suggestion'?children.get(body.native.id):undefined,source=original??child;
  if(server.outcome.kind==='ready'&&source)covered.push({body:body.key,source,relation:original?'original-packet':'derived-revision-child'});else missing.push({kind:'packet-source',body:body.key});
 }
 const references=new Map<string,{asset:string;generation:string}>();
 if(!missing.length){if(base.outcome.kind!=='ready'||server.outcome.kind!=='ready')throw fail();for(const row of [...base.outcome.references,...packets.references,...server.outcome.references]){references.set(JSON.stringify([row.asset,row.generation]),row);if(references.size>100000)throw fail('metadata_packet_retention_budget');}}
 return frozen({format:'breditor/client-and-complete-server-native-reference-closure',formatVersion:1,scope:'base-history-declared-packet-bodies-and-complete-server-physical-native',covered,outcome:missing.length?{kind:'pending',missing}:{kind:'ready',references:[...references.values()].sort(compareAssetReference)}});
}
