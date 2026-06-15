"use client";

import { useRouter } from "next/navigation";
import { ConnectControl } from "./ConnectControl";

export function Header() {
  const router = useRouter();

  return (
    <div className="topbar">
      <button className="btn" onClick={() => router.push("/games")}>
        ← Back to Lobby
      </button>
      <div
        className="brand"
        style={{ cursor: "pointer" }}
        onClick={() => router.push("/games")}
      >
        Arcadia
      </div>
      <ConnectControl />
    </div>
  );
}