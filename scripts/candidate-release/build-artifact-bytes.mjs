/** Allocation bound for a live compiler tree. Temporary files may disappear
 * during traversal; symlinks are never followed and hard links count once. */
import {lstatSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
export function buildArtifactBytes(directory,ceiling){
 if(!Number.isSafeInteger(ceiling)||ceiling<1)throw Error('A positive build allocation ceiling is mandatory');
 const pending=[directory],seen=new Set();let bytes=0;
 while(pending.length){
  const path=pending.pop();let stat;
  try{stat=lstatSync(path);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  const identity=stat.dev+':'+stat.ino;if(seen.has(identity))continue;seen.add(identity);
  const allocated=typeof stat.blocks==='number'?stat.blocks*512:stat.size;
  if(!Number.isSafeInteger(allocated)||allocated<0)throw Error('Build allocation is unavailable');bytes+=allocated;
  if(bytes>ceiling)return bytes;
  if(stat.isDirectory()){
   let names;try{names=readdirSync(path);}catch(error){if(error.code==='ENOENT')continue;throw error;}
   for(const name of names)pending.push(join(path,name));
  }
 }
 return bytes;
}
