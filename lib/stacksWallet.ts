"use client";

import { useCallback, useEffect, useState } from "react";
import { AppConfig, UserSession, showConnect } from "@stacks/connect";
import { STACKS_NETWORK_NAME } from "./contract";

// A single shared UserSession (Leather / Xverse via Stacks Connect). `store_write` lets us request
// contract-call signatures; we don't store any Gaia data.
const appConfig = new AppConfig(["store_write"]);
export const userSession = new UserSession({ appConfig });

function addressFromSession(): string | null {
  if (!userSession.isUserSignedIn()) return null;
  const data = userSession.loadUserData();
  return STACKS_NETWORK_NAME === "mainnet"
    ? data.profile.stxAddress.mainnet
    : data.profile.stxAddress.testnet;
}

export interface StacksWallet {
  address: string | null;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
}

export function useStacksWallet(): StacksWallet {
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    if (userSession.isSignInPending()) {
      userSession.handlePendingSignIn().then(() => setAddress(addressFromSession()));
    } else {
      setAddress(addressFromSession());
    }
  }, []);

  const connect = useCallback(() => {
    showConnect({
      userSession,
      appDetails: {
        name: "QuizArcade",
        icon:
          typeof window !== "undefined" ? `${window.location.origin}/favicon.ico` : "/favicon.ico",
      },
      onFinish: () => setAddress(addressFromSession()),
    });
  }, []);

  const disconnect = useCallback(() => {
    userSession.signUserOut();
    setAddress(null);
  }, []);

  return { address, isConnected: !!address, connect, disconnect };
}
