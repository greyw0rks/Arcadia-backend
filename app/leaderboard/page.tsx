"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

interface LeaderboardEntry {
  rank: number;
  address: string;
  username: string | null;
  avatar: string | null;
  score: number;
  gamesPlayed: number;
  winRate: number;
  totalWinnings: number;
}

type Period = 'daily' | 'weekly' | 'monthly' | 'allTime';
type Metric = 'winnings' | 'winRate' | 'gamesPlayed' | 'highestMultiplier';

export default function LeaderboardPage() {
  const router = useRouter();
  const { address } = useAccount();
  const [period, setPeriod] = useState<Period>('allTime');
  const [metric, setMetric] = useState<Metric>('winnings');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRank, setUserRank] = useState<number | null>(null);

  useEffect(() => {
    loadLeaderboard();
  }, [period, metric]);

  async function loadLeaderboard() {
    setLoading(true);
    try {
      const res = await fetch(`/api/leaderboard?period=${period}&metric=${metric}`);
      const data = await res.json();
      setLeaderboard(data.leaderboard || []);
      setUserRank(data.userRank || null);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
      // Mock data for now
      setLeaderboard(generateMockLeaderboard());
    } finally {
      setLoading(false);
    }
  }

  function generateMockLeaderboard(): LeaderboardEntry[] {
    return Array.from({ length: 50 }, (_, i) => ({
      rank: i + 1,
      address: `0x${Math.random().toString(16).slice(2, 42)}`,
      username: `Player${i + 1}`,
      avatar: ['🎮', '🎯', '🎲', '🎰', '🏆', '⭐', '💎', '🔥'][i % 8],
      score: Math.floor(Math.random() * 10000) + 1000,
      gamesPlayed: Math.floor(Math.random() * 100) + 10,
      winRate: Math.floor(Math.random() * 100),
      totalWinnings: Math.floor(Math.random() * 1000) + 100,
    })).sort((a, b) => b.score - a.score);
  }

  const periods: { value: Period; label: string }[] = [
    { value: 'daily', label: 'Today' },
    { value: 'weekly', label: 'This Week' },
    { value: 'monthly', label: 'This Month' },
    { value: 'allTime', label: 'All Time' },
  ];

  const metrics: { value: Metric; label: string; icon: string }[] = [
    { value: 'winnings', label: 'Total Winnings', icon: '💰' },
    { value: 'winRate', label: 'Win Rate', icon: '📈' },
    { value: 'gamesPlayed', label: 'Games Played', icon: '🎮' },
    { value: 'highestMultiplier', label: 'Highest Multiplier', icon: '🚀' },
  ];

  function getRankColor(rank: number) {
    if (rank === 1) return 'var(--yellow)';
    if (rank === 2) return '#C0C0C0';
    if (rank === 3) return '#CD7F32';
    return 'var(--card)';
  }

  function getRankIcon(rank: number) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  }

  return (
    <div className="container">
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button
            className="btn ghost"
            onClick={() => router.back()}
            style={{ padding: "12px 16px", fontSize: "20px" }}
            title="Go back"
          >
            ←
          </button>
          <div className="brand" style={{ cursor: "pointer" }} onClick={() => router.push("/games")}>
            Arcadia
          </div>
        </div>
        <ConnectButton showBalance={false} chainStatus="icon" />
      </div>

      <div className="panel" style={{ marginTop: 32 }}>
        <h1 style={{ marginTop: 0, fontSize: "48px", textAlign: "center" }}>
          🏆 Leaderboard
        </h1>
        <p className="muted" style={{ textAlign: "center", fontSize: "18px", marginBottom: 32 }}>
          Compete with players worldwide
        </p>

        {/* Period Selector */}
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginBottom: 24, flexWrap: "wrap" }}>
          {periods.map((p) => (
            <button
              key={p.value}
              className="btn"
              style={{
                background: period === p.value ? 'var(--accent)' : 'transparent',
                border: '5px solid var(--border)',
                padding: '12px 24px',
                fontSize: '16px',
              }}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Metric Selector */}
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginBottom: 32, flexWrap: "wrap" }}>
          {metrics.map((m) => (
            <button
              key={m.value}
              className="btn ghost"
              style={{
                background: metric === m.value ? 'var(--purple)' : 'transparent',
                color: metric === m.value ? 'var(--card)' : 'var(--text)',
                padding: '12px 20px',
                fontSize: '14px',
              }}
              onClick={() => setMetric(m.value)}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>

        {/* User's Rank */}
        {address && userRank && (
          <div
            style={{
              background: 'var(--bg-alt)',
              border: '5px solid var(--border)',
              padding: '16px 24px',
              marginBottom: 24,
              textAlign: 'center',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <p style={{ fontSize: '18px', fontWeight: 900, margin: 0 }}>
              Your Rank: <span style={{ color: 'var(--accent)' }}>#{userRank}</span>
            </p>
          </div>
        )}

        {/* Leaderboard Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p className="muted">Loading leaderboard...</p>
          </div>
        ) : (
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            {leaderboard.map((entry) => (
              <div
                key={entry.address}
                style={{
                  background: getRankColor(entry.rank),
                  border: '5px solid var(--border)',
                  padding: '20px 24px',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '20px',
                  boxShadow: entry.rank <= 3 ? 'var(--shadow)' : 'var(--shadow-sm)',
                  transition: 'all 0.2s',
                  cursor: 'pointer',
                }}
                onClick={() => router.push(`/profile/${entry.address}`)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translate(-3px, -3px)';
                  e.currentTarget.style.boxShadow = '8px 8px 0 var(--border)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translate(0, 0)';
                  e.currentTarget.style.boxShadow = entry.rank <= 3 ? 'var(--shadow)' : 'var(--shadow-sm)';
                }}
              >
                {/* Rank */}
                <div
                  style={{
                    fontSize: '32px',
                    fontWeight: 900,
                    minWidth: '60px',
                    textAlign: 'center',
                  }}
                >
                  {getRankIcon(entry.rank)}
                </div>

                {/* Avatar */}
                <div
                  style={{
                    fontSize: '40px',
                    width: '60px',
                    height: '60px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--card)',
                    border: '4px solid var(--border)',
                  }}
                >
                  {entry.avatar || '👤'}
                </div>

                {/* Info */}
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>
                    {entry.username || `${entry.address.slice(0, 6)}...${entry.address.slice(-4)}`}
                  </h3>
                  <p className="muted" style={{ margin: '4px 0 0 0', fontSize: '14px' }}>
                    {entry.gamesPlayed} games · {entry.winRate}% win rate
                  </p>
                </div>

                {/* Score */}
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: '24px', fontWeight: 900, color: 'var(--accent)' }}>
                    {metric === 'winnings' && `${entry.totalWinnings} cUSD`}
                    {metric === 'winRate' && `${entry.winRate}%`}
                    {metric === 'gamesPlayed' && entry.gamesPlayed}
                    {metric === 'highestMultiplier' && `${(entry.score / 100).toFixed(1)}x`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 48 }}>
          <button className="btn" onClick={() => router.push("/games")}>
            Back to Games
          </button>
        </div>
      </div>
    </div>
  );
}
