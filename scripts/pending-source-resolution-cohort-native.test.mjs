/** Real metadata publication/catalog and selected Native server replay, followed
 * by the existing original document/review Undo and Redo checks. */
import test from 'node:test';
import {testMetadataAvailability} from './fixtures/local-metadata/asset-availability.mjs';
import {testPendingSourceResolution} from './fixtures/local-metadata/pending-source-resolution.mjs';
import {inspectionNativeRoot} from './fixtures/server-packet-inspection/native-root.mjs';
test('all seven genuine sources recover uncached version dependencies and rasters while original Pending, receipts, metadata and Undo remain intact',{timeout:7200000},()=>testMetadataAvailability('pending-catalog',{nativeHostRoot:inspectionNativeRoot,onAvailable:testPendingSourceResolution}));
