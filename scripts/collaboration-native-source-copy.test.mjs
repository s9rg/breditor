import test from "node:test";
import assert from "node:assert/strict";
import {existsSync,mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {copyNativeSourceCrate} from "./collaboration-native-source-copy.mjs";
test("native source copies exclude only the root Cargo cache and preserve target-named sources",()=>{
 const temporary=mkdtempSync(join(tmpdir(),"breditor-native-copy-contract-")),source=join(temporary,"source"),destination=join(temporary,"copy");
 try{
  for(const directory of ["src","target/debug/deps","vendor/library/target"])mkdirSync(join(source,directory),{recursive:true});
  for(const [path,text] of [["Cargo.toml","manifest"],["src/lib.rs","native source"],["target/debug/deps/cache","discardable cache"],["vendor/library/target/source.rs","vendor source"]])writeFileSync(join(source,path),text);
  copyNativeSourceCrate(source,destination);
  assert.equal(existsSync(join(destination,"target")),false);
  for(const path of ["Cargo.toml","src/lib.rs","vendor/library/target/source.rs"])assert.equal(readFileSync(join(destination,path),"utf8"),readFileSync(join(source,path),"utf8"));
  assert.equal(readFileSync(join(source,"target/debug/deps/cache"),"utf8"),"discardable cache");
 }finally{rmSync(temporary,{recursive:true,force:true});}
});
