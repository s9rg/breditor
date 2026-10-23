/** Private marker admission only: controlled real SDK marker bindings, not
 * native owner, author lease, storage-driver or room activation evidence. */
import test from 'node:test';import assert from 'node:assert/strict';
import {snapshotPhysicalOperationV3Policy as snapshot} from '../packages/breditor-collaboration/dist/physical_room_operation_v3/policy_snapshot.js';
import {withIndependentDeliveryCompanion} from '../packages/breditor-collaboration/dist/independent_history/driver.js';
import {bindIndependentLocalOperationDriver} from '../packages/breditor-collaboration/dist/independent_history/local_driver.js';
import {withIndependentBootstrapPolicy} from '../packages/breditor-collaboration/dist/independent_history/bootstrap_policy.js';
const refused=error=>error.code==='physical_operation_v3_policy';
for(const[kind,select]of [
 ['delivery companion',value=>withIndependentDeliveryCompanion(value,{})],
 ['local operation driver',value=>bindIndependentLocalOperationDriver(value,{})],
 ['bootstrap grant',value=>withIndependentBootstrapPolicy(value,()=>{})],
 ['bootstrap grant and cancellation',value=>withIndependentBootstrapPolicy(value,()=>{},new AbortController().signal)],
])test('ordinary policy snapshot cannot erase private '+kind+' selection',()=>{const selected=select({room:'room',writer:'writer'});assert.throws(()=>snapshot({options:{session:selected}}),refused);});
