"use client";

import { Role } from "./types";

export type AudioCaptureHandle = {
  stop: () => void;
};

export async function startAudioCapture(opts: {
  stream: MediaStream;
  role: Role;
  wsUrl: string;
}): Promise<AudioCaptureHandle> {
  const ctx = new AudioContext({ sampleRate: 48000 });
  if (ctx.sampleRate !== 48000) {
    throw new Error(
      `AudioContext rate is ${ctx.sampleRate}, expected 48000. Downsampling would be wrong.`
    );
  }

  await ctx.audioWorklet.addModule("/pcm-worklet.js");

  const src = ctx.createMediaStreamSource(opts.stream);
  const node = new AudioWorkletNode(ctx, "pcm-worklet");
  src.connect(node);

  const ws = new WebSocket(opts.wsUrl);
  ws.binaryType = "arraybuffer";

  node.port.onmessage = (e: MessageEvent) => {
    if (ws.readyState === 1) {
      ws.send(e.data);
    }
  };

  return {
    stop: () => {
      try { ws.close(); } catch {}
      try { node.disconnect(); } catch {}
      try { src.disconnect(); } catch {}
      try { ctx.close(); } catch {}
    },
  };
}
