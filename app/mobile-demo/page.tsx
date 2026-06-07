"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function MobileDemoPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'colors' | 'components' | 'layout'>('colors');

  return (
    <div className="container">
      <div className="topbar">
        <div className="brand" style={{ cursor: "pointer" }} onClick={() => router.push("/")}>
          Arcadia
        </div>
        <button className="btn ghost" onClick={() => router.push("/")}>
          ← Back
        </button>
      </div>

      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 40, marginBottom: 16 }}>Mobile UI Demo</h1>
        <p className="muted" style={{ fontSize: 16 }}>
          This page demonstrates the Heal & Grow inspired mobile design system.
          <br />
          <strong>Resize your browser to &lt;768px to see the mobile styles.</strong>
        </p>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: "flex", gap: 12, marginBottom: 32, flexWrap: "wrap" }}>
        <button
          className={activeTab === 'colors' ? 'btn' : 'btn ghost'}
          onClick={() => setActiveTab('colors')}
        >
          🎨 Colors
        </button>
        <button
          className={activeTab === 'components' ? 'btn' : 'btn ghost'}
          onClick={() => setActiveTab('components')}
        >
          🧩 Components
        </button>
        <button
          className={activeTab === 'layout' ? 'btn' : 'btn ghost'}
          onClick={() => setActiveTab('layout')}
        >
          📐 Layout
        </button>
      </div>

      {/* Colors Tab */}
      {activeTab === 'colors' && (
        <div>
          <h2 style={{ fontSize: 28, marginBottom: 24 }}>Color Palette</h2>

          <div className="panel" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 16 }}>Mobile Colors (≤768px)</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
              <div>
                <div style={{
                  background: "#111111",
                  height: 80,
                  border: "1px solid #2A2A2A",
                  borderRadius: 12,
                  marginBottom: 8
                }} />
                <strong>Background</strong>
                <p className="muted" style={{ fontSize: 12 }}>#111111</p>
              </div>
              <div>
                <div style={{
                  background: "#1A1A1A",
                  height: 80,
                  border: "1px solid #2A2A2A",
                  borderRadius: 12,
                  marginBottom: 8
                }} />
                <strong>Surface</strong>
                <p className="muted" style={{ fontSize: 12 }}>#1A1A1A</p>
              </div>
              <div>
                <div style={{
                  background: "#F2ECE6",
                  height: 80,
                  border: "1px solid #2A2A2A",
                  borderRadius: 12,
                  marginBottom: 8
                }} />
                <strong>Text Primary</strong>
                <p className="muted" style={{ fontSize: 12 }}>#F2ECE6</p>
              </div>
              <div>
                <div style={{
                  background: "#B5AEA7",
                  height: 80,
                  border: "1px solid #2A2A2A",
                  borderRadius: 12,
                  marginBottom: 8
                }} />
                <strong>Text Secondary</strong>
                <p className="muted" style={{ fontSize: 12 }}>#B5AEA7</p>
              </div>
              <div>
                <div style={{
                  background: "#2A2A2A",
                  height: 80,
                  border: "1px solid #444",
                  borderRadius: 12,
                  marginBottom: 8
                }} />
                <strong>Border</strong>
                <p className="muted" style={{ fontSize: 12 }}>#2A2A2A</p>
              </div>
              <div>
                <div style={{
                  background: "#FF6B9D",
                  height: 80,
                  border: "1px solid #2A2A2A",
                  borderRadius: 12,
                  marginBottom: 8
                }} />
                <strong>Accent</strong>
                <p className="muted" style={{ fontSize: 12 }}>#FF6B9D</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Components Tab */}
      {activeTab === 'components' && (
        <div>
          <h2 style={{ fontSize: 28, marginBottom: 24 }}>Components</h2>

          {/* Buttons */}
          <div className="panel" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 16 }}>Buttons</h3>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button className="btn">Primary Button</button>
              <button className="btn ghost">Ghost Button</button>
              <button className="btn" disabled>Disabled Button</button>
            </div>
          </div>

          {/* Cards */}
          <div className="panel" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 16 }}>Cards</h3>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              <div className="card playable">
                <div className="game-icon-wrapper">
                  <div style={{ fontSize: 32, textAlign: "center" }}>🎮</div>
                </div>
                <h3>Game Card</h3>
                <p>This is a playable game card with hover effects</p>
                <span className="badge live">Live</span>
              </div>
              <div className="card">
                <div className="game-icon-wrapper">
                  <div style={{ fontSize: 32, textAlign: "center" }}>🎯</div>
                </div>
                <h3>Static Card</h3>
                <p>This card is not interactive</p>
                <span className="badge soon">Coming Soon</span>
              </div>
            </div>
          </div>

          {/* Badges */}
          <div className="panel" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 16 }}>Badges</h3>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span className="badge live">Live</span>
              <span className="badge soon">Coming Soon</span>
              <span className="badge" style={{ background: "#6BCF7F" }}>Success</span>
              <span className="badge" style={{ background: "#FF6B6B" }}>Error</span>
            </div>
          </div>

          {/* Input */}
          <div className="panel" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 16 }}>Input Fields</h3>
            <input
              type="text"
              className="input"
              placeholder="Enter text here..."
              style={{ width: "100%", maxWidth: 400 }}
            />
          </div>

          {/* Options */}
          <div className="panel" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 16 }}>Option Buttons</h3>
            <button className="option">Option A - Click to select</button>
            <button className="option correct">Correct Answer ✓</button>
            <button className="option wrong">Wrong Answer ✗</button>
          </div>
        </div>
      )}

      {/* Layout Tab */}
      {activeTab === 'layout' && (
        <div>
          <h2 style={{ fontSize: 28, marginBottom: 24 }}>Layout Examples</h2>

          {/* Hero */}
          <div className="hero" style={{ marginBottom: 24 }}>
            <h1>Hero Section</h1>
            <p className="tagline">
              This is the hero section with a tagline. On mobile, it has rounded corners
              and a dark minimalist style.
            </p>
            <div className="mechanic">
              <span>Start at <b>1.0x</b></span>
              <span>·</span>
              <span className="up">+0.1x correct</span>
              <span>·</span>
              <span className="down">−0.1x wrong</span>
            </div>
          </div>

          {/* Panel */}
          <div className="panel" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 16 }}>Panel Component</h3>
            <p className="muted">
              Panels are used for grouping related content. On mobile, they have
              rounded corners and subtle borders.
            </p>
          </div>

          {/* Grid */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 16 }}>Grid Layout (2 columns on mobile)</h3>
            <div className="grid">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="card">
                  <div className="game-icon-wrapper">
                    <div style={{ fontSize: 32, textAlign: "center" }}>🎲</div>
                  </div>
                  <h3>Card {i}</h3>
                  <p>Grid item {i}</p>
                  <span className="badge live">Live</span>
                </div>
              ))}
            </div>
          </div>

          {/* Typography */}
          <div className="panel">
            <h3 style={{ marginBottom: 16 }}>Typography</h3>
            <h1 style={{ fontSize: 32, marginBottom: 12, fontFamily: "serif" }}>
              Heading 1 (Serif)
            </h1>
            <h2 style={{ fontSize: 24, marginBottom: 12, fontFamily: "serif" }}>
              Heading 2 (Serif)
            </h2>
            <p style={{ marginBottom: 12 }}>
              Body text uses sans-serif font for readability. This is a paragraph
              with regular weight.
            </p>
            <p className="muted">
              Muted text is used for secondary information and has lower contrast.
            </p>
          </div>
        </div>
      )}

      {/* Design Comparison */}
      <div className="panel" style={{ marginTop: 48 }}>
        <h3 style={{ marginBottom: 16 }}>📱 Design System Comparison</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 24 }}>
          <div>
            <h4 style={{ marginBottom: 8 }}>Desktop (&gt;768px)</h4>
            <ul style={{ fontSize: 14, lineHeight: 1.8 }}>
              <li>Neo-brutalism style</li>
              <li>Bright colors</li>
              <li>Hard shadows</li>
              <li>Sharp corners</li>
              <li>Bold borders (6px)</li>
              <li>Playful aesthetic</li>
            </ul>
          </div>
          <div>
            <h4 style={{ marginBottom: 8 }}>Mobile (≤768px)</h4>
            <ul style={{ fontSize: 14, lineHeight: 1.8 }}>
              <li>Dark minimalist</li>
              <li>Monochrome palette</li>
              <li>Soft shadows</li>
              <li>Rounded corners (16px)</li>
              <li>Thin borders (1px)</li>
              <li>Premium aesthetic</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="info" style={{ marginTop: 32, padding: 20, borderRadius: 12 }}>
        <strong>💡 Testing Instructions:</strong>
        <ol style={{ marginTop: 12, marginLeft: 20, fontSize: 14, lineHeight: 1.8 }}>
          <li>Open browser DevTools (F12)</li>
          <li>Toggle device toolbar (Ctrl+Shift+M)</li>
          <li>Select a mobile device or set width &lt;768px</li>
          <li>Observe the dark theme and rounded corners</li>
          <li>Test hover/tap interactions</li>
          <li>Check bottom navigation appears</li>
        </ol>
      </div>

      <div style={{ height: 100 }} />
    </div>
  );
}
