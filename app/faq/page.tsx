"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function FAQPage() {
  const router = useRouter();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      question: "What is Arcadia?",
      answer: "Arcadia is an on-chain arcade where you stake cUSD (Celo USD) on skill-based games. Your payout depends on your performance - get questions right to increase your multiplier, get them wrong and it decreases. It's like a quiz show where you bet on yourself!",
    },
    {
      question: "How does the multiplier work?",
      answer: "Every game starts at 1.0x. For each correct answer, you gain +0.1x. For each wrong answer or timeout, you lose -0.1x. The multiplier can go below 1.0x, meaning you can lose money! Your final payout is: stake × multiplier × 0.97 (after 3% rake).",
    },
    {
      question: "Can I lose money?",
      answer: "Yes! The multiplier can drop below 1.0x if you get too many questions wrong. For example, if you stake 1 cUSD and end at 0.8x, you'll only get back 0.78 cUSD (1 × 0.97 × 0.8). This is what makes it exciting - you're betting on your skills!",
    },
    {
      question: "Is there a maximum bet?",
      answer: "Yes. The maximum bet is $1 per game (1 cUSD on Celo, or 1 STX on Stacks). The cap is enforced on-chain, so no session can ever stake more.",
    },
    {
      question: "Does the bet size change the difficulty?",
      answer: "Yes. The higher your bet, the harder the session: you get fewer seconds per question, tougher questions, and more rounds. A small bet is a short, gentle session; a max bet is a longer, faster, harder one with more upside.",
    },
    {
      question: "What is the 3% rake?",
      answer: "A 3% entry fee is taken from your stake to fund the house treasury. This ensures the house can always pay out winners. If you stake 1 cUSD, 0.97 cUSD goes into play. This is standard for gaming platforms.",
    },
    {
      question: "What happens if the game crashes?",
      answer: "Your funds are safe! If a game fails before settlement, you can request a refund after 1 hour. The smart contract has a cancelExpired() function that returns your stake (minus the 3% rake). This protects you from backend failures.",
    },
    {
      question: "How do I get cUSD?",
      answer: "cUSD is Celo's stablecoin (1 cUSD = $1 USD). You can get it by: 1) Buying CELO on an exchange and swapping for cUSD, 2) Using a fiat on-ramp like MoonPay, or 3) Bridging from another chain.",
    },
    {
      question: "Which games are available?",
      answer: "We have 13 games: Trivia Rush, Letter League, GeoGuess, True/False Blitz, Odd One Out, Emoji Puzzle, Riddle Me This, Capital Quiz, Math Sprint, Name That Landmark, Logo Quiz, Movie Stills, and Hex Match. More coming soon!",
    },
    {
      question: "Is this gambling?",
      answer: "Arcadia is skill-based, not luck-based. Your performance directly determines your payout. However, regulations vary by jurisdiction. We recommend checking your local laws. Bets are capped at $1 per game.",
    },
    {
      question: "Is Arcadia open source? Can I copy it?",
      answer: "No. Arcadia is proprietary software. The source code, game mechanics, question banks, scoring engine, and all creative works are copyright © greyw0rks. Copying, cloning, forking for deployment, or building competing products based on Arcadia's design is strictly prohibited. See our Terms & IP page for full details.",
    },
    {
      question: "How long do I have to answer?",
      answer: "Most games give you 15-20 seconds per question. If time runs out, it counts as a wrong answer and you lose 0.1x from your multiplier. Stay focused!",
    },
    {
      question: "Can I play on mobile?",
      answer: "Yes! Arcadia is fully responsive and works great on mobile devices. The 2-column grid layout makes it easy to browse games on your phone.",
    },
    {
      question: "Is my wallet safe?",
      answer: "Yes. We use RainbowKit for secure wallet connections. You always control your funds - we never have access to your private keys. All transactions require your approval.",
    },
    {
      question: "What blockchain is this on?",
      answer: "Arcadia runs on two mainnets: Celo (stake cUSD) and Stacks (stake STX). Both are low-fee, fast networks — pick whichever you prefer with the in-app chain switcher.",
    },
    {
      question: "How are answers verified?",
      answer: "Answers are scored server-side by a trusted backend signer. The correct answer never reaches your browser, preventing cheating. The backend signs your final multiplier, which the smart contract verifies before payout.",
    },
    {
      question: "What if I disconnect during a game?",
      answer: "Your session is saved on-chain. If you disconnect, you can't continue that specific game, but after 1 hour you can request a refund. Always try to complete games in one session!",
    },
    {
      question: "Can I play multiple games at once?",
      answer: "No, you can only play one game at a time per wallet. Finish your current game before starting another.",
    },
    {
      question: "How do I withdraw my winnings?",
      answer: "Winnings are automatically sent to your wallet when you complete a game and settle on-chain. No withdrawal needed - it's instant!",
    },
  ];

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
          Frequently Asked Questions
        </h1>
        <p className="muted" style={{ textAlign: "center", fontSize: "18px", marginBottom: 40 }}>
          Everything you need to know about Arcadia
        </p>

        <div style={{ maxWidth: "800px", margin: "0 auto" }}>
          {faqs.map((faq, index) => (
            <div
              key={index}
              style={{
                marginBottom: "16px",
                border: "5px solid var(--border)",
                background: openIndex === index ? "var(--bg-alt)" : "var(--card)",
                transition: "all 0.2s",
              }}
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                style={{
                  width: "100%",
                  padding: "20px 24px",
                  background: "transparent",
                  border: "none",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "18px",
                  fontWeight: 900,
                  color: "var(--text)",
                }}
              >
                <span>{faq.question}</span>
                <span style={{ fontSize: "24px", fontWeight: 900 }}>
                  {openIndex === index ? "−" : "+"}
                </span>
              </button>
              {openIndex === index && (
                <div
                  style={{
                    padding: "0 24px 20px 24px",
                    fontSize: "16px",
                    lineHeight: 1.6,
                    borderTop: "3px solid var(--border)",
                    paddingTop: "20px",
                  }}
                >
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 48 }}>
          <button className="btn" onClick={() => router.push("/games")}>
            Back to Games
          </button>
        </div>
      </div>
    </div>
  );
}
