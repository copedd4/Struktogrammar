/**
 * Geometry of the diagonal headers (if / switch). Shared by the editor and the
 * exporter so both place the condition text identically: always inside the
 * triangle formed by the diagonals, never crossing a line.
 */

/** Gap kept between the text box and a diagonal / the border. */
export const DIAG_MARGIN = 6;
/** Space above the condition text. */
export const DIAG_PAD = 4;
/** The text box never gets wider than this share of the block; longer text wraps. */
export const DIAG_TEXT_RATIO = 0.6;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * If-header: the diagonals run from both top corners down to the point `split`
 * on the bottom edge (the line between the true and false branch).
 * For a text box of `w` × `h`, returns the header height and the text's left
 * offset so the box sits inside the upper triangle.
 *
 * At depth y the triangle spans [split·y/H, W − (W − split)·y/H]; the box needs
 * that span at its bottom edge, which gives H = depth / (1 − boxWidth / W).
 */
export function ifHeaderLayout(W: number, split: number, w: number, h: number, minH: number) {
  if (W <= 0) return { height: minH, left: 0 };
  const boxW = w + DIAG_MARGIN * 2;
  const depth = DIAG_PAD + h + DIAG_MARGIN;
  const t = Math.max(0.15, 1 - boxW / W);
  const height = Math.max(minH, Math.ceil(depth / t));
  const k = depth / height;
  const lo = split * k;
  const hi = W - (W - split) * k;
  const left = clamp(
    (lo + hi - w) / 2,
    lo + DIAG_MARGIN,
    Math.max(lo + DIAG_MARGIN, hi - DIAG_MARGIN - w),
  );
  return { height, left };
}

/**
 * Switch-header: one diagonal from the top-left to the bottom-right corner; the
 * expression sits in the lower-left triangle, anchored bottom-left.
 * The box's top-right corner must stay below the line y = H·x / W.
 */
export function switchHeaderLayout(W: number, w: number, h: number, minH: number) {
  if (W <= 0) return { height: minH, left: DIAG_MARGIN };
  const boxW = w + DIAG_MARGIN * 2;
  const t = Math.max(0.15, 1 - boxW / W);
  const height = Math.max(minH, Math.ceil((h + DIAG_PAD + DIAG_MARGIN) / t));
  return { height, left: DIAG_MARGIN };
}
