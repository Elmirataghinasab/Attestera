import { useState, useCallback, useEffect } from "react";
import { ONBOARDING_MESSAGE, deriveEncryptionKeypair, bytesToHex } from "./encryption.js";

/**
 * Manages the one-time "sign to enable encryption" flow. The derived private
 * key lives ONLY in React state (memory) for this session — it is never
 * persisted to disk or localStorage, and is re-derived fresh (by re-signing
 * the same message) the next time the app loads. See encryption.js for why
 * this is a SEPARATE keypair from the wallet's own signing key.
 */
export function useEncryptionKeypair(signer, address, accessControl) {
  const [keypair, setKeypair] = useState(null); // { privateKey, publicKey64 }
  const [isRegisteredOnChain, setIsRegisteredOnChain] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);

  const checkRegistration = useCallback(async () => {
    if (!accessControl || !address) return;
    setChecking(true);
    try {
      const registered = await accessControl.hasRegisteredPublicKey(address);
      setIsRegisteredOnChain(registered);
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }, [accessControl, address]);

  useEffect(() => {
    checkRegistration();
  }, [checkRegistration]);

  // CRITICAL: clear any previously-derived keypair whenever the connected
  // address changes. Without this, switching from an account that already
  // enabled encryption to a DIFFERENT account would leave the first
  // account's private key sitting in state — silently wrong for the newly
  // connected address, with no error to signal it. The user must re-sign
  // (or re-enable) for each address individually, by design.
  useEffect(() => {
    setKeypair(null);
  }, [address]);

  /** Signs the fixed message, derives the keypair, and registers it on-chain if needed. */
  const enableEncryption = useCallback(async () => {
    if (!signer) return;
    setError(null);
    try {
      const signature = await signer.signMessage(ONBOARDING_MESSAGE);
      const derived = await deriveEncryptionKeypair(signature);
      setKeypair(derived);

      if (!isRegisteredOnChain) {
        const tx = await accessControl.registerPublicKey(bytesToHex(derived.publicKey64));
        await tx.wait();
        setIsRegisteredOnChain(true);
      }
      return derived;
    } catch (err) {
      setError(err.message || "Failed to enable encryption.");
      throw err;
    }
  }, [signer, accessControl, isRegisteredOnChain]);

  return { keypair, isRegisteredOnChain, checking, error, enableEncryption };
}
