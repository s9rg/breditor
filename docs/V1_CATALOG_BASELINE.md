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

The release review still owns the disposition of differences. The current
block-level bookmark anchors, trailing table captions and independent text
language and direction fields are documented in the
[release plan](V1_RELEASE_PLAN.md#what-the-review-found). The draft cases
expose these differences to review.
