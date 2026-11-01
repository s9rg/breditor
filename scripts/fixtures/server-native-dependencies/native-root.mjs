/** Each run owns its fixture outputs. New endpoints use separately built
 * examples; historical pinned main executables are never replaced. */
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,symlinkSync,realpathSync,statSync} from 'node:fs';
import {join} from 'node:path';
export function dependencyNativeRoot(root){
 root=realpathSync(root);const examples=join(root,'target/server-native-dependencies-native/release/examples');
 for(const name of ['selected_suggestion_delivery_functional','complete_cohort_control_functional'])assert.ok(statSync(join(examples,name)).isFile());
 const directory=mkdtempSync(join(root,'target/server-native-dependencies-fixture-'));
 mkdirSync(join(directory,'target/owned-history-relay-native/release'),{recursive:true});
 symlinkSync(examples,join(directory,'target/owned-history-relay-native/release/examples'),'dir');
 symlinkSync(realpathSync(join(root,'packages/breditor-collaboration/dist/runtime')),join(directory,'target/promoted-shared-web'),'dir');
 return directory;
}
