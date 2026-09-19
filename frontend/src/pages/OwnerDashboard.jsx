import { useState, useEffect, useCallback } from "react";
import {
  unwrapKey,
  wrapKeyForRecipient,
  serializeWrappedKey,
  deserializeWrappedKey,
  decryptDocument,
  hexToBytes,
} from "../lib/encryption.js";
import { fetchFromStorage } from "../lib/storage.js";
import { downloadBytes } from "../lib/fileHelpers.js";
import { DOCUMENT_TYPES, STATUS_LABELS } from "../lib/contracts.js";
import StatusBadge from "../components/StatusBadge.jsx";
import EncryptionGate from "../components/EncryptionGate.jsx";

export default function OwnerDashboard({ wallet, encryption }) {
  const [credentials, setCredentials] = useState([]);
  const [status, setStatus] = useState(null);
  const [grantForms, setGrantForms] = useState({}); // id -> verifier address being typed
  const [grantees, setGrantees] = useState({}); // id -> [addresses granted, from events]

  const loadCredentials = useCallback(async () => {
    if (!wallet.credentialRegistry || !wallet.address) return;
    try {
      const ids = await wallet.credentialRegistry.getCredentialsByOwner(wallet.address);
      const details = await Promise.all(
        ids.map(async (id) => {
          const c = await wallet.credentialRegistry.getCredential(id);
          return {
            id,
            issuer: c.issuer,
            documentType: DOCUMENT_TYPES[c.documentType],
            majorId: c.majorId,
            issueDate: Number(c.issueDate),
            isTimeLimited: c.isTimeLimited,
            expiryDate: Number(c.expiryDate),
            status: STATUS_LABELS[c.status],
          };
        })
      );
      setCredentials(details.reverse());
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }, [wallet.credentialRegistry, wallet.address]);

  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  const loadGrantees = useCallback(
    async (id) => {
      const filter = wallet.credentialRegistry.filters.AccessGranted(id);
      const events = await wallet.credentialRegistry.queryFilter(filter);
      const revokedFilter = wallet.credentialRegistry.filters.AccessRevoked(id);
      const revokedEvents = await wallet.credentialRegistry.queryFilter(revokedFilter);
      const revokedAt = {};
      for (const e of revokedEvents) revokedAt[e.args.grantee] = Number(e.args.timestamp);

      const currentlyGranted = [...new Set(events.map((e) => e.args.grantee))].filter((addr) => {
        const lastGrant = Math.max(...events.filter((e) => e.args.grantee === addr).map((e) => Number(e.args.timestamp)));
        return !(addr in revokedAt) || revokedAt[addr] < lastGrant;
      });
      setGrantees((prev) => ({ ...prev, [id]: currentlyGranted }));
    },
    [wallet.credentialRegistry]
  );

  async function handleViewDocument(cred) {
    setStatus({ type: "pending", message: "Decrypting document…" });
    try {
      const full = await wallet.credentialRegistry.getCredential(cred.id);
      const wrappedForMeHex = await wallet.credentialRegistry.getWrappedKey(cred.id, wallet.address);
      const wrappedForMe = deserializeWrappedKey(wrappedForMeHex);
      const aesKey = await unwrapKey(wrappedForMe, encryption.keypair.privateKey);

      const packagedFile = await fetchFromStorage(full.ipfsCid);
      const iv = packagedFile.slice(0, 12);
      const ciphertext = packagedFile.slice(12);
      const plaintext = await decryptDocument(ciphertext, iv, aesKey);

      downloadBytes(plaintext, `credential-${cred.id.slice(0, 10)}`);
      setStatus({ type: "success", message: "Document decrypted and downloaded." });
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  async function handleGrantAccess(cred) {
    const verifierAddress = grantForms[cred.id];
    if (!verifierAddress) return;
    setStatus({ type: "pending", message: "Granting access…" });
    try {
      const verifierPublicKeyHex = await wallet.accessControl.encryptionPublicKeys(verifierAddress);
      if (!verifierPublicKeyHex || verifierPublicKeyHex === "0x") {
        throw new Error("This address hasn't enabled encryption yet — ask them to connect and enable it first.");
      }

      const wrappedForMeHex = await wallet.credentialRegistry.getWrappedKey(cred.id, wallet.address);
      const wrappedForMe = deserializeWrappedKey(wrappedForMeHex);
      const aesKey = await unwrapKey(wrappedForMe, encryption.keypair.privateKey);

      const wrappedForVerifier = await wrapKeyForRecipient(aesKey, hexToBytes(verifierPublicKeyHex));
      const tx = await wallet.credentialRegistry.grantAccess(
        cred.id,
        verifierAddress,
        serializeWrappedKey(wrappedForVerifier)
      );
      await tx.wait();

      setStatus({ type: "success", message: `Access granted to ${verifierAddress.slice(0, 10)}…` });
      setGrantForms((prev) => ({ ...prev, [cred.id]: "" }));
      loadGrantees(cred.id);
    } catch (err) {
      setStatus({ type: "error", message: err.reason || err.message });
    }
  }

  async function handleRevokeAccess(id, grantee) {
    setStatus({ type: "pending", message: "Revoking access…" });
    try {
      const tx = await wallet.credentialRegistry.revokeAccess(id, grantee);
      await tx.wait();
      setStatus({ type: "success", message: "Access revoked." });
      loadGrantees(id);
    } catch (err) {
      setStatus({ type: "error", message: err.reason || err.message });
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-semibold">Owner</h2>
        <p className="mt-1 text-muted">Your credentials, and who you've shared them with.</p>
      </div>

      <EncryptionGate encryption={encryption} />

      {status && (
        <div
          className={`rounded border px-4 py-2 text-sm ${
            status.type === "error"
              ? "border-seal/30 bg-seal-light text-seal"
              : status.type === "success"
                ? "border-registry/30 bg-registry-light text-registry"
                : "border-line bg-white text-muted"
          }`}
        >
          {status.message}
        </div>
      )}

      <div className="space-y-4">
        {credentials.map((cred) => (
          <div key={cred.id} className="rounded border border-line bg-white p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-serif font-semibold">{cred.documentType}</p>
                <p className="font-hash text-xs text-muted">{cred.id}</p>
              </div>
              <StatusBadge status={cred.status} />
            </div>

            <div className="mt-3 flex gap-6 text-sm text-muted">
              <span>Issued {new Date(cred.issueDate * 1000).toLocaleDateString()}</span>
              {cred.isTimeLimited && <span>Expires {new Date(cred.expiryDate * 1000).toLocaleDateString()}</span>}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => handleViewDocument(cred)}
                disabled={!encryption.keypair}
                className="rounded-sm bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:bg-ink/90 disabled:opacity-50"
              >
                View / download
              </button>
              <button
                onClick={() => loadGrantees(cred.id)}
                className="rounded-sm border border-line px-3 py-1.5 text-sm hover:bg-line/20"
              >
                Show who has access
              </button>
            </div>

            {grantees[cred.id] && (
              <ul className="mt-3 space-y-1 border-t border-line/60 pt-3 text-sm">
                {grantees[cred.id].length === 0 && <li className="text-muted">Nobody has access yet.</li>}
                {grantees[cred.id].map((addr) => (
                  <li key={addr} className="flex items-center justify-between">
                    <span className="font-hash">{addr}</span>
                    <button onClick={() => handleRevokeAccess(cred.id, addr)} className="text-sm text-seal hover:underline">
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex gap-2 border-t border-line/60 pt-3">
              <input
                value={grantForms[cred.id] || ""}
                onChange={(e) => setGrantForms((prev) => ({ ...prev, [cred.id]: e.target.value }))}
                placeholder="0x… verifier address"
                className="font-hash flex-1 rounded-sm border border-line px-3 py-1.5 text-sm"
              />
              <button
                onClick={() => handleGrantAccess(cred)}
                disabled={!encryption.keypair}
                className="rounded-sm border border-line px-3 py-1.5 text-sm hover:bg-line/20 disabled:opacity-50"
              >
                Grant access
              </button>
            </div>
          </div>
        ))}
        {credentials.length === 0 && <p className="py-8 text-center text-muted">No credentials yet.</p>}
      </div>
    </div>
  );
}
