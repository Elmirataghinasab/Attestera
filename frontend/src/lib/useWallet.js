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
    isConnected: !!address,
    accessControl,
    credentialRegistry,
  };
}
