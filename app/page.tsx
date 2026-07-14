"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

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
  return <ChainHome />;
}
