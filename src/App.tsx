import React, { useState } from "react";
import { ColorGradeCanvas } from "./components/ColorGradeCanvas";
import { DropZone } from "./components/DropZone";
import { prepareAndAnalyzeImage, type ImageAnalysisResult } from "./utils/imageAnalysis";
import { DEFAULT_UNIFORMS, type ColorProfileUniforms } from "./types/color";

export const App: React.FC = () => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [analysis, setAnalysis] = useState<ImageAnalysisResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uniforms, setUniforms] = useState<ColorProfileUniforms>(DEFAULT_UNIFORMS);
  const [intensity, setIntensity] = useState<number>(1.0);

  const handleFileSelected = async (file: File) => {
    setIsProcessing(true);
    try {
      const result = await prepareAndAnalyzeImage(file);
      setAnalysis(result);
      setImage(result.originalImage);
    } catch (err) {
      console.error("Failed to analyze image:", err);
      alert("Error processing image file.");
    } finally {
      setIsProcessing(false);
    }
  };

  const updateChannel = (
    key: "slope" | "offset" | "power" | "shadow_tint_rgb" | "highlight_tint_rgb",
    index: number,
    value: number
  ) => {
    setUniforms((prev) => {
      const updated = [...prev[key]] as [number, number, number];
      updated[index] = value;
      return { ...prev, [key]: updated };
    });
  };

  const applyPreset = (type: "neutral" | "warm" | "cool" | "vintage") => {
    if (type === "neutral") setUniforms(DEFAULT_UNIFORMS);
    else if (type === "warm") {
      setUniforms({
        slope: [1.1, 1.02, 0.95],
        offset: [0.01, 0.0, -0.01],
        power: [0.98, 1.0, 1.02],
        shadow_tint_rgb: [0.55, 0.48, 0.42],
        highlight_tint_rgb: [0.62, 0.54, 0.45],
        saturation: 1.05,
      });
    } else if (type === "cool") {
      setUniforms({
        slope: [0.95, 1.02, 1.1],
        offset: [-0.02, 0.01, 0.03],
        power: [1.02, 1.0, 0.98],
        shadow_tint_rgb: [0.42, 0.52, 0.58],
        highlight_tint_rgb: [0.54, 0.52, 0.48],
        saturation: 0.95,
      });
    } else if (type === "vintage") {
      setUniforms({
        slope: [0.92, 0.95, 0.98],
        offset: [0.03, 0.02, 0.01],
        power: [1.05, 1.02, 0.98],
        shadow_tint_rgb: [0.52, 0.5, 0.45],
        highlight_tint_rgb: [0.58, 0.55, 0.48],
        saturation: 0.88,
      });
    }
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0f172a", color: "#f8fafc", padding: "24px", fontFamily: "sans-serif" }}>
      <header style={{ maxWidth: "1280px", margin: "0 auto 20px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "bold", margin: 0 }}>Cinematic AI Color Engine</h1>
        <p style={{ color: "#94a3b8", margin: "4px 0 0", fontSize: "14px" }}>
          Day 2: Client Pre-Processing, Dynamic Normalization & Histogram Analysis
        </p>
      </header>

      <main style={{ maxWidth: "1280px", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 340px", gap: "24px" }}>
        {/* Left Column: DropZone & Canvas Viewport */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <DropZone onFileSelected={handleFileSelected} isLoading={isProcessing} />

          <div style={{ backgroundColor: "#020617", padding: "16px", borderRadius: "12px", border: "1px solid #1e293b", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "480px" }}>
            {image ? (
              <ColorGradeCanvas image={image} uniforms={uniforms} intensity={intensity} />
            ) : (
              <p style={{ color: "#64748b" }}>Upload or drag an image above to run the pipeline.</p>
            )}
          </div>

          {/* Diagnostics HUD */}
          {analysis && (
            <div style={{ backgroundColor: "#1e293b", borderRadius: "10px", padding: "16px", border: "1px solid #334155" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <h4 style={{ margin: 0, fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#38bdf8" }}>
                  Hardware & Analysis Telemetry
                </h4>
                <span style={{ fontSize: "12px", backgroundColor: "#0f172a", padding: "3px 8px", borderRadius: "4px", color: "#94a3b8" }}>
                  ⚡ Processed in {analysis.processingTimeMs}ms
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", fontSize: "12px" }}>
                <div style={hudCardStyle}>
                  <span style={hudLabelStyle}>Payload Size</span>
                  <strong style={{ fontSize: "14px", color: "#4ade80" }}>
                    {(analysis.payloadSizeBytes / 1024).toFixed(1)} KB
                  </strong>
                  <span style={{ fontSize: "10px", color: "#64748b" }}>max 1280px JPEG</span>
                </div>

                <div style={hudCardStyle}>
                  <span style={hudLabelStyle}>Dynamic Range</span>
                  <strong style={{ fontSize: "14px", color: "#f8fafc" }}>
                    {(analysis.dynamicRangeRatio * 100).toFixed(0)}%
                  </strong>
                  <span style={{ fontSize: "10px", color: "#64748b" }}>
                    P2: {analysis.blackFloor} | P98: {analysis.whiteCeiling}
                  </span>
                </div>

                <div style={hudCardStyle}>
                  <span style={hudLabelStyle}>Exposure Balance</span>
                  {analysis.isUnderexposed ? (
                    <strong style={{ color: "#f87171" }}>Underexposed</strong>
                  ) : analysis.isOverexposed ? (
                    <strong style={{ color: "#fbbf24" }}>Overexposed</strong>
                  ) : (
                    <strong style={{ color: "#4ade80" }}>Balanced</strong>
                  )}
                  <span style={{ fontSize: "10px", color: "#64748b" }}>
                    {analysis.isUnderexposed ? "Crushed blacks" : analysis.isOverexposed ? "Blown highlights" : "Good headroom"}
                  </span>
                </div>

                <div style={hudCardStyle}>
                  <span style={hudLabelStyle}>Ambient Cast</span>
                  <strong style={{ fontSize: "14px", textTransform: "capitalize", color: "#38bdf8" }}>
                    {analysis.ambientCast.dominantCast}
                  </strong>
                  <span style={{ fontSize: "10px", color: "#64748b" }}>
                    R:{analysis.ambientCast.rMean} G:{analysis.ambientCast.gMean} B:{analysis.ambientCast.bMean}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Grade Controls */}
        <div style={{ backgroundColor: "#1e293b", padding: "20px", borderRadius: "12px", border: "1px solid #334155", height: "fit-content", fontSize: "13px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "16px", borderBottom: "1px solid #334155", paddingBottom: "8px" }}>Grade Controls</h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
            <button onClick={() => applyPreset("neutral")} style={btnStyle}>Reset Neutral</button>
            <button onClick={() => applyPreset("warm")} style={btnStyle}>Kodak Warm</button>
            <button onClick={() => applyPreset("cool")} style={btnStyle}>Neo-Noir Teal</button>
            <button onClick={() => applyPreset("vintage")} style={btnStyle}>16mm Vintage</button>
          </div>

          <div style={sliderRowStyle}>
            <div style={labelStyle}>
              <span>Master Intensity</span>
              <span>{(intensity * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={intensity}
              onChange={(e) => setIntensity(parseFloat(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>

          <div style={sliderRowStyle}>
            <div style={labelStyle}>
              <span>Saturation</span>
              <span>{uniforms.saturation.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.7}
              max={1.3}
              step={0.01}
              value={uniforms.saturation}
              onChange={(e) => setUniforms((prev) => ({ ...prev, saturation: parseFloat(e.target.value) }))}
              style={{ width: "100%" }}
            />
          </div>

          <div style={sliderRowStyle}>
            <div style={labelStyle}>
              <span>Slope (Gain - Red)</span>
              <span>{uniforms.slope[0].toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.8}
              max={1.2}
              step={0.01}
              value={uniforms.slope[0]}
              onChange={(e) => updateChannel("slope", 0, parseFloat(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>

          <div style={sliderRowStyle}>
            <div style={labelStyle}>
              <span>Offset (Lift - Blue)</span>
              <span>{uniforms.offset[2].toFixed(3)}</span>
            </div>
            <input
              type="range"
              min={-0.05}
              max={0.05}
              step={0.005}
              value={uniforms.offset[2]}
              onChange={(e) => updateChannel("offset", 2, parseFloat(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>

          <div style={sliderRowStyle}>
            <div style={labelStyle}>
              <span>Power (Gamma - All)</span>
              <span>{uniforms.power[0].toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.8}
              max={1.2}
              step={0.01}
              value={uniforms.power[0]}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setUniforms((prev) => ({ ...prev, power: [val, val, val] }));
              }}
              style={{ width: "100%" }}
            />
          </div>

          <div style={sliderRowStyle}>
            <div style={labelStyle}>
              <span>Shadow Tint (Blue / Teal)</span>
              <span>{uniforms.shadow_tint_rgb[2].toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.35}
              max={0.65}
              step={0.01}
              value={uniforms.shadow_tint_rgb[2]}
              onChange={(e) => updateChannel("shadow_tint_rgb", 2, parseFloat(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>

          <div style={sliderRowStyle}>
            <div style={labelStyle}>
              <span>Highlight Tint (Red / Amber)</span>
              <span>{uniforms.highlight_tint_rgb[0].toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.35}
              max={0.65}
              step={0.01}
              value={uniforms.highlight_tint_rgb[0]}
              onChange={(e) => updateChannel("highlight_tint_rgb", 0, parseFloat(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

const hudCardStyle: React.CSSProperties = {
  backgroundColor: "#0f172a",
  padding: "10px",
  borderRadius: "6px",
  display: "flex",
  flexDirection: "column",
  gap: "3px",
  border: "1px solid #1e293b",
};

const hudLabelStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: "11px",
};

const btnStyle: React.CSSProperties = {
  backgroundColor: "#334155",
  color: "#f8fafc",
  border: "none",
  borderRadius: "6px",
  padding: "8px 12px",
  fontSize: "12px",
  cursor: "pointer",
  fontWeight: 500,
};

const sliderRowStyle: React.CSSProperties = {
  marginBottom: "14px",
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  marginBottom: "4px",
  color: "#cbd5e1",
};

export default App;