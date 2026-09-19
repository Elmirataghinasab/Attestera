import { useState } from "react";
import { useWallet } from "./lib/useWallet.js";
import { useEncryptionKeypair } from "./lib/useEncryptionKeypair.js";
import WalletBar from "./components/WalletBar.jsx";
import RoleNav from "./components/RoleNav.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import IssuerDashboard from "./pages/IssuerDashboard.jsx";
import OwnerDashboard from "./pages/OwnerDashboard.jsx";
import VerifierDashboard from "./pages/VerifierDashboard.jsx";
import { ACCESS_CONTROL_REGISTRY_ADDRESS, CREDENTIAL_REGISTRY_ADDRESS } from "./lib/contracts.js";

const PAGES = {
  admin: AdminDashboard,
  issuer: IssuerDashboard,
  owner: OwnerDashboard,
  verifier: VerifierDashboard,
};

export default function App() {
  const wallet = useWallet();
  const encryption = useEncryptionKeypair(wallet.signer, wallet.address, wallet.accessControl);
  const [role, setRole] = useState("admin");

  const Page = PAGES[role];
  const missingConfig = !ACCESS_CONTROL_REGISTRY_ADDRESS || !CREDENTIAL_REGISTRY_ADDRESS;

  return (
    <div className="min-h-screen bg-paper">
      <WalletBar wallet={wallet} />

      {wallet.error && (
        <div className="border-b border-seal/30 bg-seal-light px-6 py-2 text-sm text-seal">{wallet.error}</div>
      )}

      {!wallet.isConnected ? (
        <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
          <p className="font-serif text-xl">Connect a wallet to open a dashboard.</p>
          <p className="mt-2 max-w-md text-muted">
            Use the same wallet you'll act as — Admin, Issuer, Owner, or Verifier — the role tabs on the left decide
            which actions are available once connected.
          </p>
        </div>
      ) : missingConfig ? (
        <div className="px-6 py-12">
          <div className="mx-auto max-w-lg rounded border border-brass/40 bg-[#FBF3E7] p-5 text-sm">
            <p className="font-medium">Contract addresses not set.</p>
            <p className="mt-1 text-muted">
              Copy <code className="font-hash">.env.example</code> to <code className="font-hash">.env</code> and fill
              in the addresses from your <code className="font-hash">forge script script/Deploy.s.sol</code> run.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex">
          <RoleNav active={role} onChange={setRole} />
          <main className="flex-1 px-8 py-8">
            <Page wallet={wallet} encryption={encryption} />
          </main>
        </div>
      )}
    </div>
  );
}
