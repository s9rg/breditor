/** Temporary cleanup ownership stays private; it is not a host grant. */
// @ts-expect-error The package root exposes no source-opening ownership constructor.
import {openJournalSource} from '@breditor/collaboration';
// @ts-expect-error Journal cleanup is SDK-private, not a serialized recovery option.
import {closeUnreturnedJournalSource} from '@breditor/collaboration';
// @ts-expect-error An actual running native destructor cannot be supplied by host DATA.
import {journalSourceCleanupOwnsRelease} from '@breditor/collaboration';
void openJournalSource;void closeUnreturnedJournalSource;void journalSourceCleanupOwnsRelease;
