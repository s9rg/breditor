/** Server-side portion of portable inspection. Actual Native state is compared
 * with the whole recorded inventory, including otherwise inert Prepare packets.
 * This internal bracket alone is not client replay, closure or activation. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {archiveHex} from '../archive_integrity/policy.js';
import {SharedServerLogGenerationRoomArchive as Server} from '../server_generation_archive/read.js';
import {SharedServerLogGenerationParticipantInventory as Inventory} from '../server_generation_inventory/read.js';
import {SharedServerLogGenerationRecoveryHost,generationRecoveryHostPort} from '../generation_recovery_control/host.js';
import {generationControlSelection} from '../generation_recovery_control/identity.js';
import type {SharedServerLogGenerationRecoveryControlSelection as Selection} from '../generation_recovery_control/contract.js';
import {captureSelectedServerNativeDependencies,withCheckedServerNativeDependencies} from '../server_native_dependencies/collect.js';
import {MAX_SERVER_NATIVE_DEPENDENCY_RESPONSE_BYTES} from '../server_native_dependencies/contract.js';
import {prepareNativeDependencyRequest} from '../server_native_dependencies/request.js';
import {readNativeDependencyResponse} from '../server_native_dependencies/response.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {detachServerPacketSourceFiles,type ServerPacketSourceFiles} from './source_files.js';
import {fail,same} from '../metadata_packet_retention/policy.js';
import {readVerifiedPacketText} from '../metadata_packet_retention/read_verified_text.js';
const server={read:Server.read,metadata:Server.prototype.metadata,dispose:Server.prototype.dispose},inventory={read:Inventory.read,dispose:Inventory.prototype.dispose};
export async function withInspectedServerPacketSource<T>(provided:ServerPacketSourceFiles,recordedSelection:Selection,host:SharedServerLogGenerationRecoveryHost,options:SharedArchiveIntegrityOptions,visit:(facts:ServerPacketSourceInspection)=>Promise<T>):Promise<T>{
 const signal=options.signal,files=detachServerPacketSourceFiles(provided),recorded=generationControlSelection(recordedSelection),port=generationRecoveryHostPort(host),selected=port.selection,integrity=prepareArchiveIntegrity(options);
 if(typeof visit!=='function'||!same(selected.source.origin,files.server.identity)||!same(selected.source.server,files.server.identity)||!same(selected.source.participants,files.inventory.identity)||!same(recorded.source.server,files.server.identity)||!same(recorded.source.participants,files.inventory.identity)||!same(files.inventory.identity.source,files.server.identity.native)||files.server.sha256!==archiveHex(files.server.identity.archiveSha256)||files.inventory.sha256!==archiveHex(files.inventory.identity.sha256))throw fail();
 integrity.guard();await port.check(signal);integrity.guard();
 for(const row of [files.server,files.inventory]){if(await integrity.digest(row.file)!==row.sha256)throw fail();integrity.guard();}
 const text=await readVerifiedPacketText(files.dependencies.file,files.dependencies.sha256,MAX_SERVER_NATIVE_DEPENDENCY_RESPONSE_BYTES,integrity);
 const request=await prepareNativeDependencyRequest('server-log-generation-recovery',recorded);integrity.guard();
 const stored=readNativeDependencyResponse(text,'server-log-generation-recovery',recorded,files.server.identity.native,request.sha256,generationControlSelection);
 let admittedServer:Server|undefined,admittedInventory:Inventory|undefined;
 try{
  admittedServer=await server.read.call(Server,files.server.file,files.server.identity,{wasm:integrity.wasm,checkAuthority:integrity.guard});integrity.guard();
  admittedInventory=await inventory.read.call(Inventory,files.inventory.file,files.inventory.identity,{...(signal?{signal:signal}:{})});integrity.guard();
  const actual=await captureSelectedServerNativeDependencies(host,signal);integrity.guard();if(!same(actual.selection,selected)||!same(actual.native,stored.native))throw fail();
  const metadata=server.metadata.call(admittedServer),facts=frozen({format:'breditor/server-packet-source-inspection' as const,formatVersion:1 as const,scope:'selected-files-and-complete-genuine-server-native-equality' as const,recordedSelection:recorded,selection:selected,server:{identity:files.server.identity,bytes:files.server.bytes,sha256:files.server.sha256,nativeBytes:metadata.nativeBytes,rasterArchiveBytes:metadata.rasterArchiveBytes},inventory:{identity:files.inventory.identity,bytes:files.inventory.bytes,sha256:files.inventory.sha256},dependencies:{bytes:files.dependencies.bytes,sha256:files.dependencies.sha256},native:actual.native});
  const result=await withCheckedServerNativeDependencies(actual,async()=>{integrity.guard();const value=await visit(facts);integrity.guard();return value;});integrity.guard();return result;
 }finally{if(admittedInventory)inventory.dispose.call(admittedInventory);if(admittedServer)server.dispose.call(admittedServer);}
}
export interface ServerPacketSourceInspection {
 readonly format:'breditor/server-packet-source-inspection';readonly formatVersion:1;
 readonly scope:'selected-files-and-complete-genuine-server-native-equality';
 readonly recordedSelection:Selection;readonly selection:Selection;
 readonly server:Readonly<Omit<ServerPacketSourceFiles['server'],'file'>&{nativeBytes:number;rasterArchiveBytes:number}>;
 readonly inventory:Readonly<Omit<ServerPacketSourceFiles['inventory'],'file'>>;
 readonly dependencies:Readonly<Omit<ServerPacketSourceFiles['dependencies'],'file'>>;
 readonly native:import('../server_native_dependencies/contract.js').ServerNativeDependencyInventory;
}
