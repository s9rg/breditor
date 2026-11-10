/** Reproduce the pinned read-only test corpus without relying on prior ignored
 * build output. Only absent files are written; changed/extraneous data refuses. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,realpathSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
const sha=data=>createHash('sha256').update(data).digest('hex');
export function prepareActivationRetentionFixture(root){
 root=realpathSync(resolve(root));
 const bytes=readFileSync(join(root,'scripts/fixtures/activation-retention/actual-intent.json.gz'));
 assert.equal(bytes.length,3868331);assert.equal(sha(bytes),'a4de81f253f2ebb451cfbc5d72c7898ee6ef9da20950b3176d9c9eb6e86d2adc');
 const body=JSON.parse(gunzipSync(bytes,{maxOutputLength:32*1024*1024}));
 assert.equal(body.format,'breditor/activation-retention-fixture-bytes');assert.equal(body.formatVersion,1);assert.equal(body.files.length,17);
 const files=new Map();let total=0;
 for(const row of body.files){
  assert.match(row.name,/^(?:index\.json|choice\.json|graph\.json|state\.json|[a-f0-9]{64}\.bin)$/);assert.equal(files.has(row.name),false);assert.equal(typeof row.data,'string');
  const data=Buffer.from(row.data,'base64');assert.equal(data.toString('base64'),row.data);total+=data.length;assert.ok(total<=32*1024*1024);files.set(row.name,data);
 }
 const indexBytes=files.get('index.json');assert.equal(sha(indexBytes),'572671293d3afd4c2134c69774e8e0bacc0d180e9f652dbf8d64a4354a510518');
 const index=JSON.parse(indexBytes);assert.equal(index.files.length,16);
 assert.deepEqual([...files.keys()].sort(),['index.json',...index.files.map(row=>row.name)].sort());
 for(const row of index.files){const data=files.get(row.name);assert.equal(data.length,row.bytes);assert.equal(sha(data),row.sha256);}
 const target=join(root,'target');mkdirSync(target,{recursive:true});assert.equal(realpathSync(target),target);
 const directory=join(target,'activation-retainer-actual-input');mkdirSync(directory,{recursive:true});assert.equal(lstatSync(directory).isSymbolicLink(),false);assert.equal(realpathSync(directory),directory);
 for(const name of readdirSync(directory))assert.equal(files.has(name),true,'Preserve unexpected fixture data');
 for(const[name,data]of files){
  const path=join(directory,name);
  try{writeFileSync(path,data,{flag:'wx',mode:0o600});}catch(error){if(error?.code!=='EEXIST')throw error;}
  const stat=lstatSync(path);assert.equal(stat.isFile(),true);assert.equal(stat.isSymbolicLink(),false);assert.ok(readFileSync(path).equals(data),'Preserve changed fixture data: '+name);
 }
 return directory;
}
