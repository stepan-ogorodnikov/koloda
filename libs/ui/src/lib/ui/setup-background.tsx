type PileCard = [depth: number, x: number, y: number, rotate: number];

// WHY: the pile's soft shadow is a stack of rings of one token color; a single rect reads as a hard offset.
const SHADOW_LAYERS = [
  { x: -205.79, y: -136.05, width: 411.57, height: 278.57, rx: 31.79 },
  { x: -204.17, y: -135.35, width: 408.33, height: 275.33, rx: 30.17 },
  { x: -202.78, y: -134.66, width: 405.55, height: 272.55, rx: 28.78 },
  { x: -201.85, y: -134.2, width: 403.71, height: 270.71, rx: 27.85 },
  { x: -200.93, y: -133.73, width: 401.85, height: 268.85, rx: 26.93 },
  { x: -200.23, y: -133.27, width: 400.46, height: 267.46, rx: 26.23 },
];

const CARD_FACE = { x: -200, y: -133.5, width: 400, height: 267, rx: 26 };

// Back to front: depth 1 is the bottom of the pile, depth 8 the top.
const PILE_CARDS: PileCard[] = [
  [1, 1096, 131, -37.6],
  [1, 958, 291, -0.8],
  [2, 1131, 623, 19.4],
  [2, 519, 152, 7.8],
  [2, 303, 363, 24.5],
  [2, 168, 244, 3.5],
  [2, 712, 642, 11.4],
  [3, 648, 478, -20.5],
  [3, 173, 632, 29.6],
  [3, 818, 537, -44.4],
  [3, 891, 166, 65.9],
  [3, 1111, 457, 7.2],
  [4, 27, 398, 47.1],
  [4, 965, 620, -60.6],
  [4, 708, 181, -23.1],
  [4, 1263, 197, -1.3],
  [4, 531, 612, -35.2],
  [4, 322, 172, -65.3],
  [4, 447, 288, 1.5],
  [5, 266, 765, -77.5],
  [5, 17, 577, -7.5],
  [5, 791, 349, 21],
  [5, 343, 588, -6.4],
  [5, 28, 48, -9.4],
  [5, 1263, 371, -21.2],
  [6, 610, 320, 47],
  [6, 1060, 770, 43],
  [6, 205, 45, 11.7],
  [6, 1002, 24, -15.1],
  [6, 1256, 750, -32.4],
  [6, 649, 771, -21.3],
  [6, 615, 30, 12.8],
  [7, 1268, 551, -13.1],
  [7, 17, 222, 31.8],
  [7, 457, 455, 33.3],
  [7, 805, 32, -16.2],
  [7, 954, 449, 20.9],
  [7, 455, 760, 19.1],
  [7, 187, 463, -17.4],
  [7, 1111, 289, 0.9],
  [8, 44, 760, 0],
  [8, 1239, 32, 6.2],
  [8, 405, 28, 0.5],
  [8, 858, 759, 14.9],
];

// WHY: inline, not an .svg file: an image cannot read the scheme's tokens, so the pile would stay in one scheme.
// WHY: a body-colored layer whose opacity falls with depth fades the back cards into the page without a fill token per depth.
// WHY: the outline rises with depth while the face fades, so only the front cards keep a visible edge.
// WHY: the svg scales with the viewport (slice), so the outline uses non-scaling-stroke to stay at border-2's pixel width.
// WHY: the page-colored layer over the cards changes nothing on the page itself, and pulls the outlines toward the page color.
export function SetupBackground() {
  return (
    <svg
      className="absolute inset-0 size-full pointer-events-none"
      viewBox="0 0 1280 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {PILE_CARDS.map(([depth, x, y, rotate], index) => (
        <g key={index} transform={`translate(${x} ${y}) rotate(${rotate})`}>
          {SHADOW_LAYERS.map((layer) => (
            <rect key={layer.rx} className="fill-pile-shadow" {...layer} />
          ))}
          <rect className="fill-bg-level-1" {...CARD_FACE} />
          <rect className="fill-bg-body" fillOpacity={1 - (depth - 1) / 7} {...CARD_FACE} />
          <rect
            className="fill-none stroke-border-main"
            strokeOpacity={(depth - 1) / 7}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            {...CARD_FACE}
          />
        </g>
      ))}
      <rect className="fill-bg-body" fillOpacity={0.4} width={1280} height={800} />
    </svg>
  );
}
