import { useState } from "react";
import { parseInterhumanResponse, InterhumanResponse } from "../lib/parsers/interhumanParser";
import { appLogger } from "../lib/logger";

export function useUploadAnalysis() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InterhumanResponse | null>(null);

  const analyzeFile = async (file: File) => {
    setLoading(true);
    setError(null);
    appLogger.info("upload", "Starting upload analysis", {
      fileName: file.name,
      sizeBytes: file.size,
      type: file.type,
    });

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://localhost:8000/v1/upload/analyze", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `Server error: ${response.status}`);
      }

      const rawData = await response.json();
      const parsed = parseInterhumanResponse(rawData);
      setData(parsed);
      appLogger.info("upload", "Upload analysis completed successfully");
    } catch (err: any) {
      setError(err.message || "Failed to analyze file");
      setData(null);
      appLogger.error("upload", "Upload analysis failed", err);
    } finally {
      setLoading(false);
    }
  };

  const clearData = () => {
    setData(null);
    setError(null);
  };

  return {
    analyzeFile,
    loading,
    error,
    data,
    clearData,
  };
}
