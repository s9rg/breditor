/** Actual coordinator read contract, genuine native catalog, synthetic IDB. */
import test from 'node:test';import assert from 'node:assert/strict';
import {operationalV3Manifest} from './fixtures/physical-operation-v3/manifest.mjs';
import {currentV3Participant,v3CatalogReadOptions,closeV3FixtureWriters} from './fixtures/physical-operation-v3/participants.mjs';
import {PhysicalRoomCatalogV3 as Catalog} from '../packages/breditor-collaboration/dist/physical_room_catalog_v3/catalog.js';
import {PhysicalRoomClientOperationV3 as Operation} from '../packages/breditor-collaboration/dist/physical_room_operation_v3/operation.js';
test('progress namespace views cannot mutate the coordinator durable identity pin',async()=>operationalV3Manifest(async fixture=>{
 await closeV3FixtureWriters(fixture);const selected=await currentV3Participant(fixture,'local-operation-flat'),read=v3CatalogReadOptions(fixture),catalog=await Catalog.begin({...read,database:'view selected catalog',archive:fixture.archive,expected:fixture.archive.selection()});let owner;
 try{owner=await Operation.begin({...read,database:'view selected intent',catalog,expected:fixture.archive.selection(),participants:[selected]});const before=await owner.progress(),roles=before.participants[0].namespaces;assert.ok(Object.isFrozen(roles));assert.ok(roles.every(Object.isFrozen));assert.throws(()=>{roles[0].database='caller retargeted storage';},TypeError);assert.deepEqual(await owner.progress(),before);}
 finally{await owner?.discardAndClose();await catalog.close();}
}));
