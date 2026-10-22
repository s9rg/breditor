/** A native inventory reads one bounded array shape, never caller iteration or
 * a second length observation. Reactive arrays cannot change the admitted cut. */
import test,{before,after}from'node:test';import assert from'node:assert/strict';
import*as api from'../packages/breditor-collaboration/dist/index.js';
import{nativeInventoryFixtures}from'./fixtures/independent-inventory/native.mjs';
let physical,logical;
before(async()=>{const fixtures=await nativeInventoryFixtures(),item=fixtures.manifest.cases[1],fixture=fixtures.fixture(item);physical=await api.readSharedServerLogGenerationParticipantInventory(fixtures.inventory(item),fixture.selected);logical=await api.readSharedRoomParticipantInventory(new Blob([fixture.inventoryJson]),{room:physical.metadata().native.room,sha256:[...Buffer.from(fixtures.sha(fixture.inventoryJson),'hex')]});});
after(()=>{physical?.dispose();logical?.dispose();});
const checks=[
 ['logical original',input=>logical.checkSources(input)],
 ['logical generation',input=>logical.checkGenerationSources(input)],
 ['logical independent',input=>logical.checkIndependentSources(input)],
 ['physical original',input=>physical.checkSources(input).coverage],
 ['physical generation',input=>physical.checkGenerationSources(input).coverage],
 ['physical mixed',input=>physical.checkMixedSources(input).coverage],
 ['physical independent',input=>physical.checkIndependentSources(input).coverage],
 ['physical cohort',input=>physical.checkSourceCohort(input).coverage],
];
for(const[label,check]of checks)test(label+' snapshots one bounded native source array',()=>{
 let lengthReads=0,indexReads=0;
 const changing=new Proxy([],{get(target,key,receiver){if(key==='length')return lengthReads++===0?0:1025;if(typeof key==='string'&&/^\d+$/.test(key)){indexReads++;throw Error('No row belongs to the selected zero-length shape');}return Reflect.get(target,key,receiver);}});
 const result=check(changing);assert.equal(result.kind,'pending');assert.deepEqual(result.checkedParticipants,[]);assert.equal(lengthReads,1);assert.equal(indexReads,0);
 for(const length of[NaN,-1,0.5,1025]){let reads=0,indexes=0;const invalid=new Proxy([],{get(target,key,receiver){if(key==='length'){reads++;return length;}if(typeof key==='string'&&/^\d+$/.test(key)){indexes++;throw Error('Refuse the shape before reading values');}return Reflect.get(target,key,receiver);}});assert.throws(()=>check(invalid),e=>e.code==='inventory_source');assert.equal(reads,1);assert.equal(indexes,0);}
 let called=0;const custom=[];custom.map=()=>{called++;throw Error('No supplied map');};custom[Symbol.iterator]=()=>{called++;throw Error('No supplied iterator');};Object.defineProperty(custom,'constructor',{get(){called++;throw Error('No supplied array species');}});assert.equal(check(custom).kind,'pending');assert.equal(called,0);
 assert.throws(()=>check(new Array(1)),e=>e.code==='inventory_source');
});
