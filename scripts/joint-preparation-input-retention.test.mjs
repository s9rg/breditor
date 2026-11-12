/** Fixture boundary regression: session.retain() returns the selected file
 * directly. The integrity wrapper belongs to a different scope API. */
import {tmpdir} from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {join} from 'node:path';
import {prepareJointExecution} from './fixtures/native-publication/prepare-joint-execution.mjs';
import {LoadedNativeReconstructionCurrent as Loaded} from '../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';

test('preparation retains the direct selected file before its downstream archive reader',async t=>{
 const directory=fs.mkdtempSync(join(fs.realpathSync(tmpdir()),'breditor-joint-input-retention-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const bytes=Buffer.from('Fixture DATA only: native input bytes 🙂 日本語\n');
 const selection=Object.freeze({format:'breditor/selected-room-current-selection',formatVersion:1,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 const retained=Object.freeze({selection,file:new Blob([bytes],{type:'application/vnd.breditor.selected-room-current'})});
 const marker=Error('Stop after the real preparation entrypoint retained its exact input');
 const read=Loaded.read;let reads=0,retains=0;
 Loaded.read=async(input,integrity)=>{assert.equal(input,retained);assert.equal(typeof integrity.checkAuthority,'function');reads++;throw marker;};
 t.after(()=>{Loaded.read=read;});
 await assert.rejects(prepareJointExecution({session:{async retain(){retains++;return retained;}},host:{directory},assetTransport:{},native:{}},'input-retention-regression'),error=>error===marker);
 assert.equal(retains,1);assert.equal(reads,1);
 const archive=join(directory,'joint-selected-original-before-preparation.archive');assert.deepEqual(fs.readFileSync(archive),bytes);
 const saved=JSON.parse(fs.readFileSync(join(directory,'joint-selected-original-before-preparation.json')));
 assert.deepEqual(saved.selection,selection);assert.equal(saved.readBackVerified,true);assert.equal(saved.physicalBlobConstructionRetained,false);assert.equal(saved.ownerOrServingAuthority,false);
});
