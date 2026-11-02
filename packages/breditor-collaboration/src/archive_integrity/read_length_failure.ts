/** Preserve the existing refusal and attach bounded numerical observations.
 * This never retries, clips or accepts an incorrect byte read. */
import {archiveFailure,type SharedArchiveIntegrityError} from './policy.js';
import type {SharedArchiveReadLengthFailure} from './contract.js';
const freeze=Object.freeze,define=Object.defineProperty;
export function archiveReadLengthFailure(offset:number,expectedBytes:number,observedBeforeAuthorityBytes:unknown,actualBytes:unknown):SharedArchiveIntegrityError {
 const error=archiveFailure('archive_integrity');
 if(typeof observedBeforeAuthorityBytes!=='number'||!Number.isSafeInteger(observedBeforeAuthorityBytes)||observedBeforeAuthorityBytes<0
  ||typeof actualBytes!=='number'||!Number.isSafeInteger(actualBytes)||actualBytes<0)return error;
 const readFailure:SharedArchiveReadLengthFailure=freeze({kind:'read-length',offset,expectedBytes,observedBeforeAuthorityBytes,actualBytes});
 define(error,'readFailure',{value:readFailure,enumerable:true,writable:false,configurable:false});return error;
}
