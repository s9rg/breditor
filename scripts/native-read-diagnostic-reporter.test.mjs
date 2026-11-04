/** Reporting an actual refusal must preserve it and emit only finite length DATA. */
import test from 'node:test';import assert from 'node:assert/strict';
import {withPayloadReadDiagnostics as report} from './fixtures/native-publication/payload-read-diagnostics.mjs';
import {archiveReadLengthFailure} from '../packages/breditor-collaboration/dist/archive_integrity/read_length_failure.js';
import {lineagePayloadReadFailure} from '../packages/breditor-collaboration/dist/independent_operation/payload_read_failure.js';
async function capture(work){const prior=console.error,lines=[];console.error=value=>lines.push(value);try{await work(lines);}finally{console.error=prior;}}
test('both measured archive and lineage refusals retain their original identity and exact scalar observations',()=>capture(async lines=>{
 for(const[error,property,prefix]of[
  [archiveReadLengthFailure(0,1048576,0,0),'readFailure','ARCHIVE_READ_LENGTH_FAILURE'],
  [lineagePayloadReadFailure(()=>Error('original lineage refusal'),2097152,1048576,1048576,0,0),'payloadReadFailure','LINEAGE_PAYLOAD_READ_LENGTH_FAILURE'],
 ]){Object.freeze(error);const before=lines.length;await assert.rejects(report(()=>Promise.reject(error)),actual=>actual===error);assert.equal(lines.length,before+1);assert.equal(lines.at(-1),prefix+' '+JSON.stringify(error[property]));}
}));
test('custom diagnostics cannot expose extra payload fields or replace a frozen original refusal',()=>capture(async lines=>{
 const error=Error('original');Object.defineProperty(error,'readFailure',{value:{kind:'read-length',offset:0,expectedBytes:3,observedBeforeAuthorityBytes:0,actualBytes:0,payload:'must-not-appear'}});Object.freeze(error);
 await assert.rejects(report(()=>Promise.reject(error)),actual=>actual===error);assert.equal(lines.length,1);assert.equal(lines[0].includes('must-not-appear'),false);assert.equal(Object.keys(JSON.parse(lines[0].slice(lines[0].indexOf(' ')+1))).length,5);
 const hostile=Error('hostile diagnostic');Object.defineProperty(hostile,'readFailure',{get(){throw Error('No diagnostic getter call');}});Object.freeze(hostile);await assert.rejects(report(()=>Promise.reject(hostile)),actual=>actual===hostile);assert.equal(lines.length,1);
}));
test('successful work and unmeasured refusals keep their exact values without diagnostic output',()=>capture(async lines=>{
 const value=Object.freeze({data:'unchanged'});assert.equal(await report(async()=>value),value);
 const error=Object.freeze(Error('no observations'));await assert.rejects(report(()=>Promise.reject(error)),actual=>actual===error);assert.deepEqual(lines,[]);
}));
