function shortenAddress(address) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
}

export default function WalletBar({ wallet }) {
  if (!wallet.isConnected) {
    return (
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <div>
          <h1 className="font-serif text-lg font-semibold">Attestera</h1>
          <p className="text-sm text-muted">Connect a wallet to continue</p>
        </div>
        <button
          onClick={wallet.connect}
          disabled={wallet.connecting}
          className="rounded-sm bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90 disabled:opacity-50"
        >
          {wallet.connecting ? "Connecting…" : "Connect wallet"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between border-b border-line px-6 py-4">
      <h1 className="font-serif text-lg font-semibold">Attestera</h1>
      <div className="flex items-center gap-3">
        {wallet.chainId && (
          <span className="rounded-sm border border-line px-2 py-1 text-xs text-muted">
            Chain {wallet.chainId}
          </span>
        )}
        <button
          onClick={wallet.switchAccount}
          title="Click to switch accounts in your wallet"
          className="font-hash rounded-sm border border-line bg-white px-3 py-1.5 text-sm hover:bg-line/20 hover:border-registry cursor-pointer transition-colors"
        >
          {shortenAddress(wallet.address)}
          <span className="ml-2 text-muted">⇄</span>
        </button>
      </div>
    </div>
  );
}
