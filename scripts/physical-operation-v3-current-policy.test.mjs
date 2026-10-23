/** A later invalid current factory must refuse before any child recovery.
 * Real selected native sources and synthetic IDB, not physical durability. */
import test from 'node:test';import assert from 'node:assert/strict';
import {operationalV3Manifest} from './fixtures/physical-operation-v3/manifest.mjs';
import {currentV3Participant,v3CatalogReadOptions,closeV3FixtureWriters} from './fixtures/physical-operation-v3/participants.mjs';
import {PhysicalRoomCatalogV3 as Catalog} from '../packages/breditor-collaboration/dist/physical_room_catalog_v3/catalog.js';
import {PhysicalRoomClientOperationV3 as Operation} from '../packages/breditor-collaboration/dist/physical_room_operation_v3/operation.js';
test('every family current factory validates before the coordinator can begin recovering earlier children',async()=>operationalV3Manifest(async fixture=>{
 await closeV3FixtureWriters(fixture);const first=await currentV3Participant(fixture,'independent-delivery','policy-first'),last=await currentV3Participant(fixture,'restored-graph','policy-last'),invalid={...last,options:{...last.options,session:{...last.options.session,documentHistory:{kind:'not-a-native-history'}}}},read=v3CatalogReadOptions(fixture),catalog=await Catalog.begin({...read,database:'policy selected catalog',archive:fixture.archive,expected:fixture.archive.selection()});let owner;
 try{const opening=Operation.begin({...read,database:'policy selected intent',catalog,expected:fixture.archive.selection(),participants:[first,invalid]}).then(value=>{owner=value;return value;});await assert.rejects(opening);const names=await indexedDB.databases();assert.equal(names.some(row=>row.name===first.options.database||row.name===last.options.database),false);await catalog.verify();}
 finally{await owner?.discardAndClose();await catalog.close();}
}));
