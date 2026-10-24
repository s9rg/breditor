/** Distinct image-bearing seven-author producer. Normal checks regenerate the
 * exact source-pinned inputs first; no live operator credential is loaded here. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function completeImageNativeFixtures(root){
 root=resolve(root);const report=JSON.parse(readFileSync(join(root,'target/complete-image-cohort-native.json')));assert.equal(report.format,'breditor/native-complete-image-cohort-check');assert.equal(report.passed,true);assert.equal(report.cases,10);assert.equal(report.registeredWritersPerRoom,7);assert.equal(report.reviewActorsPerRoom,7);assert.equal(report.protectedStreamsPerRoom,14);assert.equal(report.rawCredentialsExported,false);assert.equal(report.files.length,50);
 for(const row of report.files){const bytes=readFileSync(join(root,row.path));assert.equal(bytes.length,row.bytes);assert.equal(sha(bytes),row.sha256);}assert.equal(sha(readFileSync(report.manifest)),report.manifestSha256);
 const manifest=JSON.parse(readFileSync(report.manifest));assert.equal(manifest.format,'breditor/native-complete-control-fixtures');assert.equal(manifest.cases.length,10);assert.equal(JSON.stringify(manifest).includes('operatorToken'),false);
 const runtime=join(root,'target/promoted-shared-web'),wasm=readFileSync(join(runtime,'breditor_shared_bg.wasm'));assert.equal(sha(wasm),'b5061a35efb4a34804a925f4dc9d847904f6685b719dc99ff2f324223305e329');const native=await import(pathToFileURL(join(runtime,'breditor_shared.js')).href);await native.default({module_or_path:wasm});
 return{native,manifest,source:report,fixture(item){const value=JSON.parse(readFileSync(item.path));assert.equal(value.format,'breditor/native-complete-control-fixture');assert.equal(value.clients.length,7);const selected=value.physicalRecoveryState;return{...value,selected:selected.participants,afterSelected:selected.participants,afterRecoveryState:{origin:selected.ancestor,server:selected.server,participants:selected.participants}};},profile(value){const name=value.language===1?'from_configuration_json':value.standard?'from_standard_configuration_json_v'+value.language:'from_configuration_json_v'+value.language;return native.SharedRichProfile[name](value.configuration);},async close(){}};
}
