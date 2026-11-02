/** A separate new executable target. Only the actual private fixture can replay
 * an observed complete archive; no caller-created ownership DTO is accepted. */
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,symlinkSync,realpathSync,statSync} from 'node:fs';
import {join} from 'node:path';
export function reconciledPacketNativeRoot(root){
 root=realpathSync(root);const examples=join(root,'target/reconciled-packet-native/release/examples');
 for(const name of ['selected_suggestion_delivery_functional','complete_cohort_control_functional'])assert.ok(statSync(join(examples,name)).isFile());
 const directory=mkdtempSync(join(root,'target/reconciled-packet-fixture-'));
 mkdirSync(join(directory,'target/owned-history-relay-native/release'),{recursive:true});
 symlinkSync(examples,join(directory,'target/owned-history-relay-native/release/examples'),'dir');
 symlinkSync(realpathSync(join(root,'packages/breditor-collaboration/dist/runtime')),join(directory,'target/promoted-shared-web'),'dir');
 return directory;
}
