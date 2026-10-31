import React, { useState, useMemo } from "react";
import { DropZone } from "./components/DropZone";
import { SplitCompareViewer } from "./components/SplitCompareViewer";
import { ApiKeyModal } from "./components/ApiKeyModal";
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

  // User Gemini API Key (Bring Your Own Key)
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem("gemini_api_key") || "";
  });
  const [isKeyModalOpen, setIsKeyModalOpen] = useState<boolean>(() => {
    const savedKey = localStorage.getItem("gemini_api_key");
    const dismissed = localStorage.getItem("gemini_key_prompt_dismissed");
    return !savedKey && !dismissed;
  });

  const handleSaveApiKey = (key: string) => {
    setApiKey(key);
    if (key) {
      localStorage.setItem("gemini_api_key", key);
      localStorage.removeItem("gemini_key_prompt_dismissed");
    } else {
      localStorage.removeItem("gemini_api_key");
    }
  };

  const handleUsePresets = () => {
    localStorage.setItem("gemini_key_prompt_dismissed", "true");
  };

  // Director Quick Trim Sliders (Non-Destructive Final 10%)
  const [exposureTrim, setExposureTrim] = useState<number>(0.0);     // -0.20 to +0.20
  const [shadowLiftTrim, setShadowLiftTrim] = useState<number>(0.0); // -0.06 to +0.06
  const [tempTrim, setTempTrim] = useState<number>(0.0);             // -0.15 to +0.15
  const [intensity, setIntensity] = useState<number>(1.0);           // 0.0 to 1.0
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Combine Base AI Uniforms with User's Non-Destructive Trims
  const activeUniforms = useMemo((): ColorProfileUniforms => {
    const base = profiles[selectedIndex] || DEFAULT_UNIFORMS;

    const expFactor = 1.0 + exposureTrim;
    const rTempFactor = 1.0 + tempTrim * 0.5;
    const bTempFactor = 1.0 - tempTrim * 0.5;

    const slope: [number, number, number] = [
      Math.max(0.65, Math.min(1.45, base.slope[0] * expFactor * rTempFactor)),
      Math.max(0.65, Math.min(1.45, base.slope[1] * expFactor)),
      Math.max(0.65, Math.min(1.45, base.slope[2] * expFactor * bTempFactor)),
    ];

    const offset: [number, number, number] = [
      Math.max(-0.08, Math.min(0.08, base.offset[0] + shadowLiftTrim)),
      Math.max(-0.08, Math.min(0.08, base.offset[1] + shadowLiftTrim)),
      Math.max(-0.08, Math.min(0.08, base.offset[2] + shadowLiftTrim)),
    ];

    return {
      ...base,
      slope,
      offset,
    };
  }, [profiles, selectedIndex, exposureTrim, shadowLiftTrim, tempTrim]);

  const hasTrims = exposureTrim !== 0 || shadowLiftTrim !== 0 || tempTrim !== 0 || intensity !== 1.0;

  const handleResetTrims = () => {
    setExposureTrim(0.0);
    setShadowLiftTrim(0.0);
    setTempTrim(0.0);
    setIntensity(1.0);
  };

  const handleFileSelected = async (file: File) => {
    setIsAnalyzing(true);
    setLoadingMsg("Optimizing image payload...");
    setLoadingSubMsg("Downscaling & extracting histogram...");
    handleResetTrims();

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
        body: JSON.stringify({
          image_base64: result.previewBase64,
          api_key: apiKey.trim() || null,
        }),
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
  };

  const handleExport = async () => {
    if (!image) return;
    setIsExporting(true);
    try {
      const activeLookTitle = profiles[selectedIndex]?.title || "custom_grade";
      const cleanName = activeLookTitle.toLowerCase().replace(/[^a-z0-9]/g, "_");
      await exportHighResImage(image, activeUniforms, intensity, `${cleanName}_fullres.jpg`);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed. Please check browser console.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0f172a", color: "#f8fafc", padding: "16px 24px 32px", fontFamily: "sans-serif" }}>
      <header style={{ maxWidth: "1280px", margin: "0 auto 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: "bold", margin: 0 }}>Cinematic AI Color Engine</h1>
          <p style={{ color: "#94a3b8", margin: "2px 0 0", fontSize: "13px" }}>
            Production Engine: 60 FPS WebGL · Multimodal Gemini · 4K Full-Resolution Export
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {modelUsed && (
            <div style={{ backgroundColor: "#1e293b", padding: "4px 12px", borderRadius: "20px", border: "1px solid #38bdf8", fontSize: "12px", color: "#38bdf8" }}>
              ⚡ Graded by: <strong>{modelUsed}</strong>
            </div>
          )}
          <button
            onClick={() => setIsKeyModalOpen(true)}
            style={{
              backgroundColor: apiKey ? "rgba(34, 197, 94, 0.12)" : "rgba(56, 189, 248, 0.12)",
              border: `1px solid ${apiKey ? "rgba(34, 197, 94, 0.4)" : "rgba(56, 189, 248, 0.4)"}`,
              color: apiKey ? "#4ade80" : "#38bdf8",
              padding: "6px 14px",
              borderRadius: "20px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.15s ease",
            }}
            title={apiKey ? "Personal Gemini API Key is Active · Click to Manage" : "Connect Free Gemini API Key for Live AI Grading"}
          >
            <span>{apiKey ? "🟢" : "🔑"}</span>
            <span>{apiKey ? "Gemini Key Connected" : "Connect Free Gemini Key"}</span>
            <span style={{ fontSize: "10px", opacity: 0.8 }}>({apiKey ? "Manage" : "Free"})</span>
          </button>
        </div>
      </header>

      <main className="grader-main-grid">
        {/* Left Column: Image Viewer + Direct Trim Controls + Telemetry */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <DropZone onFileSelected={handleFileSelected} isLoading={isAnalyzing} compact={Boolean(image)} />

          <SplitCompareViewer
            image={image}
            rawImageSrc={rawImageSrc}
            uniforms={activeUniforms}
            intensity={intensity}
            isLoading={isAnalyzing}
            loadingMessage={loadingMsg}
            loadingSubMessage={loadingSubMsg}
          />

          {/* Director Trim Controls (Docked directly beneath image for instant visual feedback) */}
          <div style={{ backgroundColor: "#1e293b", borderRadius: "10px", padding: "14px 18px", border: "1px solid #334155" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#f8fafc", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Director Trim Controls
                </span>
                <span style={{ fontSize: "11px", color: "#64748b" }}>
                  Fine-tune exposure, shadows, and temperature in real time
                </span>
              </div>
              {hasTrims && (
                <button
                  onClick={handleResetTrims}
                  style={{
                    background: "rgba(56, 189, 248, 0.12)",
                    border: "1px solid rgba(56, 189, 248, 0.4)",
                    color: "#38bdf8",
                    fontSize: "11px",
                    cursor: "pointer",
                    padding: "3px 8px",
                    borderRadius: "4px",
                    fontWeight: 600,
                  }}
                >
                  ↺ Reset Trims
                </button>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px 24px" }}>
              {/* Exposure / Gain Trim */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "12px" }}>
                  <span style={{ color: "#cbd5e1", fontWeight: 500 }}>Exposure (Gain)</span>
                  <span style={{ color: exposureTrim !== 0 ? "#38bdf8" : "#94a3b8", fontWeight: 600 }}>
                    {exposureTrim > 0 ? "+" : ""}{(exposureTrim * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={-0.20}
                  max={0.20}
                  step={0.01}
                  value={exposureTrim}
                  onChange={(e) => setExposureTrim(parseFloat(e.target.value))}
                  style={{ width: "100%", accentColor: "#38bdf8" }}
                />
              </div>

              {/* Shadow Lift / Offset Trim */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "12px" }}>
                  <span style={{ color: "#cbd5e1", fontWeight: 500 }}>Shadow Lift (Offset)</span>
                  <span style={{ color: shadowLiftTrim !== 0 ? "#38bdf8" : "#94a3b8", fontWeight: 600 }}>
                    {shadowLiftTrim > 0 ? "+" : ""}{shadowLiftTrim.toFixed(3)}
                  </span>
                </div>
                <input
                  type="range"
                  min={-0.06}
                  max={0.06}
                  step={0.005}
                  value={shadowLiftTrim}
                  onChange={(e) => setShadowLiftTrim(parseFloat(e.target.value))}
                  style={{ width: "100%", accentColor: "#38bdf8" }}
                />
              </div>

              {/* Temperature Bias Trim */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "12px" }}>
                  <span style={{ color: "#cbd5e1", fontWeight: 500 }}>Temperature Bias</span>
                  <span style={{ color: tempTrim !== 0 ? "#38bdf8" : "#94a3b8", fontWeight: 600 }}>
                    {tempTrim > 0 ? `Warm +${tempTrim.toFixed(2)}` : tempTrim < 0 ? `Cool ${tempTrim.toFixed(2)}` : "Neutral"}
                  </span>
                </div>
                <input
                  type="range"
                  min={-0.15}
                  max={0.15}
                  step={0.01}
                  value={tempTrim}
                  onChange={(e) => setTempTrim(parseFloat(e.target.value))}
                  style={{ width: "100%", accentColor: "#38bdf8" }}
                />
              </div>

              {/* Master Look Intensity */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "12px" }}>
                  <span style={{ color: "#cbd5e1", fontWeight: 500 }}>Master Look Intensity</span>
                  <span style={{ color: "#38bdf8", fontWeight: 600 }}>{(intensity * 100).toFixed(0)}%</span>
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
              </div>
            </div>
          </div>

          {/* Telemetry Card */}
          {analysis && (
            <div style={{ backgroundColor: "#1e293b", borderRadius: "10px", padding: "12px 16px", border: "1px solid #334155" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#38bdf8", textTransform: "uppercase" }}>
                  Telemetry & Dynamic Range
                </span>
                <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                  Client: {analysis.processingTimeMs}ms | Payload: {(analysis.payloadSizeBytes / 1024).toFixed(1)} KB
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", fontSize: "11px" }}>
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

        {/* Right Column: AI Look Selector Deck (Full-Sized & Fully Readable) */}
        <div style={{ backgroundColor: "#1e293b", padding: "20px", borderRadius: "12px", border: "1px solid #334155", height: "fit-content" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid #334155", paddingBottom: "10px" }}>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, letterSpacing: "0.02em" }}>
              AI Art Director Looks
            </h3>
            <span style={{ fontSize: "11px", color: "#94a3b8" }}>3 Bespoke Grades</span>
          </div>

          {profiles.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
              {profiles.map((p, idx) => {
                const isSelected = selectedIndex === idx;
                return (
                  <div
                    key={idx}
                    onClick={() => handleSelectLook(idx)}
                    style={{
                      padding: "16px",
                      borderRadius: "8px",
                      cursor: "pointer",
                      backgroundColor: isSelected ? "rgba(56, 189, 248, 0.15)" : "#0f172a",
                      border: `1.5px solid ${isSelected ? "#38bdf8" : "#334155"}`,
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <strong style={{ color: isSelected ? "#38bdf8" : "#f8fafc", fontSize: "15px" }}>
                        {p.title}
                      </strong>
                      {isSelected && (
                        <span style={{ fontSize: "10px", backgroundColor: "#38bdf8", color: "#0f172a", padding: "2px 7px", borderRadius: "4px", fontWeight: 700, letterSpacing: "0.05em" }}>
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: "13px", color: "#94a3b8", lineHeight: 1.45 }}>
                      {p.rationale}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: "32px 20px", textAlign: "center", backgroundColor: "#0f172a", borderRadius: "8px", border: "1px dashed #334155", marginBottom: "20px" }}>
              <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>
                Upload a photo to see the live model waterfall generate 3 cinematic looks.
              </p>
            </div>
          )}

          {/* Full-Resolution GPU Export Button */}
          <button
            onClick={handleExport}
            disabled={!image || isExporting}
            style={{
              width: "100%",
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

      {/* Bring Your Own Key (BYOK) Modal with friendly step-by-step guide for non-tech users */}
      <ApiKeyModal
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        currentKey={apiKey}
        onSaveKey={handleSaveApiKey}
        onUsePresets={handleUsePresets}
      />
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
