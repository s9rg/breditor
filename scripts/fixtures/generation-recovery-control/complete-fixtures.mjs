/** Actual seven-author standalone generation controls. Only Node storage/locks
 * are controlled fixtures; source identities and provider responses are genuine. */
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {pixel,secondPixel} from '../review-assets/pixels.mjs';
import {NORMAL_SHARED_WASM_SHA256} from '../native-runtime/normal-shared-identity.mjs';
import {startNativeGenerationCompleteControls} from './complete-native-host.mjs';
export async function generationCompleteControlFixtures(root,{migrated=false}={}){
 root=resolve(root);const directory=mkdtempSync(join(root,'target/generation-complete-control-'));
 for(const[name,bytes]of[['seed-a.png',pixel],['seed-b.png',secondPixel]])writeFileSync(join(directory,name),bytes,{mode:0o600,flag:'wx'});
 const binary=join(root,'target/owned-history-relay-native/release/examples/generation_complete_control_functional'),controls=await startNativeGenerationCompleteControls(root,binary,directory,{migrated});
 try{const runtime=join(root,'packages/breditor-collaboration/dist/runtime'),bytes=readFileSync(join(runtime,'breditor_shared_bg.wasm'));assert.equal(createHash('sha256').update(bytes).digest('hex'),NORMAL_SHARED_WASM_SHA256);const native=await import(pathToFileURL(join(runtime,'breditor_shared.js')).href);await native.default({module_or_path:bytes});
  return{native,manifest:controls.manifest,controls,directory,fixture(item){const value=JSON.parse(readFileSync(item.path)),source=value.generationRecoveryState;assert.equal(value.format,'breditor/native-generation-complete-control-fixture');assert.equal(Object.hasOwn(source,'ancestor'),false);assert.notDeepEqual(source.origin,source.server);return{...value,selected:source.participants,afterSelected:source.participants,afterRecoveryState:{origin:source.origin,server:source.server,participants:source.participants}};},profile(fixture){const name=fixture.language===1?'from_configuration_json':fixture.standard?'from_standard_configuration_json_v'+fixture.language:'from_configuration_json_v'+fixture.language;return native.SharedRichProfile[name](fixture.configuration);},close:()=>controls.stop()};
 }catch(error){await controls.stop();throw error;}
}
