"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoadingScreen() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Simulate loading progress
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => router.push("/welcome"), 500);
          return 100;
        }
        return prev + 2;
      });
    }, 30);

    return () => clearInterval(interval);
  }, [router]);

  return (
    <div className="loading-screen">
      <div className="loading-content">
        {/* Large monochrome illustration */}
        <div className="loading-illustration">
          <div className="arcade-icon">🎮</div>
        </div>

        {/* Brand name */}
        <h1 className="loading-title">Arcadia</h1>

        {/* Tagline */}
        <p className="loading-tagline">Stake. Play. Win.</p>

        {/* Progress bar */}
        <div className="loading-progress">
          <div className="loading-progress-bar" style={{ width: `${progress}%` }} />
        </div>

        {/* Loading text */}
        <p className="loading-text">Loading your experience...</p>
      </div>

      <style jsx>{`
        .loading-screen {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg);
          padding: 20px;
        }

        .loading-content {
          text-align: center;
          max-width: 400px;
          width: 100%;
        }

        .loading-illustration {
          margin-bottom: 40px;
          animation: float 3s ease-in-out infinite;
        }

        .arcade-icon {
          font-size: 120px;
          filter: grayscale(100%);
          opacity: 0.9;
        }

        .loading-title {
          font-size: 48px;
          font-weight: 900;
          margin-bottom: 12px;
          text-transform: uppercase;
          letter-spacing: -0.03em;
        }

        .loading-tagline {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 40px;
          opacity: 0.8;
        }

        .loading-progress {
          width: 100%;
          height: 8px;
          background: var(--bg-alt);
          border: 4px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 20px;
        }

        .loading-progress-bar {
          height: 100%;
          background: var(--accent);
          transition: width 0.3s ease;
          border-radius: 4px;
        }

        .loading-text {
          font-size: 14px;
          font-weight: 600;
          opacity: 0.6;
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }

        /* Mobile styles */
        @media (max-width: 768px) {
          .loading-screen {
            background: var(--mobile-bg);
          }

          .arcade-icon {
            font-size: 100px;
          }

          .loading-title {
            font-size: 40px;
            font-family: serif;
            color: var(--mobile-text-primary);
          }

          .loading-tagline {
            font-size: 16px;
            color: var(--mobile-text-secondary);
          }

          .loading-progress {
            background: var(--mobile-surface);
            border: 1px solid var(--mobile-border);
            border-radius: 12px;
          }

          .loading-progress-bar {
            background: var(--mobile-accent);
          }

          .loading-text {
            color: var(--mobile-text-secondary);
          }
        }
      `}</style>
    </div>
  );
}
