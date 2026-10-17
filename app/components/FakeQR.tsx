const SIZE = 33; // modules per side (QR versions 1-2 are 21-25)

// Deterministic hash so the same seed always renders the same pattern
function hash(str: string, i: number) {
  let h = 2166136261 ^ i;
  for (let k = 0; k < str.length; k++) {
    h ^= str.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 2 ** 32;
}

// A module is part of a finder pattern if it's in the top-left, top-right, or bottom-left 7x7 corner areas.
function isFinder(row: number, col: number) {
  const inTopLeft = row < 7 && col < 7;
  const inTopRight = row < 7 && col >= SIZE - 7;
  const inBottomLeft = row >= SIZE - 7 && col < 7;
  return inTopLeft || inTopRight || inBottomLeft;
}

// 7x7 finder pattern: filled outer ring + filled center 3x3
function finderModule(row: number, col: number, baseR: number, baseC: number) {
  const r = row - baseR;
  const c = col - baseC;
  const onRing = r === 0 || r === 6 || c === 0 || c === 6;
  const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
  return onRing || inCore;
}

export function FakeQR({
  seed,
  size = 220,
  className = "",
}: {
  seed: string;
  size?: number;
  className?: string;
}) {
  const cells: boolean[] = [];

  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      let on: boolean;

      // 1. Finder patterns
      if (isFinder(row, col)) {
        if (row < 7 && col < 7) on = finderModule(row, col, 0, 0);
        else if (row < 7) on = finderModule(row, col, 0, SIZE - 7);
        else on = finderModule(row, col, SIZE - 7, 0);
      }
      // 2. Timing patterns (row 6 and col 6, alternating)
      else if (row === 6 || col === 6) {
        on = (row + col) % 2 === 0;
      }
      // 3. Alignment pattern (small 5x5 near bottom-right, typical of v2+)
      else if (row >= SIZE - 9 && row <= SIZE - 5 && col >= SIZE - 9 && col <= SIZE - 5) {
        const r = row - (SIZE - 9);
        const c = col - (SIZE - 9);
        const onRing = r === 0 || r === 4 || c === 0 || c === 4;
        const center = r === 2 && c === 2;
        on = onRing || center;
      }
      // 4. Data modules — pseudo-random from the seed
      else {
        on = hash(seed, row * SIZE + col) > 0.5;
      }

      cells.push(on);
    }
  }

  return (
    <div
      className={`bg-white p-2 ${className}`}
      style={{ width: size, height: size }}
      aria-label="Payment QR code (simulation)"
    >
      <div
        className="grid h-full w-full"
        style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)` }}
      >
        {cells.map((on, i) => (
          <div key={i} className={on ? "bg-black" : "bg-white"} />
        ))}
      </div>
    </div>
  );
}