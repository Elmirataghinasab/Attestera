// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControlRegistry} from "./CredentialRegistry.sol";

/// @title AccessControlRegistry
/// @notice Manages the system Admin, approved Issuer institutions, and the
///         dynamic Major registry. This contract is deliberately kept separate
///         from CredentialRegistry because it changes state infrequently
///         (institutions and majors are added occasionally by the Admin),
///         unlike credential issuance and verification which happen constantly.
///         Keeping permission logic isolated here makes it easy to audit on its own.
/// @dev Deployed as an immutable contract. There is no upgrade path by design —
///      see NFR-20 in the project's Design Decisions Log for the rationale.
contract AccessControlRegistry is IAccessControlRegistry {
    /// @notice The single Admin address, set once at deployment and never changed.
    address public immutable ADMIN;

    struct Institution {
        address institutionAddress;
        string name;
        bool isApproved;
        uint256 approvedDate;
    }

    /// @dev institutionAddress => Institution record.
    mapping(address => Institution) public institutions;

    /// @dev Enumerable list of every institution ever approved, supporting
    ///      FR-3 (Admin can view a list of all registered Issuers). An
    ///      address is pushed here only the first time it is approved, so
    ///      revoking and later re-approving the same institution never
    ///      creates a duplicate entry.
    address[] public institutionList;

    /// @dev Tracks whether an address has ever been registered before, used
    ///      to decide whether approveInstitution should push to institutionList.
    mapping(address => bool) private everRegistered;

    /// @dev Dynamic, Admin-extensible list of majors/fields of study.
    ///      A mapping is used instead of a fixed enum so new majors can be
    ///      added after deployment without redeploying the contract.
    mapping(uint16 => string) public majors;
    uint16 public majorCount;

    /// @dev address => uncompressed secp256k1 public key (64 bytes, no 0x04
    ///      prefix), self-registered once via a one-time onboarding signature.
    ///      Wallets don't expose a raw public key from just an address, so
    ///      this registry is what lets any contract or frontend look one up
    ///      to wrap an AES key for that address. See the encryption module
    ///      design notes for the full reasoning behind this approach.
    mapping(address => bytes) public encryptionPublicKeys;

    event InstitutionApproved(address indexed institutionAddress, string name);
    event InstitutionRevoked(address indexed institutionAddress);
    event MajorAdded(uint16 indexed majorId, string name);
    event PublicKeyRegistered(address indexed user, bytes publicKey);

    error NotAdmin();
    error InstitutionAlreadyApproved();
    error InstitutionNotApproved();
    error InvalidPublicKeyLength();

    modifier onlyAdmin() {
        _onlyAdmin();
        _;
    }

    function _onlyAdmin() internal view {
        if (msg.sender != ADMIN) revert NotAdmin();
    }

    constructor(address _admin) {
        ADMIN = _admin;
    }

    /// @notice Approves a new institution as an authorized Issuer.
    /// @param institutionAddress The wallet address the institution will issue credentials from.
    /// @param name Display name of the institution (e.g., "University of Tehran").
    function approveInstitution(address institutionAddress, string calldata name) external onlyAdmin {
        if (institutions[institutionAddress].isApproved) revert InstitutionAlreadyApproved();

        institutions[institutionAddress] = Institution({
            institutionAddress: institutionAddress,
            name: name,
            isApproved: true,
            approvedDate: block.timestamp
        });

        if (!everRegistered[institutionAddress]) {
            everRegistered[institutionAddress] = true;
            institutionList.push(institutionAddress);
        }

        emit InstitutionApproved(institutionAddress, name);
    }

    /// @notice Revokes an institution's Issuer privileges. Does not affect
    ///         credentials already issued by that institution.
    function revokeInstitution(address institutionAddress) external onlyAdmin {
        if (!institutions[institutionAddress].isApproved) revert InstitutionNotApproved();

        institutions[institutionAddress].isApproved = false;

        emit InstitutionRevoked(institutionAddress);
    }

    /// @notice Registers a new major/field of study. Admin-only, append-only —
    ///         existing majorIds already referenced by issued credentials are
    ///         never reused or overwritten.
    /// @param name Display name of the major (e.g., "Computer Science").
    /// @return majorId The numeric ID assigned to this major.
    function addMajor(string calldata name) external onlyAdmin returns (uint16 majorId) {
        majorId = majorCount;
        majors[majorId] = name;
        majorCount++;

        emit MajorAdded(majorId, name);
    }

    /// @notice Returns every institution address ever approved, including
    ///         currently-revoked ones. Combine with institutions(address) to
    ///         read each one's current isApproved status. Satisfies FR-3.
    function getAllInstitutions() external view returns (address[] memory) {
        return institutionList;
    }

    /// @notice Checks whether an address is currently an approved Issuer.
    ///         Called by CredentialRegistry before allowing issuance.
    function isApprovedIssuer(address institutionAddress) external view override returns (bool) {
        return institutions[institutionAddress].isApproved;
    }

    /// @notice Checks whether a majorId refers to a registered major.
    ///         Called by CredentialRegistry before accepting a credential submission.
    function isValidMajor(uint16 majorId) external view override returns (bool) {
        return majorId < majorCount;
    }

    /// @notice Self-registers the caller's public key for an ENCRYPTION
    ///         keypair, so others can look it up to wrap an AES key for this
    ///         address. Anyone can call this for themselves — Admin, Issuer,
    ///         Owner, or Verifier all need to do this once before they can
    ///         receive an encrypted document key.
    /// @param publicKey The 64-byte uncompressed public key (no 0x04 prefix)
    ///        of a keypair DERIVED from a fixed-message wallet signature —
    ///        deliberately NOT the wallet's own real public key, since
    ///        wallets never expose their real private key to a dApp for
    ///        decryption. See the encryption module's deriveEncryptionKeypair().
    /// @dev No address-derivation check is performed here: since the
    ///      registered key is intentionally a SEPARATE keypair from the
    ///      wallet's own, its derived address will never equal msg.sender by
    ///      design — checking for that would make this function permanently
    ///      unusable. The security boundary is simply that only msg.sender
    ///      can write to their own mapping entry, which the EVM already
    ///      guarantees; self-consistency between the registered public key
    ///      and its matching private key comes from ECDSA signature
    ///      determinism (same wallet + same message always re-derives the
    ///      same keypair), not from an on-chain check.
    function registerPublicKey(bytes calldata publicKey) external {
        if (publicKey.length != 64) revert InvalidPublicKeyLength();

        encryptionPublicKeys[msg.sender] = publicKey;

        emit PublicKeyRegistered(msg.sender, publicKey);
    }

    /// @notice Convenience check for whether an address has registered a
    ///         public key yet — useful for the frontend to prompt the
    ///         one-time onboarding signature only when actually needed.
    function hasRegisteredPublicKey(address user) external view returns (bool) {
        return encryptionPublicKeys[user].length > 0;
    }
}
