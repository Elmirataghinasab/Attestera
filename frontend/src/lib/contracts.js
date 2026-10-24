// contracts.js
//
// Contract addresses and ABIs. Addresses come from environment variables so
// the same code works against a local Anvil chain, Arbitrum Sepolia, or
// mainnet later — just change .env, nothing in this file.
//
// After running `forge script script/Deploy.s.sol ...`, paste the two
// printed addresses into your .env file as shown in .env.example.

export const ACCESS_CONTROL_REGISTRY_ADDRESS = import.meta.env.VITE_ACCESS_CONTROL_REGISTRY_ADDRESS || "";
export const CREDENTIAL_REGISTRY_ADDRESS = import.meta.env.VITE_CREDENTIAL_REGISTRY_ADDRESS || "";

// Human-readable ABIs — only the functions and events the frontend actually
// calls, matching exactly what's implemented in the Solidity contracts.

export const ACCESS_CONTROL_REGISTRY_ABI = [
  "function ADMIN() view returns (address)",
  "function approveInstitution(address institutionAddress, string name)",
  "function revokeInstitution(address institutionAddress)",
  "function addMajor(string name) returns (uint16)",
  "function institutions(address) view returns (address institutionAddress, string name, bool isApproved, uint256 approvedDate)",
  "function majors(uint16) view returns (string)",
  "function majorCount() view returns (uint16)",
  "function getAllInstitutions() view returns (address[])",
  "function isApprovedIssuer(address) view returns (bool)",
  "function isValidMajor(uint16) view returns (bool)",
  "function registerPublicKey(bytes publicKey)",
  "function hasRegisteredPublicKey(address) view returns (bool)",
  "function encryptionPublicKeys(address) view returns (bytes)",
  "event InstitutionApproved(address indexed institutionAddress, string name)",
  "event InstitutionRevoked(address indexed institutionAddress)",
  "event MajorAdded(uint16 indexed majorId, string name)",
  "event PublicKeyRegistered(address indexed user, bytes publicKey)",
  "error NotAdmin()",
  "error InstitutionAlreadyApproved()",
  "error InstitutionNotApproved()",
  "error InvalidPublicKeyLength()",
];

export const CREDENTIAL_REGISTRY_ABI = [
  "function issueCredential(address owner, string ipfsCid, bytes ownerWrappedKey, uint8 documentType, uint16 majorId, bool isTimeLimited, uint256 expiryDate) returns (bytes32)",
  "function revokeCredential(bytes32 id)",
  "function grantAccess(bytes32 id, address grantee, bytes wrappedKey)",
  "function revokeAccess(bytes32 id, address grantee)",
  "function getStatus(bytes32 id) view returns (uint8)",
  "function getCredential(bytes32 id) view returns (address owner, address issuer, string ipfsCid, uint8 documentType, uint16 majorId, uint256 issueDate, bool isTimeLimited, uint256 expiryDate, uint8 status)",
  "function getWrappedKey(bytes32 id, address grantee) view returns (bytes)",
  "function getCredentialsByOwner(address owner) view returns (bytes32[])",
  "event CredentialIssued(bytes32 indexed id, address indexed owner, address indexed issuer, uint256 timestamp)",
  "event CredentialRevoked(bytes32 indexed id, uint256 timestamp)",
  "event AccessGranted(bytes32 indexed credentialId, address indexed grantee, uint256 timestamp)",
  "event AccessRevoked(bytes32 indexed credentialId, address indexed grantee, uint256 timestamp)",
  "error NotApprovedIssuer()",
  "error InvalidMajor()",
  "error CredentialNotFound()",
  "error NotIssuerOfCredential()",
  "error NotOwnerOfCredential()",
  "error AlreadyRevoked()",
];

// Mirrors CredentialRegistry.DocumentType exactly — order matters, these are
// the enum's numeric positions, not arbitrary labels.
export const DOCUMENT_TYPES = ["Bachelor", "Master", "Certificate", "PhD", "Diploma"];

// Mirrors CredentialRegistry.Status exactly.
export const STATUS_LABELS = ["Active", "Expired", "Revoked"];
