/** Bounded local stage execution; save failures, timeouts and signals cannot become a pass. */
import {spawn} from "node:child_process";
import {openSync,writeSync,closeSync} from "node:fs";
export const stageLogLimit=32*1024*1024;
export async function executeCandidateStage(check,{root,logPath,signal,logLimit=stageLogLimit,reportProgress,progressEveryMs=60_000}={}){
 const file=openSync(logPath,"wx",0o600);let bytes=0,child,reason,forceTimer,deadline,progressTimer,spawnError;
 const startedAt=new Date().toISOString();
 const startedClock=performance.now();
 const kill=name=>{if(!child?.pid)return;try{if(process.platform!=="win32")process.kill(-child.pid,name);else child.kill(name);}catch{/* Already retired. */}};
 function stop(kind){
  if(reason)return;reason=kind;
  kill("SIGTERM");forceTimer=setTimeout(()=>kill("SIGKILL"),1000);forceTimer.unref();
 }
 const abort=()=>stop("interrupted");
 try{
  if(signal?.aborted)return {id:check.id,status:"interrupted",startedAt,finishedAt:new Date().toISOString(),exitCode:null,signal:null,logBytes:0};
  child=spawn(check.command,check.args,{cwd:root,env:{...process.env,...check.env},shell:false,stdio:["ignore","pipe","pipe"],detached:process.platform!=="win32"});
  const append=chunk=>{try{const remaining=logLimit-bytes;if(remaining>0){const part=chunk.subarray(0,remaining);let offset=0;while(offset<part.length){const written=writeSync(file,part,offset,part.length-offset);if(written===0)throw Error("Could not advance the stage log");offset+=written;bytes+=written;}}if(chunk.length>remaining)stop("log-limit");}catch(error){spawnError=String(error);stop("log-write-failed");}};
  child.stdout.on("data",append);child.stderr.on("data",append);
  signal?.addEventListener("abort",abort,{once:true});if(signal?.aborted)abort();
  deadline=setTimeout(()=>stop("timeout"),check.timeoutMs);deadline.unref();
  if(reportProgress){
   progressTimer=setInterval(()=>{
    try{
     const reported=reportProgress({elapsedSeconds:Math.floor((performance.now()-startedClock)/1000),logBytes:bytes});
     void Promise.resolve(reported).catch(()=>{});
    }
    catch{/* Status reporting cannot influence the stage outcome. */}
   },progressEveryMs);
   progressTimer.unref();
  }
  const outcome=await new Promise(resolve=>{child.once("error",error=>{spawnError=String(error);});child.once("close",(exitCode,exitSignal)=>resolve({exitCode,exitSignal}));});
  return {id:check.id,status:reason??(spawnError?"launch-failed":outcome.exitCode===0&&!outcome.exitSignal?"passed":"failed"),startedAt,finishedAt:new Date().toISOString(),exitCode:outcome.exitCode,signal:outcome.exitSignal,logBytes:bytes,...(spawnError?{error:spawnError}:{})};
 }finally{clearTimeout(deadline);clearTimeout(forceTimer);clearInterval(progressTimer);if(reason)kill("SIGKILL");signal?.removeEventListener("abort",abort);closeSync(file);}
}
