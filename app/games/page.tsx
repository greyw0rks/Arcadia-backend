"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { ConnectControl } from "../../components/ConnectControl";
import { useChain } from "../../lib/chainContext";
import { useStacksWallet } from "../../lib/stacksWallet";
import { GameIcon } from "../../components/GameIcons";
import { TutorialModal } from "../../components/TutorialModal";
import { SocialLinks } from "../../components/SocialLinks";
import { MobileBottomNav } from "../../components/MobileBottomNav";
import { soundManager } from "../../lib/sounds";

interface GameMeta {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  maxRounds: number;
  available: boolean;
}

const COMING_SOON: GameMeta[] = [];

export default function GamesPage() {
  const router = useRouter();
  const { chain } = useChain();
  const evm = useAccount();
  const stx = useStacksWallet();
  const address = chain === "stacks" ? stx.address ?? undefined : evm.address;
  const [games, setGames] = useState<GameMeta[]>([]);
  const [showTutorial, setShowTutorial] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    // Initialize sounds
    soundManager.init();
    setSoundEnabled(soundManager.isEnabled());

    // Show tutorial for first-time users
    const hasSeenTutorial = localStorage.getItem('arcadia_tutorial_seen');
    if (!hasSeenTutorial) {
      setShowTutorial(true);
    }

    fetch("/api/games")
      .then((r) => r.json())
      .then((d) => setGames(d.games ?? []))
      .catch(() => setGames([]));
  }, []);

  const handleTutorialClose = () => {
    setShowTutorial(false);
    localStorage.setItem('arcadia_tutorial_seen', 'true');
  };

  const toggleSound = () => {
    const enabled = soundManager.toggle();
    setSoundEnabled(enabled);
    soundManager.play('click');
  };

  const all = [...games, ...COMING_SOON.filter((c) => !games.some((g) => g.id === c.id))];

  return (
    <div className="container">
      <div className="topbar">
        <div className="brand">Arcadia</div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {!isMobile && address && (
            <button
              className="btn ghost"
              onClick={() => router.push(`/profile/${address}`)}
              style={{ padding: "12px 16px", fontSize: "14px" }}
              title="View my profile"
            >
              👤 Profile
            </button>
          )}
          <button
            className="btn ghost"
            onClick={toggleSound}
            style={{ padding: "12px 16px", fontSize: "20px" }}
            title={soundEnabled ? "Mute sounds" : "Enable sounds"}
          >
            {soundEnabled ? "🔊" : "🔇"}
          </button>
          <ConnectControl />
        </div>
      </div>

      <div className="hero">
        <h1>Stake. Play. Win.</h1>
        <p className="tagline">
          An on-chain arcade where your stake rides a live multiplier. Every correct answer grows your
          payout — every miss shrinks it. Cash out at stake × multiplier.
        </p>
        <div className="mechanic">
          <span>Start at <b>1.0x</b></span>
          <span>·</span>
          <span className="up">+0.1x correct</span>
          <span>·</span>
          <span className="down">−0.1x wrong</span>
        </div>
      </div>

      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <button
          className="btn"
          onClick={() => setShowTutorial(true)}
          style={{ marginRight: 12 }}
        >
          📚 How to Play
        </button>
        <button
          className="btn ghost"
          onClick={() => router.push("/faq")}
          style={{ marginRight: 12 }}
        >
          ❓ FAQ
        </button>
      </div>

      <div className="grid">
        {all.map((g) => (
          <div
            key={g.id}
            className={`card ${g.available ? "playable" : ""}`}
            onClick={() => {
              if (g.available) {
                soundManager.play('click');
                router.push(`/play/${g.id}`);
              }
            }}
          >
            <div className="game-icon-wrapper">
              <GameIcon gameId={g.id} />
            </div>
            <h3>{g.title}</h3>
            <p>{g.description}</p>
            <span className={`badge ${g.available ? "live" : "soon"}`}>
              {g.available ? "Live" : "Coming soon"}
            </span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 64, textAlign: "center" }}>
        <h2 style={{ marginBottom: 24 }}>Join the Community</h2>
        <SocialLinks />
      </div>

      <div style={{ marginTop: 48, textAlign: "center", paddingBottom: 40 }}>
        <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>
          Built on Celo · <a href="/faq" style={{ textDecoration: "underline" }}>FAQ</a>
        </p>
        <p className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
          &copy; {new Date().getFullYear()} greyw0rks. All rights reserved.
        </p>
        <p className="muted" style={{ fontSize: 11, opacity: 0.6 }}>
          Arcadia, its game mechanics, question banks, and scoring engine are proprietary.
          Unauthorised copying, cloning, or redistribution is strictly prohibited.
          <a href="/terms" style={{ marginLeft: 6, textDecoration: "underline" }}>Terms &amp; IP</a>
        </p>
      </div>

      {showTutorial && <TutorialModal onClose={handleTutorialClose} />}

      <MobileBottomNav />
    </div>
  );
}
