/** Appends an alpha channel to a 6-digit hex color, e.g. `tintWithAlpha("#D2601F", 0.12)` ->
 *  `"#D2601F1E"`. Used for a semantic-color wash painted as an ordinary background over an
 *  already-glass surface (RecoveryBanner, a grade-weight warning) -- never for the aurora,
 *  which only ever composites through its own gradient stops. */
export function tintWithAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}
