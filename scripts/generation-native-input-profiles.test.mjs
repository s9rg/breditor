/** Genuine before-files and accepted pages for all ten native grammar/wire
 * configurations. Preparation is read-only and grants no serving authority. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import {generationCompleteControlFixtures} from './fixtures/generation-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/selected-generation-reconciliation/accepted-transport.mjs';
import {generationBoundSession} from './fixtures/selected-generation-reconciliation/all-bound.mjs';
import {selectedNativePairs} from './fixtures/selected-generation-reconciliation/session.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
import {previewSelectedGenerationNativeImport as preview} from '../packages/breditor-collaboration/dist/selected_generation_import/coordinator.js';
import {SelectedGenerationNativeImportArchive as Archive} from '../packages/breditor-collaboration/dist/selected_generation_import/archive.js';
import {SelectedNativeImportArchive as PhysicalArchive} from '../packages/breditor-collaboration/dist/selected_native_import/archive.js';
let fixtures,transport;before(async()=>{fixtures=await generationCompleteControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});after(async()=>{transport?.restore();await fixtures?.close();});
for(let index=0;index<10;index++)test('generation accepted-input codec binds genuine native profile/wire '+index,async()=>{const s=await generationBoundSession(fixtures,'generation-input-profile-'+index,{item:fixtures.manifest.cases[index],converge:false});let archive;
 try{await s.owner.capture(s.input());const before=await snapshotReadDatabases(),native=selectedNativePairs(s.owner,false),proposed=await preview(s.owner,s.host,s.input(),{database:'generation-profile-input-'+index}),options={wasm:fixtures.native,checkAuthority(){}};assert.deepEqual(await snapshotReadDatabases(),before);assert.deepEqual(selectedNativePairs(s.owner,false),native);archive=await Archive.read(proposed.input.file,proposed.input.selection,options);const manifest=archive.manifest();assert.equal(manifest.format,'breditor/selected-generation-native-import-input');assert.deepEqual(manifest.server,s.host.selection());assert.equal(Object.hasOwn(manifest.server.source,'ancestor'),false);assert.equal(Object.hasOwn(manifest.server.source,'localOrigin'),false);assert.deepEqual(manifest.server.source,fixtures.fixture(fixtures.manifest.cases[index]).generationRecoveryState);for(const[i,page]of manifest.pages.entries())assert.deepEqual(await archive.readPage(i,options),await s.host.readAcceptedNative(page.request));await assert.rejects(PhysicalArchive.read(proposed.input.file,proposed.input.selection,options));await assert.rejects(PhysicalArchive.read(proposed.input.file,{...proposed.input.selection,format:'breditor/selected-native-import-selection'},options));assert.deepEqual(selectedNativePairs(s.owner,false),native);assert.deepEqual(await snapshotReadDatabases(),before);assert.equal(Object.hasOwn(proposed,'activate'),false);
 }finally{archive?.dispose();await s.close();}
});
