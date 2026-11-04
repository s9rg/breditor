/** Failure-boundary laws only. Synthetic transport failures grant no Native
 * receipt and do not reproduce or repair the intermittent physical read fault. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {inspect} from 'node:util';
import {SharedDurableNativeActivationHost as Activation} from '../packages/breditor-collaboration/dist/native_activation_control/host.js';
import {SharedNativeRoomPublicationHost as Publication} from '../packages/breditor-collaboration/dist/native_publication_control/host.js';
import {options as activationOptions,using} from './fixtures/native-activation/transport.mjs';
import {options as publicationOptions,joint} from './fixtures/native-publication/transport.mjs';
import {activationFailure} from '../packages/breditor-collaboration/dist/native_activation_control/policy.js';
import {publicationFailure} from '../packages/breditor-collaboration/dist/native_publication_control/policy.js';
import {preserveReadObservations} from '../packages/breditor-collaboration/dist/archive_integrity/preserve_read_observations.js';
import {reportArchiveErrorChain} from './diagnostics/archive-error-chain.mjs';

const archive = () => Object.freeze({kind:'read-length',offset:0,expectedBytes:408,observedBeforeAuthorityBytes:0,actualBytes:0});
const lineage = () => Object.freeze({kind:'lineage-payload-read-length',fileBytes:408,offset:0,expectedBytes:408,observedBeforeAuthorityBytes:0,actualBytes:0});
const measured = (property,row) => Object.assign(Error('TEST_PRIVATE transport or payload detail'),{[property]:row,token:'TEST_PRIVATE credential'});
function assertObservation(error,code,property,row,original){
 assert.equal(error.code,code);assert.notEqual(error,original);
 assert.deepEqual(error[property],row);assert.notEqual(error[property],original[property]);
 assert.ok(Object.isFrozen(error[property]));assert.equal(Object.hasOwn(error,'cause'),false);
 assert.equal(JSON.stringify(error).includes('TEST_PRIVATE'),false);
 assert.equal(inspect(error,{depth:8,showHidden:true}).includes('TEST_PRIVATE'),false);
 return true;
}

test('actual activation requester preserves finite read evidence and keeps the original outcome unknown',async()=>{
 const row=archive(),original=measured('readFailure',row),host=Activation.configure(activationOptions());let calls=0;
 try{await using(async()=>{calls++;throw original;},async()=>{
  await assert.rejects(host.commit(),error=>assertObservation(error,'activation_outcome_unknown','readFailure',row,original));
 });assert.equal(calls,1);}finally{host.close();}
});

test('actual publication requester preserves finite lineage evidence and never grants publication',async()=>{
 const row=lineage(),original=measured('payloadReadFailure',row),host=Publication.configure(publicationOptions());let calls=0;
 try{await using(async()=>{calls++;throw original;},async()=>{
  await assert.rejects(host.publish(joint()),error=>assertObservation(error,'publication_outcome_unknown','payloadReadFailure',row,original));
 });assert.equal(calls,1);}finally{host.close();}
});

test('a later coordinator mapping retains detached numeric evidence without the original error chain',()=>{
 const row=archive(),source=measured('readFailure',row),first=activationFailure('activation_outcome_unknown',source),second=activationFailure('activation_outcome_unknown',first),last=publicationFailure('publication_outcome_unknown',second);
 for(const error of [first,second,last])assertObservation(error,error.code,'readFailure',row,source);
 assert.notEqual(first.readFailure,second.readFailure);assert.notEqual(second.readFailure,last.readFailure);
 const messages=[];assert.equal(reportArchiveErrorChain(last,line=>messages.push(line)),1);
 const record=JSON.parse(messages[0].slice('ARCHIVE_ERROR_CHAIN '.length));assert.deepEqual(record.readFailure,row);
 assert.equal(messages.join('').includes('TEST_PRIVATE'),false);
});

test('only the two finite numeric records survive, never extra payload or credentials',()=>{
 const a={...archive(),payload:new Blob(['TEST_PRIVATE']),token:'TEST_PRIVATE'},b={...lineage(),content:'TEST_PRIVATE'};
 const source=Object.assign(Error('TEST_PRIVATE'),{readFailure:a,payloadReadFailure:b,cause:Error('TEST_PRIVATE'),actual:Error('TEST_PRIVATE'),errors:[Error('TEST_PRIVATE')]});
 const result=activationFailure('activation_outcome_unknown',source);
 assert.deepEqual(result.readFailure,archive());assert.deepEqual(result.payloadReadFailure,lineage());
 for(const key of ['cause','actual','errors','token','payload'])assert.equal(Object.hasOwn(result,key),false);
 assert.equal(inspect(result,{showHidden:true,depth:10}).includes('TEST_PRIVATE'),false);
 a.expectedBytes=99;b.fileBytes=99;assert.equal(result.readFailure.expectedBytes,408);assert.equal(result.payloadReadFailure.fileBytes,408);
 for(const key of ['readFailure','payloadReadFailure']){
  const descriptor=Object.getOwnPropertyDescriptor(result,key);assert.equal(descriptor.writable,false);assert.equal(descriptor.configurable,false);
 }
});

test('application accessors and inherited observations never run or become evidence',()=>{
 let calls=0;const getter=()=>{calls++;throw Error('TEST_PRIVATE getter');};
 for(const property of ['readFailure','payloadReadFailure']){
  const source=Object.defineProperty({},property,{get:getter});
  const result=activationFailure('activation_outcome_unknown',source);assert.equal(Object.hasOwn(result,property),false);
 }
 for(const key of ['kind','offset','expectedBytes','observedBeforeAuthorityBytes','actualBytes']){
  const row={...archive()};Object.defineProperty(row,key,{get:getter});
  assert.equal(Object.hasOwn(publicationFailure('publication_outcome_unknown',{readFailure:row}),'readFailure'),false);
 }
 const inherited=Object.create({readFailure:archive()});assert.equal(Object.hasOwn(activationFailure('activation_outcome_unknown',inherited),'readFailure'),false);
 assert.equal(calls,0);
});

test('invalid numbers, kinds and incomplete records cannot survive an uncertainty mapping',()=>{
 for(const value of [-1,NaN,Infinity,0.5,Number.MAX_SAFE_INTEGER+1,'408',408n,undefined,null]){
  for(const key of ['offset','expectedBytes','observedBeforeAuthorityBytes','actualBytes']){
   const source={readFailure:{...archive(),[key]:value}};
   assert.equal(Object.hasOwn(activationFailure('activation_outcome_unknown',source),'readFailure'),false);
  }
  assert.equal(Object.hasOwn(publicationFailure('publication_outcome_unknown',{payloadReadFailure:{...lineage(),fileBytes:value}}),'payloadReadFailure'),false);
 }
 for(const row of [null,{}, {...archive(),kind:'other'}])assert.equal(Object.hasOwn(activationFailure('activation_outcome_unknown',{readFailure:row}),'readFailure'),false);
});

test('frozen or inaccessible diagnostic inputs cannot replace the selected mapped error',()=>{
 const outcome=Object.freeze(Error('Selected outcome')),source=measured('readFailure',archive());
 assert.equal(preserveReadObservations(outcome,source),outcome);assert.equal(Object.hasOwn(outcome,'readFailure'),false);
 const proxy=new Proxy({},{getOwnPropertyDescriptor(){throw Error('TEST_PRIVATE inaccessible');}});
 const mapped=publicationFailure('publication_outcome_unknown',proxy);assert.equal(mapped.code,'publication_outcome_unknown');assert.equal(Object.hasOwn(mapped,'readFailure'),false);
 const frozen=Object.freeze(source);assert.deepEqual(activationFailure('activation_outcome_unknown',frozen).readFailure,archive());
});

test('ordinary errors stay redacted and definite error families do not acquire uncertainty evidence',()=>{
 for(const value of [Error('TEST_PRIVATE'),{cause:measured('readFailure',archive())},undefined,null,17,'TEST_PRIVATE']){
  const result=activationFailure('activation_outcome_unknown',value);
  assert.equal(Object.hasOwn(result,'readFailure'),false);assert.equal(Object.hasOwn(result,'cause'),false);
  assert.equal(inspect(result,{depth:8,showHidden:true}).includes('TEST_PRIVATE'),false);
 }
 assert.equal(Object.hasOwn(activationFailure('activation_cancelled',measured('readFailure',archive())),'readFailure'),false);
 assert.equal(Object.hasOwn(publicationFailure('publication_transfer',measured('payloadReadFailure',lineage())),'payloadReadFailure'),false);
});
