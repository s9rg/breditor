/** Seed the existing flat-local format from a genuine snapshot archive. The
 * literal prefix and ordered parts remain exact; no saved head is relabelled. */
import {portableLocalOperationArchive as snapshot,type IndependentLocalOperationBackup} from '../independent_local_operation/portable_backup.js';
import {LOCAL_OPERATION_BACKUP_PREFIX_BYTES} from '../independent_local_operation/portable_codec.js';
import {FlatLocalProvenance,flatLocalFraming as framing} from './framing.js';
export function seedFlatLocalSnapshot(owner:IndependentLocalOperationBackup,state:Blob,extras:readonly Blob[],check:()=>void):Promise<FlatLocalProvenance>{
 const header=snapshot.metadata.call(owner),file=snapshot.file.call(owner),start=LOCAL_OPERATION_BACKUP_PREFIX_BYTES+new TextEncoder().encode(JSON.stringify(header)).length;
 return framing.seed.call(FlatLocalProvenance,file.slice(0,start),header.parts.map(p=>file.slice(start+p.offset,start+p.offset+p.bytes)),file.type,state,check,extras);
}
