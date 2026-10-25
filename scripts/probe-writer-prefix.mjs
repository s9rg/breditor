/** All native compiler/history/digest combinations against actual Wasm + SDK.
 * This read proof grants no current room authority, source selection or activation. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import * as sdk from '../packages/breditor-collaboration/dist/index.js';
import {prefixAt,groupMetadata} from '../packages/breditor-collaboration/dist/relay/validation.js';
import * as captured from '../packages/breditor-collaboration/dist/native_history_read/registry.js';
import {sourceNativeRecoveryRead} from '../packages/breditor-collaboration/dist/source_native_read.js';
import {writerPrefixLaws} from './fixtures/writer-prefix/laws.mjs';
/** Deliberately broken pre-repair control: a foreign counter indexes LOCAL groups.
 * This is a test oracle only, never a fallback or application implementation. */
function wrongAuthorControl(core,id,through,version){
 const local=version===2?core.writerClockV2(id):core.writerClock(id);
 if(BigInt(through)>BigInt(local.through))throw Error('server_ahead');
 if(through===local.through)return local.prefixDigest;
 const first=(version===2?core.writerGroupsV2(through):core.writerGroups(through)).groups[0];
 if(first===undefined)throw Error('history_fork');return groupMetadata(first,version).previousDigest;
}
export async function probeWriterPrefix(directory,{legacy=false}={}){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),bytes=readFileSync(resolve(directory,'breditor_shared_bg.wasm'));
 const native=await import(pathToFileURL(resolve(directory,'breditor_shared.js')).href);await native.default({module_or_path:bytes});
 const result=await writerPrefixLaws({sdk,native,prefixAt,captured,sourceNativeRecoveryRead,documentRoot:JSON.parse(readFileSync(resolve(root,'crates/breditor-core/tests/fixtures/rich-local-root.json'),'utf8')),oldPrefixAt:wrongAuthorControl,legacy});
 assert.equal(result.queries,legacy?0:648);assert.equal(result.oldWrongAuthorReproductions,24);
 return{format:'breditor/native-writer-prefix-probe',formatVersion:1,wasmSha256:createHash('sha256').update(bytes).digest('hex'),...result};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length<1||args.length>2||args[1]!==undefined&&args[1]!=='--legacy-runtime')throw Error('Usage: node scripts/probe-writer-prefix.mjs WASM_DIRECTORY [--legacy-runtime]; never publishes');
 console.log(JSON.stringify(await probeWriterPrefix(args[0],{legacy:args[1]!==undefined}),null,2));
}
