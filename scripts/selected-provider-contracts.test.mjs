/** Genuine owners/hosts only. A saved provider report is never authority. */
import test from 'node:test';import assert from 'node:assert/strict';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import {selectedRoomProvider} from '../packages/breditor-collaboration/dist/selected_room_provider/check.js';
import {RetainedSelectedAssetOwner as Owner} from '../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
test('a forged provider host cannot inspect catalog data, queue choices or a host policy',()=>{let calls=0;const incoming=new Proxy({}, {get(){calls++;throw Error('not a live host');}});assert.throws(()=>selectedRoomProvider(incoming,incoming,incoming),error=>error.code==='control_policy');assert.equal(calls,0);});
test('a copied selected owner cannot inspect provider options or call a grant',async()=>{let calls=0;const incoming=new Proxy({}, {get(){calls++;throw Error('not selected resources');}});await assert.rejects(Owner.prototype.readHistoryAssets.call({},incoming,incoming));assert.equal(calls,0);});
test('provider diagnostics and private constructors do not widen the package root',()=>{for(const name of['selectedRoomProvider','RetainedSelectedAssetOwner','SelectedRoomProviderRead','prepareSelectedAssetOwner','readSelectedRoomProvider','activateSelectedRoom'])assert.equal(Object.hasOwn(api,name),false,name);});
