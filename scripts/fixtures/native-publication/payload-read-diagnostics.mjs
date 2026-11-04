/** Keep finite length observations that the standard test reporter omits.
 * This never changes a refusal or attempts another payload read. */
export async function withPayloadReadDiagnostics(work){
 try{return await work();}catch(error){
  for(const[property,kind,prefix,keys]of[
   ['readFailure','read-length','ARCHIVE_READ_LENGTH_FAILURE',['offset','expectedBytes','observedBeforeAuthorityBytes','actualBytes']],
   ['payloadReadFailure','lineage-payload-read-length','LINEAGE_PAYLOAD_READ_LENGTH_FAILURE',['fileBytes','offset','expectedBytes','observedBeforeAuthorityBytes','actualBytes']],
  ])try{
   const row=Object.getOwnPropertyDescriptor(error,property)?.value;
   if(row?.kind===kind&&keys.every(key=>Number.isSafeInteger(row[key])&&row[key]>=0)){
    const observation={kind,...Object.fromEntries(keys.map(key=>[key,row[key]]))};
    console.error(prefix+' '+JSON.stringify(observation));
   }
  }catch{/* Keep the original exception, including frozen/custom errors. */}
  throw error;
 }
}
