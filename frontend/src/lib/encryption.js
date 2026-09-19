// encryption.js
//
// The client-side encryption module for the Credential Registry system.
// Everything here runs in the browser — the contracts never see plaintext
// documents, raw AES keys, or anyone's private key. See the Design Decisions
// Log (section 3, NFR-5) and the Implementation Plan for the reasoning.
//
// Two building blocks, combined:
//   1. AES-256-GCM (via the native Web Crypto API)      — encrypts the document
//   2. A from-scratch ECIES scheme (via @noble/secp256k1) — wraps the AES key
//      for a specific recipient's registered public key
//
// No native/compiled dependencies: @noble/secp256k1 is pure JS and audited,
// and Web Crypto is built into every modern browser and Node.js. This avoids
// the native-binding install problems some other Ethereum crypto libraries
// (e.g. eccrypto) can cause across different operating systems.

import * as secp from "@noble/secp256k1";

const webcrypto = globalThis.crypto;

// ---------------------------------------------------------------------
// Byte/hex helpers
// ---------------------------------------------------------------------

function hexToBytes(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function concatBytes(...arrays) {
  const total = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// ---------------------------------------------------------------------
// 1. Deterministic encryption keypair, derived from a wallet signature
// ---------------------------------------------------------------------
// The dApp never has access to the wallet's real private key — this derives
// a SEPARATE keypair, used only for encryption, that can be regenerated any
// time just by re-signing the same fixed message with the same wallet.

export const ONBOARDING_MESSAGE = "Enable encrypted documents on Credential Registry";

/**
 * Derives a secp256k1 encryption keypair from a wallet signature.
 * @param {string} signatureHex - hex signature string (e.g. from wallet.signMessage)
 * @returns {Promise<{privateKey: Uint8Array, publicKey64: Uint8Array}>}
 *          publicKey64 is the 64-byte uncompressed public key WITHOUT the
 *          0x04 prefix — the exact format AccessControlRegistry.registerPublicKey expects.
 */
export async function deriveEncryptionKeypair(signatureHex) {
  const signatureBytes = hexToBytes(signatureHex);

  // Hash the signature to get a 32-byte scalar. In the astronomically
  // unlikely case it's not a valid secp256k1 private key (>= curve order),
  // re-hash until it is, rather than silently using an invalid key.
  let candidate = await sha256(signatureBytes);
  while (!secp.utils.isValidPrivateKey(candidate)) {
    candidate = await sha256(candidate);
  }

  const privateKey = candidate;
  const publicKeyWithPrefix = secp.getPublicKey(privateKey, false); // 65 bytes, 0x04 prefix
  const publicKey64 = publicKeyWithPrefix.slice(1); // strip prefix -> 64 bytes

  return { privateKey, publicKey64 };
}

async function sha256(bytes) {
  const digest = await webcrypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

// ---------------------------------------------------------------------
// 2. AES-256-GCM document encryption
// ---------------------------------------------------------------------

/** Generates a fresh random 256-bit AES key as raw bytes. */
export function generateAESKey() {
  return webcrypto.getRandomValues(new Uint8Array(32));
}

async function importAESKey(rawKeyBytes) {
  return webcrypto.subtle.importKey("raw", rawKeyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Encrypts a document with AES-256-GCM.
 * @param {Uint8Array} plaintextBytes
 * @param {Uint8Array} aesKeyRaw - 32 raw key bytes, from generateAESKey()
 * @returns {Promise<{ciphertext: Uint8Array, iv: Uint8Array}>}
 */
export async function encryptDocument(plaintextBytes, aesKeyRaw) {
  const key = await importAESKey(aesKeyRaw);
  const iv = webcrypto.getRandomValues(new Uint8Array(12)); // 96-bit IV, standard for GCM

  const ciphertextBuffer = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintextBytes);

  return { ciphertext: new Uint8Array(ciphertextBuffer), iv };
}

/**
 * Decrypts a document previously encrypted with encryptDocument().
 * @returns {Promise<Uint8Array>} the original plaintext bytes
 */
export async function decryptDocument(ciphertext, iv, aesKeyRaw) {
  const key = await importAESKey(aesKeyRaw);
  const plaintextBuffer = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new Uint8Array(plaintextBuffer);
}

// ---------------------------------------------------------------------
// 3. ECIES key wrapping — encrypts the small AES key for one recipient
// ---------------------------------------------------------------------
// Standard ECIES construction:
//   1. Generate a one-time ephemeral keypair
//   2. ECDH(ephemeral private, recipient public) => shared point
//   3. HKDF(shared point) => a fresh symmetric key, unique to this wrap
//   4. AES-GCM-encrypt the AES key under that symmetric key
//   5. Package {ephemeralPublicKey, iv, ciphertext} — this whole package is
//      what gets stored on-chain as `encryptedKey` / the wrapped-key mapping
//
// ECDH is symmetric: the recipient computes the exact same shared point from
// (their own private key, the ephemeral public key), so they derive the same
// symmetric key without the ephemeral private key ever being shared.

const HKDF_INFO = new TextEncoder().encode("credential-registry-key-wrap");

async function deriveSymmetricKeyFromSharedPoint(sharedPointBytes) {
  const hkdfKey = await webcrypto.subtle.importKey("raw", sharedPointBytes, "HKDF", false, ["deriveKey"]);
  return webcrypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: HKDF_INFO },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Wraps (encrypts) an AES key for a specific recipient's public key.
 * @param {Uint8Array} aesKeyRaw - the 32-byte AES key to protect
 * @param {Uint8Array} recipientPublicKey64 - recipient's 64-byte public key
 *        (as stored in AccessControlRegistry.encryptionPublicKeys)
 * @returns {Promise<{ephemeralPublicKey64: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array}>}
 */
export async function wrapKeyForRecipient(aesKeyRaw, recipientPublicKey64) {
  const ephemeralPrivateKey = secp.utils.randomPrivateKey();
  const ephemeralPublicKeyWithPrefix = secp.getPublicKey(ephemeralPrivateKey, false);

  const recipientPublicKeyWithPrefix = concatBytes(new Uint8Array([0x04]), recipientPublicKey64);
  const sharedPoint = secp.getSharedSecret(ephemeralPrivateKey, recipientPublicKeyWithPrefix, true);

  const symmetricKey = await deriveSymmetricKeyFromSharedPoint(sharedPoint);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ciphertextBuffer = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, symmetricKey, aesKeyRaw);

  return {
    ephemeralPublicKey64: ephemeralPublicKeyWithPrefix.slice(1),
    iv,
    ciphertext: new Uint8Array(ciphertextBuffer),
  };
}

/**
 * Unwraps (decrypts) an AES key that was wrapped for this recipient.
 * @param {{ephemeralPublicKey64: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array}} wrapped
 * @param {Uint8Array} recipientPrivateKey - the recipient's OWN derived
 *        encryption private key, from deriveEncryptionKeypair()
 * @returns {Promise<Uint8Array>} the original 32-byte AES key
 */
export async function unwrapKey(wrapped, recipientPrivateKey) {
  const ephemeralPublicKeyWithPrefix = concatBytes(new Uint8Array([0x04]), wrapped.ephemeralPublicKey64);
  const sharedPoint = secp.getSharedSecret(recipientPrivateKey, ephemeralPublicKeyWithPrefix, true);

  const symmetricKey = await deriveSymmetricKeyFromSharedPoint(sharedPoint);
  const aesKeyBuffer = await webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv: wrapped.iv },
    symmetricKey,
    wrapped.ciphertext
  );

  return new Uint8Array(aesKeyBuffer);
}

// ---------------------------------------------------------------------
// Serialization helpers — for storing wrapped-key packages as bytes
// (e.g. what actually gets sent to CredentialRegistry.grantAccess)
// ---------------------------------------------------------------------

/** Packs a wrapped-key object into a single hex string for on-chain storage. */
export function serializeWrappedKey(wrapped) {
  // Fixed-width layout: [64 bytes ephemeral pubkey][12 bytes iv][remaining: ciphertext]
  const packed = concatBytes(wrapped.ephemeralPublicKey64, wrapped.iv, wrapped.ciphertext);
  return bytesToHex(packed);
}

/** Reverses serializeWrappedKey(). */
export function deserializeWrappedKey(hex) {
  const bytes = hexToBytes(hex);
  return {
    ephemeralPublicKey64: bytes.slice(0, 64),
    iv: bytes.slice(64, 76),
    ciphertext: bytes.slice(76),
  };
}

export { hexToBytes, bytesToHex };
