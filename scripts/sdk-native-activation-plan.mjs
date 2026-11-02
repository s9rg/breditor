/** Component qualification: actual default native policies with all seven cold
 * clients and fourteen offline suffixes. Full V1 and other policy matrices stay open. */
import {currentReconciliationTypes,currentReconciliationData} from './current-server-reconciliation-plan.mjs';
export const sdkActivationTests=Object.freeze(['native-activation-transport.test.mjs','room-native-activation-intent.test.mjs','native-activation-coordinated.test.mjs']);
export const sdkActivationTypes=Object.freeze([...currentReconciliationTypes,'scripts/fixtures/editor-consumer/types-native-activation.ts']);
export const sdkActivationData=currentReconciliationData;
export const sdkActivationCaseCount=46;
export const sdkActivationTimeoutMs=7200000+180000;
export const sdkActivationBuildReport='target/sdk-native-activation-native-build.json';
