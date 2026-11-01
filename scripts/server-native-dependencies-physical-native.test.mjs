
/** Real physical-host Native dependency read. This does not create any client owner. */
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync} from 'node:fs';import {join} from 'node:path';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {dependencyNativeRoot} from './fixtures/server-native-dependencies/native-root.mjs';
import {SharedPhysicalRoomRecoveryHost as Host} from '../packages/breditor-collaboration/dist/physical_recovery_control/host.js';
import {captureSelectedServerNativeDependencies,withCheckedServerNativeDependencies} from '../packages/breditor-collaboration/dist/server_native_dependencies/collect.js';
const root=new URL('../',import.meta.url).pathname,evidence=mkdtempSync(new URL('../target/server-native-dependencies-physical-evidence-',import.meta.url).pathname);
test('genuine physical control reads complete Native source knowledge with its own selected operator family',{timeout:180000},async()=>{
 const fetchOriginal=globalThis.fetch;let fixtures,reader;
 globalThis.fetch=(url,options={})=>{const headers=new Headers(options.headers);headers.set('Origin','http://127.0.0.1:4187');return fetchOriginal(url,{...options,headers});};
 try{fixtures=await completeControlFixtures(dependencyNativeRoot(root));const chosen=fixtures.manifest.cases.find(item=>{const f=fixtures.fixture(item);return f.language===3&&f.standard&&f.atomic;});assert.ok(chosen);
  reader=await Host.open({endpoint:chosen.endpoint,expected:chosen.selection,principal:'operator',getToken:()=>fixtures.controls.token(chosen.path),checkAuthority(){}});const method=Host.prototype.readNativeDependencies;let read;
  try{Host.prototype.readNativeDependencies=()=>{throw Error('Public method is not the Native read port');};read=await captureSelectedServerNativeDependencies(reader);}finally{Host.prototype.readNativeDependencies=method;}
  assert.equal(read.format,'breditor/physical-room-recovery-native-dependencies-read');assert.equal(read.native.outcome.kind,'ready');assert.deepEqual(read.native.source,chosen.selection.source.server.native);assert.equal('activate'in read,false);assert.equal('clientRole'in read,false);assert.equal(await withCheckedServerNativeDependencies(read,async()=>true),true);assert.ok(Object.isFrozen(read.native));
  writeFileSync(join(evidence,'physical-native-dependencies.json'),JSON.stringify(read,null,2)+'\n',{flag:'wx'});reader.close();await assert.rejects(withCheckedServerNativeDependencies(read,async()=>true),error=>error.code==='control_closed');console.log('SERVER_NATIVE_DEPENDENCIES_PHYSICAL '+JSON.stringify({directory:evidence,selected:chosen.selection,nativeKind:read.native.outcome.kind,publicShadowIgnored:true}));
 }finally{reader?.close();globalThis.fetch=fetchOriginal;await fixtures?.close();}
});
