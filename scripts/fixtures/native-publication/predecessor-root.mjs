/** Explicit built fixture for original-predecessor provisioning. The manifest
 * pins executable bytes only; readiness still needs genuine Native controls. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,basename} from 'node:path';
import {nativePublicationRootWithExamples} from './native-root.mjs';
export function nativePublicationPredecessorRoot(root){
 root=realpathSync(root);const build=JSON.parse(readFileSync(join(root,'target/sdk-native-publication-native-build.json'),'utf8'));
 assert.equal(build.format,'breditor/sdk-native-publication-native-build');assert.equal(build.formatVersion,1);
 assert.equal(build.complete,true);assert.equal(build.exitCode,0);assert.equal(build.sourceUnchanged,true);assert.equal(build.exceeded,false);assert.equal(build.timedOut,false);
 const profile=build.profile??'debug';assert.ok(profile==='debug'||profile==='release');
 const examples=join(root,'target/sdk-native-publication-native',profile,'examples'),file=join(examples,'native_publication_sdk_functional'),pin=build.binaries.find(row=>basename(row.path)==='native_publication_sdk_functional');assert.ok(pin);
 const bytes=readFileSync(file);assert.equal(bytes.length,pin.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),pin.sha256);
 return nativePublicationRootWithExamples(root,examples);
}
