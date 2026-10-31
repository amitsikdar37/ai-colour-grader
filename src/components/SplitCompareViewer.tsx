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
    const mediaRef = useRef<HTMLDivElement | null>(null);

    const handleMove = useCallback((clientX: number) => {
        if (!mediaRef.current) return;
        const rect = mediaRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        const percentage = Math.min(Math.max((x / rect.width) * 100, 0), 100);
        setSplitPos(percentage);
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleMouseUp = () => setIsDragging(false);

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) handleMove(e.clientX);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length > 0) handleMove(e.touches[0].clientX);
    };

    const imgAspect = image && image.naturalWidth && image.naturalHeight 
        ? image.naturalWidth / image.naturalHeight 
        : 1;

    return (
        <div
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
                minHeight: "460px",
                height: "63vh",
                padding: "14px",
                boxSizing: "border-box",
            }}
        >
            {image ? (
                /* Perfectly wraps the canvas size in both portrait and landscape */
                <div
                    ref={mediaRef}
                    style={{
                        position: "relative",
                        width: "100%",
                        maxWidth: `min(100%, calc((max(63vh, 460px) - 28px) * ${imgAspect}))`,
                        maxHeight: "calc(max(63vh, 460px) - 28px)",
                        aspectRatio: `${image.naturalWidth} / ${image.naturalHeight}`,
                        borderRadius: "8px",
                        overflow: "hidden",
                        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
                        cursor: isDragging ? "ew-resize" : "default",
                    }}
                >
                    {/* 1. Underlying Graded WebGL Canvas */}
                    <ColorGradeCanvas image={image} uniforms={uniforms} intensity={intensity} />

                    {/* 2. Overlaid Raw Original (Superimposed 1:1 on the Canvas) */}
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
                                display: "block",
                                pointerEvents: "none",
                                clipPath: `inset(0 ${100 - splitPos}% 0 0)`,
                            }}
                        />
                    )}

                    {/* 3. Draggable Split Divider Line */}
                    <div
                        onMouseDown={handleMouseDown}
                        onTouchStart={() => setIsDragging(true)}
                        style={{
                            position: "absolute",
                            top: 0,
                            bottom: 0,
                            left: `${splitPos}%`,
                            width: "2px",
                            backgroundColor: "#ffffff",
                            cursor: "ew-resize",
                            boxShadow: "0 0 10px rgba(0, 0, 0, 0.8)",
                            zIndex: 10,
                        }}
                    >
                        {/* Center Handle Button */}
                        <div
                            style={{
                                position: "absolute",
                                top: "50%",
                                left: "50%",
                                transform: "translate(-50%, -50%)",
                                width: "30px",
                                height: "30px",
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

                    {/* Corner Badges: Auto-fade when slider gets close so they never show on the wrong side */}
                    <span
                        style={{
                            position: "absolute",
                            bottom: "12px",
                            left: "12px",
                            backgroundColor: "rgba(0, 0, 0, 0.75)",
                            backdropFilter: "blur(4px)",
                            color: "#e2e8f0",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: 600,
                            letterSpacing: "0.05em",
                            pointerEvents: "none",
                            zIndex: 5,
                            opacity: splitPos > 18 ? 1 : 0,
                            transform: `translateY(${splitPos > 18 ? "0px" : "4px"})`,
                            transition: "all 0.2s ease",
                        }}
                    >
                        RAW ORIGINAL
                    </span>
                    <span
                        style={{
                            position: "absolute",
                            bottom: "12px",
                            right: "12px",
                            backgroundColor: "rgba(14, 165, 233, 0.85)",
                            backdropFilter: "blur(4px)",
                            color: "#ffffff",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: 600,
                            letterSpacing: "0.05em",
                            pointerEvents: "none",
                            zIndex: 5,
                            opacity: splitPos < 82 ? 1 : 0,
                            transform: `translateY(${splitPos < 82 ? "0px" : "4px"})`,
                            transition: "all 0.2s ease",
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
