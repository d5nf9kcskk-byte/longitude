/* Minimal QR code generator — byte mode, EC level M, versions 1–10.
   Self-contained (no CDN) so the QR Kit works offline. Global `QR`.
   QR.matrix(text) → 2D array of 0/1, or null if the text is too long.
   QR.svg(text, size) → SVG markup string. */
'use strict';

const QR = (() => {
  // GF(256) tables, generator 0x11d
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1; if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const gmul = (a, b) => (a && b) ? EXP[LOG[a] + LOG[b]] : 0;

  // EC-M block structure per version: [ecPerBlock, [dataLenPerBlock...]]
  const BLOCKS_M = {
    1: [10, [16]], 2: [16, [28]], 3: [26, [44]],
    4: [18, [32, 32]], 5: [24, [43, 43]], 6: [16, [27, 27, 27, 27]],
    7: [18, [31, 31, 31, 31]], 8: [22, [38, 38, 39, 39]],
    9: [22, [36, 36, 36, 37, 37]], 10: [26, [43, 43, 43, 43, 44]],
  };
  const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };

  function rsPoly(deg) {
    let poly = [1];
    for (let i = 0; i < deg; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= gmul(poly[j], EXP[i]);
        next[j + 1] ^= poly[j];
      }
      poly = next;
    }
    // built lowest-degree-first; reverse so gen[0] is the leading (x^deg) coeff
    return poly.reverse();
  }

  function rsRemainder(data, deg) {
    const gen = rsPoly(deg);
    const res = data.concat(new Array(deg).fill(0));
    for (let i = 0; i < data.length; i++) {
      const factor = res[i];
      if (factor === 0) continue;
      for (let j = 0; j < gen.length; j++) res[i + j] ^= gmul(gen[j], factor);
    }
    return res.slice(data.length);
  }

  function toBytes(text) {
    // UTF-8 encode
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(text));
    const out = [];
    for (const ch of unescape(encodeURIComponent(text))) out.push(ch.charCodeAt(0));
    return out;
  }

  function buildCodewords(bytes, version) {
    const [ecLen, dataBlocks] = BLOCKS_M[version];
    const totalData = dataBlocks.reduce((a, b) => a + b, 0);
    // bit stream: mode 0100, count (8 or 16 bits), data, terminator, pads
    const bits = [];
    const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    push(0b0100, 4);
    push(bytes.length, version >= 10 ? 16 : 8);
    for (const b of bytes) push(b, 8);
    const cap = totalData * 8;
    if (bits.length > cap) return null;
    push(0, Math.min(4, cap - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let v = 0;
      for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      data.push(v);
    }
    const pads = [0xec, 0x11];
    let p = 0;
    while (data.length < totalData) data.push(pads[p++ % 2]);

    // split into blocks, compute EC per block, interleave
    const blocks = [], ecs = [];
    let off = 0;
    for (const len of dataBlocks) {
      const blk = data.slice(off, off + len);
      off += len;
      blocks.push(blk);
      ecs.push(rsRemainder(blk, ecLen));
    }
    const out = [];
    const maxLen = Math.max(...dataBlocks);
    for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
    for (let i = 0; i < ecLen; i++) for (const e of ecs) out.push(e[i]);
    return out;
  }

  function makeMatrix(version, codewords, mask) {
    const size = 17 + version * 4;
    const m = Array.from({ length: size }, () => new Array(size).fill(null)); // null = unset data area

    const setFunc = (r, c, v) => { if (r >= 0 && r < size && c >= 0 && c < size) m[r][c] = { f: true, v }; };

    // finders + separators
    const finder = (r0, c0) => {
      for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
        const rr = r0 + r, cc = c0 + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const inF = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const dark = inF && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        setFunc(rr, cc, dark ? 1 : 0);
      }
    };
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

    // alignment patterns
    const centers = ALIGN[version];
    for (const r of centers) for (const c of centers) {
      // skip ones overlapping finders
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
        setFunc(r + dr, c + dc, dark ? 1 : 0);
      }
    }

    // timing
    for (let i = 8; i < size - 8; i++) {
      if (m[6][i] == null) setFunc(6, i, i % 2 === 0 ? 1 : 0);
      if (m[i][6] == null) setFunc(i, 6, i % 2 === 0 ? 1 : 0);
    }

    // dark module
    setFunc(size - 8, 8, 1);

    // reserve format info areas (filled later)
    for (let i = 0; i < 9; i++) {
      if (m[8][i] == null) setFunc(8, i, 0);
      if (m[i][8] == null) setFunc(i, 8, 0);
    }
    for (let i = 0; i < 8; i++) {
      if (m[8][size - 1 - i] == null) setFunc(8, size - 1 - i, 0);
      if (m[size - 1 - i][8] == null) setFunc(size - 1 - i, 8, 0);
    }

    // version info (v >= 7)
    if (version >= 7) {
      let v = version;
      // BCH(18,6) with generator 0x1f25
      let d = v << 12;
      while (bitLen(d) - 1 >= 12) d ^= 0x1f25 << (bitLen(d) - 13);
      const bitsV = (v << 12) | d;
      for (let i = 0; i < 18; i++) {
        const bit = (bitsV >> i) & 1;
        setFunc(Math.floor(i / 3), size - 11 + (i % 3), bit);
        setFunc(size - 11 + (i % 3), Math.floor(i / 3), bit);
      }
    }

    // place data bits, zigzag from bottom-right, skipping col 6
    const bits = [];
    for (const b of codewords) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
    let bi = 0;
    let col = size - 1, up = true;
    while (col > 0) {
      if (col === 6) col--;
      for (let i = 0; i < size; i++) {
        const r = up ? size - 1 - i : i;
        for (const c of [col, col - 1]) {
          if (m[r][c] == null) {
            const bit = bi < bits.length ? bits[bi++] : 0;
            m[r][c] = { f: false, v: bit };
          }
        }
      }
      col -= 2; up = !up;
    }

    // apply mask to data modules
    const maskFn = MASKS[mask];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (!m[r][c].f && maskFn(r, c)) m[r][c].v ^= 1;
    }

    // format info: EC M = 00, mask bits; BCH(15,5), XOR 0x5412
    let fmt = (0b00 << 3) | mask;
    let rem = fmt << 10;
    while (bitLen(rem) - 1 >= 10) rem ^= 0x537 << (bitLen(rem) - 11);
    const fmtBits = ((fmt << 10) | rem) ^ 0x5412;
    // index 0 in the coordinate lists below is the MSB of the 15-bit sequence
    const fb = i => (fmtBits >> (14 - i)) & 1;
    // around top-left finder
    const coordsA = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
    coordsA.forEach(([r, c], i) => { m[r][c] = { f: true, v: fb(i) }; });
    // split copy: bottom-left column + top-right row
    for (let i = 0; i < 7; i++) m[size - 1 - i][8] = { f: true, v: fb(i) };
    for (let i = 7; i < 15; i++) m[8][size - 15 + i] = { f: true, v: fb(i) };
    m[size - 8][8] = { f: true, v: 1 }; // dark module stays dark

    return m.map(row => row.map(cell => cell.v));
  }

  function bitLen(n) { let l = 0; while (n) { l++; n >>= 1; } return l; }

  const MASKS = [
    (r, c) => (r + c) % 2 === 0,
    (r, c) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
    (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
    (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
  ];

  function penalty(mat) {
    const n = mat.length;
    let score = 0;
    // rule 1: runs >= 5 in row/col
    for (let axis = 0; axis < 2; axis++) {
      for (let i = 0; i < n; i++) {
        let run = 1;
        for (let j = 1; j < n; j++) {
          const cur = axis ? mat[j][i] : mat[i][j];
          const prev = axis ? mat[j - 1][i] : mat[i][j - 1];
          if (cur === prev) { run++; if (j === n - 1 && run >= 5) score += 3 + run - 5; }
          else { if (run >= 5) score += 3 + run - 5; run = 1; }
        }
      }
    }
    // rule 2: 2x2 blocks
    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {
      const v = mat[r][c];
      if (mat[r][c + 1] === v && mat[r + 1][c] === v && mat[r + 1][c + 1] === v) score += 3;
    }
    // rule 3: finder-like patterns 1011101 with 0000 on either side
    const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    for (let axis = 0; axis < 2; axis++) {
      for (let i = 0; i < n; i++) for (let j = 0; j <= n - 11; j++) {
        let m1 = true, m2 = true;
        for (let k = 0; k < 11; k++) {
          const v = axis ? mat[j + k][i] : mat[i][j + k];
          if (v !== pat1[k]) m1 = false;
          if (v !== pat2[k]) m2 = false;
        }
        if (m1) score += 40;
        if (m2) score += 40;
      }
    }
    // rule 4: dark ratio
    let dark = 0;
    for (const row of mat) for (const v of row) dark += v;
    const pct = (dark * 100) / (n * n);
    score += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return score;
  }

  function matrix(text) {
    const bytes = toBytes(String(text));
    let version = null;
    for (let v = 1; v <= 10; v++) {
      const total = BLOCKS_M[v][1].reduce((a, b) => a + b, 0);
      const headBits = 4 + (v >= 10 ? 16 : 8);
      if (bytes.length * 8 + headBits <= total * 8) { version = v; break; }
    }
    if (!version) return null;
    const codewords = buildCodewords(bytes, version);
    if (!codewords) return null;
    let best = null, bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const m = makeMatrix(version, codewords, mask);
      const s = penalty(m);
      if (s < bestScore) { bestScore = s; best = m; }
    }
    return best;
  }

  function svg(text, sizePx, opts) {
    const m = matrix(text);
    if (!m) return '<svg xmlns="http://www.w3.org/2000/svg" width="' + (sizePx || 160) + '" height="' + (sizePx || 160) + '"><text x="8" y="20" font-size="11">Link too long for QR</text></svg>';
    const n = m.length, quiet = 4, dim = n + quiet * 2;
    const fg = (opts && opts.fg) || '#000';
    const bg = (opts && opts.bg) || '#fff';
    let path = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (m[r][c]) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${sizePx || 160}" height="${sizePx || 160}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${dim}" height="${dim}" fill="${bg}"/><path d="${path}" fill="${fg}"/></svg>`;
  }

  return { matrix, svg };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { QR };
