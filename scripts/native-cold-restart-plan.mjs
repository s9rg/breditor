/** The same real five-case qualification is mandatory in source and installed packages. */
import {independentCurrentTypes,independentCurrentData} from './independent-current-reconciliation-plan.mjs';
export const nativeColdTests=Object.freeze(['native-cold-restart-authentication.test.mjs','native-cold-current-reconciliation.test.mjs']);
export const nativeColdTypes=independentCurrentTypes;
export const nativeColdData=independentCurrentData;
export const nativeColdCaseCount=5;
export const nativeColdTimeoutMs=4*7200000+300000;
export const nativeColdBuildReport='target/native-cold-restart-native-build.json';

export const nativeColdCaseIds=Object.freeze([
 'auth','original','review-segmented','document-segmented','both-segmented',
]);
const recoveryPairs=[
 [false,false],[false,true],[true,false],[true,true],
];
export function nativeColdSelection(id){
 if(id===undefined)return {id:null,tests:nativeColdTests,count:nativeColdCaseCount,timeoutMs:nativeColdTimeoutMs};
 const index=nativeColdCaseIds.indexOf(id);
 if(index<0)throw Error('Unknown Native cold-restart case');
 if(index===0)return {id,tests:[nativeColdTests[0]],count:1,timeoutMs:240000,pair:null};
 const [document,review]=recoveryPairs[index-1];
 const policy=value=>value?'segmented-v1':'original';
 return {id,tests:[nativeColdTests[1]],count:1,timeoutMs:7200000+60000,
  pair:policy(document)+'/'+policy(review),
  pattern:'^Native epoch restart preserves seven cold owners: document='+document+' review='+review+'$'};
}
export function nativeColdReport(kind,id){
 const name=kind==='source'?'source-qualification':'installed-consumer';
 return 'target/native-cold-restart-'+name+(id?'-'+id:'')+'.json';
}
