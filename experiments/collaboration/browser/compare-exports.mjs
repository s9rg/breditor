// Bounded asynchronous transport for native diagnostics; never block Playwright's deadlines.
import {execFile} from "node:child_process";
import {fileURLToPath} from "node:url";

const executable=fileURLToPath(new URL("../../../target/collaboration-native/debug/examples/compare_engine_exports",import.meta.url));

/** Compare every supplied export, retaining causal-operation and state assertions in callers. */
export function compareEngineExports(cases){
 const frame=`${JSON.stringify({cases})}\n`;
 if(Buffer.byteLength(frame,"utf8")>16*1024*1024)throw Error("Comparison request exceeds byte limit");
 return new Promise((resolve,reject)=>{
  let writeError;
  const child=execFile(executable,[],{encoding:"utf8",timeout:15_000,killSignal:"SIGKILL",maxBuffer:64*1024},(error,stdout,stderr)=>{
   if(error||writeError){reject(new Error(`Native comparison failed: ${error?.message??writeError.message}${stderr?`\n${stderr}`:""}`));return;}
   try{
    const results=stdout.trim()?stdout.trim().split(/\r?\n/).map(JSON.parse):[];
    if(results.length!==cases.length||results.some((value,index)=>value.name!==cases[index].name))throw Error("Native comparison returned missing or reordered cases");
    resolve(results);
   }catch(error){reject(error);}
  });
  child.stdin?.on("error",error=>{writeError=error;});
  child.stdin?.end(frame);
 });
}
