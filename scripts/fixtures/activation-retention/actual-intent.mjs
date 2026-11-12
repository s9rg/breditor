/** Read-only test corpus from an actual retained Native intent. These bytes
 * supply no runtime source, actor, approval or serving authority. */
import {NORMAL_SHARED_WASM_SHA256} from '../native-runtime/normal-shared-identity.mjs';
import assert from 'node:assert/strict';import {readFileSync,lstatSync} from 'node:fs';import {join,resolve} from 'node:path';import {createHash} from 'node:crypto';
import * as native from '../../../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {decodeRoomActivationIntent} from '../../../packages/breditor-collaboration/dist/room_native_activation_intent/decode.js';
import {prepareActivationRetentionFixture} from './prepare.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
export async function retainedActivationData(){
 const directory=process.env.BREDITOR_ACTIVATION_RETENTION_FIXTURE?resolve(process.env.BREDITOR_ACTIVATION_RETENTION_FIXTURE):prepareActivationRetentionFixture(new URL('../../../',import.meta.url).pathname),indexBytes=readFileSync(join(directory,'index.json'));
 assert.equal(sha(indexBytes),'572671293d3afd4c2134c69774e8e0bacc0d180e9f652dbf8d64a4354a510518');const index=JSON.parse(indexBytes);assert.equal(index.format,'breditor/actual-sdk-native-activation-intent-evidence');assert.equal(index.files.length,16);
 const values=new Map();let total=0;for(const pin of index.files){assert.match(pin.name,/^(?:choice\.json|graph\.json|state\.json|[a-f0-9]{64}\.bin)$/);assert.equal(values.has(pin.name),false);const path=join(directory,pin.name),stat=lstatSync(path);assert.equal(stat.isFile(),true);assert.equal(stat.isSymbolicLink(),false);assert.ok(stat.size<=64*1024*1024);total+=stat.size;assert.ok(total<=64*1024*1024);const data=readFileSync(path);assert.equal(data.length,pin.bytes);assert.equal(sha(data),pin.sha256);values.set(pin.name,data);}
 const wasm=readFileSync(new URL('../../../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url));assert.equal(sha(wasm),NORMAL_SHARED_WASM_SHA256);await native.default({module_or_path:wasm});
 const choice=JSON.parse(values.get('choice.json')),graph=values.get('graph.json').toString('utf8'),objects=choice.objects.map(pin=>new Blob([values.get(pin.sha256+'.bin')])),capture=Object.freeze(await decodeRoomActivationIntent({choice,graph,objects},{wasm:native,checkAuthority(){}}));assert.equal(capture.recovery.kind,'retained');assert.equal(capture.recovery.bundle.assets.kind,'retained');
 return{native,choice,capture,inputIndexSha256:sha(indexBytes),inputBytes:total};
}
