/** Complete component workset; physical process/storage durability remains separate. */
import {currentReconciliationTypes,currentReconciliationData} from './current-server-reconciliation-plan.mjs';
export const recoveryRasterTests=Object.freeze(['generation-recovery-raster.test.mjs','generation-recovery-raster-native.test.mjs']);
export const recoveryRasterTypes=Object.freeze([...currentReconciliationTypes,'scripts/fixtures/editor-consumer/types-recovery-raster.ts']);
export const recoveryRasterData=currentReconciliationData;
export const recoveryRasterCaseCount=23;
export const recoveryRasterTimeoutMs=7380000;
export const recoveryRasterBuildReport='target/recovery-raster-native-build.json';
