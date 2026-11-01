/** Native document and comment generations are independently selected.
 * Physical server cuts and both original protocol passes remain genuine. */
import test from 'node:test';
import {testIndependentCurrentReconciliation} from './fixtures/local-metadata/independent-current-reconciliation.mjs';
for(const [documentSegmented,reviewSegmented] of [[false,false],[false,true],[true,false]]){
 test('current full provider reconciliation preserves independently selected Native histories: document='+documentSegmented+' review='+reviewSegmented,{timeout:7200000},()=>testIndependentCurrentReconciliation({documentSegmented,reviewSegmented}));
}
