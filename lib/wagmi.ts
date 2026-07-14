"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { celoChain, RPC_URL } from "./contract";

export const wagmiConfig = getDefaultConfig({
  appName: "Arcadia",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "demo-project-id",
  chains: [celoChain],
  transports: { [celoChain.id]: http(RPC_URL) },
  ssr: true,
});
