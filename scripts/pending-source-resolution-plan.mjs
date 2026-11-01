/** Source and independent installed qualification retain every original packet
 * case and add the actual source-Pending repair and unchanged client facts. */
import {packetInspectionTests,packetInspectionTypes,packetInspectionData,packetInspectionCaseCount} from './server-packet-inspection-plan.mjs';
export const sourceResolutionTests=Object.freeze([...packetInspectionTests,'pending-source-resolution-contracts.test.mjs','pending-source-resolution-native-read.test.mjs','pending-source-resolution-cohort-native.test.mjs']);
export const sourceResolutionTypes=Object.freeze([...packetInspectionTypes,'scripts/fixtures/editor-consumer/types-pending-source-resolution.ts']);
export const sourceResolutionData=Object.freeze([...packetInspectionData,'scripts/fixtures/local-metadata/pending-source-packet-recovery.archive']);
export const sourceResolutionCaseCount=packetInspectionCaseCount+6;
