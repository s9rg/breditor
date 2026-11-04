/** Actual new Rust publication fixture, isolated output and unchanged normal Wasm. */
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,symlinkSync,realpathSync,statSync} from 'node:fs';
import {join} from 'node:path';import {fileURLToPath} from 'node:url';
export function nativePublicationRoot(root){
 root=realpathSync(root);const examples=join(root,'target/joint-publication-native/debug/examples');assert.ok(statSync(join(examples,'native_publication_sdk_functional')).isFile());
 return nativePublicationRootWithExamples(root,examples);
}
/** Fixture-only explicit binary selection. This creates no room/actor grant. */
export function nativePublicationRootWithExamples(root,examples){
 root=realpathSync(root);assert.ok(statSync(join(examples,'native_publication_sdk_functional')).isFile());
 const directory=mkdtempSync(join(root,'target/sdk-native-publication-fixture-'));mkdirSync(join(directory,'target/joint-publication-native/debug'),{recursive:true});symlinkSync(examples,join(directory,'target/joint-publication-native/debug/examples'),'dir');symlinkSync(realpathSync(fileURLToPath(new URL('../../../packages/breditor-collaboration/dist/runtime/',import.meta.url))),join(directory,'target/promoted-shared-web'),'dir');return directory;
}
