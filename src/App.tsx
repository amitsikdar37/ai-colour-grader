import React, { useState } from "react";
import { DropZone } from "./components/DropZone";
import { SplitCompareViewer } from "./components/SplitCompareViewer";
import { prepareAndAnalyzeImage, type ImageAnalysisResult } from "./utils/imageAnalysis";
import { DEFAULT_UNIFORMS, type ColorProfile, type ColorProfileUniforms } from "./types/color";
import { exportHighResImage } from "./utils/exportImage";

export const App: React.FC = () => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ImageAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // Dynamic Loading Statuses
  const [loadingMsg, setLoadingMsg] = useState<string>("Connecting to Gemini...");
  const [loadingSubMsg, setLoadingSubMsg] = useState<string>("Preparing stream...");
  const [modelUsed, setModelUsed] = useState<string | null>(null);

  // AI Looks State
  const [profiles, setProfiles] = useState<ColorProfile[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [uniforms, setUniforms] = useState<ColorProfileUniforms>(DEFAULT_UNIFORMS);
  const [intensity, setIntensity] = useState<number>(1.0);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const handleFileSelected = async (file: File) => {
    setIsAnalyzing(true);
    setLoadingMsg("Optimizing image payload...");
    setLoadingSubMsg("Downscaling & extracting histogram...");

    try {
      // 1. Client-Side Pre-processing
      const result = await prepareAndAnalyzeImage(file);
      setAnalysis(result);
      setImage(result.originalImage);
      setRawImageSrc(result.previewBase64);

      setLoadingMsg("Connecting to Gemini Gateway...");
      setLoadingSubMsg("Initiating model fallback waterfall...");

      // 2. Stream from FastAPI (using dynamic env var for deployment)
      const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const res = await fetch(`${API_BASE}/api/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: result.previewBase64 }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("Stream reader not supported");

      let buffer = "";

      const processLine = (line: string) => {
        if (!line.trim()) return;
        try {
          const event = JSON.parse(line);

          if (event.type === "attempting") {
            setLoadingMsg("Analyzing scene lighting...");
            setLoadingSubMsg(`Model: ${event.model}`);
          } else if (event.type === "fallback") {
            setLoadingMsg("High demand detected.");
            setLoadingSubMsg(event.message);
          } else if (event.type === "success") {
            if (event.profiles && event.profiles.length > 0) {
              setProfiles(event.profiles);
              setSelectedIndex(0);
              setUniforms(event.profiles[0]);
            }
            setModelUsed(event.model);
            setIsAnalyzing(false);
          }
        } catch (e) {
          console.warn("Could not parse stream chunk:", line, e);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) processLine(buffer);
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          processLine(line);
        }
      }
    } catch (err) {
      console.error("Grading failed:", err);
      alert("AI grading error. Check backend console.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSelectLook = (index: number) => {
    setSelectedIndex(index);
    if (profiles[index]) {
      setUniforms(profiles[index]);
    }
  };

  const handleExport = async () => {
    if (!image) return;
    setIsExporting(true);
    try {
      const activeLookTitle = profiles[selectedIndex]?.title || "custom_grade";
      const cleanName = activeLookTitle.toLowerCase().replace(/[^a-z0-9]/g, "_");
      await exportHighResImage(image, uniforms, intensity, `${cleanName}_fullres.jpg`);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed. Please check browser console.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0f172a", color: "#f8fafc", padding: "24px", fontFamily: "sans-serif" }}>
      <header style={{ maxWidth: "1280px", margin: "0 auto 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: "bold", margin: 0 }}>Cinematic AI Color Engine</h1>
          <p style={{ color: "#94a3b8", margin: "4px 0 0", fontSize: "14px" }}>
            Production Engine: 60 FPS WebGL · Multimodal Gemini · 4K Full-Resolution Export
          </p>
        </div>
        {modelUsed && (
          <div style={{ backgroundColor: "#1e293b", padding: "6px 12px", borderRadius: "20px", border: "1px solid #38bdf8", fontSize: "12px", color: "#38bdf8" }}>
            ⚡ Graded by: <strong>{modelUsed}</strong>
          </div>
        )}
      </header>

      <main style={{ maxWidth: "1280px", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 360px", gap: "24px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <DropZone onFileSelected={handleFileSelected} isLoading={isAnalyzing} />

          <SplitCompareViewer
            image={image}
            rawImageSrc={rawImageSrc}
            uniforms={uniforms}
            intensity={intensity}
            isLoading={isAnalyzing}
            loadingMessage={loadingMsg}
            loadingSubMessage={loadingSubMsg}
          />

          {analysis && (
            <div style={{ backgroundColor: "#1e293b", borderRadius: "10px", padding: "16px", border: "1px solid #334155" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#38bdf8", textTransform: "uppercase" }}>
                  Telemetry & Dynamic Range
                </span>
                <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                  Client: {analysis.processingTimeMs}ms | Payload: {(analysis.payloadSizeBytes / 1024).toFixed(1)} KB
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", fontSize: "12px" }}>
                <div style={telemetryCard}>
                  <span style={{ color: "#94a3b8" }}>Dynamic Range</span>
                  <strong>{(analysis.dynamicRangeRatio * 100).toFixed(0)}%</strong>
                </div>
                <div style={telemetryCard}>
                  <span style={{ color: "#94a3b8" }}>Exposure</span>
                  <strong style={{ color: analysis.isUnderexposed ? "#f87171" : "#4ade80" }}>
                    {analysis.isUnderexposed ? "Underexposed" : "Balanced"}
                  </strong>
                </div>
                <div style={telemetryCard}>
                  <span style={{ color: "#94a3b8" }}>Ambient Cast</span>
                  <strong style={{ textTransform: "capitalize", color: "#38bdf8" }}>
                    {analysis.ambientCast.dominantCast}
                  </strong>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: AI Look Selector Deck */}
        <div style={{ backgroundColor: "#1e293b", padding: "20px", borderRadius: "12px", border: "1px solid #334155", height: "fit-content" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "16px", borderBottom: "1px solid #334155", paddingBottom: "10px" }}>
            AI Art Director Looks
          </h3>

          {profiles.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
              {profiles.map((p, idx) => {
                const isSelected = selectedIndex === idx;
                return (
                  <div
                    key={idx}
                    onClick={() => handleSelectLook(idx)}
                    style={{
                      padding: "14px",
                      borderRadius: "8px",
                      cursor: "pointer",
                      backgroundColor: isSelected ? "rgba(56, 189, 248, 0.15)" : "#0f172a",
                      border: `1.5px solid ${isSelected ? "#38bdf8" : "#334155"}`,
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <strong style={{ color: isSelected ? "#38bdf8" : "#f8fafc", fontSize: "14px" }}>
                        {p.title}
                      </strong>
                      {isSelected && (
                        <span style={{ fontSize: "10px", backgroundColor: "#38bdf8", color: "#0f172a", padding: "2px 6px", borderRadius: "4px", fontWeight: "bold" }}>
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8", lineHeight: 1.4 }}>
                      {p.rationale}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: "24px", textAlign: "center", backgroundColor: "#0f172a", borderRadius: "8px", border: "1px dashed #334155", marginBottom: "20px" }}>
              <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>
                Upload a photo to see the live model waterfall generate 3 cinematic looks.
              </p>
            </div>
          )}

          {/* Master Intensity Slider */}
          <div style={{ borderTop: "1px solid #334155", paddingTop: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px" }}>
              <span style={{ fontWeight: 600 }}>Master Intensity</span>
              <span style={{ color: "#38bdf8", fontWeight: "bold" }}>{(intensity * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={intensity}
              onChange={(e) => setIntensity(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "#38bdf8" }}
            />
            <p style={{ margin: "6px 0 0", fontSize: "11px", color: "#64748b" }}>
              Blends non-destructively between Raw (0%) and Graded (100%).
            </p>
          </div>

          {/* Full-Resolution GPU Export Button */}
          <button
            onClick={handleExport}
            disabled={!image || isExporting}
            style={{
              width: "100%",
              marginTop: "20px",
              padding: "14px",
              backgroundColor: !image || isExporting ? "#334155" : "#0284c7",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontWeight: "bold",
              fontSize: "14px",
              cursor: !image || isExporting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              boxShadow: !image || isExporting ? "none" : "0 4px 14px rgba(2, 132, 199, 0.4)",
              transition: "all 0.2s ease",
            }}
          >
            {isExporting ? (
              <span>⚡ Rendering Full-Res GPU Frame...</span>
            ) : (
              <span>💾 Export Graded Photo (Full-Res)</span>
            )}
          </button>
        </div>
      </main>
    </div>
  );
};

const telemetryCard: React.CSSProperties = {
  backgroundColor: "#0f172a",
  padding: "8px 12px",
  borderRadius: "6px",
  display: "flex",
  flexDirection: "column",
  gap: "2px",
  border: "1px solid #1e293b",
};

export default App;