/** Native versions are an ordered immutable catalog, not a membership-only bag. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import * as api from '../packages/breditor-collaboration/dist/index.js';import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentLocalParticipant as Participant} from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import {captureLocalOperationBackup as capture} from '../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js';
import {IndependentLocalOperationBackup as Backup} from '../packages/breditor-collaboration/dist/independent_local_operation/portable_backup.js';
import * as codec from '../packages/breditor-collaboration/dist/independent_local_operation/portable_codec.js';
import {localParticipantUnitHost} from './fixtures/independent-local-operation/participant.mjs';import {prepareLocalPortableCase} from './fixtures/independent-local-operation/portable.mjs';import {reframeLocalPortable,remapLocalPortableParts} from './fixtures/independent-local-operation/portable_frame.mjs';
const runtime=process.env.BREDITOR_LOCAL_PORTABLE_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;let host;
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});after(()=>host?.free());
for(const mutation of ['reordered','duplicate'])test(`valid outer framing cannot admit a ${mutation} immutable version catalog`,async()=>{
 const value=await prepareLocalPortableCase(await host.fixture(),capture);let unexpected;
 try{const result=await value.capture();assert.equal(result.kind,'ready');const frame=await reframeLocalPortable(result.backup,codec,(header,parts)=>{const versions=header.live.filter(row=>row.kind==='version');assert.equal(versions.length,2);if(mutation==='reordered'){[parts[versions[0].part],parts[versions[1].part]]=[parts[versions[1].part],parts[versions[0].part]];}else{const index=header.uploads,blob=parts[versions[0].part],rename=new Map(parts.map((_,i)=>[i,i>=index?i+1:i]));remapLocalPortableParts(header,rename);parts.splice(index,0,blob);header.live.push({kind:'version',index:2,part:index});}});
  const prefix=new Uint8Array(await frame.file.slice(0,codec.LOCAL_OPERATION_BACKUP_PREFIX_BYTES).arrayBuffer()),length=new DataView(prefix.buffer).getUint32(codec.LOCAL_OPERATION_BACKUP_MAGIC.length),offset=codec.LOCAL_OPERATION_BACKUP_PREFIX_BYTES+length,raw=JSON.parse(await frame.file.slice(codec.LOCAL_OPERATION_BACKUP_PREFIX_BYTES,offset).text());await codec.readLocalOperationPortableHeader(raw,frame.file.size-offset,frame.selection,rich.checkRichAssetLimits());await assert.rejects(async()=>{unexpected=await Backup.read(frame.file,frame.selection,value.readOptions);});
 }finally{unexpected?.dispose();await value.close();}
});
