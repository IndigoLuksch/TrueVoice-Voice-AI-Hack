"use client";

/**
 * Request mic + (optional) camera with graceful fallback.
 * Returns the best stream we could get, plus flags for what's actually in it.
 */
export type MediaResult = {
  stream: MediaStream;
  hasAudio: boolean;
  hasVideo: boolean;
};

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  facingMode: "user",
};

export async function requestCallMedia(): Promise<MediaResult> {
  // Preferred: mic + cam.
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: AUDIO_CONSTRAINTS,
      video: VIDEO_CONSTRAINTS,
    });
    return {
      stream,
      hasAudio: stream.getAudioTracks().length > 0,
      hasVideo: stream.getVideoTracks().length > 0,
    };
  } catch (err) {
    // If the mic was denied we must fail outright — we need it.
    if (err instanceof DOMException && err.name === "NotAllowedError") {
      const audioOnly = await navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CONSTRAINTS,
        video: false,
      });
      return {
        stream: audioOnly,
        hasAudio: true,
        hasVideo: false,
      };
    }
    // Otherwise (no camera, camera busy, overconstrained, etc.) fall back.
    const audioOnly = await navigator.mediaDevices.getUserMedia({
      audio: AUDIO_CONSTRAINTS,
      video: false,
    });
    return {
      stream: audioOnly,
      hasAudio: true,
      hasVideo: false,
    };
  }
}

export function describeMediaError(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === "NotAllowedError") {
      return "Microphone permission denied. Enable it in your browser and retry.";
    }
    if (e.name === "NotFoundError") {
      return "No microphone found. Connect a microphone and retry.";
    }
    if (e.name === "NotReadableError") {
      return "Microphone is already in use by another app. Close that app and retry.";
    }
    return `${e.name}: ${e.message}`;
  }
  return e instanceof Error ? e.message : String(e);
}
