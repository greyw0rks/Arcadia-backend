"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LOCKED_CHAIN } from "../lib/contract";

const isLanding = !LOCKED_CHAIN || LOCKED_CHAIN === "landing";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const CHAINS = [
  {
    href: "https://celo.arcadia.uno",
    label: "Celo",
    emoji: "🟡",
    tokens: ["USDM", "USDC", "USDT"],
    color: "#FCFF52",
    textColor: "#000",
    desc: "Fast, low-fee L2 with dollar-stable tokens",
  },
  {
    href: "https://base.arcadia.uno",
    label: "Base",
    emoji: "🔵",
    tokens: ["USDC"],
    color: "#0052FF",
    textColor: "#fff",
    desc: "Coinbase's Ethereum L2, powered by USDC",
  },
  {
    href: "https://stacks.arcadia.uno",
    label: "Stacks",
    emoji: "🟠",
    tokens: ["STX"],
    color: "#FF5500",
    textColor: "#fff",
    desc: "Bitcoin-secured smart contracts",
  },
];

const GAMES = [
  { emoji: "🧠", label: "Trivia", desc: "General knowledge, all difficulty levels" },
  { emoji: "🌍", label: "Geography", desc: "Landmarks, capitals & flags" },
  { emoji: "🎬", label: "Movies", desc: "Identify films from a single frame" },
  { emoji: "😂", label: "Emoji", desc: "Guess the phrase from emojis" },
  { emoji: "🏷️", label: "Logos", desc: "Name the brand from its logo" },
  { emoji: "📖", label: "Riddles", desc: "Classic lateral thinking puzzles" },
  { emoji: "🔤", label: "Word", desc: "Definitions, anagrams & wordplay" },
  { emoji: "🔢", label: "Math", desc: "Quick-fire arithmetic under pressure" },
  { emoji: "✅", label: "True / False", desc: "Separate fact from fiction fast" },
  { emoji: "🦆", label: "Odd One Out", desc: "Spot what doesn't belong" },
  { emoji: "🏛️", label: "Landmarks", desc: "Identify world-famous structures" },
  { emoji: "🌐", label: "Capitals", desc: "Know your world capitals" },
];

const STEPS = [
  {
    n: "01",
    title: "Connect your wallet",
    body: "Link a Celo, Base, or Stacks wallet — no sign-up, no email, no KYC.",
  },
  {
    n: "02",
    title: "Pick a game & stake",
    body: "Choose from 12 game modes. Stake from $0.01 to $1. More stake = more rounds = harder questions.",
  },
  {
    n: "03",
    title: "Answer & collect",
    body: "Score gets multiplied round-by-round. Finish strong and the payout settles on-chain instantly.",
  },
];

const STATS = [
  { value: "12", label: "Game modes" },
  { value: "3", label: "Chains" },
  { value: "100%", label: "On-chain payouts" },
  { value: "0", label: "Sign-ups required" },
];

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------

