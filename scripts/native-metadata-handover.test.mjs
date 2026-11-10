/** Real sealed successor plus seven cold owners, review facts and pending metadata. */
import test from 'node:test';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
import {testColdCurrentReconciliation} from './fixtures/local-metadata/cold-current-reconciliation.mjs';

test('sealed handover preserves cold review and metadata facts before full current reconciliation', {timeout: 7200000},
 () => testMetadataMaterialization('local-only-content', {
  reconcileAssets: true,
  cacheCatalogPackets: false,
  documentSegmented: true,
  reviewSegmented: true,
  onRetainedReconciliation: input => testColdCurrentReconciliation({...input, sealedHandover: true}),
  verifyFutureHistories: true,
 }));
