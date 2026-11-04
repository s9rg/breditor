/** Explicit: node --import ./scripts/fixtures/preload-blob-read-witness.mjs ...
 * A diagnostic run changes host instrumentation and NEVER qualifies release
 * behavior. At orderly exit, preserve scalar observations and separately test
 * the actual retained Blob in a pristine worker. No product retry is added. */
import fs from 'node:fs';import {resolve} from 'node:path';
import {watchBlobReadLengths} from './blob-read-witness.mjs';
import {probeRetainedBlobRead} from '../probe-retained-blob-read.mjs';
const watch=watchBlobReadLengths();
process.once('beforeExit',async()=>{
 const witness=watch.first();watch.uninstall();if(!witness)return;
 const result={format:'breditor/test-blob-read-witness-report',formatVersion:1,pid:process.pid,node:process.version,expectedBytes:witness.expectedBytes,actualBytes:witness.actualBytes,failures:watch.failures(),stack:witness.stack,qualification:false,scope:'Instrumented diagnostic run. The original failing result was returned unchanged; follow-up worker reads cannot change the product outcome.'};
 try{result.probe=await probeRetainedBlobRead(witness);}catch(error){result.probeError=String(error);}
 try{fs.mkdirSync('target',{recursive:true});const path=resolve('target','blob-read-witness-'+process.pid+'.json');fs.writeFileSync(path,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.error('BLOB_READ_WITNESS '+path);}catch(error){console.error('BLOB_READ_WITNESS_OUTPUT_FAILED '+String(error));}
});
