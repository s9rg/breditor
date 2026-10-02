/* Semantically equivalent diagnostic replacements for the two pinned FCSELs.
 * Swap the source operands AND invert HI to LS. No extra instructions or
 * relocation, unlike the guard. Not a production fix or a disk patch.
 */
.text
.globl _breditor_select_equivalence
_breditor_select_equivalence:
    fcsel d0, d1, d0, ls
    fcsel d1, d2, d1, ls
