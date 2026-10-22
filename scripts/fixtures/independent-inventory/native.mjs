/** Admit the actual producer's retained files and the unchanged normal native runtime.
 * Fresh source matching is additionally required by the candidate SDK wrapper. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function nativeInventoryFixtures({runtime=new URL('../../../target/promoted-shared-web/',import.meta.url).pathname,report=new URL('../../../target/server-generation-inventory-native.json',import.meta.url)}={}){
 const native=await import(pathToFileURL(resolve(runtime,'breditor_shared.js')));await native.default({module_or_path:readFileSync(resolve(runtime,'breditor_shared_bg.wasm'))});
 const result=JSON.parse(readFileSync(report,'utf8'));assert.equal(result.passed,true);assert.equal(result.format,'breditor/native-server-generation-inventory-check');
 const root=resolve(new URL('../../../',import.meta.url).pathname);for(const file of result.files){const bytes=readFileSync(resolve(root,file.path));assert.equal(bytes.length,file.bytes);assert.equal(sha(bytes),file.sha256);}
 const bytes=readFileSync(result.manifest);assert.equal(sha(bytes),result.manifestEvidence.sha256);const manifest=JSON.parse(bytes);assert.equal(manifest.cases.length,10);
 return{native,result,manifest,sha,runtime,sharedWasmSha256:sha(readFileSync(resolve(runtime,'breditor_shared_bg.wasm'))),
  fixture:item=>JSON.parse(readFileSync(item.path,'utf8')),inventory:item=>new Blob([readFileSync(resolve(dirname(item.path),'inventory.json'))]),
  profile(fixture){const method=fixture.language===1?'from_configuration_json':fixture.standard?`from_standard_configuration_json_v${fixture.language}`:`from_configuration_json_v${fixture.language}`;return native.SharedRichProfile[method](fixture.configuration);}};
}
