"use client";

export function LoadingSpinner() {
  return (
    <div
      style={{
        display: "inline-block",
        width: "40px",
        height: "40px",
        border: "6px solid var(--bg-alt)",
        borderTop: "6px solid var(--accent)",
        borderRadius: "0",
        animation: "spin 1s linear infinite",
      }}
    >
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export function LoadingState({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="panel center" style={{ padding: "60px 40px" }}>
      <LoadingSpinner />
      <p className="muted" style={{ marginTop: 20, fontSize: 16 }}>
        {message}
      </p>
    </div>
  );
}
