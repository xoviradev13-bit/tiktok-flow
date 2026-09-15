export function AuthScreenSpinner() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        width: "100%",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "3px solid rgba(0, 0, 0, 0.15)",
          borderTopColor: "rgba(0, 0, 0, 0.65)",
          animation: "protected-layout-spin 0.8s linear infinite",
        }}
      />
      <span
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
        }}
      >
        Loading…
      </span>
      <style>{`
        @keyframes protected-layout-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
