import { useState, useEffect, useCallback } from "react";

export default function AdminDashboard({ wallet }) {
  const [institutions, setInstitutions] = useState([]);
  const [majors, setMajors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  const [newInstitutionAddress, setNewInstitutionAddress] = useState("");
  const [newInstitutionName, setNewInstitutionName] = useState("");
  const [newMajorName, setNewMajorName] = useState("");

  const loadAll = useCallback(async () => {
    if (!wallet.accessControl) return;
    setLoading(true);
    try {
      const addresses = await wallet.accessControl.getAllInstitutions();
      const details = await Promise.all(
        addresses.map(async (addr) => {
          const record = await wallet.accessControl.institutions(addr);
          return { address: addr, name: record.name, isApproved: record.isApproved };
        })
      );
      setInstitutions(details);

      const count = await wallet.accessControl.majorCount();
      const majorList = await Promise.all(
        Array.from({ length: Number(count) }, (_, i) => wallet.accessControl.majors(i))
      );
      setMajors(majorList.map((name, id) => ({ id, name })));
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setLoading(false);
    }
  }, [wallet.accessControl]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleApproveInstitution(e) {
    e.preventDefault();
    setStatus(null);
    try {
      const tx = await wallet.accessControl.approveInstitution(newInstitutionAddress, newInstitutionName);
      setStatus({ type: "pending", message: "Approving institution…" });
      await tx.wait();
      setStatus({ type: "success", message: `${newInstitutionName} approved.` });
      setNewInstitutionAddress("");
      setNewInstitutionName("");
      loadAll();
    } catch (err) {
      setStatus({ type: "error", message: err.reason || err.message });
    }
  }

  async function handleRevokeInstitution(address) {
    setStatus(null);
    try {
      const tx = await wallet.accessControl.revokeInstitution(address);
      setStatus({ type: "pending", message: "Revoking…" });
      await tx.wait();
      setStatus({ type: "success", message: "Institution revoked." });
      loadAll();
    } catch (err) {
      setStatus({ type: "error", message: err.reason || err.message });
    }
  }

  async function handleAddMajor(e) {
    e.preventDefault();
    setStatus(null);
    try {
      const tx = await wallet.accessControl.addMajor(newMajorName);
      setStatus({ type: "pending", message: "Adding major…" });
      await tx.wait();
      setStatus({ type: "success", message: `${newMajorName} added.` });
      setNewMajorName("");
      loadAll();
    } catch (err) {
      setStatus({ type: "error", message: err.reason || err.message });
    }
  }

  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <h2 className="font-serif text-2xl font-semibold">Admin</h2>
        <p className="mt-1 text-muted">Approve institutions and grow the list of majors credentials can reference.</p>
      </div>

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

      <section>
        <h3 className="font-serif text-lg font-semibold">Institutions</h3>
        <form onSubmit={handleApproveInstitution} className="mt-3 flex gap-2">
          <input
            value={newInstitutionAddress}
            onChange={(e) => setNewInstitutionAddress(e.target.value)}
            placeholder="0x… institution wallet address"
            className="font-hash flex-1 rounded-sm border border-line bg-white px-3 py-2 text-sm"
            required
          />
          <input
            value={newInstitutionName}
            onChange={(e) => setNewInstitutionName(e.target.value)}
            placeholder="Institution name"
            className="w-56 rounded-sm border border-line bg-white px-3 py-2 text-sm"
            required
          />
          <button type="submit" className="rounded-sm bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90">
            Approve
          </button>
        </form>

        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="pb-2 font-normal">Address</th>
              <th className="pb-2 font-normal">Name</th>
              <th className="pb-2 font-normal">Status</th>
              <th className="pb-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {institutions.map((inst) => (
              <tr key={inst.address} className="border-b border-line/60">
                <td className="font-hash py-2">{inst.address}</td>
                <td className="py-2">{inst.name}</td>
                <td className="py-2">
                  <span className={inst.isApproved ? "text-registry" : "text-seal"}>
                    {inst.isApproved ? "Approved" : "Revoked"}
                  </span>
                </td>
                <td className="py-2 text-right">
                  {inst.isApproved && (
                    <button onClick={() => handleRevokeInstitution(inst.address)} className="text-sm text-seal hover:underline">
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {institutions.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-muted">
                  No institutions approved yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="font-serif text-lg font-semibold">Majors</h3>
        <form onSubmit={handleAddMajor} className="mt-3 flex gap-2">
          <input
            value={newMajorName}
            onChange={(e) => setNewMajorName(e.target.value)}
            placeholder="e.g. Computer Science"
            className="flex-1 rounded-sm border border-line bg-white px-3 py-2 text-sm"
            required
          />
          <button type="submit" className="rounded-sm bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90">
            Add major
          </button>
        </form>

        <ul className="mt-4 divide-y divide-line/60 text-sm">
          {majors.map((m) => (
            <li key={m.id} className="flex justify-between py-2">
              <span>{m.name}</span>
              <span className="font-hash text-muted">#{m.id}</span>
            </li>
          ))}
          {majors.length === 0 && !loading && <li className="py-6 text-center text-muted">No majors added yet.</li>}
        </ul>
      </section>
    </div>
  );
}
