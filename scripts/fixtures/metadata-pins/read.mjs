/** Completed Native component observations retained as DATA, never permission. */
import fs from 'node:fs';import assert from 'node:assert/strict';import{createHash}from'node:crypto';import{gunzipSync}from'node:zlib';
export function metadataPinsFixture(){
 const root=new URL('./',import.meta.url),p=JSON.parse(fs.readFileSync(new URL('provenance.json',root))),compressed=fs.readFileSync(new URL('actual-evidence.json.gz',root));
 const sha=data=>createHash('sha256').update(data).digest('hex');assert.equal(compressed.length,p.compressedBytes);assert.equal(sha(compressed),p.compressedSha256);
 const bytes=gunzipSync(compressed,{maxOutputLength:32*1024*1024});assert.equal(bytes.length,p.bytes);assert.equal(sha(bytes),p.sha256);
 const value=JSON.parse(bytes);assert.equal(value.actualFamilies,7);assert.equal(value.actualLocalMetadataLanes,3);assert.deepEqual(value.phases,p.phases);return value;
}
