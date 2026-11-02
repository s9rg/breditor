/** Isolated test output and the exact new Rust example, with normal Wasm. */
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,symlinkSync,realpathSync,statSync} from 'node:fs';
import {join} from 'node:path';
export function nativeProcessRoot(root){
 root=realpathSync(root);const examples=join(root,'target/reconciled-packet-native/release/examples');
 assert.ok(statSync(join(examples,'native_process_recovery_functional')).isFile());
 const directory=mkdtempSync(join(root,'target/native-process-fixture-'));
 mkdirSync(join(directory,'target/reconciled-packet-native/release'),{recursive:true});
 symlinkSync(examples,join(directory,'target/reconciled-packet-native/release/examples'),'dir');
 symlinkSync(realpathSync(join(root,'packages/breditor-collaboration/dist/runtime')),join(directory,'target/promoted-shared-web'),'dir');
 return directory;
}
