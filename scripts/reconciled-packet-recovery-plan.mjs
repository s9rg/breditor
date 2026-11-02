/** Complete new association laws plus the unchanged genuine current-read compatibility case. */
import {currentReconciliationTypes,currentReconciliationData} from './current-server-reconciliation-plan.mjs';
export const reconciledPacketTests=Object.freeze(['archive-read-length-diagnostics.test.mjs','reconciled-packet-recovery-contracts.test.mjs','reconciled-packet-recovery-native.test.mjs','reconciled-packet-current-compat.test.mjs']);
export const reconciledPacketTypes=Object.freeze([...currentReconciliationTypes,'scripts/fixtures/editor-consumer/types-pending-source-resolution.ts','scripts/fixtures/editor-consumer/types-reconciled-packet-recovery.ts','scripts/fixtures/editor-consumer/types-archive-read-length.ts']);
export const reconciledPacketData=currentReconciliationData;
export const reconciledPacketCaseCount=20;
export const reconciledPacketTimeoutMs=3*7200000+120000;
export const reconciledPacketBuildReport='target/reconciled-packet-native-build.json';
