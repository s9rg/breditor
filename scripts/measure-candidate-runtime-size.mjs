/** Record the download footprint of both opt-in runtime pairs. */
import {createHash} from "node:crypto";
import {mkdirSync,readFileSync,realpathSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {gzipSync} from "node:zlib";
import {saveEvidence} from "./candidate-release/evidence.mjs";

const repository=resolve(dirname(fileURLToPath(import.meta.url)),"..");
export const candidateRuntimeSizeReport="target/candidate-runtime-size.json";
const variants=[
 {profile:"local",directory:"packages/breditor-experimental-rich-content/dist",stem:"breditor_wasm"},
 {profile:"shared",directory:"packages/breditor-collaboration/dist/runtime",stem:"breditor_shared"},
];

export function measureCandidateRuntimeSize(root=repository){
 const profiles=variants.map(({profile,directory,stem})=>{
  const paths=[`${directory}/${stem}.js`,`${directory}/${stem}_bg.wasm`];
  const files=paths.map(path=>{
   const contents=readFileSync(resolve(root,path));
   if(!contents.length)throw Error(`Empty runtime artifact: ${path}`);
   return {path,rawBytes:contents.length,gzipBytes:gzipSync(contents,{level:9}).length,
    sha256:createHash("sha256").update(contents).digest("hex")};
  });
  return {profile,files,rawBytes:files.reduce((total,file)=>total+file.rawBytes,0),
   gzipBytes:files.reduce((total,file)=>total+file.gzipBytes,0)};
 });
 return {format:"breditor/candidate-runtime-footprint",formatVersion:1,gzipLevel:9,profiles};
}

if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==2){
  console.error("Usage: node scripts/measure-candidate-runtime-size.mjs");
  process.exitCode=2;
 }else{
  const report=measureCandidateRuntimeSize(),path=resolve(repository,candidateRuntimeSizeReport);
  mkdirSync(dirname(path),{recursive:true});
  saveEvidence(path,report);
  console.log(JSON.stringify(report,null,2));
 }
}
