/** Qualification of the current reference/provider read, independent of the
 * already qualified complete byte-recovery API and its unchanged meanings. */
import {packetInspectionTypes,packetInspectionData} from './server-packet-inspection-plan.mjs';
export const currentReconciliationTests=Object.freeze(['server-packet-reconciliation-contracts.test.mjs','current-server-reference-native-read.test.mjs','lazy-version-reconciliation-native.test.mjs','current-provider-missing-native.test.mjs']);
export const currentReconciliationTypes=Object.freeze([...packetInspectionTypes,'scripts/fixtures/editor-consumer/types-current-server-packet-reconciliation.ts']);
export const currentReconciliationData=Object.freeze([...packetInspectionData,'scripts/fixtures/local-metadata/pending-source-packet-recovery.archive']);
export const currentReconciliationCaseCount=8;
