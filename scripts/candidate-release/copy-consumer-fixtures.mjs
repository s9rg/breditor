import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join,relative,resolve} from 'node:path';

/** Copy test fixtures unchanged apart from the reversible installed module paths. */
export function copyConsumerFixtures(root,consumer,paths){
 const fixtureRoot=join(root,'scripts/fixtures'),copied=new Set();
 function copy(path){
  const absolute=resolve(fixtureRoot,path),name=relative(fixtureRoot,absolute);
  assert.ok(absolute.startsWith(fixtureRoot+'/'));
  if(copied.has(name))return;
  copied.add(name);
  const original=readFileSync(absolute,'utf8'),workspace="'../../../packages/breditor-collaboration/dist/";
  for(const match of original.matchAll(/(?:from\s*|import\s*\()(['"])([^'"]+)\1/g)){
   if(match[2].startsWith('.')){
    const dependency=resolve(dirname(absolute),match[2]);
    if(dependency.startsWith(fixtureRoot+'/'))copy(relative(fixtureRoot,dependency));
   }
  }
  const installed="'../../node_modules/@breditor/collaboration/dist/",changed=original.replaceAll(workspace,installed);
  assert.equal(changed.replaceAll(installed,workspace),original);
  const output=join(consumer,'fixtures',name);mkdirSync(dirname(output),{recursive:true});
  writeFileSync(output,changed);
 }
 for(const path of paths)copy(path);
}
