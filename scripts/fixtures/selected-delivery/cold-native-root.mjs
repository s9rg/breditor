/** Dedicated restart binaries and a fresh runtime root; public SDK state is unchanged. */
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,symlinkSync,realpathSync,statSync} from 'node:fs';
import {join} from 'node:path';
export function coldNativeRoot(root){
 root=realpathSync(root);const examples=join(root,'target/native-cold-restart-native/release/examples');
 for(const name of ['coordinated_native_restart_functional','complete_cohort_control_functional'])assert.ok(statSync(join(examples,name)).isFile());
 const directory=mkdtempSync(join(root,'target/native-cold-restart-fixture-'));
 mkdirSync(join(directory,'target/owned-history-relay-native/release'),{recursive:true});
 symlinkSync(examples,join(directory,'target/owned-history-relay-native/release/examples'),'dir');
 symlinkSync(realpathSync(join(root,'packages/breditor-collaboration/dist/runtime')),join(directory,'target/promoted-shared-web'),'dir');
 return directory;
}
