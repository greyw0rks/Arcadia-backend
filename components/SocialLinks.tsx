"use client";

export function SocialLinks() {
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <a
        href="https://twitter.com/arcadia_uno"
        target="_blank"
        rel="noopener noreferrer"
        className="btn"
        style={{
          background: "#1DA1F2",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "12px 20px",
          fontSize: "16px",
        }}
      >
        <span style={{ fontSize: "20px" }}>🐦</span>
        @arcadia_uno
      </a>
    </div>
  );
}
