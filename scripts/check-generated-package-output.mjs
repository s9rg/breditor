/** Re-emit the three SDK TypeScript packages into disposable directories and
 * require exact file names and bytes before packing. Normal Wasm/glue is a
 * separately qualified input: this check snapshots it, never rebuilds it. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
if(process.argv.length!==2)throw Error('Run without package filters');
const packages=[
 // Match the browser package's two-pass build: stripped JS, full declarations.
 {name:'breditor-browser',output:'dist',external:[],passes:[['--declaration','false','--removeComments'],['--emitDeclarationOnly']]},
 {name:'breditor-experimental-rich-content',output:'dist/browser',external:[],passes:[[]]},
 {name:'breditor-collaboration',output:'dist',external:['runtime'],passes:[[]]},
];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function inventory(directory,excluded=[]){
 const rows=new Map();
 function walk(base){
  for(const entry of fs.readdirSync(base,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
   const path=join(base,entry.name),name=relative(directory,path);
   assert.ok(!entry.isSymbolicLink(),'Generated package output cannot contain a link: '+path);
   if(excluded.includes(name))continue;
   if(entry.isDirectory())walk(path);
   else {assert.ok(entry.isFile(),'Unexpected package entry: '+path);rows.set(name,sha(fs.readFileSync(path)));}
  }
 }
 walk(directory);return rows;
}
const temporary=fs.mkdtempSync('/private/tmp/breditor-generated-package-check-'),results=[];
try{
 for(const specification of packages){
  const base=join(root,'packages',specification.name),output=join(base,specification.output);
  const held=specification.external.map(name=>({name,files:[...inventory(join(output,name))]}));
  const fresh=join(temporary,specification.name);
  for(const flags of specification.passes)execFileSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'-p',join(base,'tsconfig.json'),'--outDir',fresh,...flags],{cwd:root,stdio:'inherit'});
  const expected=inventory(fresh),actual=inventory(output,specification.external);
  assert.ok(expected.size>0,'Compiler produced no package output');
  const missing=[...expected.keys()].filter(name=>!actual.has(name));
  const extra=[...actual.keys()].filter(name=>!expected.has(name));
  const changed=[...expected.keys()].filter(name=>actual.has(name)&&actual.get(name)!==expected.get(name));
  assert.deepEqual({missing,extra,changed},{missing:[],extra:[],changed:[]},specification.name+' dist differs from fresh source output');
  for(const item of held)assert.deepEqual([...inventory(join(output,item.name))],item.files,'Separately qualified runtime changed during package inspection');
  results.push({package:specification.name,output:specification.output,generatedFiles:expected.size,generatedTreeSha256:sha(JSON.stringify([...expected])),externalInputs:held.map(item=>({directory:item.name,files:item.files.length,treeSha256:sha(JSON.stringify(item.files))}))});
 }
 console.log(JSON.stringify({format:'breditor/generated-package-output',formatVersion:1,passed:true,packages:results,scope:'Exact TypeScript output names and bytes; separately qualified Wasm/glue inputs held unchanged. Not a new Wasm build or functional qualification.'},null,2));
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
