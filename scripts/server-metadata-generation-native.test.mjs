import {join as evidenceJoin} from 'node:path';
import {metadataNativeRoot} from './fixtures/server-metadata/native-root.mjs';
/** Genuine separately authenticated selected Native server; no synthetic native proof. */
import test from 'node:test';import assert from 'node:assert/strict';import {writeFileSync,mkdtempSync} from 'node:fs';
import {selectedDeliveryNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {SharedServerLogGenerationRecoveryHost as Host,generationRecoveryHostPort} from '../packages/breditor-collaboration/dist/generation_recovery_control/host.js';
const root=new URL('../',import.meta.url).pathname;
test('actual generation host reads original metadata pages under exact current operator selection', {timeout:120000},async()=>{
 const fetchOriginal=globalThis.fetch;let native,reader,tokens=0,fetches=0,authority=0,body;
 globalThis.fetch=async(url,options={})=>{fetches++;const headers=new Headers(options.headers);headers.set('Origin','http://127.0.0.1:4187');const response=await fetchOriginal(url,{...options,headers});if(String(url).endsWith('/metadata/read')&&response.status===200)body=await response.clone().text();return response;};
 try{native=await selectedDeliveryNativeHost(metadataNativeRoot(root),{suggestionGrants:true});const chosen=native.initial;reader=await Host.open({endpoint:chosen.endpoint,expected:chosen.selection,principal:'operator',getToken:()=>{tokens++;return native.operatorToken(chosen);},checkAuthority(){authority++;}});
  const query={versions:{kind:'start'},suggestions:{kind:'start'},revisions:{kind:'start'}},page=await reader.readMetadata(query);assert.deepEqual(page.selection,chosen.selection);assert.equal(page.scope,'selected-server-original-metadata-receipts-and-packet-fingerprints-page');for(const name of ['versions','suggestions','revisions']){assert.equal(page.metadata[name].kind,'page');assert.equal(page.metadata[name].catalog.more,false);assert.equal(page.metadata[name].catalog.cursor.after,page.metadata[name].catalog.cursor.through);}assert.ok(Object.isFrozen(page.metadata.versions.catalog));assert.equal('activate'in page,false);
  const repeated=await reader.readMetadata(Object.fromEntries(Object.entries(page.metadata).map(([name,value])=>[name,{kind:'after',cursor:value.catalog.cursor}])));assert.equal(repeated.metadata.versions.catalog.entries.length,0);assert.equal(repeated.metadata.suggestions.catalog.updates.length,0);assert.equal(repeated.metadata.revisions.catalog.revisions.length,0);
  const calls={tokens,fetches,authority};let getters=0;const getterQuery={...query,get versions(){getters++;return{kind:'start'};}};await assert.rejects(reader.readMetadata(getterQuery),error=>error.code==='control_policy');assert.equal(getters,0);assert.deepEqual({tokens,fetches,authority},calls);await reader.check();
  const port=generationRecoveryHostPort(reader),method=Host.prototype.readMetadata;try{Host.prototype.readMetadata=()=>Promise.resolve({forged:true});const actual=await port.readMetadata(query);assert.equal(actual.scope,page.scope);assert.equal('forged'in actual,false);}finally{Host.prototype.readMetadata=method;}
  assert.throws(()=>generationRecoveryHostPort({...reader}),error=>error.code==='control_policy');writeFileSync(evidenceJoin(evidence,'native-generation-page.json'),JSON.stringify(page,null,2)+'\n',{flag:'wx'});writeFileSync(evidenceJoin(evidence,'native-generation-wire.json'),body,{flag:'wx'});reader.close();await assert.rejects(port.readMetadata(query),error=>error.code==='control_closed');
 }finally{reader?.close();globalThis.fetch=fetchOriginal;await native?.stop();}
});

const evidence=mkdtempSync(new URL('../target/metadata-native-generation-evidence-',import.meta.url).pathname);
