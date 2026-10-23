/** One real normal Wasm initialization under concurrent fixture imports. Tiny
 * normalization modules are not counted; no native owner crosses instances. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sevenNativeFixtures} from '../physical-operation-v3/seven-native.mjs';
const runtime=new URL('../../../target/promoted-shared-web/',import.meta.url);
test('concurrent seven-author fixture imports initialize the actual normal Wasm namespace exactly once',{timeout:60000},async t=>{
 const instantiate=WebAssembly.instantiate,normalBytes=readFileSync(new URL('breditor_shared_bg.wasm',runtime)).length,events=[];let calls=0,release;
 const gate=new Promise(resolve=>{release=resolve;});
 WebAssembly.instantiate=async function(...args){if(args[0]?.byteLength!==normalBytes)return instantiate.apply(this,args);const id=++calls;events.push(['entered',id]);if(id===2)await gate;const result=await instantiate.apply(this,args);events.push(['finished',id]);return result;};
 try{
  const a=sevenNativeFixtures(),b=sevenNativeFixtures(),first=await a;events.push(['first-reader-returned',calls]);release();const second=await b;
  assert.equal(first.native,second.native);assert.notEqual(first.manifest,second.manifest,'Manifest validation remains independent for each call');
  t.diagnostic(JSON.stringify({actualNormalWasmInitializations:calls,events}));
  assert.equal(calls,1,'One generated namespace must have exactly one actual normal Wasm initialization');
 }finally{release();WebAssembly.instantiate=instantiate;}
});
