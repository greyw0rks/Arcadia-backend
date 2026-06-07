"use client";
import { useCallback, useEffect, useState } from "react";
import { STACKS_NETWORK_NAME } from "./contract";

function getConnect() {
  if (typeof window === "undefined") return null;
  const { AppConfig, UserSession, showConnect } = require("@stacks/connect");
  const appConfig = new AppConfig(["store_write"]);
  const userSession = new UserSession({ appConfig });
  return { userSession, showConnect };
}

function addressFromSession(userSession: any): string | null {
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
    const c = getConnect();
    if (!c) return;
    const { userSession } = c;
    if (userSession.isSignInPending()) {
      userSession.handlePendingSignIn().then(() => setAddress(addressFromSession(userSession)));
    } else {
      setAddress(addressFromSession(userSession));
    }
  }, []);

  const connect = useCallback(() => {
    const c = getConnect();
    if (!c) return;
    const { userSession, showConnect } = c;
    showConnect({
      userSession,
      appDetails: {
        name: "QuizArcade",
        icon:
          typeof window !== "undefined"
            ? `${window.location.origin}/favicon.ico`
            : "/favicon.ico",
      },
      onFinish: () => setAddress(addressFromSession(userSession)),
    });
  }, []);

  const disconnect = useCallback(() => {
    const c = getConnect();
    if (!c) return;
    c.userSession.signUserOut();
    setAddress(null);
  }, []);

  return { address, isConnected: !!address, connect, disconnect };
}
