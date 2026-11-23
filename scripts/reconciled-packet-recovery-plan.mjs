/** Complete new association laws plus the unchanged genuine current-read compatibility case. */
import {currentReconciliationTypes,currentReconciliationData} from './current-server-reconciliation-plan.mjs';
export const reconciledPacketTests=Object.freeze(['archive-read-length-diagnostics.test.mjs','reconciled-packet-recovery-contracts.test.mjs','reconciled-packet-recovery-native.test.mjs','reconciled-packet-current-compat.test.mjs']);
export const reconciledPacketTypes=Object.freeze([...currentReconciliationTypes,'scripts/fixtures/editor-consumer/types-pending-source-resolution.ts','scripts/fixtures/editor-consumer/types-reconciled-packet-recovery.ts','scripts/fixtures/editor-consumer/types-archive-read-length.ts']);
export const reconciledPacketData=currentReconciliationData;
export const reconciledPacketCaseCount=21;
export const reconciledPacketTimeoutMs=3*7200000+120000;
export const reconciledPacketBuildReport='target/reconciled-packet-native-build.json';

const cases={
 contracts:{tests:reconciledPacketTests.slice(0,2),count:18,timeoutMs:120000},
 availability:{tests:[reconciledPacketTests[2]],count:1,timeoutMs:7260000,
  pattern:'^same reservation retains complete original Pending packet bytes and current Native state$'},
 checked:{tests:[reconciledPacketTests[2]],count:1,timeoutMs:7260000,
  pattern:'^same reservation binds retained bytes to checked current provider/client state without changing original Pending$'},
 compatibility:{tests:[reconciledPacketTests[3]],count:1,timeoutMs:7260000},
};
export const reconciledPacketCaseIds=Object.freeze(Object.keys(cases));
export function reconciledPacketSelection(id){
 if(id===undefined)return {id:null,tests:reconciledPacketTests,count:reconciledPacketCaseCount,timeoutMs:reconciledPacketTimeoutMs};
 if(!Object.hasOwn(cases,id))throw Error('Unknown reconciled packet case');
 return {id,...cases[id]};
}
export function reconciledPacketReport(kind,id){
 const name=kind==='source'?'source-qualification':'installed-consumer';
 return 'target/reconciled-packet-recovery-'+name+(id?'-'+id:'')+'.json';
}
