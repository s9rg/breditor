/** Decode retained storage JSON from the same owned bytes used for verification. */
import type {ArchiveIntegrityContext} from '../archive_integrity/context.js';
import type {LocalReviewRoomBundle} from '../selected_local_review_delivery/contract.js';
import {localChoice,localJson,localSnapshot,MAX_LOCAL_REVIEW_BYTES} from '../selected_local_review_delivery/policy.js';
import {equal,fail} from './policy.js';

export async function readVerifiedStorageText(
 file:Blob,
 expectedSha256:string,
 maximumBytes:number,
 integrity:ArchiveIntegrityContext,
):Promise<string>{
 if(file.size>maximumBytes)throw fail('room_storage_budget');
 const {bytes,sha256}=await integrity.readAndDigest(file,maximumBytes);
 if(sha256!==expectedSha256)throw fail();
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
 catch{throw fail();}
}

export async function readStorageReview(bundle:LocalReviewRoomBundle,integrity:ArchiveIntegrityContext){
 const delivery=bundle.delivery;
 if(delivery.file.size!==delivery.bytes)throw fail();
 const text=await readVerifiedStorageText(delivery.file,delivery.sha256,MAX_LOCAL_REVIEW_BYTES,integrity);
 const raw=JSON.parse(text) as {before:{choice:unknown}};
 const choice=localChoice(raw.before.choice);
 const snapshot=await localSnapshot(raw,choice);
 if(localJson(snapshot)!==text||!equal(choice.before,bundle.prepared.choice.before))throw fail();
 integrity.guard();
 return {choice,snapshot};
}
