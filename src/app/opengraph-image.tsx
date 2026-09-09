import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "TIKTOKFLOW – TikTok Fleet Automation & Creator Rewards Operations";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #020617 0%, #0f172a 50%, #020617 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "space-between",
          padding: "80px",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* Glow ambient effects */}
        <div
          style={{
            position: "absolute",
            top: "-10%",
            right: "-5%",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(6,182,212,0.25) 0%, rgba(0,0,0,0) 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-10%",
            left: "20%",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(236,72,153,0.2) 0%, rgba(0,0,0,0) 70%)",
          }}
        />

        {/* Top bar: Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #06b6d4, #ec4899)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontSize: "26px",
              fontWeight: 900,
            }}
          >
            TF
          </div>
          <span
            style={{
              fontSize: "32px",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "#ffffff",
            }}
          >
            TIKTOK<span style={{ color: "#06b6d4" }}>FLOW</span>
          </span>
          <div
            style={{
              marginLeft: "16px",
              padding: "6px 14px",
              borderRadius: "9999px",
              backgroundColor: "rgba(6,182,212,0.15)",
              border: "1px solid rgba(6,182,212,0.4)",
              color: "#38bdf8",
              fontSize: "15px",
              fontWeight: 600,
            }}
          >
            ENTERPRISE AUTOMATION
          </div>
        </div>

        {/* Main Headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "950px" }}>
          <h1
            style={{
              fontSize: "56px",
              fontWeight: 900,
              lineHeight: 1.15,
              letterSpacing: "-0.03em",
              color: "#ffffff",
              margin: 0,
            }}
          >
            Hệ Thống Tự Động Hóa & Quản Trị Dàn{" "}
            <span
              style={{
                backgroundImage: "linear-gradient(90deg, #06b6d4, #ec4899)",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                color: "transparent",
              }}
            >
              TikTok Fleet Quy Mô Lớn
            </span>
          </h1>
          <p
            style={{
              fontSize: "24px",
              color: "#94a3b8",
              lineHeight: 1.4,
              margin: 0,
            }}
          >
            Kết nối GPMLogin Local 9495, checklist chấm công tự động, giám sát doanh thu và tối ưu RPM Creator Rewards.
          </p>
        </div>

        {/* Bottom badges */}
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#e2e8f0",
              fontSize: "18px",
              fontWeight: 600,
              backgroundColor: "rgba(30, 41, 59, 0.8)",
              padding: "10px 20px",
              borderRadius: "10px",
              border: "1px solid rgba(148, 163, 184, 0.15)",
            }}
          >
            ⚡ Local Port 9495
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#e2e8f0",
              fontSize: "18px",
              fontWeight: 600,
              backgroundColor: "rgba(30, 41, 59, 0.8)",
              padding: "10px 20px",
              borderRadius: "10px",
              border: "1px solid rgba(148, 163, 184, 0.15)",
            }}
          >
            🛡️ OWASP Top 10 Certified
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#e2e8f0",
              fontSize: "18px",
              fontWeight: 600,
              backgroundColor: "rgba(30, 41, 59, 0.8)",
              padding: "10px 20px",
              borderRadius: "10px",
              border: "1px solid rgba(148, 163, 184, 0.15)",
            }}
          >
            🧩 Chrome Extension & Agent
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
