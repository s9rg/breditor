import {SharedServerLogGenerationDeliveryRecoveryHost,generationDeliveryRecoveryHostPort} from '../generation_delivery_control/host.js';
/** Genuine host collection. Portable DATA or a public prototype override cannot
 * register a live source check, install a receipt or confer activation authority. */
import {SharedServerLogGenerationRecoveryHost,generationRecoveryHostPort} from '../generation_recovery_control/host.js';
import {SharedPhysicalRoomRecoveryHost,physicalRecoveryHostPort} from '../physical_recovery_control/host.js';
import type {SharedServerLogGenerationRecoveryControlSelection} from '../generation_recovery_control/contract.js';
import type {SharedPhysicalRecoveryControlSelection} from '../physical_recovery_control/contract.js';
import {collectOriginalMetadataData,freshMetadataQuery} from './collect_data.js';import {fail} from './policy.js';
import type {OriginalMetadataStartQuery,SelectedServerMetadataCatalog} from './contract.js';import type {OriginalMetadataIndex} from './accumulator.js';
type Selection=SharedServerLogGenerationRecoveryControlSelection|SharedPhysicalRecoveryControlSelection;
const captures=new WeakMap<object,{check:()=>Promise<void>;index:OriginalMetadataIndex}>();
const active=new WeakSet<object>();
function genuine(host:unknown){try{return{family:'server-log-generation-recovery' as const,port:generationRecoveryHostPort(host as SharedServerLogGenerationRecoveryHost)};}catch{/* Only a private brand failure selects the other host family. */}try{return{family:'physical-room-recovery' as const,port:physicalRecoveryHostPort(host as SharedPhysicalRoomRecoveryHost)};}catch{/* Only a private brand failure selects continuation control. */}try{const source=generationDeliveryRecoveryHostPort(host as SharedServerLogGenerationDeliveryRecoveryHost);return{family:'server-log-generation-recovery' as const,port:{selection:source.selection.current,check:source.check,readMetadata:source.readMetadata}};}catch{throw fail('metadata_read_policy');}}
export function captureSelectedServerMetadata(host:SharedServerLogGenerationRecoveryHost,input:OriginalMetadataStartQuery,signal?:AbortSignal):Promise<SelectedServerMetadataCatalog<SharedServerLogGenerationRecoveryControlSelection>>;
export function captureSelectedServerMetadata(host:SharedPhysicalRoomRecoveryHost,input:OriginalMetadataStartQuery,signal?:AbortSignal):Promise<SelectedServerMetadataCatalog<SharedPhysicalRecoveryControlSelection>>;
export function captureSelectedServerMetadata(host:SharedServerLogGenerationDeliveryRecoveryHost,input:OriginalMetadataStartQuery,signal?:AbortSignal):Promise<SelectedServerMetadataCatalog<SharedServerLogGenerationRecoveryControlSelection>>;
export async function captureSelectedServerMetadata(host:SharedServerLogGenerationRecoveryHost|SharedPhysicalRoomRecoveryHost|SharedServerLogGenerationDeliveryRecoveryHost,input:OriginalMetadataStartQuery,signal?:AbortSignal):Promise<SelectedServerMetadataCatalog<Selection>>{
 const {family,port}=genuine(host);if(active.has(host))throw fail('metadata_read_busy');active.add(host);
 try{const query=freshMetadataQuery(input),check=()=>port.check(signal),{catalog,index}=await collectOriginalMetadataData<Selection>(family,port.selection,port.selection.source.server.native.source.document,query,query=>port.readMetadata(query,signal),check);captures.set(catalog,{check,index});return catalog;}finally{active.delete(host);}
}
/** Internal use always rechecks the actual selected Native host before and
 * after the caller's work. This is still catalog evidence, never client custody. */
export async function withCheckedServerMetadataCatalog<T>(catalog:object,visit:(index:OriginalMetadataIndex)=>Promise<T>):Promise<T>{const source=captures.get(catalog);if(!source||typeof visit!=='function')throw fail('metadata_read_policy');await source.check();const value=await visit(source.index);await source.check();return value;}
