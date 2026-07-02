"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { celoChain, baseChain, RPC_URL, BASE_RPC_URL, LOCKED_CHAIN } from "./contract";

// Pick the EVM chain for this deployment. Stacks and landing don't need an EVM chain but wagmi
// requires at least one — default to celoChain as a harmless fallback.
const evmChain = LOCKED_CHAIN === "base" ? baseChain : celoChain;
const evmRpc = LOCKED_CHAIN === "base" ? BASE_RPC_URL : RPC_URL;

export const wagmiConfig = getDefaultConfig({
  appName: "Arcadia",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "demo-project-id",
  chains: [evmChain],
  transports: { [evmChain.id]: http(evmRpc) },
  ssr: true,
});
