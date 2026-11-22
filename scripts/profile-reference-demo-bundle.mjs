/** Report generated JavaScript bytes and the biggest rendered module contributions. */
import assert from "node:assert/strict";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {gzipSync} from "node:zlib";
import {build} from "vite";

if(process.argv.length!==2)throw Error("Usage: node scripts/profile-reference-demo-bundle.mjs");
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../examples/react");
const result=await build({root,logLevel:"error",build:{write:false}});
const outputs=(Array.isArray(result)?result:[result]).flatMap(bundle=>bundle.output);
const chunks=outputs.filter(file=>file.type==="chunk").sort((a,b)=>a.fileName.localeCompare(b.fileName));
assert.ok(chunks.length>0,"No production JavaScript was produced");
const totals={rawBytes:0,gzipBytes:0};
const contributions=new Map();
const files=chunks.map(({fileName,code,modules})=>{
 const rawBytes=Buffer.byteLength(code),gzipBytes=gzipSync(code,{level:9}).length;
 totals.rawBytes+=rawBytes;totals.gzipBytes+=gzipBytes;
 for(const [id,details] of Object.entries(modules)){
  const path=id.replaceAll("\\","/").split("?")[0];
  const file=path.match(/(?:^|\/)(node_modules|packages|examples)\/(.+)$/);
  if(file&&Number.isSafeInteger(details.renderedLength)&&details.renderedLength>0){
   const name=file[1]+"/"+file[2];
   contributions.set(name,(contributions.get(name)??0)+details.renderedLength);
  }
 }
 return {fileName,rawBytes,gzipBytes};
});
const largestModules=[...contributions].map(([path,renderedLength])=>({path,renderedLength}))
 .sort((a,b)=>b.renderedLength-a.renderedLength||a.path.localeCompare(b.path)).slice(0,20);
assert.ok(largestModules.length>0,"The bundler produced no rendered module metadata");
console.log(JSON.stringify({format:"breditor/reference-demo-footprint",formatVersion:1,totals,files,largestModules},null,2));
