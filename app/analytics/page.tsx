"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

interface AnalyticsData {
  totalUsers: number;
  totalGames: number;
  totalVolume: number;
  totalPayout: number;
  activeUsers24h: number;
  activeUsers7d: number;
  popularGames: { id: string; name: string; plays: number }[];
  recentActivity: { type: string; player: string; amount: number; timestamp: number }[];
  volumeChart: { date: string; volume: number }[];
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { address } = useAccount();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | 'all'>('7d');

  useEffect(() => {
    loadAnalytics();
  }, [timeRange]);

  async function loadAnalytics() {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics?range=${timeRange}`);
      const data = await res.json();
      setAnalytics(data);
    } catch (error) {
      // Mock data for now
      setAnalytics(generateMockAnalytics());
    } finally {
      setLoading(false);
    }
  }

  function generateMockAnalytics(): AnalyticsData {
    return {
      totalUsers: 1247,
      totalGames: 8934,
      totalVolume: 45678,
      totalPayout: 42341,
      activeUsers24h: 234,
      activeUsers7d: 892,
      popularGames: [
        { id: 'trivia', name: 'Trivia Rush', plays: 2341 },
        { id: 'geo', name: 'GeoGuess', plays: 1876 },
        { id: 'math', name: 'Math Sprint', plays: 1543 },
        { id: 'word', name: 'Letter League', plays: 1234 },
        { id: 'truefalse', name: 'True/False Blitz', plays: 987 },
      ],
      recentActivity: Array.from({ length: 10 }, (_, i) => ({
        type: Math.random() > 0.5 ? 'win' : 'loss',
        player: `0x${Math.random().toString(16).slice(2, 10)}`,
        amount: Math.floor(Math.random() * 50) + 5,
        timestamp: Date.now() - i * 60000,
      })),
      volumeChart: Array.from({ length: 7 }, (_, i) => ({
        date: new Date(Date.now() - (6 - i) * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        volume: Math.floor(Math.random() * 5000) + 2000,
      })),
    };
  }

  if (loading || !analytics) {
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
        <div className="panel center" style={{ marginTop: 32 }}>
          <p className="muted">Loading analytics...</p>
        </div>
      </div>
    );
  }

  const houseProfit = analytics.totalVolume - analytics.totalPayout;
  const houseEdge = ((houseProfit / analytics.totalVolume) * 100).toFixed(2);

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
          📊 Analytics
        </h1>
        <p className="muted" style={{ textAlign: "center", fontSize: "18px", marginBottom: 32 }}>
          Platform statistics and insights
        </p>

        {/* Time Range Selector */}
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginBottom: 40, flexWrap: "wrap" }}>
          {(['24h', '7d', '30d', 'all'] as const).map((range) => (
            <button
              key={range}
              className="btn"
              style={{
                background: timeRange === range ? 'var(--accent)' : 'transparent',
                border: '5px solid var(--border)',
                padding: '12px 24px',
              }}
              onClick={() => setTimeRange(range)}
            >
              {range === '24h' && 'Last 24 Hours'}
              {range === '7d' && 'Last 7 Days'}
              {range === '30d' && 'Last 30 Days'}
              {range === 'all' && 'All Time'}
            </button>
          ))}
        </div>

        {/* Key Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: 40 }}>
          <MetricCard icon="👥" label="Total Users" value={analytics.totalUsers.toLocaleString()} />
          <MetricCard icon="🎮" label="Total Games" value={analytics.totalGames.toLocaleString()} />
          <MetricCard icon="💰" label="Total Volume" value={`${analytics.totalVolume.toLocaleString()} cUSD`} />
          <MetricCard icon="💸" label="Total Payout" value={`${analytics.totalPayout.toLocaleString()} cUSD`} />
          <MetricCard icon="🔥" label="Active (24h)" value={analytics.activeUsers24h.toLocaleString()} />
          <MetricCard icon="📈" label="Active (7d)" value={analytics.activeUsers7d.toLocaleString()} />
          <MetricCard icon="🏦" label="House Profit" value={`${houseProfit.toLocaleString()} cUSD`} color="var(--green)" />
          <MetricCard icon="📊" label="House Edge" value={`${houseEdge}%`} />
        </div>

        {/* Popular Games */}
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '28px', marginBottom: 20 }}>🎯 Popular Games</h2>
          <div style={{ display: 'grid', gap: '12px' }}>
            {analytics.popularGames.map((game, index) => (
              <div
                key={game.id}
                style={{
                  background: 'var(--card)',
                  border: '5px solid var(--border)',
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div style={{ fontSize: '24px', fontWeight: 900, minWidth: '40px' }}>
                  #{index + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>{game.name}</h3>
                </div>
                <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--accent)' }}>
                  {game.plays.toLocaleString()} plays
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Volume Chart */}
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '28px', marginBottom: 20 }}>📈 Volume Over Time</h2>
          <div
            style={{
              background: 'var(--card)',
              border: '5px solid var(--border)',
              padding: '24px',
              boxShadow: 'var(--shadow)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '200px' }}>
              {analytics.volumeChart.map((data, index) => {
                const maxVolume = Math.max(...analytics.volumeChart.map(d => d.volume));
                const height = (data.volume / maxVolume) * 100;
                return (
                  <div key={index} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '100%',
                        height: `${height}%`,
                        background: 'var(--accent)',
                        border: '3px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 900,
                      }}
                      title={`${data.volume} cUSD`}
                    />
                    <div style={{ fontSize: '12px', fontWeight: 700, textAlign: 'center' }}>
                      {data.date}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '28px', marginBottom: 20 }}>⚡ Recent Activity</h2>
          <div style={{ display: 'grid', gap: '8px' }}>
            {analytics.recentActivity.map((activity, index) => (
              <div
                key={index}
                style={{
                  background: 'var(--bg-alt)',
                  border: '3px solid var(--border)',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '14px',
                }}
              >
                <span style={{ fontSize: '20px' }}>
                  {activity.type === 'win' ? '🎉' : '😔'}
                </span>
                <span style={{ fontWeight: 700 }}>
                  {activity.player.slice(0, 6)}...{activity.player.slice(-4)}
                </span>
                <span style={{ color: activity.type === 'win' ? 'var(--green)' : 'var(--red)', fontWeight: 900 }}>
                  {activity.type === 'win' ? '+' : '-'}{activity.amount} cUSD
                </span>
                <span className="muted" style={{ marginLeft: 'auto' }}>
                  {Math.floor((Date.now() - activity.timestamp) / 60000)}m ago
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 48 }}>
          <button className="btn" onClick={() => router.push("/")}>
            Back to Games
          </button>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, color }: { icon: string; label: string; value: string; color?: string }) {
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '5px solid var(--border)',
        padding: '20px',
        textAlign: 'center',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{ fontSize: '32px', marginBottom: '8px' }}>{icon}</div>
      <p className="muted" style={{ fontSize: '12px', margin: '0 0 8px 0' }}>{label}</p>
      <p style={{ fontSize: '20px', fontWeight: 900, margin: 0, color: color || 'var(--text)' }}>
        {value}
      </p>
    </div>
  );
}
