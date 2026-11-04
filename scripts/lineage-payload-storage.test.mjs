/** Literal public graph DATA. These tests create no editor, source, writer or
 * Native grant. The same canonical bytes must survive repeated reconstruction. */
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {defaultAssetLimits} from '@breditor/experimental-rich-content';
import {readGraphEnvelope} from '../packages/breditor-collaboration/dist/restored_graph/graph_envelope.js';
import {encodeGraph,GRAPH_PREFIX} from '../packages/breditor-collaboration/dist/restored_graph/graph_codec.js';
import {ownedLineagePayload} from '../packages/breditor-collaboration/dist/independent_operation/payload_blob.js';
const sha=b=>createHash('sha256').update(b).digest('hex'),directory=new URL('./fixtures/lineage-payloads/',import.meta.url),pin=JSON.parse(readFileSync(new URL('provenance.json',directory))),gzip=readFileSync(new URL('actual-graph.archive.gz',directory)),bytes=gunzipSync(gzip);assert.equal(sha(gzip),pin.gzipSha256);assert.equal(sha(bytes),pin.sha256);assert.equal(bytes.length,pin.bytes);
test('production encoder preserves every byte of the original public graph',async()=>{const view=await readGraphEnvelope(new Blob([bytes]),pin.selection,defaultAssetLimits),encoded=await encodeGraph(view.header.root,view.header.states,view.header.nodes,view.payloads,()=>{});assert.deepEqual(Buffer.from(await encoded.file.arrayBuffer()),bytes);});
test('512 graph reconstructions retain a fixed byte representation without a growing Blob view chain',{timeout:120000},async()=>{
 let current=new Blob([bytes]),view=await readGraphEnvelope(current,pin.selection,defaultAssetLimits);
 for(let cycle=0;cycle<512;cycle++){
  const encoded=await encodeGraph(view.header.root,view.header.states,view.header.nodes,view.payloads,()=>{}),part=encoded.header.parts[cycle%encoded.header.parts.length],headerBytes=encoded.file.size-encoded.header.parts.reduce((sum,row)=>sum+row.bytes,0),at=headerBytes+part.offset;assert.ok(headerBytes>=GRAPH_PREFIX);
  const file=encoded.file;current=cycle%4===0?structuredClone(file):cycle%4===1?new Blob([file.slice(0,at),new Blob([]),file.slice(at)],{type:file.type}):cycle%4===2?new File([file],'owned-lineage.archive',{type:file.type}):new Blob([new Uint8Array(17),file,new Uint8Array(3)]).slice(17,17+file.size,file.type);
  view=await readGraphEnvelope(current,pin.selection,defaultAssetLimits);assert.equal(current.size,pin.bytes);assert.equal(sha(Buffer.from(await current.arrayBuffer())),pin.sha256);
 }
});
test('a multi-chunk payload keeps its exact bytes and MIME',async()=>{const input=Buffer.alloc(3*1024*1024+19);for(let i=0;i<input.length;i++)input[i]=(i*17+3)%251;const file=new Blob([input],{type:'application/x-breditor-payload-test'}),owned=await ownedLineagePayload(file,sha(input),()=>{},()=>Error('integrity'));assert.equal(owned.type,file.type);assert.equal(owned.size,file.size);assert.deepEqual(Buffer.from(await owned.arrayBuffer()),input);});
test('a changed digest refuses the copied payload without changing the input',async()=>{const input=new Blob(['original immutable input']),before=Buffer.from(await input.arrayBuffer());await assert.rejects(ownedLineagePayload(input,'0'.repeat(64),()=>{},()=>Error('test-integrity')),/test-integrity/);assert.deepEqual(Buffer.from(await input.arrayBuffer()),before);});
test('closure while an asynchronous copy is pending refuses before returning a payload',async()=>{const data=Buffer.alloc(2*1024*1024+7,31),input=new Blob([data]);let current=true;const result=ownedLineagePayload(input,sha(data),()=>{if(!current)throw Error('test-closed');},()=>Error('integrity'));current=false;await assert.rejects(result,/test-closed/);assert.equal(sha(Buffer.from(await input.arrayBuffer())),sha(data));});
function isolatedCopy(mode){
 const module=new URL('../packages/breditor-collaboration/dist/independent_operation/payload_blob.js',import.meta.url).href;
 const code=`import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
 const original=Blob.prototype.arrayBuffer,reads=[],mode=process.argv[1];let latest;
 Blob.prototype.arrayBuffer=async function(){const bytes=await original.call(this);if(this.type===''){reads.push(this.size);if(mode.startsWith('short')&&reads.length===1)return bytes.slice(0,bytes.byteLength-1);if(mode==='detach')latest=bytes;}return bytes;};
 try{const {ownedLineagePayload,LINEAGE_PAYLOAD_COPY_CHUNK_BYTES}=await import(${JSON.stringify(module)}),data=Buffer.alloc(3*1024*1024+17,47),input=new Blob([data],{type:'application/x-breditor-bounded-copy'}),sha=value=>createHash('sha256').update(value).digest('hex');
 if(mode.startsWith('short')||mode==='detach'){
 const error=mode==='short-frozen'?Object.freeze(Error('short-refused')):Error('short-refused'),check=()=>{if(mode==='detach'&&latest?.byteLength)structuredClone(latest,{transfer:[latest]});};
 await assert.rejects(ownedLineagePayload(input,sha(data),check,()=>error),actual=>{assert.equal(actual,error);if(mode==='short-frozen')assert.equal(Object.hasOwn(actual,'payloadReadFailure'),false);else{assert.deepEqual(actual.payloadReadFailure,{kind:'lineage-payload-read-length',fileBytes:data.length,offset:0,expectedBytes:LINEAGE_PAYLOAD_COPY_CHUNK_BYTES,observedBeforeAuthorityBytes:mode==='detach'?LINEAGE_PAYLOAD_COPY_CHUNK_BYTES:LINEAGE_PAYLOAD_COPY_CHUNK_BYTES-1,actualBytes:mode==='detach'?0:LINEAGE_PAYLOAD_COPY_CHUNK_BYTES-1});assert.ok(Object.isFrozen(actual.payloadReadFailure));assert.equal(Object.getOwnPropertyDescriptor(actual,'payloadReadFailure').writable,false);}return true;});assert.equal(reads.length,1);
 }
 else{const output=await ownedLineagePayload(input,sha(data),()=>{},()=>Error('integrity'));assert.deepEqual(Buffer.from(await original.call(output)),data);assert.ok(reads.length>=2);assert.ok(reads.every(bytes=>bytes<=LINEAGE_PAYLOAD_COPY_CHUNK_BYTES));}
 assert.deepEqual(Buffer.from(await original.call(input)),data);console.log(JSON.stringify({mode,reads,unchangedInput:true}));}finally{Blob.prototype.arrayBuffer=original;}`;
 return JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',code,mode],{encoding:'utf8',timeout:20000,maxBuffer:1024*1024}));
}
test('copy uses bounded reads for a large payload',()=>{const result=isolatedCopy('bounded');assert.equal(result.unchangedInput,true);});
test('an actual short copy read refuses immediately without retry or input changes',()=>{const result=isolatedCopy('short');assert.equal(result.reads.length,1);});

test('authority detachment is distinguished from an already short payload read',()=>{assert.equal(isolatedCopy('detach').reads.length,1);});
test('a frozen original integrity error is retained without diagnostic substitution',()=>{assert.equal(isolatedCopy('short-frozen').reads.length,1);});
