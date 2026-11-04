/** Keep finite length observations that the standard test reporter omits.
 * This never changes a refusal or attempts another payload read. */
export async function withPayloadReadDiagnostics(work){
 try{return await work();}catch(error){
  try{const row=Object.getOwnPropertyDescriptor(error,'payloadReadFailure')?.value;
   if(row?.kind==='lineage-payload-read-length'&&['fileBytes','offset','expectedBytes','observedBeforeAuthorityBytes','actualBytes'].every(key=>Number.isSafeInteger(row[key])&&row[key]>=0))console.error('LINEAGE_PAYLOAD_READ_LENGTH_FAILURE '+JSON.stringify(row));
  }catch{/* Keep the original exception. */}
  throw error;
 }
}
