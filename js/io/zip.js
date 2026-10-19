/* ZIP 읽기(.mxl — deflate 풀기)·쓰기(백업 — 무압축 저장) + CRC32. 외부 라이브러리 없이. */
(function (SJ) {
  'use strict';
  const Z = {};

  // ── CRC32 ──
  const CRC = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; }
  Z.crc32 = function (b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

  // ── DEFLATE 풀기 (RFC 1951) ──
  const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const CLORD = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  function huff(lengths) {
    const counts = new Uint16Array(16), offs = new Uint16Array(16);
    lengths.forEach(l => counts[l]++);
    counts[0] = 0;
    for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];
    const symbols = new Uint16Array(lengths.length);
    lengths.forEach((l, s) => { if (l) symbols[offs[l]++] = s; });
    return { counts, symbols };
  }

  Z.inflateRaw = function (src) {
    let pos = 0, bit = 0, out = new Uint8Array(Math.max(1024, src.length * 4)), op = 0;
    const need = n => { if (op + n > out.length) { const o = new Uint8Array(Math.max(out.length * 2, op + n)); o.set(out.subarray(0, op)); out = o; } };
    const bits = n => {
      let v = 0;
      for (let i = 0; i < n; i++) {
        if (pos >= src.length) throw new Error('inflate: 데이터 끝');
        v |= ((src[pos] >> bit) & 1) << i;
        if (++bit === 8) { bit = 0; pos++; }
      }
      return v;
    };
    const decode = h => {
      let code = 0, first = 0, index = 0;
      for (let len = 1; len < 16; len++) {
        code |= bits(1);
        const count = h.counts[len];
        if (code - count < first) return h.symbols[index + (code - first)];
        index += count; first += count; first <<= 1; code <<= 1;
      }
      throw new Error('inflate: 잘못된 부호');
    };
    let fixedL = null, fixedD = null;
    let final = 0;
    while (!final) {
      final = bits(1);
      const type = bits(2);
      if (type === 0) {
        if (bit) { bit = 0; pos++; }
        const len = src[pos] | (src[pos + 1] << 8); pos += 4;
        need(len); out.set(src.subarray(pos, pos + len), op); op += len; pos += len;
        continue;
      }
      let L, Dd;
      if (type === 1) {
        if (!fixedL) {
          const l = new Array(288);
          for (let i = 0; i < 144; i++) l[i] = 8; for (let i = 144; i < 256; i++) l[i] = 9; for (let i = 256; i < 280; i++) l[i] = 7; for (let i = 280; i < 288; i++) l[i] = 8;
          fixedL = huff(l); fixedD = huff(new Array(30).fill(5));
        }
        L = fixedL; Dd = fixedD;
      } else if (type === 2) {
        const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
        const cl = new Array(19).fill(0);
        for (let i = 0; i < hclen; i++) cl[CLORD[i]] = bits(3);
        const ch = huff(cl);
        const lens = [];
        while (lens.length < hlit + hdist) {
          const sym = decode(ch);
          if (sym < 16) lens.push(sym);
          else if (sym === 16) { const p = lens[lens.length - 1]; let r = 3 + bits(2); while (r--) lens.push(p); }
          else if (sym === 17) { let r = 3 + bits(3); while (r--) lens.push(0); }
          else { let r = 11 + bits(7); while (r--) lens.push(0); }
        }
        L = huff(lens.slice(0, hlit)); Dd = huff(lens.slice(hlit));
      } else throw new Error('inflate: 블록 종류');
      for (;;) {
        const sym = decode(L);
        if (sym < 256) { need(1); out[op++] = sym; }
        else if (sym === 256) break;
        else {
          const li = sym - 257;
          const len = LBASE[li] + bits(LEXT[li]);
          const di = decode(Dd);
          const dist = DBASE[di] + bits(DEXT[di]);
          need(len);
          for (let i = 0; i < len; i++) { out[op] = out[op - dist]; op++; }
        }
      }
    }
    return out.slice(0, op);
  };

  // ── ZIP 읽기 → [{name, data(Uint8Array)}] ──
  Z.unzip = function (buf) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('zip 아님');
    const n = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = [];
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const name = new TextDecoder('utf-8').decode(buf.subarray(p + 46, p + 46 + nlen));
      const lnlen = dv.getUint16(lho + 26, true), lxlen = dv.getUint16(lho + 28, true);
      const start = lho + 30 + lnlen + lxlen;
      const raw = buf.subarray(start, start + csize);
      let data = null;
      if (method === 0) data = raw.slice();
      else if (method === 8) data = Z.inflateRaw(raw);
      if (data) files.push({ name, data });
      p += 46 + nlen + xlen + clen;
    }
    return files;
  };

  // ── ZIP 쓰기 (무압축, UTF-8 이름) ──
  Z.zip = function (files) {
    const parts = [], central = [];
    let off = 0;
    const enc = new TextEncoder();
    const d = new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(f => {
      const name = enc.encode(f.name), data = f.data, crc = Z.crc32(data);
      const lh = new Uint8Array(30 + name.length), lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
      lv.setUint16(10, dosTime, true); lv.setUint16(12, dosDate, true); lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true);
      lh.set(name, 30);
      const ch = new Uint8Array(46 + name.length), cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
      cv.setUint16(12, dosTime, true); cv.setUint16(14, dosDate, true); cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true);
      cv.setUint32(42, off, true); ch.set(name, 46);
      parts.push(lh, data); central.push(ch);
      off += lh.length + data.length;
    });
    const csize = central.reduce((a, c) => a + c.length, 0);
    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, csize, true); ev.setUint32(16, off, true);
    const all = parts.concat(central, [end]);
    const out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
    let p = 0; all.forEach(c => { out.set(c, p); p += c.length; });
    return out;
  };

  SJ.Zip = Z;
})(window.SJ = window.SJ || {});
