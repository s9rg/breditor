/** Explicit new seven-author producer reader. The old two-author inventory
 * fixture stays closed and is independently required. No source DTO is minted. */
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
// Generated bindings guard only an already completed initialization. Concurrent
// calls can otherwise replace their one module-global instance after a reader
// has started constructing native owners. Coalesce only initialization, never
// manifests, file verification, profiles, policies or successful room results.
const initializations=new WeakMap();
async function initializedRuntime(runtime){
 const native=await import(pathToFileURL(resolve(runtime,'breditor_shared.js')).href),bytes=readFileSync(resolve(runtime,'breditor_shared_bg.wasm')),digest=sha(bytes),before=initializations.get(native);
 if(before){assert.equal(before.sha256,digest,'One fixture namespace cannot select different Wasm bytes');return before.ready;}
 const ready=Promise.resolve().then(()=>native.default({module_or_path:bytes})).then(()=>native);initializations.set(native,{sha256:digest,ready});return ready;
}
export async function sevenNativeFixtures({runtime=new URL('../../../target/promoted-shared-web/',import.meta.url).pathname,report=new URL('../../../target/complete-cohort-native.json',import.meta.url)}={}){
 const root=resolve(new URL('../../../',import.meta.url).pathname),selected=JSON.parse(readFileSync(report));assert.equal(selected.format,'breditor/native-complete-cohort-check');assert.equal(selected.passed,true);assert.equal(selected.registeredWritersPerRoom,7);assert.equal(selected.protectedStreamsPerRoom,14);for(const row of selected.files){const bytes=readFileSync(resolve(root,row.path));assert.equal(bytes.length,row.bytes);assert.equal(sha(bytes),row.sha256);}assert.equal(sha(readFileSync(selected.manifest)),selected.manifestEvidence.sha256);const manifest=JSON.parse(readFileSync(selected.manifest));assert.equal(manifest.format,'breditor/native-complete-cohort-fixtures');assert.equal(manifest.cases.length,10);
 const native=await initializedRuntime(runtime);
 return{native,manifest,source:selected,fixture:item=>JSON.parse(readFileSync(item.path)),profile(fixture){const name=fixture.language===1?'from_configuration_json':fixture.standard?'from_standard_configuration_json_v'+fixture.language:'from_configuration_json_v'+fixture.language;return native.SharedRichProfile[name](fixture.configuration);}};
}
