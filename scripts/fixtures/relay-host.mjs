/** Isolated loopback fixture lifecycle. No SDK imports, room mutation commands or publication. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
export async function startReviewHost(executable,args){
 const child=spawn(executable,args,{stdio:["ignore","pipe","pipe"]});let errors="";child.stderr.on("data",value=>{errors=(errors+value).slice(-8192);});
 const closed=new Promise(resolve=>child.once("exit",(code,signal)=>resolve({code,signal}))),lines=createInterface({input:child.stdout});
 const address=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(`Host start timed out: ${errors}`)),15000);child.once("error",reject);child.once("exit",()=>{clearTimeout(timer);reject(Error(`Host exited: ${errors}`));});lines.on("line",line=>{try{const value=JSON.parse(line);if(value.kind==="listening"){clearTimeout(timer);resolve(value.address);}}catch{/* No payload logging. */}});});
 let crashed=false;
 return {address,async crash(){crashed=true;if(child.exitCode===null&&child.signalCode===null)child.kill("SIGTERM");await closed;lines.close();},async stop(){if(child.exitCode===null&&child.signalCode===null)child.kill("SIGINT");const result=await Promise.race([closed,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error("Host did not stop")),15000);timer.unref();})]);lines.close();if(!crashed)assert.equal(result.code,0,errors);}};
}
