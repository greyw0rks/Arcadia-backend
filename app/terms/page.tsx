"use client";

import { useRouter } from "next/navigation";

const YEAR = new Date().getFullYear();

export default function TermsPage() {
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
          Terms of Use &amp; Intellectual Property
        </h1>
        <p className="muted" style={{ textAlign: "center", marginBottom: 40 }}>
          Last updated {YEAR} &mdash; greyw0rks
        </p>

        <section style={{ marginBottom: 40 }}>
          <h2>1. Copyright Notice</h2>
          <p>
            Copyright &copy; 2024&ndash;{YEAR} <strong>greyw0rks</strong>. All rights reserved.
          </p>
          <p>
            Arcadia — including its source code, game mechanics, multiplier system, question
            banks, difficulty engine, smart contract interfaces, UI/UX design, branding, and all
            associated creative works — is the exclusive intellectual property of greyw0rks and
            is protected by applicable copyright law.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2>2. Permitted Use</h2>
          <p>You are permitted to:</p>
          <ul style={{ lineHeight: 2 }}>
            <li>Access and play Arcadia for personal, non-commercial enjoyment.</li>
            <li>Share links to Arcadia on social media or with friends.</li>
            <li>View source code hosted publicly for personal reference only.</li>
          </ul>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2>3. Prohibited Actions</h2>
          <p>
            The following are <strong>strictly prohibited</strong> without prior written
            permission from greyw0rks:
          </p>
          <ul style={{ lineHeight: 2 }}>
            <li>
              <strong>Copying or cloning</strong> — reproducing the Software, game mechanics,
              question content, or scoring logic in whole or in part.
            </li>
            <li>
              <strong>Forking for deployment</strong> — deploying a fork or derivative of
              Arcadia as a live product, whether commercially or otherwise.
            </li>
            <li>
              <strong>Redistribution</strong> — distributing, sublicensing, or selling the
              Software or any substantial portion of it.
            </li>
            <li>
              <strong>Competing products</strong> — using Arcadia&apos;s distinctive mechanics
              (stake-to-multiplier system, session architecture, difficulty engine) to build a
              competing on-chain gaming platform.
            </li>
            <li>
              <strong>Content scraping</strong> — bulk-downloading question banks, game data,
              leaderboard data, or any other platform content via automated means.
            </li>
            <li>
              <strong>Brand misuse</strong> — using the name &ldquo;Arcadia&rdquo;, the
              greyw0rks brand, or associated logos in any derivative work or competing product.
            </li>
            <li>
              <strong>Contract exploitation</strong> — reverse-engineering the settlement or
              signing logic for the purpose of manipulating on-chain payouts.
            </li>
            <li>
              <strong>Removing notices</strong> — altering, hiding, or removing copyright
              notices or proprietary markings from any part of the Software.
            </li>
          </ul>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2>4. Gameplay &amp; Financial Terms</h2>
          <ul style={{ lineHeight: 2 }}>
            <li>
              Arcadia is a <strong>skill-based</strong> gaming platform. Your payout is
              determined by your performance, not chance.
            </li>
            <li>
              A <strong>3% rake</strong> is deducted from every stake to fund the house
              treasury and ensure payouts to winners.
            </li>
            <li>
              Maximum bet is <strong>$1 per game</strong> (1 cUSD on Celo, 1 STX on Stacks),
              enforced on-chain.
            </li>
            <li>
              Your multiplier can fall <strong>below 1.0x</strong>, meaning you may receive
              back less than you staked. Only stake what you can afford to lose.
            </li>
            <li>
              Regulations on skill-based wagering vary by jurisdiction. You are solely
              responsible for compliance with local laws.
            </li>
          </ul>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2>5. Disclaimer of Warranties</h2>
          <p>
            Arcadia is provided &ldquo;as is&rdquo; without warranty of any kind, express or
            implied. greyw0rks makes no guarantees of uptime, correctness of question content,
            or continuity of the platform. Use at your own risk.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2>6. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, greyw0rks shall not be liable for any
            direct, indirect, incidental, special, or consequential damages arising from use
            of, or inability to use, the platform — including loss of staked funds due to
            smart contract failure, network issues, or backend outages.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2>7. Enforcement</h2>
          <p>
            Unauthorised use of Arcadia&apos;s intellectual property constitutes copyright
            infringement and may result in civil and/or criminal liability. greyw0rks reserves
            the right to pursue all available legal remedies against infringers.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2>8. Contact</h2>
          <p>
            For licensing, partnership, or legal inquiries, reach out via Twitter at{" "}
            <a
              href="https://twitter.com/arcadia_uno"
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "underline" }}
            >
              @arcadia_uno
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
            &copy; 2024&ndash;{YEAR} greyw0rks. All rights reserved. Arcadia is a proprietary
            product. Copying, cloning, or redistribution without written permission is strictly
            prohibited.
          </p>
          <button
            className="btn"
            onClick={() => router.push("/")}
            style={{ marginTop: 16 }}
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
