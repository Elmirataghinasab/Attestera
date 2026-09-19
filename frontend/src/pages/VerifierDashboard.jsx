import { useState } from "react";
import { unwrapKey, deserializeWrappedKey, decryptDocument } from "../lib/encryption.js";
import { fetchFromStorage } from "../lib/storage.js";
import { downloadBytes } from "../lib/fileHelpers.js";
import { DOCUMENT_TYPES, STATUS_LABELS } from "../lib/contracts.js";
import StatusBadge from "../components/StatusBadge.jsx";
import EncryptionGate from "../components/EncryptionGate.jsx";

export default function VerifierDashboard({ wallet, encryption }) {
  const [credentialId, setCredentialId] = useState("");
  const [result, setResult] = useState(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [status, setStatus] = useState(null);

  async function handleLookup(e) {
    e.preventDefault();
    setStatus(null);
    setResult(null);
    try {
      const c = await wallet.credentialRegistry.getCredential(credentialId);
      setResult({
        owner: c.owner,
        issuer: c.issuer,
        documentType: DOCUMENT_TYPES[c.documentType],
        majorId: c.majorId,
        issueDate: Number(c.issueDate),
        isTimeLimited: c.isTimeLimited,
        expiryDate: Number(c.expiryDate),
        status: STATUS_LABELS[c.status],
      });

      const wrappedHex = await wallet.credentialRegistry.getWrappedKey(credentialId, wallet.address);
      setHasAccess(wrappedHex && wrappedHex !== "0x");
    } catch (err) {
      setStatus({ type: "error", message: "No credential found for that ID." });
    }
  }

  async function handleViewDocument() {
    setStatus({ type: "pending", message: "Decrypting document…" });
    try {
      const wrappedHex = await wallet.credentialRegistry.getWrappedKey(credentialId, wallet.address);
      const wrapped = deserializeWrappedKey(wrappedHex);
      const aesKey = await unwrapKey(wrapped, encryption.keypair.privateKey);

      const full = await wallet.credentialRegistry.getCredential(credentialId);
      const packagedFile = await fetchFromStorage(full.ipfsCid);
      const iv = packagedFile.slice(0, 12);
      const ciphertext = packagedFile.slice(12);
      const plaintext = await decryptDocument(ciphertext, iv, aesKey);

      downloadBytes(plaintext, `credential-${credentialId.slice(0, 10)}`);
      setStatus({ type: "success", message: "Document decrypted and downloaded." });
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-semibold">Verifier</h2>
        <p className="mt-1 text-muted">Check a credential's status. No prior access needed for this part.</p>
      </div>

      <EncryptionGate encryption={encryption} />

      <form onSubmit={handleLookup} className="flex gap-2">
        <input
          value={credentialId}
          onChange={(e) => setCredentialId(e.target.value)}
          placeholder="0x… credential ID"
          className="font-hash flex-1 rounded-sm border border-line bg-white px-3 py-2 text-sm"
          required
        />
        <button type="submit" className="rounded-sm bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90">
          Look up
        </button>
      </form>

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

      {result && (
        <div className="rounded border border-line bg-white p-5">
          <div className="flex items-start justify-between">
            <p className="font-serif font-semibold">{result.documentType}</p>
            <StatusBadge status={result.status} />
          </div>

          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Issued by</dt>
              <dd className="font-hash">{result.issuer}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Owned by</dt>
              <dd className="font-hash">{result.owner}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Issue date</dt>
              <dd>{new Date(result.issueDate * 1000).toLocaleDateString()}</dd>
            </div>
            {result.isTimeLimited && (
              <div className="flex justify-between">
                <dt className="text-muted">Expiry date</dt>
                <dd>{new Date(result.expiryDate * 1000).toLocaleDateString()}</dd>
              </div>
            )}
          </dl>

          <div className="mt-4 border-t border-line/60 pt-4">
            {hasAccess ? (
              <button
                onClick={handleViewDocument}
                disabled={!encryption.keypair}
                className="rounded-sm bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:bg-ink/90 disabled:opacity-50"
              >
                View full document
              </button>
            ) : (
              <p className="text-sm text-muted">
                You haven't been granted access to the full document. Ask the owner to grant access to{" "}
                <span className="font-hash">{wallet.address}</span>.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
