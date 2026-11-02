/** The same real five-case qualification is mandatory in source and installed packages. */
import {independentCurrentTypes,independentCurrentData} from './independent-current-reconciliation-plan.mjs';
export const nativeColdTests=Object.freeze(['native-cold-restart-authentication.test.mjs','native-cold-current-reconciliation.test.mjs']);
export const nativeColdTypes=independentCurrentTypes;
export const nativeColdData=independentCurrentData;
export const nativeColdCaseCount=5;
export const nativeColdTimeoutMs=4*7200000+300000;
export const nativeColdBuildReport='target/native-cold-restart-native-build.json';
