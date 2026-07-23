"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createWalletClient, custom, type Address, type WalletClient } from "viem";
import { sepolia, ensureSepolia, type EthereumProvider } from "@/lib/chain";
import { deskLabels } from "@/lib/config";
import { getHandleClient, type HandleClient } from "@/lib/nox";

type WalletState = {
  address: Address | null;
  label: string | null;
  chainId: number | null;
  wallet: WalletClient | null;
  connecting: boolean;
  error: string | null;
  hasProvider: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  nox: () => Promise<HandleClient>;
};

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasProvider, setHasProvider] = useState(false);

  useEffect(() => {
    setHasProvider(typeof window !== "undefined" && Boolean(window.ethereum));
  }, []);

  const wallet = useMemo(() => {
    if (typeof window === "undefined" || !window.ethereum || !address) return null;
    return createWalletClient({
      account: address,
      chain: sepolia,
      transport: custom(window.ethereum as EthereumProvider),
    });
  }, [address]);

  const connect = useCallback(async () => {
    const provider = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!provider) {
      setError("No injected wallet found. Install MetaMask or another EIP-1193 wallet.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as Address[];
      await ensureSepolia(provider);
      const id = (await provider.request({ method: "eth_chainId" })) as string;
      setAddress(accounts[0] ?? null);
      setChainId(Number.parseInt(id, 16));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
  }, []);

  // Track wallet-side account and network changes rather than going stale.
  useEffect(() => {
    const provider = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!provider?.on) return;

    const onAccounts = (...args: never[]) => {
      const accounts = args[0] as unknown as Address[];
      setAddress(accounts?.[0] ?? null);
    };
    const onChain = (...args: never[]) => {
      setChainId(Number.parseInt(args[0] as unknown as string, 16));
    };

    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const nox = useCallback(async () => {
    if (!wallet) throw new Error("Connect a wallet first.");
    return getHandleClient(wallet);
  }, [wallet]);

  const value: WalletState = {
    address,
    label: address ? (deskLabels[address.toLowerCase()] ?? null) : null,
    chainId,
    wallet,
    connecting,
    error,
    hasProvider,
    connect,
    disconnect,
    nox,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside <WalletProvider>");
  return context;
}
