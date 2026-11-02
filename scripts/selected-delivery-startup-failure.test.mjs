/** Missing executable is a real failed spawn, not a fabricated exit or timeout. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {selectedDeliveryNativeHost} from './fixtures/selected-delivery/native-host.mjs';
test('failed actual Native spawn settles cleanup and preserves the startup refusal',{timeout:10000},async()=>{
 const root=mkdtempSync('/private/tmp/breditor-missing-native-test-');mkdirSync(join(root,'target'));
 assert.equal(existsSync(join(root,'target/owned-history-relay-native/release/examples/selected_delivery_functional')),false);
 await assert.rejects(selectedDeliveryNativeHost(root),/Native selected-delivery process could not start/);
});
