/** Bind historical compatibility runs to the retained generated runtime bytes. */
import {createHash} from "node:crypto";
import {mkdirSync,mkdtempSync,readFileSync,rmSync,statSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,resolve} from "node:path";
import {pathToFileURL} from "node:url";

const pins=JSON.parse(readFileSync(new URL("./input-rule-historical-pins.json",import.meta.url),"utf8"));

export function readPinnedInputRuleArtifact(directory,{path,bytes,sha256}){
 const file=resolve(directory,path);
 const stat=statSync(file,{throwIfNoEntry:false});
 if(!stat?.isFile())throw Error(`Expected a regular historical input-rule artifact: ${file}`);
 if(stat.size!==bytes)throw Error(`Historical input-rule artifact has ${stat.size} bytes, expected ${bytes}: ${file}`);
 const contents=readFileSync(file);
 const digest=createHash("sha256").update(contents).digest("hex");
 if(contents.length!==bytes||digest!==sha256)throw Error(`Historical input-rule artifact digest ${digest} does not match ${sha256}: ${file}`);
 return contents;
}

function pairedPins(directories){
 if(directories.length!==2&&directories.length!==pins.length)throw Error("Expected the earlier local/shared pair or both pinned local/shared pairs");
 return pins.slice(0,directories.length);
}

function readReferences(directories,selected){
 return directories.map((directory,index)=>{
  const pin=selected[index];
  return {pin,files:pin.files.map(file=>({path:file.path,contents:readPinnedInputRuleArtifact(directory,file)}))};
 });
}

/** Check all required artifacts before a producer build or package install. */
export function preflightHistoricalInputRuleRuntimes(directories){
 readReferences(directories,pairedPins(directories));
}

/** Load only an isolated snapshot of the bytes verified against the historical receipts. */
export async function loadHistoricalInputRuleRuntimes(directories){
 return loadReferences(readReferences(directories,pairedPins(directories)));
}

/** Explicit recovery proof using both original local readers and no shared reader. */
export async function loadHistoricalLocalInputRuleRuntimes(earlierDirectory,programmaticDirectory){
 const directories=[earlierDirectory,programmaticDirectory];
 if(directories.some(directory=>typeof directory!=="string"||!directory||directory.startsWith("--")))throw Error("Expected the earlier and programmatic local reader directories");
 const localPins=["earlier","programmatic"].map(generation=>pins.find(pin=>pin.runtime==="local"&&pin.generation===generation));
 return loadReferences(readReferences(directories,localPins));
}

async function loadReferences(references){
 const scratch=mkdtempSync(resolve(tmpdir(),"breditor-input-rule-reference-"));
 try{
  writeFileSync(resolve(scratch,"package.json"),'{"type":"module"}\n',{flag:"wx"});
  const runtimeLocations=references.map(({pin,files})=>{
   const directory=resolve(scratch,pin.generation,pin.runtime);
   for(const {path,contents} of files){
    const file=resolve(directory,path);
    mkdirSync(dirname(file),{recursive:true});
    writeFileSync(file,contents,{flag:"wx"});
   }
   return directory;
  });
  // The pinned glue imports a static module graph and receives Wasm bytes
  // directly. The staged files are only needed until initialization finishes.
  const modules=[];
  for(const [index,{pin,files}] of references.entries()){
   const base=pin.runtime==="local"?"breditor_wasm":"breditor_shared";
   const wasmPath=`${base}_bg.wasm`;
   const module=await import(pathToFileURL(resolve(runtimeLocations[index],`${base}.js`)).href);
   await module.default({module_or_path:files.find(file=>file.path===wasmPath).contents});
   modules.push({module,sha256:pin.files.find(file=>file.path===wasmPath).sha256,reference:pin});
  }
  return modules;
 }finally{
  rmSync(scratch,{recursive:true,force:true});
 }
}
