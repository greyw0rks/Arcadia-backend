"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useChain } from "../lib/chainContext";
import { useStacksWallet } from "../lib/stacksWallet";

export function MobileBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);
  const { chain } = useChain();
  const evm = useAccount();
  const stx = useStacksWallet();

  const address = chain === "stacks" ? stx.address : evm.address;

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (!isMobile) return null;

  const isActive = (path: string) => {
    if (path === '/games') return pathname === '/' || pathname === '/games';
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
        className={pathname.startsWith('/profile') ? 'active' : ''}
        onClick={() => address ? router.push(`/profile/${address}`) : router.push('/games')}
      >
        👤
        <span>You</span>
      </button>
    </div>
  );
}
