"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Phone, PhoneOff, Video, Mic, MicOff } from "lucide-react";

type Signal = { type: "offer" | "answer" | "ice" | "hangup"; from: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit; mode?: "audio" | "video" };
type Props = { supabase: SupabaseClient; userId: string; conversationId: string };

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }]
};

export default function CallPanel({ supabase, userId, conversationId }: Props) {
  const [status, setStatus] = useState("Ready to call");
  const [incoming, setIncoming] = useState<Signal | null>(null);
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [mode, setMode] = useState<"audio" | "video">("audio");
  const channelRef = useRef<ReturnType<SupabaseClient["channel"]> | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const cleanup = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    pendingIceRef.current = [];
    setInCall(false);
    setMuted(false);
    setCameraOff(false);
  }, []);

  const sendSignal = useCallback(async (signal: Omit<Signal, "from">) => {
    const channel = channelRef.current;
    if (!channel) throw new Error("Call connection is not ready. Reload and try again.");
    const result = await channel.send({ type: "broadcast", event: "signal", payload: { ...signal, from: userId } });
    if (result === "error") throw new Error("Could not send call signal. Check Supabase Realtime settings.");
  }, [userId]);

  const ensurePeer = useCallback(async (stream: MediaStream) => {
    const pc = new RTCPeerConnection(rtcConfig);
    peerRef.current = pc;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    pc.ontrack = event => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
        void remoteVideoRef.current.play().catch(() => {});
      }
    };
    pc.onicecandidate = event => {
      if (event.candidate) void sendSignal({ type: "ice", candidate: event.candidate.toJSON() }).catch(err => setStatus(err instanceof Error ? err.message : "Call connection error"));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setStatus("Connected");
      else if (pc.connectionState === "connecting") setStatus("Connecting…");
      else if (pc.connectionState === "failed") setStatus("Connection failed. This network may require a TURN relay.");
      else if (pc.connectionState === "disconnected") setStatus("Connection interrupted");
    };
    return pc;
  }, [sendSignal]);

  const startCall = useCallback(async (callMode: "audio" | "video") => {
    try {
      setMode(callMode);
      setStatus("Requesting microphone" + (callMode === "video" ? " and camera…" : "…"));
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callMode === "video" ? { facingMode: "user" } : false });
      streamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = await ensurePeer(stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal({ type: "offer", sdp: pc.localDescription ?? offer, mode: callMode });
      setInCall(true);
      setStatus("Calling… waiting for the other person");
    } catch (err) {
      cleanup();
      setStatus(err instanceof Error ? err.message : "Could not start call. Check microphone/camera permissions.");
    }
  }, [cleanup, ensurePeer, sendSignal]);

  const acceptCall = useCallback(async () => {
    if (!incoming?.sdp) return;
    try {
      const callMode = incoming.mode ?? "audio";
      setMode(callMode);
      setStatus("Connecting…");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callMode === "video" ? { facingMode: "user" } : false });
      streamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = await ensurePeer(stream);
      await pc.setRemoteDescription(new RTCSessionDescription(incoming.sdp));
      for (const candidate of pendingIceRef.current) await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      pendingIceRef.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal({ type: "answer", sdp: pc.localDescription ?? answer, mode: callMode });
      setIncoming(null);
      setInCall(true);
      setStatus("Connecting…");
    } catch (err) {
      cleanup();
      setStatus(err instanceof Error ? err.message : "Could not accept call.");
    }
  }, [cleanup, ensurePeer, incoming, sendSignal]);

  const endCall = useCallback(async () => {
    try { await sendSignal({ type: "hangup" }); } catch {}
    cleanup();
    setIncoming(null);
    setStatus("Call ended");
  }, [cleanup, sendSignal]);

  useEffect(() => {
    if (!conversationId || !userId) return;
    const channel = supabase.channel("hamdam-call-" + conversationId, { config: { broadcast: { self: false } } });
    channelRef.current = channel;
    channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
      const signal = payload as Signal;
      if (!signal || signal.from === userId) return;
      if (signal.type === "offer") {
        setIncoming(signal);
        setStatus("Incoming " + (signal.mode === "video" ? "video" : "voice") + " call");
      } else if (signal.type === "answer" && signal.sdp && peerRef.current) {
        try {
          await peerRef.current.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          for (const candidate of pendingIceRef.current) await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
          pendingIceRef.current = [];
          setStatus("Connected");
        } catch { setStatus("Could not establish call. Please retry."); }
      } else if (signal.type === "ice" && signal.candidate) {
        if (peerRef.current?.remoteDescription) await peerRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
        else pendingIceRef.current.push(signal.candidate);
      } else if (signal.type === "hangup") {
        cleanup();
        setIncoming(null);
        setStatus("The other person ended the call");
      }
    }).subscribe(state => {
      if (state === "SUBSCRIBED") setStatus("Ready to call");
      if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") setStatus("Call signaling unavailable. Check Supabase Realtime.");
    });
    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
      cleanup();
    };
  }, [cleanup, conversationId, supabase, userId]);

  if (!conversationId) return <p className="subtle">A private conversation is required before calling.</p>;
  return <div style={{ padding: 20, display: "grid", gap: 14 }}>
    <p className="subtle" role="status">{status}</p>
    {incoming && !inCall && <div style={{ padding: 14, border: "1px solid var(--line)", borderRadius: 14, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
      <strong style={{ flex: "1 1 150px" }}>Incoming {incoming.mode === "video" ? "video" : "voice"} call</strong>
      <button className="send-btn" onClick={() => void acceptCall()} style={{ padding: "10px 14px" }}><Phone size={16} style={{ display: "inline", marginRight: 6 }}/>Accept</button>
      <button className="small-link" onClick={() => { void sendSignal({ type: "hangup" }); setIncoming(null); setStatus("Call declined"); }}>Decline</button>
    </div>}
    {inCall && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
      <div><video ref={localVideoRef} autoPlay muted playsInline style={{ width: "100%", minHeight: 100, maxHeight: 240, background: "#eadbd8", borderRadius: 14, objectFit: "cover" }}/><small className="subtle">You</small></div>
      <div><video ref={remoteVideoRef} autoPlay playsInline style={{ width: "100%", minHeight: 100, maxHeight: 240, background: "#eadbd8", borderRadius: 14, objectFit: "cover" }}/><small className="subtle">Other person</small></div>
    </div>}
    {inCall && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button className="small-link" onClick={() => { const next = !muted; streamRef.current?.getAudioTracks().forEach(t => t.enabled = !next); setMuted(next); }}>{muted ? <MicOff size={17}/> : <Mic size={17}/>} {muted ? "Unmute" : "Mute"}</button>
      {mode === "video" && <button className="small-link" onClick={() => { const next = !cameraOff; streamRef.current?.getVideoTracks().forEach(t => t.enabled = !next); setCameraOff(next); }}>{cameraOff ? "Turn camera on" : "Turn camera off"}</button>}
      <button className="send-btn" onClick={() => void endCall()} style={{ padding: "10px 14px", background: "#8e3c4e" }}><PhoneOff size={16} style={{ display: "inline", marginRight: 6 }}/>End call</button>
    </div>}
    {!inCall && !incoming && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button className="send-btn" onClick={() => void startCall("audio")} style={{ padding: "12px 16px" }}><Phone size={17} style={{ display: "inline", marginRight: 7 }}/>Voice call</button>
      <button className="send-btn" onClick={() => void startCall("video")} style={{ padding: "12px 16px" }}><Video size={17} style={{ display: "inline", marginRight: 7 }}/>Video call</button>
    </div>}
    <p className="subtle" style={{ fontSize: 12 }}>Calls require microphone/camera permission and both members to have Hamdam open. Some networks require a TURN relay for reliable connections.</p>
  </div>;
}
