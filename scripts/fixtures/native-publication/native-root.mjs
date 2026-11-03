/** Actual new Rust publication fixture, isolated output and unchanged normal Wasm. */
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,symlinkSync,realpathSync,statSync} from 'node:fs';
import {join} from 'node:path';import {fileURLToPath} from 'node:url';
export function nativePublicationRoot(root){
 root=realpathSync(root);const examples=join(root,'target/sdk-native-publication-native/debug/examples');assert.ok(statSync(join(examples,'native_publication_sdk_functional')).isFile());
 const directory=mkdtempSync(join(root,'target/sdk-native-publication-fixture-'));mkdirSync(join(directory,'target/sdk-native-publication-native/debug'),{recursive:true});symlinkSync(examples,join(directory,'target/sdk-native-publication-native/debug/examples'),'dir');symlinkSync(realpathSync(fileURLToPath(new URL('../../../packages/breditor-collaboration/dist/runtime/',import.meta.url))),join(directory,'target/promoted-shared-web'),'dir');return directory;
}
