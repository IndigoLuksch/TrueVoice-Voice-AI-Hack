class PcmWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.inBuf = new Float32Array(0);
    this.outBuf = new Int16Array(0);
  }
  process(inputs) {
    const x = inputs[0]?.[0];
    if (!x) return true;

    const merged = new Float32Array(this.inBuf.length + x.length);
    merged.set(this.inBuf);
    merged.set(x, this.inBuf.length);

    const usable = Math.floor(merged.length / 3) * 3;
    const dec = new Int16Array(usable / 3);
    for (let i = 0, j = 0; i < usable; i += 3, j++) {
      const a = (merged[i] + merged[i + 1] + merged[i + 2]) / 3;
      dec[j] = Math.max(-1, Math.min(1, a)) * 0x7FFF;
    }
    this.inBuf = merged.slice(usable);

    const m2 = new Int16Array(this.outBuf.length + dec.length);
    m2.set(this.outBuf);
    m2.set(dec, this.outBuf.length);

    const FRAME = 640;
    let off = 0;
    while (m2.length - off >= FRAME) {
      const f = m2.slice(off, off + FRAME);
      this.port.postMessage(f.buffer, [f.buffer]);
      off += FRAME;
    }
    this.outBuf = m2.slice(off);
    return true;
  }
}
registerProcessor("pcm-worklet", PcmWorklet);
