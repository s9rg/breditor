/** The original generation journal remains byte-for-byte the same family.
 * These readers supply detached DATA, never an original append witness. */
export {detachGenerationJournal,generationJournalMetadata,readGenerationJournal} from '../selected_generation_reconstruction/snapshot.js';
