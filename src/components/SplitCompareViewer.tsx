import React, { useState, useRef, useCallback } from "react";
import { ColorGradeCanvas } from "./ColorGradeCanvas";
import { type ColorProfileUniforms } from "../types/color";

interface SplitCompareViewerProps {
    image: HTMLImageElement | null;
    rawImageSrc: string | null;
    uniforms: ColorProfileUniforms | null;
    intensity: number;
    isLoading: boolean;
    loadingMessage?: string;
    loadingSubMessage?: string;
}

export const SplitCompareViewer: React.FC<SplitCompareViewerProps> = ({
    image,
    rawImageSrc,
    uniforms,
    intensity,
    isLoading,
    loadingMessage,
    loadingSubMessage,
}) => {
    const [splitPos, setSplitPos] = useState<number>(50);
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const handleMove = useCallback((clientX: number) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        const percentage = Math.min(Math.max((x / rect.width) * 100, 0), 100);
        setSplitPos(percentage);
    }, []);

    const handleMouseDown = () => setIsDragging(true);
    const handleMouseUp = () => setIsDragging(false);

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) handleMove(e.clientX);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length > 0) handleMove(e.touches[0].clientX);
    };

    return (
        <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleMouseUp}
            style={{
                position: "relative",
                userSelect: "none",
                overflow: "hidden",
                borderRadius: "12px",
                backgroundColor: "#020617",
                border: "1px solid #1e293b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "500px",
                cursor: isDragging ? "ew-resize" : "default",
            }}
        >
            {image ? (
                <div style={{ position: "relative", width: "100%", height: "100%" }}>
                    <ColorGradeCanvas image={image} uniforms={uniforms} intensity={intensity} />

                    {rawImageSrc && (
                        <img
                            src={rawImageSrc}
                            alt="Raw Original"
                            style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                height: "100%",
                                objectFit: "contain",
                                pointerEvents: "none",
                                clipPath: `inset(0 ${100 - splitPos}% 0 0)`,
                            }}
                        />
                    )}

                    <div
                        onMouseDown={handleMouseDown}
                        onTouchStart={handleMouseDown}
                        style={{
                            position: "absolute",
                            top: 0,
                            bottom: 0,
                            left: `${splitPos}%`,
                            width: "2px",
                            backgroundColor: "#ffffff",
                            cursor: "ew-resize",
                            boxShadow: "0 0 10px rgba(0, 0, 0, 0.7)",
                            zIndex: 10,
                        }}
                    >
                        <div
                            style={{
                                position: "absolute",
                                top: "50%",
                                left: "50%",
                                transform: "translate(-50%, -50%)",
                                width: "32px",
                                height: "32px",
                                backgroundColor: "#ffffff",
                                color: "#0f172a",
                                borderRadius: "50%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "12px",
                                fontWeight: "bold",
                                boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
                                cursor: "ew-resize",
                            }}
                        >
                            ↔
                        </div>
                    </div>

                    <span
                        style={{
                            position: "absolute",
                            bottom: "16px",
                            left: "16px",
                            backgroundColor: "rgba(0, 0, 0, 0.65)",
                            color: "#e2e8f0",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: 600,
                            letterSpacing: "0.05em",
                            pointerEvents: "none",
                            zIndex: 5,
                        }}
                    >
                        RAW ORIGINAL
                    </span>
                    <span
                        style={{
                            position: "absolute",
                            bottom: "16px",
                            right: "16px",
                            backgroundColor: "rgba(14, 165, 233, 0.75)",
                            color: "#ffffff",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: 600,
                            letterSpacing: "0.05em",
                            pointerEvents: "none",
                            zIndex: 5,
                        }}
                    >
                        CINEMATIC GRADE
                    </span>
                </div>
            ) : (
                <p style={{ color: "#64748b" }}>Upload or drag an image to see the split view.</p>
            )}

            {/* Dynamic Model Status Spinner */}
            {isLoading && (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        backgroundColor: "rgba(2, 6, 23, 0.75)",
                        backdropFilter: "blur(6px)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "20px",
                        textAlign: "center",
                        zIndex: 20,
                    }}
                >
                    <div
                        style={{
                            width: "48px",
                            height: "48px",
                            border: "3px solid #1e293b",
                            borderTopColor: "#38bdf8",
                            borderRadius: "50%",
                            animation: "spin 1s linear infinite",
                            marginBottom: "16px",
                        }}
                    />
                    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>

                    <p style={{ color: "#f8fafc", fontWeight: 600, margin: 0, fontSize: "15px" }}>
                        {loadingMessage || "Connecting to AI Art Director..."}
                    </p>
                    <p style={{ color: "#38bdf8", fontSize: "13px", margin: "6px 0 0", fontFamily: "monospace" }}>
                        {loadingSubMessage || "Preparing image stream..."}
                    </p>
                </div>
            )}
        </div>
    );
};