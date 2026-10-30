import {join as evidenceJoin} from 'node:path';
import {metadataNativeRoot} from './fixtures/server-metadata/native-root.mjs';
/** Real original version admission and byte-variant retry; no fabricated receipt or native source. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';import {createHash} from 'node:crypto';
import {selectedDeliveryNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {SharedServerLogGenerationRecoveryHost as Host} from '../packages/breditor-collaboration/dist/generation_recovery_control/host.js';
import {SharedRichEditor} from '../packages/breditor-collaboration/dist/core.js';
import {VersionCatalogHttp} from '../packages/breditor-collaboration/dist/versions/http.js';
import * as wasm from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
const root=new URL('../',import.meta.url).pathname,sha=text=>'sha256:'+createHash('sha256').update(text).digest('hex'),query={versions:{kind:'start'},suggestions:{kind:'start'},revisions:{kind:'start'}};
await wasm.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
test('metadata-only publication invalidates the selected cut and retains the first packet despite a valid differently encoded duplicate',{timeout:120000},async()=>{
 const fetchOriginal=globalThis.fetch;let native,beforeReader,afterReader,profile,core,http,discovery;
 globalThis.fetch=(url,options={})=>{const headers=new Headers(options.headers);headers.set('Origin','http://127.0.0.1:4187');return fetchOriginal(url,{...options,headers});};
 try{native=await selectedDeliveryNativeHost(metadataNativeRoot(root),{suggestionGrants:true});const chosen=native.initial,fixture=native.fixture(chosen),client=fixture.clients.find(row=>!row.observer),auth=await native.authentication(client),signal=new AbortController().signal;
  beforeReader=await Host.open({endpoint:chosen.endpoint,expected:chosen.selection,principal:'operator',getToken:()=>native.operatorToken(chosen),checkAuthority(){}});const before=await beforeReader.readAcceptedNative({document:'include',review:{kind:'start'}});
  profile=wasm.SharedRichProfile.from_standard_configuration_json_v3(fixture.configuration);core=new SharedRichEditor(profile.restore('room',client.baseCheckpoint),{richLanguage:3});const packet=core.captureVersion('Actual first server packet',client.principal,'11'),info=core.readVersion(packet),variant=JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(packet)).reverse()),null,2);assert.notEqual(variant,packet);assert.equal(core.readVersion(variant).id,info.id);assert.notEqual(sha(variant),sha(packet));
  discovery=new VersionCatalogHttp({endpoint:chosen.clientEndpoint,principal:client.principal,room:'room',getToken:auth.getToken});const descriptor=await discovery.describe(signal);assert.equal(descriptor.canPublish,true);http=new VersionCatalogHttp({endpoint:chosen.clientEndpoint,principal:client.principal,room:'room',binding:descriptor.descriptor.binding,getToken:auth.getToken});const published=await http.publish(packet,signal);assert.equal(published.kind,'durable');assert.equal(published.duplicate,false);assert.equal(published.entry.version.id,info.id);
  await assert.rejects(beforeReader.readMetadata(query),'Matching native document/review clocks cannot bless a metadata-only changed server cut');const fresh=await native.refreshAfter(chosen);afterReader=await Host.open({endpoint:fresh.endpoint,expected:fresh.selection,principal:'operator',getToken:()=>native.operatorToken(fresh),checkAuthority(){}});const after=await afterReader.readAcceptedNative({document:'include',review:{kind:'start'}});assert.equal(after.documentFrame,before.documentFrame);assert.deepEqual(after.review.batches,before.review.batches);
  const duplicate=await http.publish(variant,signal);assert.equal(duplicate.kind,'durable');assert.equal(duplicate.duplicate,true);assert.deepEqual(duplicate.entry,published.entry);await afterReader.check();const metadata=await afterReader.readMetadata(query),versions=metadata.metadata.versions;assert.equal(versions.kind,'page');assert.deepEqual(versions.catalog.entries,[published.entry]);assert.deepEqual(versions.packets,[{id:info.id,bytes:Buffer.byteLength(packet),sha256:sha(packet)}]);assert.notEqual(versions.packets[0].sha256,sha(variant));
  writeFileSync(evidenceJoin(evidence,'native-original-version-metadata.json'),JSON.stringify({metadata,published,duplicate,packet,variant,nativeDocumentFrameUnchanged:true,nativeReviewBatchesUnchanged:true,oldSelectionRefused:true},null,2)+'\n',{flag:'wx'});
 }finally{http?.dispose();discovery?.dispose();core?.dispose();profile?.free();beforeReader?.close();afterReader?.close();globalThis.fetch=fetchOriginal;await native?.stop();}
});

const evidence=mkdtempSync(new URL('../target/metadata-native-version-evidence-',import.meta.url).pathname);
