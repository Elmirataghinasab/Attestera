export default function EncryptionGate({ encryption }) {
  if (encryption.checking) return null;
  if (encryption.isRegisteredOnChain && encryption.keypair) return null;

  return (
    <div className="mb-6 rounded border border-brass/40 bg-[#FBF3E7] px-4 py-3">
      <p className="text-sm">
        {encryption.isRegisteredOnChain
          ? "Your public key is registered on-chain, but this browser session doesn't have your encryption key yet."
          : "You haven't enabled encrypted documents yet. This is a one-time signature — it does not cost gas."}
      </p>
      <button
        onClick={encryption.enableEncryption}
        className="mt-2 rounded-sm bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:bg-ink/90"
      >
        {encryption.isRegisteredOnChain ? "Sign to unlock this session" : "Enable encryption"}
      </button>
      {encryption.error && <p className="mt-2 text-sm text-seal">{encryption.error}</p>}
    </div>
  );
}
