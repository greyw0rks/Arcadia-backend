"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

interface UserProfile {
  address: string;
  username: string | null;
  avatar: string | null;
  stats: {
    totalGamesPlayed: number;
    totalGamesWon: number;
    totalStaked: number;
    totalWinnings: number;
    totalLosses: number;
    highestMultiplier: number;
    currentStreak: number;
    longestStreak: number;
    favoriteGame: string | null;
  };
  achievements: string[];
  recentGames: any[];
}

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { address: connectedAddress } = useAccount();
  const profileAddress = params.address as string;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState('');

  const isOwnProfile = connectedAddress?.toLowerCase() === profileAddress?.toLowerCase();

  useEffect(() => {
    loadProfile();
  }, [profileAddress]);

  async function loadProfile() {
    setLoading(true);
    try {
      const res = await fetch(`/api/profile/${profileAddress}`);
      const data = await res.json();
      setProfile(data.profile);
      setUsername(data.profile?.username || '');
      setAvatar(data.profile?.avatar || '');
    } catch (error) {
      // Mock data for now
      setProfile(generateMockProfile());
    } finally {
      setLoading(false);
    }
  }

  function generateMockProfile(): UserProfile {
    return {
      address: profileAddress,
      username: null,
      avatar: '🎮',
      stats: {
        totalGamesPlayed: 42,
        totalGamesWon: 28,
        totalStaked: 250,
        totalWinnings: 312,
        totalLosses: 188,
        highestMultiplier: 18000,
        currentStreak: 3,
        longestStreak: 7,
        favoriteGame: 'Trivia Rush',
      },
      achievements: ['first_win', 'streak_5', 'high_roller'],
      recentGames: [],
    };
  }

  async function saveProfile() {
    try {
      await fetch(`/api/profile/${profileAddress}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, avatar }),
      });
      setEditing(false);
      loadProfile();
    } catch (error) {
      console.error('Failed to save profile:', error);
    }
  }

  const avatarOptions = ['🎮', '🎯', '🎲', '🎰', '🏆', '⭐', '💎', '🔥', '👾', '🎪', '🎭', '🎨'];

  if (loading || !profile) {
    return (
      <div className="container">
        <div className="panel center" style={{ marginTop: 32 }}>
          <p className="muted">Loading profile...</p>
        </div>
      </div>
    );
  }

  const winRate = profile.stats.totalGamesPlayed > 0
    ? Math.round((profile.stats.totalGamesWon / profile.stats.totalGamesPlayed) * 100)
    : 0;

  const netProfit = profile.stats.totalWinnings - profile.stats.totalStaked;

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
        <ConnectButton showBalance={false} chainStatus="icon" />
      </div>

      <div className="panel" style={{ marginTop: 32 }}>
        {/* Profile Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div
            style={{
              fontSize: '80px',
              width: '120px',
              height: '120px',
              margin: '0 auto 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--card)',
              border: '6px solid var(--border)',
              boxShadow: 'var(--shadow)',
            }}
          >
            {profile.avatar || '👤'}
          </div>

          {editing ? (
            <div style={{ maxWidth: '400px', margin: '0 auto' }}>
              <input
                className="input"
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{ width: '100%', marginBottom: 16 }}
              />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
                {avatarOptions.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => setAvatar(emoji)}
                    style={{
                      fontSize: '32px',
                      padding: '8px',
                      background: avatar === emoji ? 'var(--accent)' : 'var(--card)',
                      border: '4px solid var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button className="btn" onClick={saveProfile}>
                  Save
                </button>
                <button className="btn ghost" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1 style={{ margin: '0 0 8px 0', fontSize: '36px' }}>
                {profile.username || `${profile.address.slice(0, 6)}...${profile.address.slice(-4)}`}
              </h1>
              <p className="muted" style={{ fontSize: '14px', marginBottom: 16 }}>
                {profile.address}
              </p>
              {isOwnProfile && (
                <button className="btn ghost" onClick={() => setEditing(true)}>
                  ✏️ Edit Profile
                </button>
              )}
            </>
          )}
        </div>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: 40 }}>
          <StatCard icon="🎮" label="Games Played" value={profile.stats.totalGamesPlayed} />
          <StatCard icon="🏆" label="Games Won" value={profile.stats.totalGamesWon} />
          <StatCard icon="📈" label="Win Rate" value={`${winRate}%`} />
          <StatCard icon="💰" label="Total Winnings" value={`${profile.stats.totalWinnings} cUSD`} />
          <StatCard icon="📊" label="Net Profit" value={`${netProfit > 0 ? '+' : ''}${netProfit} cUSD`} color={netProfit > 0 ? 'var(--green)' : 'var(--red)'} />
          <StatCard icon="🚀" label="Highest Multiplier" value={`${(profile.stats.highestMultiplier / 10000).toFixed(1)}x`} />
          <StatCard icon="🔥" label="Current Streak" value={profile.stats.currentStreak} />
          <StatCard icon="⭐" label="Longest Streak" value={profile.stats.longestStreak} />
        </div>

        {/* Achievements */}
        {profile.achievements.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: '28px', marginBottom: 20 }}>🏅 Achievements</h2>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {profile.achievements.map((achievement) => (
                <div
                  key={achievement}
                  style={{
                    padding: '12px 20px',
                    background: 'var(--yellow)',
                    border: '4px solid var(--border)',
                    boxShadow: 'var(--shadow-sm)',
                    fontWeight: 900,
                    fontSize: '14px',
                  }}
                >
                  {achievement.replace(/_/g, ' ').toUpperCase()}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Favorite Game */}
        {profile.stats.favoriteGame && (
          <div style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: '28px', marginBottom: 20 }}>❤️ Favorite Game</h2>
            <div
              style={{
                padding: '20px',
                background: 'var(--accent)',
                border: '5px solid var(--border)',
                boxShadow: 'var(--shadow)',
                fontSize: '20px',
                fontWeight: 900,
              }}
            >
              {profile.stats.favoriteGame}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string | number; color?: string }) {
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
      <p style={{ fontSize: '24px', fontWeight: 900, margin: 0, color: color || 'var(--text)' }}>
        {value}
      </p>
    </div>
  );
}
