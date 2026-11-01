
/** Strict DATA admission of the original Rust complete physical inventory.
 * Source provenance is separately attached by the genuine host collector. */
import {fields,rows} from '../physical_room_record_cut/policy.js';
import {digest} from '../relay/validation.js';
import {serverLogGenerationIdentity} from '../server_generation_inventory/identity.js';
import type {SharedServerLogGenerationBackupIdentity} from '../server_generation_inventory/contract.js';
import type {SharedPacketAssetIdentity} from '../packet_asset_references.js';
import {generationAssetReference,compareAssetReference} from '../generation_recovery_control/asset_requirements.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {MAX_SERVER_NATIVE_DEPENDENCY_ITEMS as maximum,type ServerNativeDependencyInventory,type ServerNativePacketSource} from './contract.js';
import {fail} from './policy.js';
function decimal(input:unknown,min:bigint,max:bigint):string{if(typeof input!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(input)||BigInt(input)<min||BigInt(input)>max)throw fail();return input;}
function packet(input:unknown):SharedPacketAssetIdentity{
 const raw=fields(input,['kind','id'],['previousSuggestionId','suggestionId']),kind=raw['kind'],id=digest(raw['id']);
 if(kind==='version'||kind==='suggestion'){if(Object.keys(raw).length!==2)throw fail();return{kind,id};}
 if(kind!=='suggestion_revision'||Object.keys(raw).length!==4)throw fail();const previousSuggestionId=digest(raw['previousSuggestionId']),suggestionId=digest(raw['suggestionId']);if(previousSuggestionId===suggestionId)throw fail();return{kind,id,previousSuggestionId,suggestionId};
}
function source(input:unknown):ServerNativePacketSource{const row=fields(input,['sequence','packet']);return{sequence:decimal(row['sequence'],0n,18446744073709551615n),packet:packet(row['packet'])};}
export function serverNativeDependencyInventory(input:unknown,expected:SharedServerLogGenerationBackupIdentity):ServerNativeDependencyInventory{
 const r=fields(input,['format','formatVersion','source','scope','sources','outcome']);if(r['format']!=='breditor/server-log-generation-asset-references'||r['formatVersion']!==1||r['scope']!=='native-causal-and-complete-physical-generation-packets')throw fail();
 const selected=serverLogGenerationIdentity(r['source']);if(JSON.stringify(selected)!==JSON.stringify(expected))throw fail();let previous=-1n;
 const sources=rows(r['sources'],maximum).map(value=>{const row=source(value),at=BigInt(row.sequence);if(at<=previous||at>=BigInt(selected.source.records))throw fail();previous=at;return row;});
 const bySequence=new Map(sources.map(row=>[row.sequence,row])),o=fields(r['outcome'],['kind'],['references','packets']);let outcome:ServerNativeDependencyInventory['outcome'];
 if(o['kind']==='ready'){
  if(!Object.hasOwn(o,'references')||Object.hasOwn(o,'packets'))throw fail();let previous:ReturnType<typeof generationAssetReference>|undefined;
  const references=rows(o['references'],maximum).map(value=>{const row=generationAssetReference(value);if(previous&&compareAssetReference(previous,row)>=0)throw fail();previous=row;return row;});outcome={kind:'ready',references};
 }else if(o['kind']==='pending'){
  if(!Object.hasOwn(o,'packets')||Object.hasOwn(o,'references'))throw fail();let previous=-1n,total=0;
  const packets=rows(o['packets'],maximum).map(value=>{const row=fields(value,['source','missing']),item=source(row['source']),at=BigInt(item.sequence);if(at<=previous||item.packet.kind==='version'||JSON.stringify(bySequence.get(item.sequence))!==JSON.stringify(item))throw fail();previous=at;let writer=0n;
   const missing=rows(row['missing'],1024).map(value=>{const p=fields(value,['writer','counter']),actual=decimal(p['writer'],1n,18446744073709551614n),counter=decimal(p['counter'],1n,2147483647n);if(BigInt(actual)<=writer)throw fail();writer=BigInt(actual);return{writer:actual,counter};});total+=missing.length;if(!missing.length||total>maximum)throw fail();return{source:item,missing};});if(!packets.length)throw fail();outcome={kind:'pending',packets};
 }else throw fail();
 return frozen({format:'breditor/server-log-generation-asset-references',formatVersion:1,source:selected,scope:'native-causal-and-complete-physical-generation-packets',sources,outcome});
}
