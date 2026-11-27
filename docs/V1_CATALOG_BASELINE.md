# V1 catalog baselines

The [upstream comparison index](v1-catalog-upstream.json) ties catalog
entries to versioned Breditor acceptance cases. The cases are draft
qualification criteria. An entry may need several cases, and the same case
may represent a capability in both catalogs.

- The Tiptap baseline uses the 93 pages with a catalog group in their
  extension frontmatter. The content path is the stable entry ID for that
  snapshot. [Pinned Tiptap docs](https://github.com/ueberdosis/tiptap-docs/tree/013f78b15b1e6adc3ffd6f56e1d0d666871f8d70/src/content)
- The CKEditor 5 v49.1.0 baseline uses the 160 feature headings and cards in
  the feature digest, excluding headings that only group entries. The index
  uses the explicit heading IDs where present and normalized labels for
  plain headings. [Pinned CKEditor feature digest](https://github.com/ckeditor/ckeditor5/blob/6573893566744eb4a134d3bf56419f96cc60be6f/docs/features/feature-digest.md)

`npm run audit:v1` verifies unique upstream IDs, the pinned source URL
format and exact case versions, and reports the linked entry counts. The numbers
count source entries with a case definition. To qualify a case, record the
case version, candidate artifacts, actual observations and any accepted
deviation in the release evidence.

## Catalog review disposition

All 253 pinned entries have versioned acceptance cases under the confirmed V1
scope. The release plan and the case definitions preserve the three recorded
differences as parity work:

- Block-level bookmark anchors cover one anchor per block. V1 still needs
  distinct inline targets within one paragraph under
  `inline-bookmark-position@1`.
- The trailing table caption has fixed presentation today. V1 still needs
  supported host configuration for placement above or below in editing and
  published views under `table-caption-edit-and-placement@2`.
- Text part language carries the run's language today. V1 still needs per-run
  direction alongside language without altering the selected paragraph or UI
  locale under `text-part-language-and-direction@1`.

The catalog review records zero approved exclusions or deviations. These
capabilities stay in scope. Implementation and behavioral qualification are
tracked in the readiness ledger's feature groups and remaining release gates.
The November 27 scope reduction removes release qualification requirements
(the application pilot, testing by outside people, and independent-writer and
independent-consumer requirements). It does not exclude any catalog capability.
