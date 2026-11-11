import test from 'node:test';
import {testCompleteJointActivation} from './fixtures/native-publication/complete-joint.mjs';

test('actual joint activation retains actors and metadata until authenticated publication, then delivers all original protocols',
 {timeout:14400000},()=>testCompleteJointActivation());
