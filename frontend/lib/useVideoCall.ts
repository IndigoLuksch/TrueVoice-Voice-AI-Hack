"use client";

import { useEffect, useRef, useState } from "react";
import { BACKEND_WS, Role } from "./types";

type SignalMsg =
  | { type: "ready"; peer: Role | null }
  | { type: "peer-joined" }
  | { type: "peer-left" }
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; candidate: RTCIceCandidateInit };

export type VideoCallState = {
  remoteStream: MediaStream | null;
  peerConnected: boolean;
  signalingConnected: boolean;
  peerPresent: boolean;
  error: string | null;
};

const INITIAL: VideoCallState = {
  remoteStream: null,
  peerConnected: false,
  signalingConnected: false,
  peerPresent: false,
  error: null,
};

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

type Opts = {
  roomId: string | null;
  role: Role;
  localStream: MediaStream | null;
  enabled: boolean;
};

/**
 * 1:1 WebRTC video call between patient and clinician in a room.
 * Clinician is the impolite (offering) peer; patient is polite (answering).
 * Signaling runs over /ws/signal and only relays SDP + ICE.
 *
 * The caller owns localStream (audio+video tracks). We add/replace tracks
 * on the peer connection when the stream arrives or tracks change.
 */
export function useVideoCall({ roomId, role, localStream, enabled }: Opts): VideoCallState {
  const [state, setState] = useState<VideoCallState>(INITIAL);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSet = useRef(false);
  const peerPresentRef = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(localStream);
  const destroyedRef = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  const polite = role === "patient";

  useEffect(() => {
    if (!enabled || !roomId) return;

    destroyedRef.current = false;

    const sendSignal = (msg: SignalMsg) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    };

    const addLocalTracks = (pc: RTCPeerConnection) => {
      const ls = localStreamRef.current;
      if (!ls) return;
      const senders = pc.getSenders();
      for (const track of ls.getTracks()) {
        const existing = senders.find((s) => s.track?.kind === track.kind);
        if (existing) {
          existing.replaceTrack(track).catch(() => {});
        } else {
          try {
            pc.addTrack(track, ls);
          } catch {
            /* already added */
          }
        }
      }
    };

    const createAndSendOffer = async () => {
      const pc = pcRef.current;
      if (!pc) return;
      if (pc.signalingState !== "stable" && pc.signalingState !== "have-local-offer") return;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (pc.localDescription) {
          sendSignal({ type: "offer", sdp: pc.localDescription.toJSON() });
        }
      } catch (e) {
        setState((s) => ({ ...s, error: `offer failed: ${String(e)}` }));
      }
    };

    const buildPeerConnection = () => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      remoteDescSet.current = false;
      pendingCandidates.current = [];

      const remote = new MediaStream();
      remoteStreamRef.current = remote;
      setState((s) => ({ ...s, remoteStream: remote, peerConnected: false }));

      pc.ontrack = (e) => {
        const stream = remoteStreamRef.current;
        if (!stream) return;
        // Prefer the peer-provided stream so track removals propagate.
        const incoming = e.streams[0];
        if (incoming) {
          incoming.getTracks().forEach((t) => {
            if (!stream.getTracks().find((rt) => rt.id === t.id)) {
              stream.addTrack(t);
            }
          });
        } else if (!stream.getTracks().find((t) => t.id === e.track.id)) {
          stream.addTrack(e.track);
        }
        // Nudge consumers by re-setting the ref.
        setState((s) => ({ ...s, remoteStream: stream }));
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendSignal({ type: "ice", candidate: e.candidate.toJSON() });
        }
      };

      pc.onconnectionstatechange = () => {
        const cs = pc.connectionState;
        setState((s) => ({ ...s, peerConnected: cs === "connected" }));
        if (cs === "failed") {
          // ICE failure: try an ICE restart if we're the impolite side.
          if (!polite && peerPresentRef.current) {
            pc.restartIce();
            createAndSendOffer();
          }
        }
      };

      addLocalTracks(pc);
      return pc;
    };

    const resetPeerConnection = () => {
      const pc = pcRef.current;
      if (pc) {
        try { pc.close(); } catch {}
      }
      pcRef.current = null;
      remoteStreamRef.current = null;
      setState((s) => ({ ...s, remoteStream: null, peerConnected: false }));
      buildPeerConnection();
    };

    const openSignaling = () => {
      if (destroyedRef.current) return;
      const url = `${BACKEND_WS}/ws/signal/${role}/${encodeURIComponent(roomId)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setState((s) => ({ ...s, signalingConnected: true, error: null }));
      };

      ws.onclose = (ev) => {
        setState((s) => ({ ...s, signalingConnected: false, peerPresent: false }));
        peerPresentRef.current = false;
        // Server kicked us because another tab took over this role — don't
        // fight it, that would cause a reconnect loop.
        if (ev.code === 4000) {
          setState((s) => ({ ...s, error: "Another tab joined as this role. Close one." }));
          return;
        }
        if (!destroyedRef.current) {
          reconnectTimer.current = setTimeout(openSignaling, 1500);
        }
      };

      ws.onerror = () => {
        /* reported via onclose */
      };

      ws.onmessage = async (ev) => {
        let msg: SignalMsg;
        try {
          msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        } catch {
          return;
        }
        const pc = pcRef.current;
        if (!pc) return;

        switch (msg.type) {
          case "ready":
            if (msg.peer) {
              peerPresentRef.current = true;
              setState((s) => ({ ...s, peerPresent: true }));
            }
            break;

          case "peer-joined":
            peerPresentRef.current = true;
            setState((s) => ({ ...s, peerPresent: true }));
            if (!polite && localStreamRef.current) {
              await createAndSendOffer();
            }
            break;

          case "peer-left":
            peerPresentRef.current = false;
            setState((s) => ({ ...s, peerPresent: false, peerConnected: false }));
            resetPeerConnection();
            break;

          case "offer": {
            try {
              await pc.setRemoteDescription(msg.sdp);
              remoteDescSet.current = true;
              for (const c of pendingCandidates.current) {
                try { await pc.addIceCandidate(c); } catch {}
              }
              pendingCandidates.current = [];
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              if (pc.localDescription) {
                sendSignal({ type: "answer", sdp: pc.localDescription.toJSON() });
              }
            } catch (e) {
              setState((s) => ({ ...s, error: `offer handle failed: ${String(e)}` }));
            }
            break;
          }

          case "answer": {
            try {
              if (pc.signalingState === "have-local-offer") {
                await pc.setRemoteDescription(msg.sdp);
                remoteDescSet.current = true;
                for (const c of pendingCandidates.current) {
                  try { await pc.addIceCandidate(c); } catch {}
                }
                pendingCandidates.current = [];
              }
            } catch (e) {
              setState((s) => ({ ...s, error: `answer handle failed: ${String(e)}` }));
            }
            break;
          }

          case "ice": {
            if (remoteDescSet.current) {
              try { await pc.addIceCandidate(msg.candidate); } catch {}
            } else {
              pendingCandidates.current.push(msg.candidate);
            }
            break;
          }
        }
      };
    };

    buildPeerConnection();
    openSignaling();

    return () => {
      destroyedRef.current = true;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      try { wsRef.current?.close(); } catch {}
      try { pcRef.current?.close(); } catch {}
      wsRef.current = null;
      pcRef.current = null;
      remoteStreamRef.current = null;
      peerPresentRef.current = false;
      setState(INITIAL);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, roomId, role]);

  // Sync local tracks into the peer connection whenever the stream changes
  // (e.g., first mount, camera toggle replaces track).
  useEffect(() => {
    const pc = pcRef.current;
    if (!pc || !localStream) return;

    const senders = pc.getSenders();
    let tracksChanged = false;
    for (const track of localStream.getTracks()) {
      const existing = senders.find((s) => s.track?.kind === track.kind);
      if (existing) {
        if (existing.track !== track) {
          existing.replaceTrack(track).catch(() => {});
        }
      } else {
        try {
          pc.addTrack(track, localStream);
          tracksChanged = true;
        } catch {}
      }
    }

    // If we added new tracks and we're the impolite peer with a partner,
    // renegotiate.
    if (tracksChanged && role === "clinician" && peerPresentRef.current) {
      (async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          if (pc.localDescription && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: "offer",
              sdp: pc.localDescription.toJSON(),
            }));
          }
        } catch {}
      })();
    }
  }, [localStream, role]);

  return state;
}
