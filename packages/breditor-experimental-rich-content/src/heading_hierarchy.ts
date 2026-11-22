export interface HeadingBranch<Heading> {
 readonly heading: Heading;
 readonly children: HeadingBranch<Heading>[];
}

/** Nest each heading under the nearest preceding heading of a shallower rank. */
export function headingHierarchy<Heading extends {readonly level: number}>(
 headings: readonly Heading[],
): HeadingBranch<Heading>[] {
 const roots: HeadingBranch<Heading>[] = [];
 const ancestors: HeadingBranch<Heading>[] = [];
 for (const heading of headings) {
  while (ancestors.length && ancestors.at(-1)!.heading.level >= heading.level) ancestors.pop();
  const branch = {heading, children: []};
  (ancestors.at(-1)?.children ?? roots).push(branch);
  ancestors.push(branch);
 }
 return roots;
}
