import React, { useState, useEffect } from "react";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentKey: string;
  onSaveKey: (key: string) => void;
  onUsePresets: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  currentKey,
  onSaveKey,
  onUsePresets,
}) => {
  const [keyInput, setKeyInput] = useState<string>(currentKey);
  const [showKey, setShowKey] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    setKeyInput(currentKey);
    setError("");
  }, [currentKey, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmed = keyInput.trim();
    if (!trimmed) {
      setError("Please paste a valid Gemini API key or choose to continue with pre-made presets.");
      return;
    }
    if (trimmed.length < 15) {
      setError("The API key seems too short. Please make sure you copied the full key from Google AI Studio.");
      return;
    }
    onSaveKey(trimmed);
    onClose();
  };

  const handleClear = () => {
    onSaveKey("");
    setKeyInput("");
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(2, 6, 23, 0.85)",
        backdropFilter: "blur(8px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: "#0f172a",
          border: "1px solid #334155",
          borderRadius: "16px",
          maxWidth: "540px",
          width: "100%",
          padding: "24px",
          color: "#f8fafc",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)",
          position: "relative",
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            background: "none",
            border: "none",
            color: "#94a3b8",
            fontSize: "18px",
            cursor: "pointer",
            padding: "4px 8px",
            borderRadius: "6px",
          }}
          title="Close"
        >
          ✕
        </button>

        {/* Modal Title */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <span style={{ fontSize: "24px" }}>🔑</span>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#f8fafc" }}>
            Connect Your Free Gemini API Key
          </h2>
        </div>

        <p style={{ fontSize: "13px", color: "#94a3b8", lineHeight: 1.5, margin: "0 0 16px" }}>
          Google provides <strong style={{ color: "#38bdf8" }}>100% free Gemini API keys</strong> with no credit card required. Connecting your free key unlocks live AI scene analysis and dynamic bespoke color grading.
        </p>

        {/* Step-by-Step Guide for Non-Tech Users */}
        <div
          style={{
            backgroundColor: "#1e293b",
            borderRadius: "10px",
            padding: "14px 16px",
            marginBottom: "16px",
            border: "1px solid #334155",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
            How to get your free key in 30 seconds:
          </div>

          <ol style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: "#cbd5e1", lineHeight: 1.6 }}>
            <li style={{ marginBottom: "6px" }}>
              Open{" "}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                style={{ color: "#38bdf8", fontWeight: 600, textDecoration: "underline" }}
              >
                Google AI Studio (Click Here) ↗
              </a>
            </li>
            <li style={{ marginBottom: "6px" }}>
              Sign in with any standard <strong>Google / Gmail account</strong>.
            </li>
            <li style={{ marginBottom: "6px" }}>
              Click the blue button that says <strong>"Create API key"</strong>.
            </li>
            <li>
              Copy your generated key and paste it below.
            </li>
          </ol>
        </div>

        {/* Key Input Field */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}>
            Your Gemini API Key:
          </label>
          <div style={{ position: "relative" }}>
            <input
              type={showKey ? "text" : "password"}
              value={keyInput}
              onChange={(e) => {
                setKeyInput(e.target.value);
                setError("");
              }}
              placeholder="Paste your Gemini key here..."
              style={{
                width: "100%",
                padding: "10px 40px 10px 12px",
                backgroundColor: "#020617",
                border: `1.5px solid ${error ? "#f87171" : "#334155"}`,
                borderRadius: "8px",
                color: "#f8fafc",
                fontSize: "13px",
                fontFamily: "monospace",
                boxSizing: "border-box",
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              style={{
                position: "absolute",
                right: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#94a3b8",
                fontSize: "14px",
                padding: 0,
              }}
              title={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? "👁️" : "🔒"}
            </button>
          </div>
          {error && (
            <p style={{ color: "#f87171", fontSize: "11px", margin: "6px 0 0" }}>
              {error}
            </p>
          )}
        </div>

        {/* Security & Privacy Notice */}
        <p style={{ fontSize: "11px", color: "#64748b", margin: "0 0 18px", lineHeight: 1.4 }}>
          🔒 <strong>Privacy First:</strong> Your key is stored solely in your personal browser's local storage. It is directly used to generate your grades and is never stored or tracked on our servers.
        </p>

        {/* Action Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <button
            onClick={handleSave}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "#0284c7",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(2, 132, 199, 0.4)",
              transition: "all 0.15s ease",
            }}
          >
            ✓ Save Key & Enable Live AI Grading
          </button>

          <button
            onClick={() => {
              onUsePresets();
              onClose();
            }}
            style={{
              width: "100%",
              padding: "10px",
              backgroundColor: "#1e293b",
              color: "#cbd5e1",
              border: "1px solid #334155",
              borderRadius: "8px",
              fontWeight: 500,
              fontSize: "12px",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            Continue with Built-in Pre-made Presets (No Key Required)
          </button>

          {currentKey && (
            <button
              onClick={handleClear}
              style={{
                background: "none",
                border: "none",
                color: "#f87171",
                fontSize: "11px",
                cursor: "pointer",
                padding: "6px",
                marginTop: "4px",
                textAlign: "center",
              }}
            >
              Remove Saved API Key
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

