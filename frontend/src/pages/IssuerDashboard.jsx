import { useState, useEffect, useCallback } from "react";
import { generateAESKey, encryptDocument, wrapKeyForRecipient, serializeWrappedKey, hexToBytes } from "../lib/encryption.js";
import { uploadToStorage, IS_MOCK_STORAGE } from "../lib/storage.js";
import { readFileAsBytes, packWithFilename } from "../lib/fileHelpers.js";
import { DOCUMENT_TYPES } from "../lib/contracts.js";
import StatusBadge from "../components/StatusBadge.jsx";
import EncryptionGate from "../components/EncryptionGate.jsx";
import { describeError } from "../lib/errorMessages.js";

export default function IssuerDashboard({ wallet, encryption }) {
  const [majors, setMajors] = useState([]);
  const [issued, setIssued] = useState([]);

  const [ownerAddress, setOwnerAddress] = useState("");
  const [file, setFile] = useState(null);
  const [documentType, setDocumentType] = useState(0);
  const [majorId, setMajorId] = useState(0);
  const [isTimeLimited, setIsTimeLimited] = useState(false);
  const [expiryDate, setExpiryDate] = useState("");

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [lastIssuedId, setLastIssuedId] = useState(null);

  const loadMajors = useCallback(async () => {
    if (!wallet.accessControl) return;
    const count = await wallet.accessControl.majorCount();
    const list = await Promise.all(Array.from({ length: Number(count) }, (_, i) => wallet.accessControl.majors(i)));
    setMajors(list.map((name, id) => ({ id, name })));
  }, [wallet.accessControl]);

  const loadIssued = useCallback(async () => {
    if (!wallet.credentialRegistry || !wallet.address) return;
    const filter = wallet.credentialRegistry.filters.CredentialIssued(null, null, wallet.address);
    const events = await wallet.credentialRegistry.queryFilter(filter);
    setIssued(events.reverse().map((e) => ({ id: e.args.id, owner: e.args.owner, timestamp: Number(e.args.timestamp) })));
  }, [wallet.credentialRegistry, wallet.address]);

  useEffect(() => {
    loadMajors();
    loadIssued();
  }, [loadMajors, loadIssued]);

  async function handleIssue(e) {
    e.preventDefault();
    setStatus(null);
    setLastIssuedId(null);
    setBusy(true);
    try {
      if (!file) throw new Error("Choose a document file first.");

      setStatus({ type: "pending", message: "Looking up the owner's encryption public key…" });
      const ownerPublicKeyHex = await wallet.accessControl.encryptionPublicKeys(ownerAddress);
      if (!ownerPublicKeyHex || ownerPublicKeyHex === "0x") {
        throw new Error(
          "This owner hasn't enabled encryption yet. Ask them to connect their wallet and click 'Enable encryption' first."
        );
      }
      const ownerPublicKey64 = hexToBytes(ownerPublicKeyHex);

      setStatus({ type: "pending", message: "Encrypting document in your browser…" });
      const fileBytes = await readFileAsBytes(file);
      const packedWithName = packWithFilename(fileBytes, file.name);
      const aesKey = generateAESKey();
      const { ciphertext, iv } = await encryptDocument(packedWithName, aesKey);
      // Store IV alongside ciphertext so it can be retrieved together later.
      const packagedFile = new Uint8Array(iv.length + ciphertext.length);
      packagedFile.set(iv, 0);
      packagedFile.set(ciphertext, iv.length);

      setStatus({ type: "pending", message: "Uploading encrypted document…" });
      const cid = await uploadToStorage(packagedFile);

      setStatus({ type: "pending", message: "Wrapping the AES key for the owner…" });
      const wrapped = await wrapKeyForRecipient(aesKey, ownerPublicKey64);
      const wrappedKeyHex = serializeWrappedKey(wrapped);

      setStatus({ type: "pending", message: "Submitting transaction…" });
      const expiryTimestamp = isTimeLimited ? Math.floor(new Date(expiryDate).getTime() / 1000) : 0;
      const tx = await wallet.credentialRegistry.issueCredential(
        ownerAddress,
        cid,
        wrappedKeyHex,
        documentType,
        majorId,
        isTimeLimited,
        expiryTimestamp
      );
      const receipt = await tx.wait();

      const issuedEvent = receipt.logs
        .map((log) => {
          try {
            return wallet.credentialRegistry.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed?.name === "CredentialIssued");

      setLastIssuedId(issuedEvent?.args?.id);
      setStatus({ type: "success", message: "Credential issued." });
      setFile(null);
      setOwnerAddress("");
      loadIssued();
    } catch (err) {
      setStatus({ type: "error", message: describeError(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="font-serif text-2xl font-semibold">Issuer</h2>
        <p className="mt-1 text-muted">Issue an encrypted credential to a student's wallet address.</p>
      </div>

      <EncryptionGate encryption={encryption} />

      {IS_MOCK_STORAGE && (
        <p className="rounded border border-line bg-white px-4 py-2 text-sm text-muted">
          Document storage is a local mock for this walkthrough — see storage.js for how to swap in real IPFS.
        </p>
      )}

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

      {lastIssuedId && (
        <div className="rounded border border-registry/30 bg-registry-light px-4 py-3">
          <p className="text-sm">Share this credential ID with the student:</p>
          <p className="font-hash mt-1 break-all text-sm">{lastIssuedId}</p>
        </div>
      )}

      <form onSubmit={handleIssue} className="space-y-4 rounded border border-line bg-white p-5">
        <div>
          <label className="text-sm font-medium">Owner wallet address</label>
          <input
            value={ownerAddress}
            onChange={(e) => setOwnerAddress(e.target.value)}
            placeholder="0x…"
            className="font-hash mt-1 w-full rounded-sm border border-line px-3 py-2 text-sm"
            required
          />
        </div>

        <div>
          <label className="text-sm font-medium">Document file</label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files[0])}
            className="mt-1 w-full rounded-sm border border-line px-3 py-2 text-sm"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Document type</label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(Number(e.target.value))}
              className="mt-1 w-full rounded-sm border border-line px-3 py-2 text-sm"
            >
              {DOCUMENT_TYPES.map((label, id) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Major</label>
            <select
              value={majorId}
              onChange={(e) => setMajorId(Number(e.target.value))}
              className="mt-1 w-full rounded-sm border border-line px-3 py-2 text-sm"
            >
              {majors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="timeLimited"
            checked={isTimeLimited}
            onChange={(e) => setIsTimeLimited(e.target.checked)}
          />
          <label htmlFor="timeLimited" className="text-sm">
            This credential expires
          </label>
        </div>
        {isTimeLimited && (
          <input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="w-full rounded-sm border border-line px-3 py-2 text-sm"
            required
          />
        )}

        <button
          type="submit"
          disabled={busy || !encryption.isRegisteredOnChain}
          className="w-full rounded-sm bg-ink px-4 py-2.5 text-sm font-medium text-paper hover:bg-ink/90 disabled:opacity-50"
        >
          {busy ? "Issuing…" : "Issue credential"}
        </button>
      </form>

      <section>
        <h3 className="font-serif text-lg font-semibold">Credentials you've issued</h3>
        <ul className="mt-3 divide-y divide-line/60 text-sm">
          {issued.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2">
              <span className="font-hash">{c.id.slice(0, 18)}…</span>
              <span className="text-muted">{new Date(c.timestamp * 1000).toLocaleDateString()}</span>
            </li>
          ))}
          {issued.length === 0 && <li className="py-6 text-center text-muted">No credentials issued yet.</li>}
        </ul>
      </section>
    </div>
  );
}