function LandingHub() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700;900&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        html { scroll-behavior: smooth; }
        body { font-family: 'Space Grotesk', 'Space Mono', monospace; background: #F5F3FF; color: #0F0F0F; }

        .lp { overflow-x: hidden; }

        /* NAV */
        .nav {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 40px; border-bottom: 4px solid #0F0F0F;
          background: #fff; position: sticky; top: 0; z-index: 100;
        }
        .nav-logo {
          font-size: 1.6rem; font-weight: 900; letter-spacing: -1px;
          text-decoration: none; color: #0F0F0F;
        }
        .nav-logo span { color: #FF6B9D; }
        .nav-links { display: flex; gap: 12px; }
        .nav-link {
          font-size: 0.85rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.08em; text-decoration: none; color: #0F0F0F;
          padding: 8px 16px; border: 3px solid transparent;
          transition: border-color 0.15s;
        }
        .nav-link:hover { border-color: #0F0F0F; }
        .nav-cta {
          font-size: 0.85rem; font-weight: 900; text-transform: uppercase;
          letter-spacing: 0.08em; text-decoration: none; color: #fff;
          background: #FF6B9D; padding: 10px 20px; border: 3px solid #0F0F0F;
          box-shadow: 4px 4px 0 #0F0F0F; transition: transform 0.12s, box-shadow 0.12s;
        }
        .nav-cta:hover { transform: translate(-2px,-2px); box-shadow: 6px 6px 0 #0F0F0F; }

        /* HERO */
        .hero {
          padding: 80px 40px 60px;
          display: flex; flex-direction: column; align-items: center;
          text-align: center; position: relative; overflow: hidden;
        }
        .hero-badge {
          display: inline-flex; align-items: center; gap: 8px;
          font-size: 0.75rem; font-weight: 900; text-transform: uppercase;
          letter-spacing: 0.12em; padding: 8px 20px;
          border: 3px solid #0F0F0F; background: #FFD93D;
          box-shadow: 4px 4px 0 #0F0F0F; margin-bottom: 32px;
        }
        .hero-badge::before { content: '●'; color: #6BCF7F; font-size: 10px; }
        .hero-title {
          font-size: clamp(4rem, 12vw, 8rem); font-weight: 900;
          text-transform: uppercase; letter-spacing: -4px; line-height: 0.9;
          margin-bottom: 24px;
        }
        .hero-title .pink { color: #FF6B9D; }
        .hero-title .arc {
          display: inline-block;
          text-shadow: 8px 8px 0 #0F0F0F;
        }
        .hero-sub {
          font-size: clamp(1rem, 2.5vw, 1.35rem); font-weight: 600; color: #4B5563;
          max-width: 560px; line-height: 1.5; margin-bottom: 48px;
        }
        .hero-sub strong { color: #0F0F0F; }
        .hero-cta-row {
          display: flex; gap: 16px; flex-wrap: wrap; justify-content: center;
          margin-bottom: 64px;
        }
        .btn-primary {
          font-size: 1rem; font-weight: 900; text-transform: uppercase;
          letter-spacing: 0.05em; text-decoration: none; color: #0F0F0F;
          background: #FFD93D; padding: 16px 36px; border: 4px solid #0F0F0F;
          box-shadow: 6px 6px 0 #0F0F0F; transition: transform 0.12s, box-shadow 0.12s;
          cursor: pointer;
        }
        .btn-primary:hover { transform: translate(-3px,-3px); box-shadow: 9px 9px 0 #0F0F0F; }
        .btn-ghost {
          font-size: 1rem; font-weight: 900; text-transform: uppercase;
          letter-spacing: 0.05em; text-decoration: none; color: #0F0F0F;
          background: transparent; padding: 16px 36px; border: 4px solid #0F0F0F;
          box-shadow: 6px 6px 0 #0F0F0F; transition: transform 0.12s, box-shadow 0.12s;
        }
        .btn-ghost:hover { transform: translate(-3px,-3px); box-shadow: 9px 9px 0 #0F0F0F; background: #E0E7FF; }

        /* STATS BAR */
        .stats {
          display: flex; flex-wrap: wrap; justify-content: center;
          border-top: 4px solid #0F0F0F; border-bottom: 4px solid #0F0F0F;
          background: #0F0F0F;
        }
        .stat {
          flex: 1 1 140px; padding: 28px 20px; text-align: center;
          border-right: 2px solid #333;
        }
        .stat:last-child { border-right: none; }
        .stat-val { font-size: 2.4rem; font-weight: 900; color: #FFD93D; line-height: 1; margin-bottom: 6px; }
        .stat-lbl { font-size: 0.75rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.1em; color: #aaa; }

        /* SECTION HEADER */
        .section { padding: 80px 40px; max-width: 1100px; margin: 0 auto; }
        .section-tag {
          display: inline-block; font-size: 0.7rem; font-weight: 900;
          text-transform: uppercase; letter-spacing: 0.15em; padding: 6px 14px;
          border: 3px solid #0F0F0F; background: #6BCDCF;
          box-shadow: 3px 3px 0 #0F0F0F; margin-bottom: 20px;
        }
        .section-title {
          font-size: clamp(2rem, 5vw, 3.2rem); font-weight: 900;
          text-transform: uppercase; letter-spacing: -2px; line-height: 1;
          margin-bottom: 16px;
        }
        .section-sub { font-size: 1rem; font-weight: 500; color: #4B5563;
          max-width: 480px; line-height: 1.6; margin-bottom: 56px; }

        /* CHAIN CARDS */
        .chains { display: flex; flex-wrap: wrap; gap: 24px; }
        .chain-card {
          flex: 1 1 280px; border: 5px solid #0F0F0F;
          box-shadow: 8px 8px 0 #0F0F0F; background: #fff;
          text-decoration: none; color: #0F0F0F;
          display: flex; flex-direction: column;
          transition: transform 0.12s, box-shadow 0.12s; overflow: hidden;
        }
        .chain-card:hover { transform: translate(-4px,-4px); box-shadow: 12px 12px 0 #0F0F0F; }
        .chain-card-top { padding: 28px 28px 20px; }
        .chain-card-accent { height: 8px; }
        .chain-emoji { font-size: 2.4rem; margin-bottom: 16px; display: block; }
        .chain-name { font-size: 2rem; font-weight: 900; text-transform: uppercase;
          letter-spacing: -1px; margin-bottom: 8px; }
        .chain-desc { font-size: 0.9rem; font-weight: 500; color: #4B5563;
          line-height: 1.5; margin-bottom: 20px; }
        .chain-tokens { display: flex; gap: 8px; flex-wrap: wrap; }
        .chain-token {
          font-size: 0.72rem; font-weight: 900; text-transform: uppercase;
          letter-spacing: 0.1em; padding: 5px 12px;
          border: 3px solid #0F0F0F;
        }
        .chain-launch {
          margin-top: auto; padding: 20px 28px;
          border-top: 4px solid #0F0F0F;
          font-size: 0.85rem; font-weight: 900; text-transform: uppercase;
          letter-spacing: 0.08em; display: flex; align-items: center;
          justify-content: space-between;
        }

        /* HOW IT WORKS */
        .steps { display: flex; flex-direction: column; gap: 0; }
        .step {
          display: flex; gap: 40px; align-items: flex-start;
          padding: 40px 0; border-bottom: 3px solid #0F0F0F;
        }
        .step:first-child { border-top: 3px solid #0F0F0F; }
        .step-num {
          font-size: 4rem; font-weight: 900; color: #FF6B9D;
          line-height: 1; min-width: 80px; letter-spacing: -2px;
          text-shadow: 4px 4px 0 #0F0F0F;
        }
        .step-body { flex: 1; padding-top: 8px; }
        .step-title { font-size: 1.4rem; font-weight: 900; text-transform: uppercase;
          letter-spacing: -0.5px; margin-bottom: 10px; }
        .step-text { font-size: 0.95rem; font-weight: 500; color: #4B5563; line-height: 1.6; }

        /* GAME GRID */
        .games { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
        .game-card {
          border: 4px solid #0F0F0F; background: #fff;
          box-shadow: 5px 5px 0 #0F0F0F; padding: 24px 20px;
          transition: transform 0.12s, box-shadow 0.12s;
        }
        .game-card:hover { transform: translate(-3px,-3px); box-shadow: 8px 8px 0 #0F0F0F; }
        .game-emoji { font-size: 2rem; margin-bottom: 12px; display: block; }
        .game-label { font-size: 1rem; font-weight: 900; text-transform: uppercase;
          letter-spacing: -0.3px; margin-bottom: 6px; }
        .game-desc { font-size: 0.78rem; font-weight: 500; color: #6B7280; line-height: 1.4; }

        /* PROVABLY FAIR STRIP */
        .fair {
          background: #0F0F0F; color: #fff; padding: 56px 40px;
          text-align: center; border-top: 4px solid #0F0F0F;
          border-bottom: 4px solid #0F0F0F;
        }
        .fair-title { font-size: clamp(1.6rem, 4vw, 2.4rem); font-weight: 900;
          text-transform: uppercase; letter-spacing: -1px; margin-bottom: 16px; }
        .fair-title span { color: #FFD93D; }
        .fair-body { font-size: 0.95rem; font-weight: 500; color: #9CA3AF;
          max-width: 560px; margin: 0 auto 40px; line-height: 1.7; }
        .fair-pills { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
        .fair-pill {
          font-size: 0.75rem; font-weight: 900; text-transform: uppercase;
          letter-spacing: 0.1em; padding: 10px 20px;
          border: 3px solid #fff; color: #fff;
          background: transparent;
        }

        /* FOOTER */
        .footer {
          padding: 40px; border-top: 4px solid #0F0F0F;
          display: flex; flex-wrap: wrap; align-items: center;
          justify-content: space-between; gap: 24px; background: #fff;
        }
        .footer-logo { font-size: 1.2rem; font-weight: 900; letter-spacing: -1px; color: #0F0F0F; }
        .footer-logo span { color: #FF6B9D; }
        .footer-links { display: flex; gap: 20px; flex-wrap: wrap; }
        .footer-link {
          font-size: 0.8rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.08em; color: #4B5563; text-decoration: none;
        }
        .footer-link:hover { color: #0F0F0F; }
        .footer-right { font-size: 0.75rem; font-weight: 600; color: #9CA3AF; }
        .twitter-btn {
          display: inline-flex; align-items: center; gap: 8px;
          font-size: 0.82rem; font-weight: 900; text-transform: uppercase;
          letter-spacing: 0.06em; text-decoration: none; color: #fff;
          background: #1DA1F2; padding: 10px 18px; border: 3px solid #0F0F0F;
          box-shadow: 4px 4px 0 #0F0F0F; transition: transform 0.12s, box-shadow 0.12s;
        }
        .twitter-btn:hover { transform: translate(-2px,-2px); box-shadow: 6px 6px 0 #0F0F0F; }

        /* TICKER */
        .ticker { background: #FF6B9D; border-top: 4px solid #0F0F0F; border-bottom: 4px solid #0F0F0F;
          overflow: hidden; padding: 12px 0; }
        .ticker-inner { display: flex; gap: 0; animation: scroll 30s linear infinite; width: max-content; }
        .ticker-item { font-size: 0.8rem; font-weight: 900; text-transform: uppercase;
          letter-spacing: 0.12em; color: #0F0F0F; padding: 0 32px; white-space: nowrap; }
        .ticker-item::after { content: '◆'; margin-left: 32px; }
        @keyframes scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }

        @media (max-width: 768px) {
          .nav { padding: 16px 20px; }
          .nav-links { display: none; }
          .hero { padding: 48px 20px 40px; }
          .section { padding: 56px 20px; }
          .step { flex-direction: column; gap: 12px; }
          .step-num { font-size: 2.8rem; min-width: auto; }
          .footer { padding: 28px 20px; flex-direction: column; align-items: flex-start; }
          .stats { }
          .stat { flex: 1 1 50%; }
        }
      `}</style>

      <div className="lp">

        {/* NAV */}
        <nav className="nav">
          <a href="/" className="nav-logo">ARC<span>A</span>DIA</a>
          <div className="nav-links">
            <a href="/faq" className="nav-link">FAQ</a>
            <a href="/terms" className="nav-link">Terms</a>
            <a href="https://twitter.com/arcadia_uno" target="_blank" rel="noopener noreferrer" className="nav-link">Twitter</a>
          </div>
          <a href="https://celo.arcadia.uno" className="nav-cta">Play now →</a>
        </nav>

        {/* HERO */}
        <section className="hero">
          <div className="hero-badge">Live on mainnet</div>
          <h1 className="hero-title">
            <span className="arc">The quiz</span>
            <br />
            <span className="pink">arcade</span>
            <br />
            <span className="arc">that pays</span>
          </h1>
          <p className="hero-sub">
            Answer questions. Multiply your stake. <strong>Collect on-chain — instantly.</strong>{" "}
            No house edge beyond the rake. The smarter you play, the more you earn.
          </p>
          <div className="hero-cta-row">
            <a href="#chains" className="btn-primary">Start playing →</a>
            <a href="#how" className="btn-ghost">How it works</a>
          </div>

          {/* floating game preview chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", maxWidth: 560 }}>
            {GAMES.slice(0, 6).map((g) => (
              <span key={g.label} style={{
                fontSize: "0.78rem", fontWeight: 800, textTransform: "uppercase",
                letterSpacing: "0.08em", padding: "8px 16px",
                border: "3px solid #0F0F0F", background: "#fff",
                boxShadow: "3px 3px 0 #0F0F0F",
              }}>
                {g.emoji} {g.label}
              </span>
            ))}
            <span style={{
              fontSize: "0.78rem", fontWeight: 800, textTransform: "uppercase",
              letterSpacing: "0.08em", padding: "8px 16px",
              border: "3px solid #0F0F0F", background: "#FFD93D",
              boxShadow: "3px 3px 0 #0F0F0F",
            }}>
              +6 more
            </span>
          </div>
        </section>

        {/* TICKER */}
        <div className="ticker">
          <div className="ticker-inner">
            {["Trivia", "Geography", "Movies", "Logos", "Riddles", "Emoji", "Math", "Capitals",
              "True/False", "Odd One Out", "Landmarks", "Word Games",
              "Trivia", "Geography", "Movies", "Logos", "Riddles", "Emoji", "Math", "Capitals",
              "True/False", "Odd One Out", "Landmarks", "Word Games",
            ].map((item, i) => (
              <span key={i} className="ticker-item">{item}</span>
            ))}
          </div>
        </div>

        {/* STATS */}
        <div className="stats">
          {STATS.map(({ value, label }) => (
            <div key={label} className="stat">
              <div className="stat-val">{value}</div>
              <div className="stat-lbl">{label}</div>
            </div>
          ))}
        </div>

        {/* CHAINS */}
        <div id="chains" style={{ background: "#F5F3FF", borderBottom: "4px solid #0F0F0F" }}>
          <div className="section">
            <div className="section-tag">Multi-chain</div>
            <h2 className="section-title">Choose your chain</h2>
            <p className="section-sub">
              Each chain runs its own isolated arcade. Pick the network you already use — same games, same rules, your tokens.
            </p>
            <div className="chains">
              {CHAINS.map(({ href, label, emoji, tokens, color, textColor, desc }) => (
                <a key={label} href={href} className="chain-card">
                  <div className="chain-card-accent" style={{ background: color }} />
                  <div className="chain-card-top">
                    <span className="chain-emoji">{emoji}</span>
                    <div className="chain-name">{label}</div>
                    <div className="chain-desc">{desc}</div>
                    <div className="chain-tokens">
                      {tokens.map((t) => (
                        <span key={t} className="chain-token" style={{ background: color, color: textColor }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="chain-launch">
                    <span>Play on {label}</span>
                    <span style={{ fontSize: "1.2rem" }}>→</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* HOW IT WORKS */}
        <div style={{ background: "#fff", borderBottom: "4px solid #0F0F0F" }} id="how">
          <div className="section">
            <div className="section-tag">How it works</div>
            <h2 className="section-title">Three steps to your payout</h2>
            <p className="section-sub">No accounts, no waiting, no middlemen. Just your wallet and your knowledge.</p>
            <div className="steps">
              {STEPS.map(({ n, title, body }) => (
                <div key={n} className="step">
                  <div className="step-num">{n}</div>
                  <div className="step-body">
                    <div className="step-title">{title}</div>
                    <p className="step-text">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* GAME MODES */}
        <div style={{ background: "#F5F3FF", borderBottom: "4px solid #0F0F0F" }}>
          <div className="section">
            <div className="section-tag">Game modes</div>
            <h2 className="section-title">12 ways to win</h2>
            <p className="section-sub">Every game type has its own question bank. The harder you bet, the tougher the questions.</p>
            <div className="games">
              {GAMES.map(({ emoji, label, desc }) => (
                <div key={label} className="game-card">
                  <span className="game-emoji">{emoji}</span>
                  <div className="game-label">{label}</div>
                  <p className="game-desc">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* PROVABLY FAIR */}
        <div className="fair">
          <h2 className="fair-title">Provably <span>fair</span> &amp; transparent</h2>
          <p className="fair-body">
            Sessions are opened on-chain before any questions are served. Payouts are signed by a trusted key and settled by your wallet — no custodian holds your funds. Every game result is verifiable on-chain.
          </p>
          <div className="fair-pills">
            {["On-chain sessions", "EIP-712 signed payouts", "Non-custodial", "Open source", "No rug possible"].map((p) => (
              <span key={p} className="fair-pill">{p}</span>
            ))}
          </div>
        </div>

        {/* FOOTER */}
        <footer className="footer">
          <div className="footer-logo">ARC<span>A</span>DIA</div>
          <div className="footer-links">
            <a href="/faq" className="footer-link">FAQ</a>
            <a href="/terms" className="footer-link">Terms</a>
            <a href="https://celo.arcadia.uno" className="footer-link">Celo</a>
            <a href="https://stacks.arcadia.uno" className="footer-link">Stacks</a>
            <a href="https://base.arcadia.uno" className="footer-link">Base</a>
          </div>
          <a href="https://twitter.com/arcadia_uno" target="_blank" rel="noopener noreferrer" className="twitter-btn">
            <span>𝕏</span> @arcadia_uno
          </a>
          <div className="footer-right">© 2025 Arcadia. All rights reserved.</div>
        </footer>

      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Chain subdomain home — redirect to games flow
// ---------------------------------------------------------------------------

function ChainHome() {
  const router = useRouter();

  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem("arcadia_welcome_seen");
    if (!hasSeenWelcome) {
      router.push("/loading");
    } else {
      router.push("/games");
    }
  }, [router]);

  return null;
}

export default function HomePage() {
  if (isLanding) return <LandingHub />;
  return <ChainHome />;
}
