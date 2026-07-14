"use client";

import { useState } from "react";

interface TutorialModalProps {
  onClose: () => void;
}

export function TutorialModal({ onClose }: TutorialModalProps) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "Welcome to Arcadia! 🎮",
      content: "Arcadia is an on-chain arcade where you stake stablecoins and play skill-based games. Your payout depends on your performance!",
    },
    {
      title: "How It Works 💰",
      content: "Every game starts at 1.0x multiplier. Get a question right? +0.1x. Get it wrong? -0.1x. Your final payout = stake × multiplier.",
    },
    {
      title: "You Can Lose Money! ⚠️",
      content: "The multiplier can go below 1.0x! If you get too many wrong, you'll lose part of your stake. Play carefully!",
    },
    {
      title: "Entry Fee 💸",
      content: "There's a 3% rake on your stake. So if you stake 10 USDm, 9.7 USDm goes into play. This funds the house treasury.",
    },
    {
      title: "Refund Protection 🛡️",
      content: "If the game crashes or fails, you can request a refund after 1 hour. Your stake is always safe on-chain!",
    },
    {
      title: "Ready to Play? 🚀",
      content: "Connect your wallet, choose a game, stake some stablecoins, and test your skills. Good luck!",
    },
  ];

  const currentStep = steps[step];
  const isLastStep = step === steps.length - 1;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(15, 15, 15, 0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        className="panel"
        style={{
          maxWidth: "600px",
          width: "100%",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "20px",
            right: "20px",
            background: "transparent",
            border: "none",
            fontSize: "24px",
            cursor: "pointer",
            padding: "8px",
            lineHeight: 1,
          }}
        >
          ✕
        </button>

        <h2 style={{ marginTop: 0, fontSize: "28px" }}>{currentStep.title}</h2>
        <p style={{ fontSize: "18px", lineHeight: 1.6, marginBottom: "32px" }}>
          {currentStep.content}
        </p>

        <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginBottom: "20px" }}>
          {steps.map((_, i) => (
            <div
              key={i}
              style={{
                width: "12px",
                height: "12px",
                background: i === step ? "var(--accent)" : "var(--bg-alt)",
                border: "3px solid var(--border)",
                transform: i === step ? "scale(1.3)" : "scale(1)",
                transition: "all 0.3s",
              }}
            />
          ))}
        </div>

        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          {step > 0 && (
            <button className="btn ghost" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button
            className="btn"
            onClick={() => {
              if (isLastStep) {
                onClose();
              } else {
                setStep(step + 1);
              }
            }}
          >
            {isLastStep ? "Let's Play!" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
