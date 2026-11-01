/** Exact compiled SDK bytes, including the normal packaged Native runtime. */
import {readdirSync,lstatSync,readFileSync} from 'node:fs';import {join} from 'node:path';import {createHash} from 'node:crypto';
export function publicationStateCompiled(root,installed=false){
 const rows=[];let bytes=0;
 for(const folder of ['breditor-browser','breditor-experimental-rich-content','breditor-collaboration']){
  const name=folder==='breditor-experimental-rich-content'?'@breditor/experimental-rich-content':folder==='breditor-browser'?'@breditor/browser':'@breditor/collaboration',directory=installed?join(root,'node_modules',name,'dist'):join(root,'packages',folder,'dist');
  function visit(path,relative){for(const entry of readdirSync(path).sort()){const full=join(path,entry),label=relative?relative+'/'+entry:entry,stat=lstatSync(full);if(stat.isDirectory())visit(full,label);else{if(!stat.isFile())throw Error('Compiled SDK may not contain links or special files');const value=readFileSync(full);bytes+=value.length;rows.push([name+'/'+label,value.length,createHash('sha256').update(value).digest('hex')]);}}}visit(directory,'');
 }
 rows.sort((a,b)=>a[0].localeCompare(b[0]));const digest=createHash('sha256');for(const row of rows)digest.update(JSON.stringify(row)+'\n');return{files:rows.length,bytes,sha256:digest.digest('hex')};
}
