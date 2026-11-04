/** Bounded diagnostic DATA on the original refusal. Never retries a read,
 * changes the error family, exposes payload bytes, or supplies archive proof. */
export interface LineagePayloadReadFailure {
 readonly kind:'lineage-payload-read-length';readonly fileBytes:number;
 readonly offset:number;readonly expectedBytes:number;
 readonly observedBeforeAuthorityBytes:number;readonly actualBytes:number;
}
const define=Object.defineProperty,freeze=Object.freeze;
export function lineagePayloadReadFailure(failure:()=>Error,fileBytes:number,offset:number,expectedBytes:number,observedBeforeAuthorityBytes:number,actualBytes:number):Error{
 const error=failure();
 try{const readFailure:LineagePayloadReadFailure=freeze({kind:'lineage-payload-read-length',fileBytes,offset,expectedBytes,observedBeforeAuthorityBytes,actualBytes});define(error,'payloadReadFailure',{value:readFailure,enumerable:true,writable:false,configurable:false});}catch{/* A diagnostic must preserve even a frozen/custom original error. */}
 return error;
}
