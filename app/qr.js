/* ============================================================
   qr.js —— 极简 QR 编码器（零依赖，纯字节模式）
   · 为什么自己写：网易云扫码登录的二维码内容就是 /api/login/qrcode/unikey
     返回的那个 unikey 字符串（36 字符），项目又是零依赖，引个二维码库
     不划算，引个在线二维码服务又要联网还不安全 —— 自己编。
   · 覆盖：版本 1~10、纠错级 L/M/Q/H、8 种掩码自动选优。
     36 字符在 EC=M 下只要版本 3（29×29），版本 10（57×57）是余量。
   · 输出：QR.matrix(text) → {n, m}（m 是 n×n 的 0/1 二维数组）
           QR.svg(text, px) → SVG 字符串（带 4 模块静区，可直接塞进 innerHTML）
           QR.canvas(text, px) → HTMLCanvasElement（DOM 环境）
   · 用法：<script src="qr.js"></script> → window.QR
   ============================================================ */
(function (root) {
  'use strict';

  /* ---------- GF(256)：RS 纠错用 ---------- */
  const EXP = new Array(512), LOG = new Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

  /* 生成多项式（系数按降幂排列，poly[0]=1） */
  function genPoly(ecLen) {
    const p = new Uint8Array(ecLen + 1);
    p[0] = 1;
    for (let i = 0; i < ecLen; i++) {
      for (let j = i + 1; j > 0; j--) p[j] ^= mul(p[j - 1], EXP[i]);
    }
    return p;
  }
  /* 对一个码块求 ecLen 个纠错码字 */
  function rsEC(data, ecLen) {
    const poly = genPoly(ecLen);
    const buf = new Uint8Array(data.length + ecLen);
    buf.set(data);
    for (let i = 0; i < data.length; i++) {
      const f = buf[i];
      if (!f) continue;
      for (let j = 0; j < poly.length; j++) buf[i + j] ^= mul(poly[j], f);
    }
    return buf.slice(data.length);
  }

  /* ---------- 版本表 ----------
     RS 块表每项是扁平的 [块数, 该块总码字, 该块数据码字, 块数, …, …]（qrcode.js 的排法）。
     顺序：L / M / Q / H，版本 1~10。 */
  const RS = [
    /* v1  */ [[1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9]],
    /* v2  */ [[1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16]],
    /* v3  */ [[1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13]],
    /* v4  */ [[1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9]],
    /* v5  */ [[1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12]],
    /* v6  */ [[2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15]],
    /* v7  */ [[2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14]],
    /* v8  */ [[2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15]],
    /* v9  */ [[2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13]],
    /* v10 */ [[2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16]]
  ];
  const MAXVER = RS.length;
  const ALIGN = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  const ECIDX = { L: 0, M: 1, Q: 2, H: 3 };
  const ECBITS = { L: 1, M: 0, Q: 3, H: 2 };

  const isArrayish = t => Array.isArray(t) || (t && typeof t.length === 'number');
  const utf8 = s => new TextEncoder().encode(s);

  /* ---------- 1. 数据 → 码字 ---------- */
  function toCodewords(bytes, ver, ecIdx) {
    const spec = RS[ver - 1][ecIdx];
    let dataTotal = 0, total = 0;
    for (let i = 0; i < spec.length; i += 3) { dataTotal += spec[i] * spec[i + 2]; total += spec[i] * spec[i + 1]; }

    const bits = [];
    const push = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
    push(4, 4);                                  // 模式：0100 = 字节
    push(bytes.length, ver <= 9 ? 8 : 16);       // 字符数
    for (const b of bytes) push(b, 8);

    /* 终止符 + 补到字节边界 */
    const cap = dataTotal * 8;
    if (bits.length > cap) throw new Error('内容太长，' + ver + ' 版装不下（' + bytes.length + ' 字节）');
    for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);

    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      data.push(v);
    }
    for (let i = 0; data.length < dataTotal; i++) data.push(i % 2 ? 0x11 : 0xEC);

    /* 按块切分 → 各自算纠错 */
    const blocks = [];
    let off = 0;
    for (let i = 0; i < spec.length; i += 3) {
      for (let b = 0; b < spec[i]; b++) {
        const dc = spec[i + 2], ec = spec[i + 1] - dc;
        const d = data.slice(off, off + dc); off += dc;
        blocks.push({ d, e: rsEC(d, ec) });
      }
    }
    /* 交错 */
    const out = [];
    const maxD = Math.max.apply(null, blocks.map(b => b.d.length));
    for (let k = 0; k < maxD; k++) for (const b of blocks) if (k < b.d.length) out.push(b.d[k]);
    const maxE = Math.max.apply(null, blocks.map(b => b.e.length));
    for (let k = 0; k < maxE; k++) for (const b of blocks) if (k < b.e.length) out.push(b.e[k]);
    if (out.length !== total) throw new Error('码字排布对不上：' + out.length + ' ≠ ' + total);
    return out;
  }

  /* ---------- 2. 矩阵骨架（功能图形） ---------- */
  function blank(n) { const m = []; for (let i = 0; i < n; i++) m.push(new Uint8Array(n).fill(0)); return m; }
  const isFn = n => { const f = []; for (let i = 0; i < n; i++) f.push(new Uint8Array(n)); return f; };

  function finder(m, f, r, c) {
    for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) {
      const y = r + i, x = c + j;
      if (y < 0 || y >= m.length || x < 0 || x >= m.length) continue;
      f[y][x] = 1;
      const on = (i >= 0 && i <= 6 && (j === 0 || j === 6)) || (j >= 0 && j <= 6 && (i === 0 || i === 6)) ||
        (i >= 2 && i <= 4 && j >= 2 && j <= 4);
      m[y][x] = on ? 1 : 0;
    }
  }
  function align(m, f, r, c) {
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      f[r + i][c + j] = 1;
      m[r + i][c + j] = (Math.max(Math.abs(i), Math.abs(j)) !== 1) ? 1 : 0;
    }
  }

  function skeleton(ver, ecIdx) {
    const n = ver * 4 + 17;
    const m = blank(n), f = isFn(n);
    finder(m, f, 0, 0); finder(m, f, 0, n - 7); finder(m, f, n - 7, 0);
    /* 定位图形 */
    for (let i = 8; i < n - 8; i++) { f[6][i] = 1; m[6][i] = (i % 2 === 0) ? 1 : 0; f[i][6] = 1; m[i][6] = (i % 2 === 0) ? 1 : 0; }
    /* 校正图形 */
    const ap = ALIGN[ver - 1];
    for (let i = 0; i < ap.length; i++) for (let j = 0; j < ap.length; j++) {
      const r = ap[i], c = ap[j];
      if ((r === 6 && c === 6) || (r === 6 && c === n - 7) || (r === n - 7 && c === 6)) continue;
      align(m, f, r, c);
    }
    /* 固定黑点 */
    m[n - 8][8] = 1; f[n - 8][8] = 1;

    /* 预留格式信息区（先占位，等掩码定了再写） */
    for (let i = 0; i < 9; i++) { if (i !== 6) { f[8][i] = 1; f[i][8] = 1; } }
    for (let i = 0; i < 8; i++) { f[8][n - 1 - i] = 1; f[n - 1 - i][8] = 1; }
    f[8][8] = 1;
    /* 预留版本信息区（v≥7） */
    if (ver >= 7) {
      for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { f[i][n - 11 + j] = 1; f[n - 11 + j][i] = 1; }
    }
    return { m, f, n };
  }

  /* ---------- 3. 掩码 ---------- */
  const MASK = [
    (i, j) => (i + j) % 2 === 0,
    (i) => i % 2 === 0,
    (i, j) => j % 3 === 0,
    (i, j) => (i + j) % 3 === 0,
    (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
    (i, j) => (i * j) % 2 + (i * j) % 3 === 0,
    (i, j) => ((i * j) % 2 + (i * j) % 3) % 2 === 0,
    (i, j) => ((i + j) % 2 + (i * j) % 3) % 2 === 0
  ];
  function applyMask(m, f, k, n) {
    const fn = MASK[k];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (f[i][j]) continue;
      if (fn(i, j)) m[i][j] ^= 1;
    }
  }
  /* 惩罚分（ISO/IEC 18004 的四条规则），分越低越好 */
  function penalty(m, n) {
    let p = 0;
    const run = (get) => {
      for (let a = 0; a < n; a++) {
        let last = -1, len = 0;
        for (let b = 0; b < n; b++) {
          const v = get(a, b);
          if (v === last) { len++; if (len === 5) p += 3; else if (len > 5) p += 1; }
          else { last = v; len = 1; }
        }
      }
    };
    run((a, b) => m[a][b]);
    run((a, b) => m[b][a]);
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - 1; j++) {
      const v = m[i][j];
      if (v === m[i][j + 1] && v === m[i + 1][j] && v === m[i + 1][j + 1]) p += 3;
    }
    /* 1:1:3:1:1 前后各 4 模块白 → 每次 +40 */
    const pat = [1, 0, 1, 1, 1, 0, 1];
    const hit = (get) => {
      for (let a = 0; a < n; a++) for (let b = 0; b + 6 < n; b++) {
        let ok = true;
        for (let k = 0; k < 7; k++) if (get(a, b + k) !== pat[k]) { ok = false; break; }
        if (!ok) continue;
        let pre = true, post = true;
        for (let k = 1; k <= 4; k++) { if (b - k < 0 || get(a, b - k) !== 0) { pre = false; break; } }
        for (let k = 7; k <= 10; k++) { if (b + k >= n || get(a, b + k) !== 0) { post = false; break; } }
        if (pre || post) p += 40;
      }
    };
    hit((a, b) => m[a][b]);
    hit((a, b) => m[b][a]);
    let dark = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) dark += m[i][j];
    const ratio = dark * 100 / (n * n);
    p += Math.floor(Math.abs(ratio - 50) / 5) * 10;
    return p;
  }

  /* ---------- 4. 格式 / 版本信息 ---------- */
  function bch(data, poly, bits) {
    let d = data << bits;
    let g = poly;
    let gl = 0; for (let t = poly; t; t >>>= 1) gl++;
    while (true) {
      let dl = 0; for (let t = d; t; t >>>= 1) dl++;
      if (dl < gl) break;
      d ^= g << (dl - gl);
    }
    return (data << bits) | d;
  }
  const FORMAT_MASK = 0x5412;
  function formatBits(ecIdx, mask) {
    /* 纠错级 2 bit + 掩码 3 bit，高 5 位，BCH(15,5) + 固定异或 */
    const idx = [1, 0, 3, 2][ecIdx];
    return bch((idx << 3) | mask, 0x537, 10) ^ FORMAT_MASK;
  }
  function versionBits(ver) { return bch(ver, 0x1f25, 12); }

  /* 格式信息两份（位 k 是「从低位往高位」的那个 k，别按书写顺序想）：
     竖排走列 8 从下往上：k<6 → 行 k；k=6 → 行 7；k=7 → 行 8；k≥8 → 行 n-15+k
     横排走行 8 从右往左：k<8 → 列 n-1-k；k=8 → 列 7；k≥9 → 列 14-k
     这两条是 ISO/IEC 18004 的固定摆法，(n-8,8) 那个固定黑点最后压一次。 */
  function placeFormat(m, n, ecIdx, mask) {
    const bits = formatBits(ecIdx, mask);
    const g = k => (bits >>> k) & 1;
    for (let k = 0; k < 15; k++) {
      const b = g(k);
      if (k < 6) m[k][8] = b;
      else if (k < 8) m[k + 1][8] = b;
      else m[n - 15 + k][8] = b;
    }
    for (let k = 0; k < 15; k++) {
      const b = g(k);
      if (k < 8) m[8][n - 1 - k] = b;
      else if (k === 8) m[8][7] = b;
      else m[8][14 - k] = b;
    }
    m[n - 8][8] = 1;
  }
  function placeVersion(m, n, ver) {
    if (ver < 7) return;
    const bits = versionBits(ver);
    for (let k = 0; k < 18; k++) {
      const b = (bits >>> k) & 1;
      const r = Math.floor(k / 3), c = k % 3;
      m[r][n - 11 + c] = b;
      m[n - 11 + c][r] = b;
    }
  }

  /* ---------- 对外 ---------- */
  function pickVersion(len, ecIdx) {
    for (let v = 1; v <= MAXVER; v++) {
      const spec = RS[v - 1][ecIdx];
      let dataTotal = 0;
      for (let i = 0; i < spec.length; i += 3) dataTotal += spec[i] * spec[i + 2];
      /* 4 + 字符数位 + 数据 + 最多 4 终止位 */
      const need = 4 + (v <= 9 ? 8 : 16) + len * 8;
      if (need <= dataTotal * 8) return v;
    }
    throw new Error('内容太长，版本 10 也装不下（' + len + ' 字节）');
  }

  /** 编码：返回 {n, m, ver, mask, ec} */
  function matrix(text, opts) {
    const o = opts || {};
    const ec = String(o.ec || 'M').toUpperCase();
    const ecIdx = ECIDX[ec] == null ? 1 : ECIDX[ec];
    const bytes = isArrayish(text) && !(typeof text === 'string') ? Uint8Array.from(text) : utf8(String(text));
    const ver = o.ver ? Number(o.ver) : pickVersion(bytes.length, ecIdx);
    if (ver < 1 || ver > MAXVER) throw new Error('版本只支持 1~' + MAXVER);
    const cw = toCodewords(bytes, ver, ecIdx);
    const { m, f, n } = skeleton(ver, ecIdx);

    /* 数据按「上下蛇形、左右两列一组」铺进去，跳过功能模块 */
    let bit = 0, up = true;
    for (let col = n - 1; col > 0; col -= 2) {
      if (col === 6) col--;                     /* 第 6 列是竖直定时图形，整列跳过 */
      for (let k = 0; k < n; k++) {
        const row = up ? n - 1 - k : k;
        for (let c = 0; c < 2; c++) {
          const j = col - c;
          if (f[row][j]) continue;
          m[row][j] = bit < cw.length * 8 ? (cw[bit >>> 3] >>> (7 - (bit & 7))) & 1 : 0;
          bit++;
        }
      }
      up = !up;
    }

    /* 八种掩码全试一遍，取惩罚分最低的 */
    let best = null;
    const lo = o.mask == null ? 0 : Number(o.mask);
    const hi = o.mask == null ? 7 : Number(o.mask);
    for (let k = lo; k <= hi; k++) {
      const mm = m.map(r => Uint8Array.from(r));
      applyMask(mm, f, k, n);
      placeFormat(mm, n, ecIdx, k);
      placeVersion(mm, n, ver);
      const p = penalty(mm, n);
      if (!best || p < best.p) best = { m: mm, mask: k, p };
    }
    return { n, m: best.m, ver, mask: best.mask, ec, penalty: best.p };
  }

  /** SVG 字符串：px 是「一个模块多少像素」，quiet 是静区模块数（标准 4） */
  function svg(text, px, opts) {
    const o = opts || {};
    const r = matrix(text, o);
    const q = o.quiet == null ? 4 : Number(o.quiet);
    const size = o.size ? Number(o.size) : (r.n + q * 2) * (px || 4);
    const unit = size / (r.n + q * 2);
    let d = '';
    for (let i = 0; i < r.n; i++) for (let j = 0; j < r.n; j++) {
      if (r.m[i][j]) d += 'M' + ((j + q) * unit).toFixed(3) + ' ' + ((i + q) * unit).toFixed(3) + 'h' + unit.toFixed(3) + 'v' + unit.toFixed(3) + 'h-' + unit.toFixed(3) + 'z';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges">' +
      '<rect width="' + size + '" height="' + size + '" fill="' + (o.bg || '#fff') + '"/>' +
      '<path d="' + d + '" fill="' + (o.fg || '#000') + '"/></svg>';
  }

  /** Canvas（要给 canvas 元素的话） */
  function canvas(text, px, opts) {
    const o = opts || {};
    const r = matrix(text, o);
    const q = o.quiet == null ? 4 : Number(o.quiet);
    const unit = px || 4, size = (r.n + q * 2) * unit;
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const g = cv.getContext('2d');
    g.fillStyle = o.bg || '#fff'; g.fillRect(0, 0, size, size);
    g.fillStyle = o.fg || '#000';
    for (let i = 0; i < r.n; i++) for (let j = 0; j < r.n; j++) if (r.m[i][j]) g.fillRect((j + q) * unit, (i + q) * unit, unit, unit);
    return cv;
  }

  const API = { matrix, svg, canvas, maxVersion: MAXVER, versions: MAXVER };
  root.QR = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
