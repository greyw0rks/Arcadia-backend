"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { useStacksWallet } from "../../../lib/stacksWallet";
import { MobileBottomNav } from "../../../components/MobileBottomNav";

interface LinkedStats {
  address: string;
  unit: string;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
  totalStaked: number;
  totalWinnings: number;
  highestMultiplierBp: number;
  currentStreak: number;
  longestStreak: number;
  recentGames: { multiplierBp: number; payout: number; won: boolean; block: number }[];
}

interface UserProfile {
  address: string;
  username: string | null;
  avatar: string | null;
  unit?: string;
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
  linkedAddress: string | null;
  linkedStats: LinkedStats | null;
}

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { address: connectedAddress } = useAccount();
  const stx = useStacksWallet();
  const profileAddress = params.address as string;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState('');
  const [waitingForLink, setWaitingForLink] = useState(false);

  const isOwnProfile = connectedAddress?.toLowerCase() === profileAddress?.toLowerCase();
  const isCeloProfile = profileAddress?.startsWith('0x');

  useEffect(() => {
    loadProfile();
  }, [profileAddress]);

  // After Stacks wallet connects, complete the pending link
  useEffect(() => {
    if (!waitingForLink || !stx.address) return;
    const addr = stx.address;
    setWaitingForLink(false);
    fetch(`/api/profile/${profileAddress}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ linkedStacksAddress: addr }),
    }).then(() => loadProfile());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stx.address, waitingForLink]);

  async function loadProfile() {
    setLoading(true);
    try {
      const res = await fetch(`/api/profile/${profileAddress}`);
      const data = await res.json();
      setProfile(data.profile);
      setUsername(data.profile?.username || '');
      setAvatar(data.profile?.avatar || '');
    } catch {
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
        totalGamesPlayed: 0,
        totalGamesWon: 0,
        totalStaked: 0,
        totalWinnings: 0,
        totalLosses: 0,
        highestMultiplier: 0,
        currentStreak: 0,
        longestStreak: 0,
        favoriteGame: null,
      },
      achievements: [],
      recentGames: [],
      linkedAddress: null,
      linkedStats: null,
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
    } catch {
      console.error('Failed to save profile');
    }
  }

  function handleLinkStacks() {
    if (stx.address) {
      fetch(`/api/profile/${profileAddress}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ linkedStacksAddress: stx.address }),
      }).then(() => loadProfile());
    } else {
      setWaitingForLink(true);
      stx.connect();
    }
  }

  async function handleUnlinkStacks() {
    await fetch(`/api/profile/${profileAddress}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ linkedStacksAddress: null }),
    });
    loadProfile();
  }

  const avatarOptions = ['🎮', '🎯', '🎲', '🎰', '🏆', '⭐', '💎', '🔥', '👾', '🎪', '🎭', '🎨'];

  const shortAddr = (a: string) =>
    a.startsWith('0x') ? `${a.slice(0, 6)}...${a.slice(-4)}` : `${a.slice(0, 8)}...${a.slice(-6)}`;

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
  const unit = profile.unit === 'STX' ? 'STX' : 'cUSD';

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
                <button className="btn" onClick={saveProfile}>Save</button>
                <button className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <h1 style={{ margin: '0 0 8px 0', fontSize: '36px' }}>
                {profile.username || shortAddr(profile.address)}
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
          <StatCard icon="💰" label="Total Winnings" value={`${profile.stats.totalWinnings} ${unit}`} />
          <StatCard icon="📊" label="Net Profit" value={`${netProfit > 0 ? '+' : ''}${netProfit} ${unit}`} color={netProfit > 0 ? 'var(--green)' : 'var(--red)'} />
          <StatCard icon="🚀" label="Highest Multiplier" value={`${(profile.stats.highestMultiplier / 10000).toFixed(1)}x`} />
          <StatCard icon="🔥" label="Current Streak" value={profile.stats.currentStreak} />
          <StatCard icon="⭐" label="Longest Streak" value={profile.stats.longestStreak} />
        </div>

        {/* Achievements */}
        {profile.achievements.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: '28px', marginBottom: 20 }}>🏅 Achievements</h2>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {profile.achievements.map((a) => (
                <div
                  key={a}
                  style={{
                    padding: '12px 20px',
                    background: 'var(--yellow)',
                    border: '4px solid var(--border)',
                    boxShadow: 'var(--shadow-sm)',
                    fontWeight: 900,
                    fontSize: '14px',
                  }}
                >
                  {a.replace(/_/g, ' ').toUpperCase()}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stacks Activity (if linked) */}
        {profile.linkedStats ? (
          <div style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '28px', margin: 0 }}>⚡ Stacks Activity</h2>
              <span className="muted" style={{ fontSize: 13 }}>
                {shortAddr(profile.linkedAddress!)}
              </span>
              {isOwnProfile && isCeloProfile && (
                <button
                  className="btn ghost"
                  onClick={handleUnlinkStacks}
                  style={{ padding: '4px 10px', fontSize: 12, marginLeft: 'auto' }}
                >
                  Unlink
                </button>
              )}
            </div>
            {profile.linkedStats.gamesPlayed > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
                <StatCard icon="🎮" label="Games Played" value={profile.linkedStats.gamesPlayed} />
                <StatCard icon="🏆" label="Games Won" value={profile.linkedStats.gamesWon} />
                <StatCard icon="📈" label="Win Rate" value={`${profile.linkedStats.winRate}%`} />
                <StatCard icon="💰" label="Winnings" value={`${profile.linkedStats.totalWinnings} STX`} />
                <StatCard icon="🚀" label="Best Multiplier" value={`${(profile.linkedStats.highestMultiplierBp / 10000).toFixed(1)}x`} />
                <StatCard icon="🔥" label="Streak" value={profile.linkedStats.currentStreak} />
              </div>
            ) : (
              <p className="muted">No Stacks games played yet.</p>
            )}
          </div>
        ) : isOwnProfile && isCeloProfile ? (
          <div
            style={{
              marginBottom: 40,
              padding: '28px',
              background: 'var(--card)',
              border: '4px solid var(--border)',
              textAlign: 'center',
            }}
          >
            <p style={{ margin: '0 0 8px 0', fontWeight: 700, fontSize: 18 }}>Also play on Stacks?</p>
            <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
              Link your Stacks wallet to show cross-chain activity on this profile.
            </p>
            <button className="btn ghost" onClick={handleLinkStacks} disabled={waitingForLink}>
              {waitingForLink ? 'Waiting for wallet...' : 'Link Stacks Wallet'}
            </button>
          </div>
        ) : null}
      </div>

      <MobileBottomNav />
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
