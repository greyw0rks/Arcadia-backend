export default function NotFound() {
  return (
    <div style={{ textAlign: "center", padding: "80px 20px" }}>
      <h1 style={{ fontSize: 64, margin: 0 }}>404</h1>
      <p style={{ fontSize: 20, margin: "16px 0 32px" }}>Page not found</p>
      <a href="/games" style={{ fontSize: 16, textDecoration: "underline" }}>
        ← Back to lobby
      </a>
    </div>
  );
}
