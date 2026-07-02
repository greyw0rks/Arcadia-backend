"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LOCKED_CHAIN } from "../lib/contract";

// When this deployment is a chain subdomain, redirect to the games flow as before.
// When it's the landing page (NEXT_PUBLIC_CHAIN=landing or unset), show the hub.
const isLanding = !LOCKED_CHAIN || LOCKED_CHAIN === "landing";

const CHAIN_LINKS = [
  {
    href: "https://celo.arcadia.uno",
    label: "Celo",
    tokens: "USDM · USDC · USDT",
    color: "#FCFF52",
  },
  {
    href: "https://base.arcadia.uno",
    label: "Base",
    tokens: "USDC",
    color: "#0052FF",
  },
  {
    href: "https://stacks.arcadia.uno",
    label: "Stacks",
    tokens: "STX",
    color: "#FF5500",
  },
];

function LandingHub() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
        fontFamily: "inherit",
      }}
    >
      <h1
        style={{
          color: "#fff",
          fontSize: "clamp(2rem, 6vw, 4rem)",
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "-2px",
          margin: "0 0 12px",
        }}
      >
        Arcadia
      </h1>
      <p
        style={{
          color: "#aaa",
          fontSize: "1.1rem",
          margin: "0 0 48px",
          textAlign: "center",
        }}
      >
        Choose your chain to start playing
      </p>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 20,
          justifyContent: "center",
          maxWidth: 720,
        }}
      >
        {CHAIN_LINKS.map(({ href, label, tokens, color }) => (
          <a
            key={label}
            href={href}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: "28px 36px",
              border: "3px solid #fff",
              background: "#111",
              color: "#fff",
              textDecoration: "none",
              minWidth: 180,
              flex: "1 1 160px",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = "#1a1a1a";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = "#111";
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: color,
              }}
            />
            <span style={{ fontSize: "1.5rem", fontWeight: 900 }}>{label}</span>
            <span style={{ color: "#888", fontSize: "0.85rem" }}>{tokens}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

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
