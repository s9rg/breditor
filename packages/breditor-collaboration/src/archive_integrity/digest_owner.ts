/** Keep a bounded Native digest owner alive only for the supplied byte stream. */
import type {SharedRustArchiveDigest} from './contract.js';
import {archiveFailure,SharedArchiveIntegrityError} from './policy.js';

export async function withArchiveDigest(
 create:(bytes:string)=>SharedRustArchiveDigest,
 bytes:number,
 guard:()=>void,
 write:(update:(chunk:Uint8Array)=>void)=>Promise<void>,
):Promise<string>{
 let release:(()=>void)|undefined;
 try{
  guard();
  const owner=create(String(bytes)),free=owner.free;
  if(typeof free!=='function')throw archiveFailure('archive_capability');
  release=free.bind(owner);
  const update=owner.update,finish=owner.finish;
  if(typeof update!=='function'||typeof finish!=='function')throw archiveFailure('archive_capability');
  await write(chunk=>{
   guard();
   if(update.call(owner,chunk)!==undefined)throw archiveFailure('archive_capability');
   guard();
  });
  guard();
  const digest=finish.call(owner);
  guard();
  if(typeof digest!=='string'||!/^[a-f0-9]{64}$/.test(digest))throw archiveFailure('archive_integrity');
  return digest;
 }catch(error){
  if(error instanceof SharedArchiveIntegrityError)throw error;
  throw archiveFailure('archive_integrity');
 }finally{
  if(release)try{release();}catch{throw archiveFailure('archive_integrity');}
 }
}
