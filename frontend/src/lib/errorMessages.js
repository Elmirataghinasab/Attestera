// errorMessages.js
//
// Translates decoded contract custom errors into plain-English messages for
// the UI. Without this, a failed transaction just shows the raw Solidity
// error name (e.g. "NotApprovedIssuer") or, worse, "unknown custom error" if
// the ABI doesn't declare it (see contracts.js — this was a real bug, fixed
// by adding `error ...()` lines to both ABIs so ethers can decode them at all).

const FRIENDLY_MESSAGES = {
  NotAdmin: "Only the Admin account can do this.",
  InstitutionAlreadyApproved: "This institution is already approved.",
  InstitutionNotApproved: "This institution isn't currently approved.",
  InvalidPublicKeyLength: "That doesn't look like a valid public key.",
  NotApprovedIssuer: "This wallet isn't an approved Issuer. Check MetaMask is on the right account, or ask the Admin to approve it first.",
  InvalidMajor: "That major doesn't exist yet — add it from the Admin dashboard first.",
  CredentialNotFound: "No credential found with that ID.",
  NotIssuerOfCredential: "Only the institution that issued this credential can do that.",
  NotOwnerOfCredential: "Only this credential's owner can do that.",
  AlreadyRevoked: "This credential has already been revoked.",
};

/**
 * Extracts a human-readable message from a thrown ethers error, preferring
 * a decoded custom error name mapped to plain English, falling back to
 * whatever ethers or MetaMask provided.
 */
export function describeError(err) {
  // ethers v6 populates err.revert with { name, args } when it can decode
  // a custom error from the ABI (see contracts.js's "error ...()" entries).
  const decodedName = err?.revert?.name || err?.reason;
  if (decodedName && FRIENDLY_MESSAGES[decodedName]) {
    return FRIENDLY_MESSAGES[decodedName];
  }

  // User rejected the MetaMask popup — ethers' ACTION_REJECTED code.
  if (err?.code === "ACTION_REJECTED") {
    return "Transaction rejected in wallet.";
  }

  // Fall back to whatever's available, shortest/clearest first.
  return err?.shortMessage || err?.reason || err?.message || "Something went wrong.";
}
