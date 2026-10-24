import { useState, useCallback, useEffect, useMemo } from "react";
import { ethers } from "ethers";
import {
  ACCESS_CONTROL_REGISTRY_ADDRESS,
  ACCESS_CONTROL_REGISTRY_ABI,
  CREDENTIAL_REGISTRY_ADDRESS,
  CREDENTIAL_REGISTRY_ABI,
} from "./contracts.js";

/**
 * Connects to whatever EVM wallet the browser has (MetaMask, etc.) and
 * exposes ready-to-use contract instances bound to the connected signer.
 */
export function useWallet() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [address, setAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError("No wallet extension found. Install MetaMask (or any EVM wallet) to continue.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      await browserProvider.send("eth_requestAccounts", []);
      const walletSigner = await browserProvider.getSigner();
      const network = await browserProvider.getNetwork();

      setProvider(browserProvider);
      setSigner(walletSigner);
      setAddress(await walletSigner.getAddress());
      setChainId(Number(network.chainId));
    } catch (err) {
      setError(err.message || "Failed to connect wallet.");
    } finally {
      setConnecting(false);
    }
  }, []);

  /**
   * Re-opens the wallet's account picker even though we're already
   * connected. Plain eth_requestAccounts only prompts the FIRST time — once
   * a site is authorized, calling it again just silently returns the same
   * account with no UI. wallet_requestPermissions forces the picker open
   * every time, which is what a "switch account" button actually needs.
   * Supported by MetaMask and most EIP-1193 wallets (EIP-2255).
   */
  const switchAccount = useCallback(async () => {
    if (!window.ethereum || !provider) return;
    setError(null);
    try {
      await window.ethereum.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
      const newSigner = await provider.getSigner();
      setSigner(newSigner);
      setAddress(await newSigner.getAddress());
    } catch (err) {
      // User closed the picker without choosing — not a real error, just
      // means nothing changed. Anything else, surface it.
      if (err?.code !== 4001) {
        setError(err.message || "Failed to switch account.");
      }
    }
  }, [provider]);

  // Re-sync when the user switches accounts or networks in their wallet.
  // IMPORTANT: this does NOT call connect() again — eth_requestAccounts is a
  // permission prompt meant for the FIRST connection. Re-triggering it on
  // every account switch is unreliable. Instead, MetaMask's accountsChanged
  // event hands us the new account list directly, so we just re-derive the
  // signer from the SAME provider — no new prompt needed.
  useEffect(() => {
    if (!window.ethereum || !provider) return;

    const handleAccountsChanged = async (accounts) => {
      if (accounts.length === 0) {
        // User disconnected all accounts from this site in their wallet.
        setSigner(null);
        setAddress(null);
        return;
      }
      const newSigner = await provider.getSigner();
      setSigner(newSigner);
      setAddress(await newSigner.getAddress());
    };

    // A network switch changes what chainId every contract call resolves
    // against — simplest correct fix is a full reload rather than trying to
    // patch every piece of state by hand.
    const handleChainChanged = () => {
      window.location.reload();
    };

    window.ethereum.on?.("accountsChanged", handleAccountsChanged);
    window.ethereum.on?.("chainChanged", handleChainChanged);
    return () => {
      window.ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [provider]);

  const accessControl = useMemo(() => {
    if (!signer || !ACCESS_CONTROL_REGISTRY_ADDRESS) return null;
    return new ethers.Contract(ACCESS_CONTROL_REGISTRY_ADDRESS, ACCESS_CONTROL_REGISTRY_ABI, signer);
  }, [signer]);

  const credentialRegistry = useMemo(() => {
    if (!signer || !CREDENTIAL_REGISTRY_ADDRESS) return null;
    return new ethers.Contract(CREDENTIAL_REGISTRY_ADDRESS, CREDENTIAL_REGISTRY_ABI, signer);
  }, [signer]);

  return {
    provider,
    signer,
    address,
    chainId,
    connecting,
    error,
    connect,
    switchAccount,
    isConnected: !!address,
    accessControl,
    credentialRegistry,
  };
}
