/* electron/make-icon.mjs —— 生成 electron/icon.ico（Windows 图标）
 *
 * 项目里没有现成 logo，就照首页的配色自己画一个：香槟金圆角方块 + 近黑内панель + 三根递增柱
 * （对应「行测学习统计」）。纯位图运算，零依赖；输出 BMP-in-ICO，Win10/11 直接认，
 * electron-builder 也能直接吃。
 *
 * 用法： node electron/make-icon.mjs     （或 npm run icon）
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'icon.ico');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

const lerp = (a, b, t) => Math.round(a + (b - a) * t);

/* 圆角矩形命中测试（含半像素采样） */
function inRound(x, y, x0, y0, x1, y1, rad) {
  if (x < x0 || y < y0 || x > x1 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + rad), x1 - rad);
  const cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= rad * rad;
}

/* 画 size×size 的 RGBA（行优先、自上而下） */
function draw(size) {
  const px = new Uint8Array(size * size * 4);
  const outer = size * 0.22;           // 外圆角
  const inset = size * 0.15;           // 内панель留边
  const inner = size * 0.13;           // 内圆角
  const barEnd = size * 0.70;          // 柱状图底部

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      if (!inRound(x + .5, y + .5, 0, 0, size - 1, size - 1, outer)) continue;
      const t = y / (size - 1);        // 上浅下深的香槟金
      px[o] = lerp(0xf4, 0xb9, t);
      px[o + 1] = lerp(0xd2, 0x8a, t);
      px[o + 2] = lerp(0x8a, 0x3c, t);
      px[o + 3] = 255;
      if (inRound(x + .5, y + .5, inset, inset, size - 1 - inset, size - 1 - inset, inner)) {
        px[o] = 0x12; px[o + 1] = 0x10; px[o + 2] = 0x0c;   // 近黑панель
      }
    }
  }

  // 三根递增的柱子（只画在内панель里）
  for (const [bx, by] of [[0.30, 0.52], [0.475, 0.40], [0.65, 0.27]]) {
    const x0 = Math.round(size * bx), x1 = Math.round(size * (bx + 0.075));
    const y0 = Math.round(size * by), y1 = Math.round(barEnd);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const o = (y * size + x) * 4;
        if (px[o] === 0x12 && px[o + 1] === 0x10 && px[o + 2] === 0x0c) {
          px[o] = 0xf4; px[o + 1] = 0xd2; px[o + 2] = 0x8a;
        }
      }
    }
  }
  return px;
}

/* RGBA → ICO 里的一张 BMP（自下而上 BGRA + 1bpp AND 掩码） */
function bmpEntry(size, rgba) {
  const xor = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const src = (size - 1 - y) * size * 4;      // 反转成自下而上
    for (let x = 0; x < size; x++) {
      const s = src + x * 4, d = (y * size + x) * 4;
      xor[d] = rgba[s + 2];                      // B
      xor[d + 1] = rgba[s + 1];                  // G
      xor[d + 2] = rgba[s];                      // R
      xor[d + 3] = rgba[s + 3];                  // A
    }
  }
  const maskStride = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(maskStride * size, 0);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = rgba[((size - 1 - y) * size + x) * 4 + 3];
      if (a < 128) {                             // 全透明处置 1
        const row = y * maskStride;
        mask[row + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  const hdr = Buffer.alloc(40);
  hdr.writeUInt32LE(40, 0);
  hdr.writeInt32LE(size, 4);
  hdr.writeInt32LE(size * 2, 8);                 // XOR + AND
  hdr.writeUInt16LE(1, 12);                      // planes
  hdr.writeUInt16LE(32, 14);                     // bitcount
  hdr.writeUInt32LE(xor.length + mask.length, 20);
  return Buffer.concat([hdr, xor, mask]);
}

function makeIco() {
  const entries = SIZES.map((s) => bmpEntry(s, draw(s)));
  const count = entries.length;
  const header = Buffer.alloc(6 + count * 16);
  header.writeUInt16LE(0, 0);                    // reserved
  header.writeUInt16LE(1, 2);                    // type = icon
  header.writeUInt16LE(count, 4);
  let offset = header.length;
  entries.forEach((e, i) => {
    const at = 6 + i * 16;
    const s = SIZES[i];
    header.writeUInt8(s < 256 ? s : 0, at);
    header.writeUInt8(s < 256 ? s : 0, at + 1);
    header.writeUInt8(0, at + 2);
    header.writeUInt8(0, at + 3);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(e.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += e.length;
  });
  return Buffer.concat([header, ...entries]);
}

mkdirSync(HERE, { recursive: true });
const ico = makeIco();
writeFileSync(OUT, ico);
console.log('icon.ico 已生成：' + OUT);
console.log('  尺寸：' + SIZES.join(' / ') + '  ·  ' + (ico.length / 1024).toFixed(1) + ' KB');
