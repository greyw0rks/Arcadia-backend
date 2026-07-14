"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { ConnectControl } from "../../components/ConnectControl";
import { MobileBottomNav } from "../../components/MobileBottomNav";

interface TournamentEntry {
  rank: number;
  address: string;
  unit: string;
  qualifyingGames: number;
  wins: number;
  winRate: number;
  totalStaked: number;
  totalWinnings: number;
  netProfit: number;
  eligible: boolean;
}

interface TournamentData {
  weekStartMs: number;
  weekEndMs: number;
  prizePoolUsd: number;
  leaderboard: TournamentEntry[];
  viewerEntry: TournamentEntry | null;
}

function shortAddr(addr: string): string {
  if (addr.startsWith("0x")) return addr.slice(0, 6) + "…" + addr.slice(-4);
  if (addr.length > 16) return addr.slice(0, 8) + "…" + addr.slice(-6);
  return addr;
}


function formatCountdown(ms: number): string {
  if (ms <= 0) return "ended";
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hrs = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (days > 0) return `${days}d ${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
}

export default function TournamentPage() {
  const router = useRouter();
  const { address } = useAccount();

  const [data, setData] = useState<TournamentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const url = address ? `/api/tournament?viewer=${address}` : "/api/tournament";
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { load(); }, [load]);

  // Countdown tick
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeLeft = data ? data.weekEndMs - now : 0;

  const styles: Record<string, React.CSSProperties> = {
    page: {
      minHeight: "100vh",
      background: "#0a0a0a",
      color: "#fff",
      fontFamily: "'Space Grotesk', monospace",
      paddingBottom: 80,
    },
    header: {
      background: "#111",
      borderBottom: "3px solid #FCFF52",
      padding: "16px 24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap" as const,
      gap: 12,
    },
    backBtn: {
      background: "none",
      border: "2px solid #444",
      color: "#aaa",
      padding: "6px 14px",
      borderRadius: 6,
      cursor: "pointer",
      fontSize: 14,
      fontFamily: "'Space Grotesk', monospace",
    },
    title: {
      fontSize: 22,
      fontWeight: 800,
      color: "#FCFF52",
      letterSpacing: 1,
    },
    container: {
      maxWidth: 900,
      margin: "0 auto",
      padding: "24px 16px",
    },
    prizeCard: {
      background: "#1a1a1a",
      border: "3px solid #FCFF52",
      borderRadius: 12,
      padding: "24px",
      marginBottom: 24,
      display: "flex",
      flexWrap: "wrap" as const,
      gap: 24,
      alignItems: "center",
      justifyContent: "space-between",
    },
    prizeAmount: {
      fontSize: 48,
      fontWeight: 900,
      color: "#FCFF52",
      lineHeight: 1,
    },
    prizeLabel: {
      fontSize: 13,
      color: "#888",
      marginTop: 4,
    },
    countdown: {
      textAlign: "right" as const,
    },
    countdownValue: {
      fontSize: 28,
      fontWeight: 800,
      color: "#fff",
    },
    countdownLabel: {
      fontSize: 12,
      color: "#888",
      marginTop: 2,
    },
    rulesCard: {
      background: "#111",
      border: "2px solid #333",
      borderRadius: 10,
      padding: "20px",
      marginBottom: 24,
    },
    rulesTitle: {
      fontSize: 14,
      fontWeight: 700,
      color: "#FCFF52",
      marginBottom: 12,
      textTransform: "uppercase" as const,
      letterSpacing: 1,
    },
    rulesList: {
      listStyle: "none",
      padding: 0,
      margin: 0,
      display: "flex",
      flexDirection: "column" as const,
      gap: 8,
    },
    ruleItem: {
      display: "flex",
      gap: 10,
      fontSize: 13,
      color: "#ccc",
      alignItems: "flex-start",
    },
    ruleDot: {
      color: "#FCFF52",
      flexShrink: 0,
      marginTop: 1,
    },
    viewerCard: {
      background: "#1a1a1a",
      border: "2px solid #FCFF52",
      borderRadius: 10,
      padding: "20px",
      marginBottom: 24,
    },
    viewerTitle: {
      fontSize: 13,
      color: "#888",
      marginBottom: 8,
      textTransform: "uppercase" as const,
      letterSpacing: 1,
    },
    tableWrap: {
      overflowX: "auto" as const,
    },
    table: {
      width: "100%",
      borderCollapse: "collapse" as const,
      fontSize: 13,
    },
    th: {
      textAlign: "left" as const,
      padding: "10px 12px",
      color: "#888",
      fontWeight: 600,
      borderBottom: "2px solid #222",
      whiteSpace: "nowrap" as const,
    },
    td: {
      padding: "10px 12px",
      borderBottom: "1px solid #1a1a1a",
    },
    rankCell: {
      fontWeight: 800,
      fontSize: 18,
      color: "#FCFF52",
    },
    emptyState: {
      textAlign: "center" as const,
      padding: "48px 24px",
      color: "#555",
    },
  };

  const eligibleBadgeStyle = (eligible: boolean): React.CSSProperties => ({
    display: "inline-block",
    padding: "4px 12px",
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 700,
    background: eligible ? "#FCFF52" : "#333",
    color: eligible ? "#000" : "#888",
    marginLeft: 10,
  });

  const eligBadgeStyle = (eligible: boolean): React.CSSProperties => ({
    padding: "2px 8px",
    borderRadius: 3,
    fontSize: 11,
    fontWeight: 700,
    background: eligible ? "#FCFF52" : "#222",
    color: eligible ? "#000" : "#666",
  });

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => router.back()}>← Back</button>
        <span style={styles.title}>🏆 Weekly Tournament</span>
        <ConnectControl />
      </div>

      <div style={styles.container}>
        {/* Prize + countdown */}
        <div style={styles.prizeCard}>
          <div>
            <div style={styles.prizeAmount}>${data?.prizePoolUsd ?? 50}</div>
            <div style={styles.prizeLabel}>Prize pool — distributed weekly</div>
          </div>
          <div style={styles.countdown}>
            <div style={styles.countdownValue}>
              {data ? formatCountdown(timeLeft) : "--:--"}
            </div>
            <div style={styles.countdownLabel}>Until week reset (Monday UTC)</div>
          </div>
        </div>

        {/* Rules */}
        <div style={styles.rulesCard}>
          <div style={styles.rulesTitle}>How to qualify</div>
          <ul style={styles.rulesList}>
            <li style={styles.ruleItem}>
              <span style={styles.ruleDot}>▸</span>
              <span>Play on medium difficulty or higher — stake ≥ $0.50</span>
            </li>
            <li style={styles.ruleItem}>
              <span style={styles.ruleDot}>▸</span>
              <span>Maintain a 95%+ win rate across all qualifying games this week</span>
            </li>
            <li style={styles.ruleItem}>
              <span style={styles.ruleDot}>▸</span>
              <span>Up to 20 qualifying games count per week — first 20 by time</span>
            </li>
            <li style={styles.ruleItem}>
              <span style={styles.ruleDot}>▸</span>
              <span>All tokens count: USDm, USDC, and USDT games all contribute</span>
            </li>
            <li style={styles.ruleItem}>
              <span style={styles.ruleDot}>▸</span>
              <span>Prize pool split among all eligible players at week end</span>
            </li>
          </ul>
        </div>

        {/* Viewer status */}
        {address && data && (
          <div style={styles.viewerCard}>
            <div style={styles.viewerTitle}>Your status this week</div>
            {data.viewerEntry ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: 22, fontWeight: 800 }}>#{data.viewerEntry.rank}</span>
                  <span style={eligibleBadgeStyle(data.viewerEntry.eligible)}>
                    {data.viewerEntry.eligible ? "✓ ELIGIBLE" : "NOT ELIGIBLE"}
                  </span>
                </div>
                <div style={{ color: "#ccc", fontSize: 13 }}>
                  {data.viewerEntry.qualifyingGames} games · {data.viewerEntry.wins} wins · {data.viewerEntry.winRate}% win rate
                </div>
                {!data.viewerEntry.eligible && (
                  <div style={{ fontSize: 12, color: "#888" }}>
                    Need {Math.max(0, Math.ceil(data.viewerEntry.qualifyingGames * 0.95) - data.viewerEntry.wins)} more win{data.viewerEntry.wins === 0 ? "s" : ""} to reach 95%
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: "#666", fontSize: 13 }}>
                No qualifying games yet this week. Play on medium difficulty or higher to appear here.
              </div>
            )}
          </div>
        )}

        {/* Leaderboard table */}
        <div style={{ marginBottom: 12, fontSize: 13, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
          Leaderboard
        </div>

        {loading && <div style={styles.emptyState}>Loading…</div>}
        {error && <div style={{ ...styles.emptyState, color: "#f44" }}>{error}</div>}
        {!loading && !error && data && data.leaderboard.length === 0 && (
          <div style={styles.emptyState}>
            No games yet this week.<br />Be the first to play and claim the top spot.
          </div>
        )}
        {!loading && !error && data && data.leaderboard.length > 0 && (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>#</th>
                  <th style={styles.th}>Player</th>
                  <th style={styles.th}>Games</th>
                  <th style={styles.th}>Win Rate</th>
                  <th style={styles.th}>Winnings</th>
                  <th style={styles.th}>Net Profit</th>
                  <th style={styles.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.leaderboard.map((e) => {
                  const isViewer = address &&
                    e.address.toLowerCase() === address.toLowerCase();
                  return (
                    <tr
                      key={e.address}
                      style={{
                        background: isViewer ? "#1a1a00" : "transparent",
                        cursor: "pointer",
                      }}
                      onClick={() => router.push(`/profile/${e.address}`)}
                    >
                      <td style={{ ...styles.td, ...styles.rankCell }}>
                        {e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : e.rank === 3 ? "🥉" : `#${e.rank}`}
                      </td>
                      <td style={styles.td}>
                        <span style={{ color: isViewer ? "#FCFF52" : "#fff" }}>
                          {shortAddr(e.address)}
                        </span>
                        {isViewer && <span style={{ marginLeft: 6, fontSize: 11, color: "#FCFF52" }}>you</span>}
                      </td>
                      <td style={styles.td}>{e.qualifyingGames} / 20</td>
                      <td style={{ ...styles.td, color: e.winRate >= 95 ? "#4f4" : "#fff" }}>
                        {e.winRate}%
                      </td>
                      <td style={{ ...styles.td, color: "#FCFF52" }}>
                        {e.totalWinnings.toFixed(2)} {e.unit}
                      </td>
                      <td style={{ ...styles.td, color: e.netProfit >= 0 ? "#4f4" : "#f44" }}>
                        {e.netProfit >= 0 ? "+" : ""}{e.netProfit.toFixed(2)} {e.unit}
                      </td>
                      <td style={styles.td}>
                        <span style={eligBadgeStyle(e.eligible)}>
                          {e.eligible ? "✓" : "✗"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <MobileBottomNav />
    </div>
  );
}
