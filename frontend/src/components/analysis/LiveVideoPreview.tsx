"use client";

import React, { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Video } from "lucide-react";

interface LiveVideoPreviewProps {
  isActive: boolean;
  selectedCameraId?: string;
  onCameraSelect?: (deviceId: string) => void;
}

export function LiveVideoPreview({ isActive, selectedCameraId, onCameraSelect }: LiveVideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    let mounted = true;

    async function loadDevices() {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        if (!mounted) return;
        const cams = all.filter((d) => d.kind === "videoinput");
        setDevices(cams);

        if (cams.length > 0 && !selectedCameraId && onCameraSelect) {
          onCameraSelect(cams[0].deviceId);
        }
      } catch {
        // No-op: device list may be unavailable before permission grant.
      }
    }

    loadDevices();

    const handleDeviceChange = () => {
      loadDevices();
    };

    navigator.mediaDevices?.addEventListener?.("devicechange", handleDeviceChange);

    return () => {
      mounted = false;
      navigator.mediaDevices?.removeEventListener?.("devicechange", handleDeviceChange);
    };
  }, [onCameraSelect, selectedCameraId]);

  useEffect(() => {
    let activeStream: MediaStream | null = null;

    async function startCamera() {
      if (!isActive) {
        stopCamera();
        return;
      }
      try {
        setError(null);
        const constraints: MediaStreamConstraints = {
          video: selectedCameraId
            ? { deviceId: { exact: selectedCameraId }, width: { ideal: 640 }, height: { ideal: 360 } }
            : { facingMode: "user", width: { ideal: 640 }, height: { ideal: 360 } },
          audio: false,
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          ...constraints,
        });

        const all = await navigator.mediaDevices.enumerateDevices();
        const cams = all.filter((d) => d.kind === "videoinput");
        setDevices(cams);

        if (!selectedCameraId && cams.length > 0 && onCameraSelect) {
          onCameraSelect(cams[0].deviceId);
        }

        activeStream = mediaStream;
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err: any) {
        console.error("Camera access failed:", err);
        setError("Unable to access camera. Please check permissions.");
      }
    }

    startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isActive, onCameraSelect, selectedCameraId]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950 p-1 dark:border-zinc-800">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-zinc-900">
        {isActive && !error && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover transform -scale-x-100"
          />
        )}

        {(!isActive || error) && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-zinc-500">
            {error ? (
              <>
                <CameraOff className="h-8 w-8 text-rose-500" />
                <span className="max-w-[200px] text-center text-xs text-rose-400">{error}</span>
              </>
            ) : (
              <>
                <Camera className="h-8 w-8 text-zinc-600" />
                <span className="text-xs">Camera is inactive</span>
              </>
            )}
          </div>
        )}

        {isActive && !error && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            Live Preview
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between px-2 pb-1">
        <span className="flex items-center gap-1 text-[10px] font-medium text-zinc-400">
          <Video className="h-3 w-3" />
          Camera Source
        </span>

        {devices.length > 1 && (
          <select
            value={selectedCameraId || ""}
            onChange={(e) => onCameraSelect?.(e.target.value)}
            disabled={isActive}
            className="max-w-[180px] truncate rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-200 outline-none focus:border-zinc-400 disabled:opacity-60"
          >
            {devices.map((device, idx) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Camera ${idx + 1}`}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
export default LiveVideoPreview;
