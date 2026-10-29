import React, { useState } from "react";
import { ColorGradeCanvas } from "./components/ColorGradeCanvas";
import { DEFAULT_UNIFORMS, type ColorProfileUniforms } from "./types/color";

export const App: React.FC = () => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [uniforms, setUniforms] = useState<ColorProfileUniforms>(DEFAULT_UNIFORMS);
  const [intensity, setIntensity] = useState<number>(1.0);

  // Handle local image file upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => setImage(img);
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Helper to update a single channel in an RGB uniform
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

  // Quick Cinematic Presets to test the engine
  const applyPreset = (type: "neutral" | "warm" | "cool" | "vintage") => {
    if (type === "neutral") {
      setUniforms(DEFAULT_UNIFORMS);
    } else if (type === "warm") {
      setUniforms({
        slope: [1.1, 1.02, 0.95],
        offset: [0.01, 0.0, -0.01],
        power: [0.98, 1.0, 1.02],
        shadow_tint_rgb: [0.55, 0.48, 0.42], // Warm shadow
        highlight_tint_rgb: [0.62, 0.54, 0.45], // Amber highlight
        saturation: 1.05,
      });
    } else if (type === "cool") {
      setUniforms({
        slope: [0.95, 1.02, 1.1],
        offset: [-0.02, 0.01, 0.03],
        power: [1.02, 1.0, 0.98],
        shadow_tint_rgb: [0.42, 0.52, 0.58], // Teal shadow
        highlight_tint_rgb: [0.54, 0.52, 0.48], // Clean neutral highlight
        saturation: 0.95,
      });
    } else if (type === "vintage") {
      setUniforms({
        slope: [0.92, 0.95, 0.98],
        offset: [0.03, 0.02, 0.01], // Lifted blacks (faded toe)
        power: [1.05, 1.02, 0.98],
        shadow_tint_rgb: [0.52, 0.5, 0.45],
        highlight_tint_rgb: [0.58, 0.55, 0.48],
        saturation: 0.88,
      });
    }
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0f172a", color: "#f8fafc", padding: "24px", fontFamily: "sans-serif" }}>
      <header style={{ maxWidth: "1200px", margin: "0 auto 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: "bold", margin: 0 }}>Cinematic AI Color Engine</h1>
          <p style={{ color: "#94a3b8", margin: "4px 0 0", fontSize: "14px" }}>Day 1: WebGL ASC-CDL & Color Pipeline Harness</p>
        </div>
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          style={{ backgroundColor: "#1e293b", padding: "8px 16px", borderRadius: "6px", border: "1px solid #334155", color: "#fff", cursor: "pointer" }}
        />
      </header>

      <main style={{ maxWidth: "1200px", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 340px", gap: "24px" }}>
        {/* Canvas Display Viewport */}
        <div style={{ backgroundColor: "#020617", padding: "20px", borderRadius: "12px", border: "1px solid #1e293b", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "500px" }}>
          {image ? (
            <ColorGradeCanvas image={image} uniforms={uniforms} intensity={intensity} />
          ) : (
            <p style={{ color: "#64748b" }}>Please upload an image (JPEG/PNG) to begin testing.</p>
          )}
        </div>

        {/* Debug Controls Panel */}
        <div style={{ backgroundColor: "#1e293b", padding: "20px", borderRadius: "12px", border: "1px solid #334155", height: "fit-content", fontSize: "13px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "16px", borderBottom: "1px solid #334155", paddingBottom: "8px" }}>Grade Controls</h3>

          {/* Preset Buttons */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
            <button onClick={() => applyPreset("neutral")} style={btnStyle}>Reset Neutral</button>
            <button onClick={() => applyPreset("warm")} style={btnStyle}>Kodak Warm</button>
            <button onClick={() => applyPreset("cool")} style={btnStyle}>Neo-Noir Teal</button>
            <button onClick={() => applyPreset("vintage")} style={btnStyle}>16mm Vintage</button>
          </div>

          {/* Intensity Slider */}
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

          {/* Saturation Slider */}
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

          {/* Slope (Gain) - Highlights */}
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

          {/* Offset (Lift) - Shadows */}
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

          {/* Power (Gamma) - Midtones */}
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

          {/* Shadow Tint Blue (Split Toning Test) */}
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

          {/* Highlight Tint Amber (Split Toning Test) */}
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