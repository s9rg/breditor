/** Source and artifact evidence for a working-tree qualification, never a hermetic RC claim. */
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {lstatSync,readFileSync,realpathSync,writeFileSync,renameSync,openSync,fsyncSync,closeSync} from "node:fs";
import {resolve,relative,isAbsolute,dirname} from "node:path";
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
function within(root,path){const actual=relative(realpathSync(root),realpathSync(path));if(isAbsolute(actual)||actual.split(/[\\/]/)[0]==="..")throw Error("Evidence input escapes its repository");}
export function fileEvidence(root,path){
 if(isAbsolute(path)||path.split(/[\\/]/).includes(".."))throw Error("Evidence needs a repository-relative path");
 const full=resolve(root,path),stat=lstatSync(full);within(root,full);
 if(!stat.isFile()||stat.size>32*1024*1024)throw Error(`Unsupported or oversized evidence file: ${path}`);
 return {path,bytes:stat.size,sha256:hash(readFileSync(full)),modifiedAtMs:stat.mtimeMs};
}
/** Include tracked and nonignored untracked inputs, not ignored generated caches/logs. */
export function sourceEvidence(root){
 const git=args=>execFileSync("git",args,{cwd:root,encoding:"utf8",maxBuffer:8*1024*1024});
 const paths=[...new Set(git(["ls-files","--cached","--others","--exclude-standard","-z"]).split("\0").filter(Boolean))].sort();
 if(!paths.length||paths.length>32768)throw Error("Unsupported source inventory size");
 const files=paths.map(path=>fileEvidence(root,path));if(files.reduce((sum,file)=>sum+file.bytes,0)>256*1024*1024)throw Error("Source evidence exceeds its explicit budget");
 let commit=null;try{commit=git(["rev-parse","--verify","HEAD"]).trim();}catch{/* An uncommitted fixture can still prove source-change refusal. */}
 const digest=createHash("sha256");for(const {path,bytes,sha256} of files)digest.update(JSON.stringify([path,bytes,sha256])+"\n");
 return {commit,dirty:git(["status","--porcelain=v1"]).length>0,sha256:digest.digest("hex"),files:files.length,bytes:files.reduce((sum,file)=>sum+file.bytes,0)};
}
/** Atomic replacement within a fresh owned result directory; interruption retains old evidence. */
export function saveEvidence(path,value){
 const temporary=`${path}.next`;writeFileSync(temporary,JSON.stringify(value,null,2)+"\n",{mode:0o600});
 const file=openSync(temporary,"r");try{fsyncSync(file);}finally{closeSync(file);}renameSync(temporary,path);
 // Directory fsync is supported on the qualified POSIX build hosts. The manifest remains
 // readable on other hosts; no crash-durability qualification is inferred there.
 if(process.platform!=="win32"){const directory=openSync(dirname(path),"r");try{fsyncSync(directory);}finally{closeSync(directory);}}
}
