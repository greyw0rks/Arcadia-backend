"use client";

import { useRouter } from "next/navigation";

const YEAR = new Date().getFullYear();

export default function PrivacyPage() {
  const router = useRouter();

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
          <div
            className="brand"
            style={{ cursor: "pointer" }}
            onClick={() => router.push("/")}
          >
            Arcadia
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 32, maxWidth: 800, margin: "32px auto" }}>
        <h1 style={{ marginTop: 0, fontSize: "40px", textAlign: "center" }}>
          Privacy Policy
        </h1>
        <p className="muted" style={{ textAlign: "center", marginBottom: 40 }}>
          Last updated {YEAR} &mdash; greyw0rks
        </p>

        <section style={{ marginBottom: 40 }}>
          <h2>1. What We Collect</h2>
          <p>Arcadia collects only what is necessary to operate the platform:</p>
          <ul style={{ lineHeight: 2 }}>
            <li>
              <strong>Wallet address</strong> — provided by your wallet when you connect. Used to
              identify your session, track gameplay stats, and display your profile.
            </li>
            <li>
              <strong>Username and avatar</strong> — optional display name and emoji you choose in
              your profile. Stored server-side and visible to other players on the leaderboard.
            </li>
            <li>
              <strong>Gameplay data</strong> — stake amounts, multipliers, payouts, and game
              outcomes. This data is also recorded on the Celo blockchain and is inherently public.
            </li>
          </ul>
          <p>
            We do <strong>not</strong> collect email addresses, phone numbers, government IDs, or
            any other personal identifiers.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2>2. How We Use Your Data</h2>
          <ul style={{ lineHeight: 2 }}>
            <li>To operate game sessions and calculate payouts.</li>
            <li>To display your profile, stats, and leaderboard position.</li>
            <li>To show platform-wide aggregate statistics (total volume, active users).</li>
            <li>To detect and prevent abuse or manipulation of the game system.</li>
          </ul>
          <p>We do not sell your data to third parties. We do not use your data for advertising.</p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2>3. On-Chain Data</h2>
          <p>
            All staking and settlement transactions are recorded on the{" "}
            <strong>Celo blockchain</strong>. Blockchain data is permanent and publicly visible to
            anyone. Arcadia cannot delete or modify on-chain records. By interacting with Arcadia&apos;s
            smart contracts, you accept that your wallet address and transaction history are public.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2>4. Data Storage and Retention</h2>
          <p>
            Off-chain data (username, avatar, session state) is stored in-memory on our servers and
            may be cleared on deployment. Game history is reconstructed from on-chain events on
            restart. We do not operate a persistent database of personal data beyond what is
            derivable from the blockchain.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2>5. Third-Party Services</h2>
          <ul style={{ lineHeight: 2 }}>
            <li>
              <strong>Celo blockchain</strong> — all on-chain transactions are processed by the
              Celo network. See{" "}
              <a
                href="https://celo.org/privacy"
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "underline" }}
              >
                celo.org/privacy
              </a>
              .
            </li>
            <li>
              <strong>Vercel</strong> — hosting provider. May collect standard access logs (IP
              address, user agent, request path). See{" "}
              <a
                href="https://vercel.com/legal/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "underline" }}
              >
                vercel.com/legal/privacy-policy
              </a>
              .
            </li>
          </ul>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2>6. Cookies and Tracking</h2>
          <p>
            Arcadia does not use advertising cookies or third-party trackers. LocalStorage is used
            solely to remember your token preference and tutorial completion state. No cross-site
            tracking occurs.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2>7. Your Rights</h2>
          <p>
            You may request deletion of your off-chain profile data (username, avatar, off-chain
            game history) at any time by contacting us. On-chain data cannot be deleted as it is
            part of a public, immutable blockchain.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2>8. Contact</h2>
          <p>
            For privacy questions or data deletion requests, email{" "}
            <a
              href="mailto:play@arcadia.uno"
              style={{ textDecoration: "underline" }}
            >
              play@arcadia.uno
            </a>
            .
          </p>
        </section>

        <div
          style={{
            borderTop: "3px solid var(--border)",
            paddingTop: 24,
            textAlign: "center",
          }}
        >
          <p className="muted" style={{ fontSize: 13 }}>
            &copy; 2024&ndash;{YEAR} greyw0rks. All rights reserved.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 16 }}>
            <button className="btn ghost" onClick={() => router.push("/terms")}>
              Terms of Use
            </button>
            <button className="btn" onClick={() => router.push("/")}>
              Back to Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
