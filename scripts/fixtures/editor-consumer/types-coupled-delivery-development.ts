/** Development-only type fence; no public root/API or cold-resume claim. */
import {SelectedNativeDeliveryJournal} from '../../../packages/breditor-collaboration/dist/selected_delivery_journal/coordinator.js';
import type {DeliveryJournalRecordingInput} from '../../../packages/breditor-collaboration/dist/selected_delivery_journal/coordinator_contract.js';
import type {RetainedDeliverySource} from '../../../packages/breditor-collaboration/dist/operation_read/delivery_retention.js';
declare const owner:SelectedNativeDeliveryJournal,source:RetainedDeliverySource,input:DeliveryJournalRecordingInput;
owner.createDelivery(source,'comment');owner.record(input).then(snapshot=>snapshot.head.sequence);owner.readFacts();owner.close();
// @ts-expect-error No saved-data editing resume exists.
owner.resume({ready:true});
// @ts-expect-error No activation capability is returned.
owner.activate();
// @ts-expect-error Constructor is private.
new SelectedNativeDeliveryJournal();
// @ts-expect-error Both genuine baseline and latest-predecessor controls are required.
owner.record({server:input.server,inventory:input.inventory});
// @ts-expect-error Snapshot heads are immutable data.
owner.readFacts().then(snapshot=>{snapshot.head.sequence=5;});
