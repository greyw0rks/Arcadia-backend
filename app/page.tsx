"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Check if user has seen welcome before
    const hasSeenWelcome = localStorage.getItem('arcadia_welcome_seen');

    if (!hasSeenWelcome) {
      // First time user - show loading then welcome
      router.push('/loading');
    } else {
      // Returning user - go straight to games
      router.push('/games');
    }
  }, [router]);

  // Show nothing while redirecting
  return null;
}
