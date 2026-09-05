/**
 * Minimal pure-JS SHA-256 + HMAC-SHA256 (zero dependencies).
 * Reference: FIPS 180-4 / RFC 4231.
 *
 * Only used when `crypto.subtle` is unavailable (e.g., Tesla in-car browser,
 * some embedded/kiosk browsers).  Exported so that the import in signing.ts
 * prevents Vite/Rollup tree-shaking this as "dead code".
 */

// ---- public API -----------------------------------------------------------

/** HMAC-SHA-256 → lowercase hex string. */
export function hmacSha256Hex(message: string, keyStr: string): string {
  return bytesToHex(hmacSha256(utf8Encode(keyStr), utf8Encode(message)));
}

// ---- SHA-256 core --------------------------------------------------------

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/** Streaming SHA-256. */
function createSha256(): {
  update(data: Uint8Array): void;
  digest(): Uint8Array;
} {
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const pending = new Uint8Array(64);
  let pendingLen = 0;
  let totalBytes = 0;

  function compress(p: Uint8Array, offset: number): void {
    const w = new Uint32Array(64);
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = (p[j] << 24) | (p[j + 1] << 16) | (p[j + 2] << 8) | p[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, hh = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + hh) | 0;
  }

  return {
    update(data: Uint8Array): void {
      totalBytes += data.length;
      let i = 0;
      if (pendingLen > 0) {
        while (i < data.length && pendingLen < 64) {
          pending[pendingLen++] = data[i++];
        }
        if (pendingLen === 64) {
          compress(pending, 0);
          pendingLen = 0;
        }
      }
      while (i + 64 <= data.length) {
        compress(data, i);
        i += 64;
      }
      while (i < data.length) {
        pending[pendingLen++] = data[i++];
      }
    },
    digest(): Uint8Array {
      const bitLen = totalBytes * 8;
      const tmp: number[] = [];
      for (let i = 0; i < pendingLen; i++) tmp.push(pending[i]);
      tmp.push(0x80);
      while (tmp.length % 64 !== 56) tmp.push(0);
      const hi = Math.floor(bitLen / 0x100000000);
      const lo = bitLen >>> 0;
      tmp.push((hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff);
      tmp.push((lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff);
      const arr = new Uint8Array(tmp);
      for (let off = 0; off < arr.length; off += 64) compress(arr, off);

      const out = new Uint8Array(32);
      const hh = [h0, h1, h2, h3, h4, h5, h6, h7];
      for (let i = 0; i < 8; i++) {
        out[i * 4]     = (hh[i] >>> 24) & 0xff;
        out[i * 4 + 1] = (hh[i] >>> 16) & 0xff;
        out[i * 4 + 2] = (hh[i] >>> 8) & 0xff;
        out[i * 4 + 3] = hh[i] & 0xff;
      }
      return out;
    },
  };
}

// ---- HMAC-SHA-256 --------------------------------------------------------

function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  const BLOCK = 64;
  let k = key;
  if (k.length > BLOCK) {
    const hk = createSha256();
    hk.update(k);
    k = hk.digest();
  }
  const ipad = new Uint8Array(BLOCK);
  const opad = new Uint8Array(BLOCK);
  for (let i = 0; i < BLOCK; i++) {
    ipad[i] = k[i] ^ 0x36;
    opad[i] = k[i] ^ 0x5c;
  }
  const h1 = createSha256();
  h1.update(ipad);
  h1.update(message);
  const inner = h1.digest();
  const h2 = createSha256();
  h2.update(opad);
  h2.update(inner);
  return h2.digest();
}

// ---- helpers -------------------------------------------------------------

function utf8Encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map((v) => v.toString(16).padStart(2, "0")).join("");
}
