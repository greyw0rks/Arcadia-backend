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
      answer: "Arcadia is an on-chain arcade where you stake USDm, USDC, or USDT on Celo on skill-based games. Each game is one round of 12 questions — answer enough correctly to win a higher payout. It's like a quiz show where you bet on yourself!",
    },
    {
      question: "How does the multiplier work?",
      answer: "Each game is one round of 12 questions. Answer 9 or more correctly and you win — 1.1x at 9, rising +0.1x for every extra correct up to 1.4x for a perfect 12. Get 4 or fewer and you lose — 0.9x at 4, dropping 0.1x for every further miss down to 0.5x at zero. Anything in between (5–8) holds at 1.0x. Your final payout is: stake × multiplier × 0.97 (after 3% rake).",
    },
    {
      question: "Can I lose money?",
      answer: "Yes! If you get 4 or fewer of the 12 questions right, the round settles at 0.9x. For example, staking 1 USDm and landing in the loss zone returns 0.873 USDm (1 × 0.97 × 0.9). That downside is what makes winning mean something!",
    },
    {
      question: "Is there a minimum or maximum bet?",
      answer: "Yes. Bets range from $0.10 to $1 per game. The $1 maximum is enforced on-chain so no session can ever stake more, and the $0.10 minimum keeps every game meaningful.",
    },
    {
      question: "Does the bet size change the game?",
      answer: "Every game is a fixed 12 questions with the same 9-to-win pass mark, no matter what you bet. Your bet sets how much is at stake and keeps the questions hard — a bigger bet raises your payout, not the number of questions or the odds.",
    },
    {
      question: "What is the 3% rake?",
      answer: "A 3% entry fee is taken from your stake to fund the house treasury. This ensures the house can always pay out winners. If you stake 1 USDm, 0.97 USDm goes into play. This is standard for gaming platforms.",
    },
    {
      question: "What happens if the game crashes?",
      answer: "Your funds are safe! If a game fails before settlement, you can request a refund after 1 hour. The smart contract has a cancelExpired() function that returns your stake (minus the 3% rake). This protects you from backend failures.",
    },
    {
      question: "How do I get USDm, USDC or USDT on Celo?",
      answer: "USDm (Mento's cUSD), USDC, and USDT are all available on Celo at ~$1 each. You can get them by: 1) Buying CELO on an exchange and swapping via Mento or Uniswap V3 on Celo, 2) Using a Deposit service like MoonPay or Transak, or 3) Bridging from another chain via the Celo native bridge.",
    },
    {
      question: "Which games are available?",
      answer: "We have 13 games: Trivia Rush, GeoGuess, True/False Blitz, Odd One Out, Emoji Puzzle, Riddle Me This, Capital Quiz, Math Sprint, Name That Landmark, Logo Quiz, Movie Stills, and Hex Match, with Letter League coming soon. More on the way!",
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
      answer: "Between 6 seconds and 3 seconds per question, depending on the game and how much you bet — a bigger bet shortens the clock. If time runs out it counts as a wrong answer, which costs you one of the 9 correct you need to win. Stay focused!",
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
      answer: "Arcadia runs on Celo — an OP Stack L2 with ~1-second blocks and ultra-low fees (~$0.0005 per tx). You stake USDm, USDC, or USDT. No ETH needed — you can pay network fees in stablecoins directly.",
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
          <div className="brand" style={{ cursor: "pointer" }} onClick={() => router.push("/")}>
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
          <button className="btn" onClick={() => router.push("/")}>
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
