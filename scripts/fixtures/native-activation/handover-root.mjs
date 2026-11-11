/** Isolated fixture output using the explicitly built inactive handover host. */
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,realpathSync,statSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
export function nativeHandoverActivationRoot(root){
 root=realpathSync(root);const examples=join(root,'target/handover-activation-native/release/examples');
 assert.ok(statSync(join(examples,'native_handover_activation_sdk_functional')).isFile());
 const directory=mkdtempSync(join(root,'target/sdk-handover-activation-fixture-'));
 mkdirSync(join(directory,'target/handover-activation-native/release'),{recursive:true});
 symlinkSync(examples,join(directory,'target/handover-activation-native/release/examples'),'dir');
 symlinkSync(realpathSync(fileURLToPath(new URL('../../../packages/breditor-collaboration/dist/runtime/',import.meta.url))),join(directory,'target/promoted-shared-web'),'dir');
 return directory;
}
