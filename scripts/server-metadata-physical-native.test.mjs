import {join as evidenceJoin} from 'node:path';
import {metadataNativeRoot} from './fixtures/server-metadata/native-root.mjs';
/** Genuine physical-family operator control and original enabled/disabled lane declarations. */
import test from 'node:test';import assert from 'node:assert/strict';import {writeFileSync,mkdtempSync} from 'node:fs';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {SharedPhysicalRoomRecoveryHost as Host,physicalRecoveryHostPort} from '../packages/breditor-collaboration/dist/physical_recovery_control/host.js';
const root=new URL('../',import.meta.url).pathname;
test('actual physical control reads metadata under its own family, source and private operator account',{timeout:180000},async()=>{
 const fetchOriginal=globalThis.fetch;let fixtures,reader;
 globalThis.fetch=(url,options={})=>{const headers=new Headers(options.headers);headers.set('Origin','http://127.0.0.1:4187');return fetchOriginal(url,{...options,headers});};
 try{fixtures=await completeControlFixtures(metadataNativeRoot(root));const chosen=fixtures.manifest.cases.find(item=>{const f=fixtures.fixture(item);return f.language===3&&f.standard&&f.atomic;});assert.ok(chosen);const fixture=fixtures.fixture(chosen),inventory=JSON.parse(fixture.inventoryJson),query=Object.fromEntries([['versions','versionsBinding'],['suggestions','suggestionsBinding'],['revisions','revisionsBinding']].map(([name,key])=>[name,{kind:typeof inventory[key]==='string'?'start':'disabled'}]));
  reader=await Host.open({endpoint:chosen.endpoint,expected:chosen.selection,principal:'operator',getToken:()=>fixtures.controls.token(chosen.path),checkAuthority(){}});const port=physicalRecoveryHostPort(reader),page=await port.readMetadata(query);assert.equal(page.format,'breditor/physical-room-recovery-metadata-read');assert.deepEqual(page.selection,chosen.selection);for(const name of ['versions','suggestions','revisions'])assert.equal(page.metadata[name].kind,query[name].kind==='disabled'?'disabled':'page');assert.equal('activate'in page,false);assert.ok(Object.isFrozen(page.metadata));
  const method=Host.prototype.readMetadata;try{Host.prototype.readMetadata=()=>Promise.resolve({forged:true});assert.equal('forged'in await port.readMetadata(query),false);}finally{Host.prototype.readMetadata=method;}
  assert.throws(()=>physicalRecoveryHostPort({...reader}),error=>error.code==='control_policy');writeFileSync(evidenceJoin(evidence,'native-physical-page.json'),JSON.stringify(page,null,2)+'\n',{flag:'wx'});reader.close();await assert.rejects(port.readMetadata(query),error=>error.code==='control_closed');
 }finally{reader?.close();globalThis.fetch=fetchOriginal;await fixtures?.close();}
});

const evidence=mkdtempSync(new URL('../target/metadata-native-physical-evidence-',import.meta.url).pathname);
