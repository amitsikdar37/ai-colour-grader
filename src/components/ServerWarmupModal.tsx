import React, { useState, useEffect, useRef } from "react";

interface ServerWarmupModalProps {
  isOpen: boolean;
  apiBase: string;
  onServerReady: () => void;
  onBypassOffline: () => void;
}

export const ServerWarmupModal: React.FC<ServerWarmupModalProps> = ({
  isOpen,
  apiBase,
  onServerReady,
  onBypassOffline,
}) => {
  const [status, setStatus] = useState<"checking" | "waking" | "online" | "retrying">("checking");
  const [elapsed, setElapsed] = useState<number>(0);
  const [attempts, setAttempts] = useState<number>(0);
  const [isExiting, setIsExiting] = useState<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    if (!isOpen) return;

    // Live stopwatch
    const timer = setInterval(() => {
      if (isMountedRef.current) {
        setElapsed((prev) => prev + 1);
      }
    }, 1000);

    let activeController: AbortController | null = null;
    let pollTimeout: ReturnType<typeof setTimeout> | null = null;

    const probeServer = async () => {
      if (!isMountedRef.current) return;

      activeController = new AbortController();
      const timeoutId = setTimeout(() => {
        activeController?.abort();
      }, 14000); // 14-second probe window per attempt

      try {
        if (isMountedRef.current) {
          setAttempts((a) => a + 1);
        }

        const res = await fetch(`${apiBase}/api/health`, {
          signal: activeController.signal,
          cache: "no-store",
        });

        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data && data.status === "online") {
            if (!isMountedRef.current) return;
            setStatus("online");
            setIsExiting(true);
            setTimeout(() => {
              if (isMountedRef.current) {
                onServerReady();
              }
            }, 650);
            return;
          }
        }

        // Server returned non-200 (e.g. 502 Bad Gateway while Render is booting)
        if (isMountedRef.current) {
          setStatus("waking");
          pollTimeout = setTimeout(probeServer, 2500);
        }
      } catch {
        clearTimeout(timeoutId);
        // Timeout, connection refused, or network error while container boots
        if (isMountedRef.current) {
          setStatus("waking");
          pollTimeout = setTimeout(probeServer, 2500);
        }
      }
    };

    probeServer();

    return () => {
      isMountedRef.current = false;
      clearInterval(timer);
      if (pollTimeout) clearTimeout(pollTimeout);
      activeController?.abort();
    };
  }, [isOpen, apiBase, onServerReady]);

  if (!isOpen) return null;

  // Approximate progress percentage based on typical Render cold-start (~40s)
  const estimatedProgress = status === "online" 
    ? 100 
    : Math.min(94, Math.round((elapsed / 42) * 94));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(3, 7, 18, 0.94)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        transition: "opacity 0.5s ease, transform 0.5s ease",
        opacity: isExiting ? 0 : 1,
        transform: isExiting ? "scale(0.98)" : "scale(1)",
        pointerEvents: isExiting ? "none" : "auto",
      }}
    >
      <div
        style={{
          backgroundColor: "#0b1329",
          border: "1px solid #1e293b",
          borderRadius: "20px",
          width: "100%",
          maxWidth: "480px",
          padding: "28px 24px",
          boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 40px rgba(56, 189, 248, 0.12)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          color: "#f8fafc",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle Ambient Top Glow */}
        <div
          style={{
            position: "absolute",
            top: "-80px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "280px",
            height: "140px",
            background: status === "online" 
              ? "radial-gradient(circle, rgba(16, 185, 129, 0.35) 0%, transparent 70%)"
              : "radial-gradient(circle, rgba(56, 189, 248, 0.3) 0%, transparent 70%)",
            filter: "blur(20px)",
            pointerEvents: "none",
          }}
        />

        {/* Animated Beacon Icon */}
        <div
          style={{
            position: "relative",
            width: "72px",
            height: "72px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "18px",
          }}
        >
          {/* Pulsing ring */}
          <div
            style={{
              position: "absolute",
              inset: "-6px",
              borderRadius: "50%",
              border: `2px solid ${status === "online" ? "#10b981" : "#38bdf8"}`,
              opacity: status === "online" ? 0.9 : 0.4,
              animation: status === "online" ? "none" : "serverPulse 2s infinite ease-out",
            }}
          />
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              backgroundColor: status === "online" ? "rgba(16, 185, 129, 0.18)" : "rgba(56, 189, 248, 0.15)",
              border: `1px solid ${status === "online" ? "#10b981" : "#0284c7"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "26px",
            }}
          >
            {status === "online" ? "✨" : "⚡"}
          </div>
        </div>

        {/* Badge */}
        <div
          style={{
            backgroundColor: status === "online" ? "rgba(16, 185, 129, 0.15)" : "rgba(56, 189, 248, 0.12)",
            border: `1px solid ${status === "online" ? "rgba(16, 185, 129, 0.4)" : "rgba(56, 189, 248, 0.35)"}`,
            color: status === "online" ? "#34d399" : "#38bdf8",
            padding: "4px 12px",
            borderRadius: "20px",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            marginBottom: "12px",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span style={{ fontSize: "8px" }}>●</span>
          <span>{status === "online" ? "System Ready" : "Render Free Tier Cold-Start"}</span>
        </div>

        {/* Title */}
        <h2
          style={{
            fontSize: "20px",
            fontWeight: 800,
            margin: "0 0 8px 0",
            color: "#f8fafc",
            letterSpacing: "-0.3px",
          }}
        >
          {status === "online" ? "AI Color Engine Ready!" : "Waking Up AI Cloud Backend..."}
        </h2>

        {/* Dynamic Status Subtitle */}
        <p
          style={{
            fontSize: "13px",
            color: "#94a3b8",
            margin: "0 0 20px 0",
            lineHeight: 1.5,
            maxWidth: "400px",
          }}
        >
          {status === "online"
            ? "Connection established with Gemini neural colorist gateway. Launching studio..."
            : "The free cloud instance sleeps after 15 minutes of inactivity. Spinning up uvicorn container and neural models (~30–50s)..."}
        </p>

        {/* Progress Bar Container */}
        <div
          style={{
            width: "100%",
            backgroundColor: "#1e293b",
            borderRadius: "8px",
            height: "7px",
            overflow: "hidden",
            marginBottom: "16px",
            position: "relative",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${estimatedProgress}%`,
              background: status === "online"
                ? "linear-gradient(90deg, #10b981 0%, #34d399 100%)"
                : "linear-gradient(90deg, #0284c7 0%, #38bdf8 100%)",
              borderRadius: "8px",
              transition: "width 0.8s ease-out",
              boxShadow: status === "online"
                ? "0 0 10px rgba(52, 211, 153, 0.6)"
                : "0 0 10px rgba(56, 189, 248, 0.5)",
            }}
          />
        </div>

        {/* Live Metrics Row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            width: "100%",
            fontSize: "12px",
            color: "#64748b",
            fontFamily: "monospace",
            marginBottom: "20px",
            padding: "0 4px",
          }}
        >
          <span>
            ⏳ Elapsed:{" "}
            <strong style={{ color: "#e2e8f0" }}>{elapsed}s</strong>
          </span>
          <span>
            Pings:{" "}
            <strong style={{ color: "#38bdf8" }}>#{attempts}</strong>
          </span>
          <span>
            Status:{" "}
            <strong style={{ color: status === "online" ? "#34d399" : "#f59e0b" }}>
              {status === "online" ? "ONLINE" : "BOOTING"}
            </strong>
          </span>
        </div>

        {/* Why this happens info box */}
        <div
          style={{
            width: "100%",
            backgroundColor: "rgba(15, 23, 42, 0.65)",
            border: "1px solid #1e293b",
            borderRadius: "12px",
            padding: "12px 14px",
            textAlign: "left",
            fontSize: "11px",
            color: "#94a3b8",
            lineHeight: 1.5,
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              fontWeight: 700,
              color: "#cbd5e1",
              marginBottom: "4px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>💡</span>
            <span>Why is there a warm-up period?</span>
          </div>
          To keep this application completely free without server fees, our backend runs on Render’s free tier. Waiting ~30 seconds now guarantees all Gemini models grade at full speed with <strong>zero failed requests</strong> and prevents dropping into offline fallback presets.
        </div>

        {/* Action Buttons */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            width: "100%",
            flexDirection: "column",
          }}
        >
          {status !== "online" && (
            <button
              onClick={onBypassOffline}
              style={{
                width: "100%",
                padding: "11px 16px",
                backgroundColor: "rgba(30, 41, 59, 0.8)",
                border: "1px solid #334155",
                borderRadius: "10px",
                color: "#cbd5e1",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#334155";
                e.currentTarget.style.color = "#f8fafc";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(30, 41, 59, 0.8)";
                e.currentTarget.style.color = "#cbd5e1";
              }}
            >
              <span>⚡</span>
              <span>Skip & Use Offline Presets Immediately</span>
            </button>
          )}

          {status === "online" && (
            <button
              onClick={onServerReady}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                border: "none",
                borderRadius: "10px",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(16, 185, 129, 0.4)",
              }}
            >
              Enter Studio Now →
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes serverPulse {
          0% {
            transform: scale(0.95);
            opacity: 0.8;
          }
          50% {
            transform: scale(1.15);
            opacity: 0.2;
          }
          100% {
            transform: scale(0.95);
            opacity: 0.8;
          }
        }
      `}</style>
    </div>
  );
};
