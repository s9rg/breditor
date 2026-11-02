/** Preserve numerical read observations that Node's default error reporter drops.
 * Logging must never replace the original failure or turn it into success. */
import {SharedArchiveIntegrityError} from '../../packages/breditor-collaboration/dist/index.js';
export async function withArchiveReadDiagnostics(work){
 try{return await work();}catch(error){
  try{
   if(error instanceof SharedArchiveIntegrityError&&error.readFailure?.kind==='read-length'){
    const {offset,expectedBytes,observedBeforeAuthorityBytes,actualBytes}=error.readFailure;
    if([offset,expectedBytes,observedBeforeAuthorityBytes,actualBytes].every(value=>Number.isSafeInteger(value)&&value>=0))console.error('ARCHIVE_READ_LENGTH_FAILURE '+JSON.stringify({kind:'read-length',offset,expectedBytes,observedBeforeAuthorityBytes,actualBytes}));
   }
  }catch{/* Diagnostic output cannot hide or replace the original error. */}
  throw error;
 }
}
