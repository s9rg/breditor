/** Describe a hosted candidate run from its retained evidence directory. */
import {existsSync,readdirSync,readFileSync} from "node:fs";
import {join} from "node:path";

const directory=process.argv[2]??"target/v1-candidate-runs";
const token=/^[a-z0-9-]+$/i;
const code=(value,pattern=token)=>"`"+(typeof value==="string"&&pattern.test(value)?value:"unknown")+"`";
const context=new Map(readFileSync(join(directory,"runner-context.tsv"),"utf8").trimEnd().split("\n").map(line=>line.split("\t")));
const runs=readdirSync(directory,{withFileTypes:true})
 .filter(entry=>entry.isDirectory()&&/^run-[a-z0-9]+$/i.test(entry.name)&&existsSync(join(directory,entry.name,"result.json")));
const lines=["## Candidate qualification","",
 `- Profile ${code(context.get("profile"))} at ${code(context.get("revision"),/^[0-9a-f]{40}$/)}.`];

const shard=context.get("shard")??"none";
if(shard!=="none")lines.push(`- Selected full-profile shard ${code(shard)}.`);

if(runs.length===1){
 const run=runs[0].name,manifest=join(run,"result.json");
 try{
  const result=JSON.parse(readFileSync(join(directory,manifest),"utf8"));
  if(result.format!=="breditor/candidate-qualification"||result.formatVersion!==1||!Array.isArray(result.stages))throw Error("Unsupported candidate result");
  if(result.profile!==context.get("profile")||(result.shard?.id??"none")!==shard||(result.source?.commit&&result.source.commit!==context.get("revision")))throw Error("Candidate does not match the runner context");
  const passed=result.stages.filter(stage=>stage.status==="passed").length;
  lines.push(`- Candidate result ${code(result.status)} with ${passed} passed ${passed===1?"stage":"stages"}.`);
  const stage=result.stages.at(-1);
  if(stage&&stage.status!=="passed"){
   const exit=Number.isSafeInteger(stage.exitCode)?` and exit code ${stage.exitCode}`:
    typeof stage.signal==="string"&&/^SIG[A-Z0-9]+$/.test(stage.signal)?` and signal ${code(stage.signal)}`:"";
   lines.push(`- Last stage ${code(stage.id)} recorded ${code(stage.status)}${exit}.`);
   if(typeof stage.id==="string"&&token.test(stage.id)){
    const log=join(run,`${String(result.stages.length).padStart(2,"0")}-${stage.id}.log`);
    if(existsSync(join(directory,log)))lines.push("- The stage log in the uploaded artifact is `"+log+"`.");
   }
  }
  const slowest=result.stages.flatMap(({id,status,execution,startedAt,finishedAt})=>{
   if(status!=="passed"||execution==="activation-shard"||typeof id!=="string"||!token.test(id)||
      typeof startedAt!=="string"||typeof finishedAt!=="string")return [];
   const duration=Date.parse(finishedAt)-Date.parse(startedAt);
   return Number.isFinite(duration)&&duration>=0?[{id,duration}]:[];
  }).sort((a,b)=>b.duration-a.duration).slice(0,5);
  if(slowest.length){
   lines.push("- Slowest completed stages in this job");
   for(const {id,duration} of slowest)lines.push(`  - ${code(id)} took ${(duration/1000).toFixed(2)} s.`);
  }
 }catch{lines.push("- Could not read a candidate result matching the runner context.");}
 lines.push("- The result in the uploaded artifact is `"+manifest+"`.");
}else if(runs.length===0){
 const stopped=["checkout","node","rust","npm","cargo","browsers","candidate"]
  .find(id=>["failure","cancelled"].includes(context.get(id)));
 if(stopped)lines.push(`- Runner step ${code(stopped)} reported ${code(context.get(stopped))}.`);
 lines.push("- The verifier did not record a candidate result. Runner outcomes are in `runner-context.tsv`.");
}else{
 lines.push("- The artifact contains multiple candidate results. Inspect their manifests individually.");
}
lines.push("","V1 release approval is reviewed separately.");
console.log(lines.join("\n"));
