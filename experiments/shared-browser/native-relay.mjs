// Native Rust admission with a bounded newline request; not a network relay substitute.
import {execFile} from "node:child_process";
import {fileURLToPath} from "node:url";
const executable=fileURLToPath(new URL("../../target/collaboration-native/debug/examples/relay_contract_driver",import.meta.url));
export function admitNativeGroups(input){
 const frame=`${JSON.stringify(input)}\n`;if(Buffer.byteLength(frame)>16*1024*1024)throw Error("Native relay request exceeds byte limit");
 return new Promise((resolve,reject)=>{let writeError;const child=execFile(executable,[],{encoding:"utf8",timeout:15_000,killSignal:"SIGKILL",maxBuffer:8*1024*1024},(error,stdout,stderr)=>{
  if(error||writeError){reject(Error(`Native relay admission failed: ${error?.message??writeError.message}${stderr?`\n${stderr}`:""}`));return;}
  try{resolve(JSON.parse(stdout));}catch(error){reject(error);}
 });child.stdin?.on("error",error=>{writeError=error;});child.stdin?.end(frame);});
}
