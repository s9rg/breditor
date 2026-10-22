/** Closed header budgets precede materialization of oversized declared values. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import * as api from '../packages/breditor-collaboration/dist/index.js';import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentLocalParticipant as Participant} from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';import {captureLocalOperationBackup as capture} from '../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js';import * as codec from '../packages/breditor-collaboration/dist/independent_local_operation/portable_codec.js';import {MAX_OPERATION_RASTER_REFERENCES} from '../packages/breditor-collaboration/dist/independent_operation/portable_rasters.js';import {MAX_INDEPENDENT_SOURCE_RECORDS} from '../packages/breditor-collaboration/dist/independent_source/contract.js';
import {localParticipantUnitHost} from './fixtures/independent-local-operation/participant.mjs';import {prepareLocalPortableCase} from './fixtures/independent-local-operation/portable.mjs';
const runtime=process.env.BREDITOR_LOCAL_PORTABLE_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;let host;
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});after(()=>host?.free());
for(const kind of ['oversized-assets','oversized-parts','invalid-intent'])test('header count fence before value cloning: '+kind,async()=>{
 const value=await prepareLocalPortableCase(await host.fixture(),capture);let reads=0;
 try{const {backup}=await value.capture(),header=backup.metadata(),bodyBytes=header.parts.reduce((sum,row)=>sum+row.bytes,0),trap=()=>{reads++;throw Error('Value cloned before count admission');};
  if(kind==='oversized-assets'){header.assets=Array(header.bindings.length+1);Object.defineProperty(header.assets,0,{get:trap,enumerable:true});}
  else if(kind==='oversized-parts'){header.parts=Array(MAX_OPERATION_RASTER_REFERENCES+2*127+MAX_INDEPENDENT_SOURCE_RECORDS+3);Object.defineProperty(header.parts,0,{get:trap,enumerable:true});}
  else{header.intent.sequence='0';Object.defineProperty(header.parts,0,{get:trap,enumerable:true});}
  await assert.rejects(codec.readLocalOperationPortableHeader(header,bodyBytes,backup.selection(),rich.checkRichAssetLimits()));assert.equal(reads,0);
 }finally{await value.close();}
});
