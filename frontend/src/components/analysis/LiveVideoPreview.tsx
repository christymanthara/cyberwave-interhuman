"use client";

import React, { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Video } from "lucide-react";

interface LiveVideoPreviewProps {
  isActive: boolean;
}

export function LiveVideoPreview({ isActive }: LiveVideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activeStream: MediaStream | null = null;

    async function startCamera() {
      if (!isActive) {
        stopCamera();
        return;
      }
      try {
        setError(null);
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 360 } },
          audio: false,
        });
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
  }, [isActive]);

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
          Default Camera Selection
        </span>
      </div>
    </div>
  );
}
export default LiveVideoPreview;
