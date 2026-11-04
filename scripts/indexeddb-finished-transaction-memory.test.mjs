/** The Node test backend must release obsolete completed transaction data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
for(const scenario of ['commit','abort'])test('test storage releases finished '+scenario+' transactions without changing stored values',()=>{
 const file=fileURLToPath(new URL('./fixtures/storage/finished-transaction-memory.mjs',import.meta.url));
 const result=spawnSync(process.execPath,['--expose-gc','--max-old-space-size=128',file,scenario],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
 assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,0,result.stderr||result.stdout);
 const observed=JSON.parse(result.stdout.trim());assert.equal(observed.scenario,scenario);assert.equal(observed.iterations,96);assert.equal(observed.currentRows,1);assert.equal(observed.valuesVerified,true);assert.ok(observed.retainedBytes<observed.budgetBytes);
 console.log('INDEXEDDB_FINISHED_TRANSACTION '+JSON.stringify(observed));
});
