/** Additional DATA composition after actual held Native/client/server reads.
 * Literal Pending, receipts, outboxes and catalog cache work remain unchanged.
 * A complete conservative asset union conveys no operational ownership. */
import type {LocalMetadataReferenceCut} from '../selected_local_metadata_assets/room_contract.js';
import type {MetadataPacketArchiveHeader,MetadataPacketRequirements} from '../metadata_packet_retention/contract.js';
import type {ServerNativeDependencyInventory,ServerNativePacketSource} from '../server_native_dependencies/contract.js';
import type {SharedPacketAssetIdentity} from '../packet_asset_references.js';
import {compareAssetReference} from '../generation_recovery_control/asset_requirements.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {fail,same} from '../metadata_packet_retention/policy.js';
import {originalSourceRequirements} from './requirements.js';
import type {NativeSourceVersionKnowledge,ServerPacketSourceResolution,PacketSourceRequirement,PacketSourceWitness} from './contract.js';
export function resolveServerPacketSources(base:LocalMetadataReferenceCut,header:MetadataPacketArchiveHeader,packets:MetadataPacketRequirements,server:ServerNativeDependencyInventory,versions:NativeSourceVersionKnowledge,parent:ServerPacketSourceResolution['parent']):ServerPacketSourceResolution{
 if(!same(header.parent,parent.references)||packets.document!==server.source.source.document||packets.document!==versions.document)throw fail();
 const members=new Set(base.base.history.participants.map(row=>row.id));if(versions.versions.some(row=>!members.has(row.participant)))throw fail();
 const unresolvedBodies=new Set(packets.pending.map(row=>row.body)),bodies=new Map(header.bodies.map(row=>[row.key,row])),nativeBodies=new Map<string,string>();for(const body of header.bodies)if(!unresolvedBodies.has(body.key)&&!nativeBodies.has(JSON.stringify(body.native)))nativeBodies.set(JSON.stringify(body.native),body.key);
 const sources=new Map<string,ServerNativePacketSource>(),children=new Map<string,ServerNativePacketSource>();for(const row of server.sources){if(!sources.has(JSON.stringify(row.packet)))sources.set(JSON.stringify(row.packet),row);if(row.packet.kind==='suggestion_revision'&&!children.has(row.packet.suggestionId))children.set(row.packet.suggestionId,row);}
 const knownVersions=new Map<string,string[]>();for(const row of versions.versions){let list=knownVersions.get(row.id);if(!list){list=[];knownVersions.set(row.id,list);}if(!list.includes(row.participant))list.push(row.participant);}
 const witness=(identity:SharedPacketAssetIdentity):PacketSourceWitness|undefined=>{
  const body=nativeBodies.get(JSON.stringify(identity));if(body)return{kind:'retained-packet',body};
  const known=identity.kind==='version'?knownVersions.get(identity.id):undefined;if(known)return{kind:'native-source-version',id:identity.id,participants:known};
  if(server.outcome.kind!=='ready')return undefined;const original=sources.get(JSON.stringify(identity)),child=identity.kind==='suggestion'?children.get(identity.id):undefined,found=original??child;if(found)return{kind:'server-packet',source:found,relation:original?'original-packet':'derived-revision-child'};return undefined;
 };
 const requirements:PacketSourceRequirement[]=[...originalSourceRequirements(base)],pendingBodies=new Set<string>();for(const row of packets.pending){const body=bodies.get(row.body);if(!body||body.kind==='version'||body.native.kind==='version'||pendingBodies.has(row.body)||!row.attempts.length||row.attempts.some(attempt=>!attempt.missing.length))throw fail();pendingBodies.add(row.body);requirements.push({kind:'retained-body',body:row.body,packet:body.native,attempts:row.attempts});}
 if(requirements.length>1000000)throw fail('metadata_packet_retention_budget');const covered:ServerPacketSourceResolution['covered'][number][]=[],missing:Extract<ServerPacketSourceResolution['outcome'],{kind:'pending'}>['missing'][number][]=[];
 if(server.outcome.kind!=='ready')missing.push({kind:'server-native'});for(const participant of base.base.unreconciledParticipants)missing.push({kind:'unreconciled-client',participant});
 for(const requirement of requirements){const id=requirement.kind==='retained-body'?requirement.packet:requirement.pending.kind==='uncached_version'?{kind:'version' as const,id:requirement.pending.id}:requirement.pending.packet,found=witness(id);if(found)covered.push({requirement,witness:found});else missing.push({kind:'requirement',requirement});}
 const references=new Map<string,{asset:string;generation:string}>();if(!missing.length){
  if(server.outcome.kind!=='ready')throw fail();const known=[base.base.history.references,...base.points.flatMap(point=>point.lanes.flatMap(lane=>lane.outcome.kind==='ready'?[lane.outcome.references]:[])),packets.references,versions.references,server.outcome.references];if(base.outcome.kind==='ready')known.push(base.outcome.references);
  for(const list of known)for(const ref of list){references.set(JSON.stringify([ref.asset,ref.generation]),ref);if(references.size>100000)throw fail('metadata_packet_retention_budget');}
 }
 return frozen({format:'breditor/client-server-native-source-resolution',formatVersion:1,scope:'complete-held-native-and-declared-packet-reference-knowledge-preserving-original-pending',parent,nativeVersions:versions,covered,outcome:missing.length?{kind:'pending',missing}:{kind:'ready',references:[...references.values()].sort(compareAssetReference)}});
}
