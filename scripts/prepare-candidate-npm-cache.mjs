/** Populate npm registry metadata needed by independently installed offline fixtures. */
import {execFileSync} from "node:child_process";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

const lock=JSON.parse(readFileSync(new URL("../package-lock.json",import.meta.url),"utf8"));
const names=["@types/react","css-tree","fake-indexeddb","jsdom","markdown-it","parse5","react","react-dom"];
const specs=names.map(name=>{
 const version=lock.packages[`node_modules/${name}`]?.version;
 if(typeof version!=="string"||!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(version)){
  throw Error(`Missing exact workspace fixture dependency version for ${name}`);
 }
 return `${name}@${version}`;
});
const fixture=mkdtempSync(join(tmpdir(),"breditor-npm-cache-prep-"));
try{
 // A locked workspace npm ci downloads tarballs without seeding every registry
 // packument needed by a separate npm install without a consumer lockfile.
 execFileSync("npm",[
  "install","--prefer-offline","--ignore-scripts","--no-audit","--no-fund","--package-lock=false",...specs,
 ],{cwd:fixture,stdio:"inherit"});
}finally{
 rmSync(fixture,{recursive:true,force:true});
}
