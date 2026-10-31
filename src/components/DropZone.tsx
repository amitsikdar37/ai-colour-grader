import React, { useState, useRef } from "react";

interface DropZoneProps {
  onFileSelected: (file: File) => void;
  isLoading?: boolean;
  compact?: boolean;
}

export const DropZone: React.FC<DropZoneProps> = ({ onFileSelected, isLoading, compact }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0];
    validateAndDispatch(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    validateAndDispatch(file);
  };

  const validateAndDispatch = (file?: File) => {
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      alert("Unsupported format. Please upload a JPEG, PNG, or WebP image.");
      return;
    }

    onFileSelected(file);
  };

  if (compact) {
    return (
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1px dashed ${isDragOver ? "#38bdf8" : "#334155"}`,
          backgroundColor: isDragOver ? "rgba(56, 189, 248, 0.08)" : "#1e293b",
          borderRadius: "8px",
          padding: "8px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          fontSize: "12px",
          color: "#94a3b8",
          transition: "all 0.2s ease",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleInputChange}
          style={{ display: "none" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span>📷</span>
          <span style={{ color: "#f8fafc", fontWeight: 600 }}>
            {isLoading ? "Analyzing new image..." : "Upload New Image"}
          </span>
          <span style={{ fontSize: "11px", color: "#64748b" }}>
            (Drop photo or click to switch)
          </span>
        </div>
        <span style={{ fontSize: "11px", color: "#38bdf8", fontWeight: 600 }}>Browse</span>
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${isDragOver ? "#38bdf8" : "#334155"}`,
        backgroundColor: isDragOver ? "rgba(56, 189, 248, 0.08)" : "#0f172a",
        borderRadius: "10px",
        padding: "24px",
        textAlign: "center",
        cursor: "pointer",
        transition: "all 0.2s ease",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleInputChange}
        style={{ display: "none" }}
      />
      <div style={{ fontSize: "28px", marginBottom: "8px" }}>📷</div>
      <p style={{ margin: "0 0 4px", fontWeight: 600, color: "#f8fafc", fontSize: "14px" }}>
        {isLoading ? "Processing & Analyzing Image..." : "Drop photo here or click to browse"}
      </p>
      <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
        Supports JPEG, PNG, WebP (up to 4K+ full-resolution)
      </p>
    </div>
  );
};
