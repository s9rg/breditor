/** Detached reconciliation diagnostics cannot manufacture owners or authority. */
import test from 'node:test';import assert from 'node:assert/strict';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import {RetainedSelectedAssetOwner as Owner} from '../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
test('copied selected owner refuses before inspecting reconciliation host/options',async()=>{let calls=0;const incoming=new Proxy({}, {get(){calls++;throw Error('not live resources');}});await assert.rejects(Owner.prototype.readReconciliation.call({},incoming,incoming));assert.equal(calls,0);});
test('new private native reader and constructors do not widen the public root',()=>{for(const name of['RetainedSelectedAssetOwner','captureSelectedNativeCut','selectedInventoryCut','checkSelectedRetainedStores','SelectedRoomReconciliationRead','activateSelectedRoom'])assert.equal(Object.hasOwn(api,name),false,name);});
