/** Real process-loss qualification plus the unchanged inactive-raster baseline. */
import {sdkActivationTypes,sdkActivationData} from './sdk-native-activation-plan.mjs';
export const nativeProcessTests=Object.freeze(['native-process-recovery-failed-boot.test.mjs','native-process-recovery-direct.test.mjs','native-process-recovery-coordinated.test.mjs','generation-recovery-raster.test.mjs','generation-recovery-raster-native.test.mjs']);
export const nativeProcessTypes=sdkActivationTypes;
export const nativeProcessData=sdkActivationData;
export const nativeProcessCaseCount=27;
export const nativeProcessTimeoutMs=14400000+180000;
export const nativeProcessBuildReport='target/native-process-recovery-native-build.json';
