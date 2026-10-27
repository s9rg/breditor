import {NORMAL_SHARED_WASM_SHA256} from "../native-runtime/normal-shared-identity.mjs";
/** Live test-owned native controls; operator tokens stay private IPC values.
 * Redacted image-bearing files remain separate from old seven-author fixtures. */
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {pixel,secondPixel} from '../review-assets/pixels.mjs';
import {startNativeCompleteControls} from './complete-native-host.mjs';
export async function completeControlFixtures(root){
 root=resolve(root);const directory=mkdtempSync(join(root,'target/complete-control-running-'));
 for(const[name,bytes]of[['seed-a.png',pixel],['seed-b.png',secondPixel]])writeFileSync(join(directory,name),bytes,{mode:0o600,flag:'wx'});
 const binary=join(root,'target/owned-history-relay-native/release/examples/complete_cohort_control_functional'),controls=await startNativeCompleteControls(root,binary,directory);
 try{const runtime=join(root,'target/promoted-shared-web'),wasm=readFileSync(join(runtime,'breditor_shared_bg.wasm'));assert.equal(createHash('sha256').update(wasm).digest('hex'),NORMAL_SHARED_WASM_SHA256);const native=await import(pathToFileURL(join(runtime,'breditor_shared.js')).href);await native.default({module_or_path:wasm});
  return{native,manifest:controls.manifest,controls,directory,fixture(item){const value=JSON.parse(readFileSync(item.path)),source=value.physicalRecoveryState;assert.equal(value.format,'breditor/native-complete-control-fixture');return{...value,selected:source.participants,afterSelected:source.participants,afterRecoveryState:{origin:source.ancestor,server:source.server,participants:source.participants}};},profile(fixture){const name=fixture.language===1?'from_configuration_json':fixture.standard?'from_standard_configuration_json_v'+fixture.language:'from_configuration_json_v'+fixture.language;return native.SharedRichProfile[name](fixture.configuration);},close:()=>controls.stop()};
 }catch(error){await controls.stop();throw error;}
}
