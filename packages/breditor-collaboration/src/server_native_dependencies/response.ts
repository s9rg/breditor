
/** A recorded Native declaration is DATA; live provenance requires the collector. */
import {fields} from '../physical_room_record_cut/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {ServerMetadataFamily} from '../server_metadata_read/contract.js';
import type {SharedServerLogGenerationBackupIdentity} from '../server_generation_inventory/contract.js';
import {MAX_SERVER_NATIVE_DEPENDENCY_RESPONSE_BYTES as maximum,type SelectedServerNativeDependencies} from './contract.js';
import {serverNativeDependencyInventory} from './inventory.js';
import {fail} from './policy.js';
export function readNativeDependencyResponse<S>(text:string,family:ServerMetadataFamily,expected:S,source:SharedServerLogGenerationBackupIdentity,sha256:string,selectionReader:(input:unknown)=>S):SelectedServerNativeDependencies<S>{
 try{
  if(typeof text!=='string'||new TextEncoder().encode(text).length>maximum||!/^[a-f0-9]{64}$/.test(sha256))throw fail();const r=fields(JSON.parse(text),['format','formatVersion','selection','requestSha256','scope','native']),format=('breditor/'+family+'-native-dependencies-read') as SelectedServerNativeDependencies<S>['format'],scope='selected-server-native-causal-and-complete-physical-packet-dependencies';
  if(r['format']!==format||r['formatVersion']!==1||r['requestSha256']!==sha256||r['scope']!==scope)throw fail();const selection=selectionReader(r['selection']);if(JSON.stringify(selection)!==JSON.stringify(expected))throw fail();const native=serverNativeDependencyInventory(r['native'],source),value:SelectedServerNativeDependencies<S>={format,formatVersion:1,selection,requestSha256:sha256,scope,native};if(JSON.stringify(value)!==text)throw fail();return frozen(value);
 }catch{throw fail();}
}
