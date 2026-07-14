"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Range = "24h" | "7d" | "30d" | "all";

interface Analytics {
  totalUsers: number;
  totalGames: number;
  totalVolume: number;
  totalPayout: number;
  activeUsers24h: number;
  activeUsers7d: number;
  popularGames: { id: string; name: string; plays: number }[];
  recentActivity: { type: "win" | "loss"; player: string; amount: number; timestamp: number }[];
  volumeChart: { date: string; volume: number }[];
}

const RANGES: { label: string; value: Range }[] = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "All time", value: "all" },
];

function shortAddr(a: string) {
  return a.startsWith("0x") ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function fmt(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

export default function StatsPage() {
  const router = useRouter();
  const [range, setRange] = useState<Range>("7d");
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats?range=${range}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [range]);

  const maxVol = data ? Math.max(...data.volumeChart.map((b) => b.volume), 0.01) : 1;

  return (
    <div className="container">
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button
            className="btn ghost"
            onClick={() => router.push("/games")}
            style={{ padding: "12px 16px", fontSize: "20px" }}
            title="Back to games"
          >
            ←
          </button>
          <div className="brand" style={{ cursor: "pointer" }} onClick={() => router.push("/games")}>
            Arcadia
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "32px auto", padding: "0 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 32 }}>
          <h1 style={{ margin: 0, fontSize: 36 }}>Platform Stats</h1>
          <div style={{ display: "inline-flex", border: "3px solid var(--border)", background: "var(--card)" }}>
            {RANGES.map((r, i) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                style={{
                  padding: "8px 16px",
                  border: "none",
                  borderRight: i < RANGES.length - 1 ? "3px solid var(--border)" : "none",
                  background: range === r.value ? "var(--accent)" : "transparent",
                  color: range === r.value ? "#fff" : "var(--fg)",
                  fontWeight: 800,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 13,
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="panel center" style={{ padding: 48 }}>
            <p className="muted">Loading stats…</p>
          </div>
        ) : !data ? (
          <div className="panel center" style={{ padding: 48 }}>
            <p className="muted">Could not load stats.</p>
          </div>
        ) : (
          <>
            {/* Key metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 32 }}>
              {[
                { label: "Total Users", value: fmt(data.totalUsers) },
                { label: "Total Games", value: fmt(data.totalGames) },
                { label: "Volume (USDm)", value: `$${data.totalVolume.toFixed(2)}` },
                { label: "Total Payout", value: `$${data.totalPayout.toFixed(2)}` },
                { label: "Active 24h", value: fmt(data.activeUsers24h) },
                { label: "Active 7d", value: fmt(data.activeUsers7d) },
              ].map(({ label, value }) => (
                <div key={label} className="panel" style={{ textAlign: "center", padding: "20px 12px" }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: "var(--accent)" }}>{value}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Volume chart */}
            <div className="panel" style={{ marginBottom: 32 }}>
              <h3 style={{ margin: "0 0 20px 0", fontSize: 18 }}>Volume Chart</h3>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
                {data.volumeChart.map((bucket) => (
                  <div key={bucket.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <div
                      style={{
                        width: "100%",
                        background: "var(--accent)",
                        height: `${Math.max(4, (bucket.volume / maxVol) * 100)}px`,
                        border: "2px solid var(--border)",
                        transition: "height 0.3s",
                      }}
                    />
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textAlign: "center", lineHeight: 1.2 }}>
                      {bucket.date}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--fg)", fontWeight: 800 }}>
                      ${bucket.volume.toFixed(1)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent activity */}
            <div className="panel">
              <h3 style={{ margin: "0 0 16px 0", fontSize: 18 }}>Recent Games</h3>
              {data.recentActivity.length === 0 ? (
                <p className="muted">No games yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {data.recentActivity.map((a, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        background: "var(--bg-alt)",
                        border: "2px solid var(--border)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 18 }}>{a.type === "win" ? "🏆" : "💸"}</span>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{shortAddr(a.player)}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <span
                          style={{
                            fontWeight: 900,
                            fontSize: 15,
                            color: a.type === "win" ? "var(--green)" : "var(--red)",
                          }}
                        >
                          {a.type === "win" ? "+" : ""}${a.amount.toFixed(2)}
                        </span>
                        <span className="muted" style={{ fontSize: 12 }}>
                          {new Date(a.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
