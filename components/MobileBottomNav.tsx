"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function MobileBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (!isMobile) return null;

  const isActive = (path: string) => {
    if (path === '/games') {
      return pathname === '/' || pathname === '/games';
    }
    return pathname === path;
  };

  return (
    <div className="mobile-bottom-nav">
      <button
        className={isActive('/games') ? 'active' : ''}
        onClick={() => router.push('/games')}
      >
        🎮
        <span>Games</span>
      </button>
      <button
        className={isActive('/leaderboard') ? 'active' : ''}
        onClick={() => router.push('/leaderboard')}
      >
        🏆
        <span>Ranks</span>
      </button>
      <button
        className={isActive('/analytics') ? 'active' : ''}
        onClick={() => router.push('/analytics')}
      >
        📊
        <span>Stats</span>
      </button>
      <button
        className={pathname.startsWith('/profile') ? 'active' : ''}
        onClick={() => router.push('/profile/0x0')}
      >
        👤
        <span>You</span>
      </button>
    </div>
  );
}
