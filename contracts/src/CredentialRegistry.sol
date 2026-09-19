// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAccessControlRegistry
/// @notice Minimal interface exposing only what CredentialRegistry needs from
///         AccessControlRegistry: the two permission checks it calls before
///         issuing a credential. Defined here, in the file that consumes it,
///         rather than in a separate interfaces/ file — AccessControlRegistry
///         imports it from here to implement it. Keeping this interface narrow
///         means CredentialRegistry can be unit-tested against a small mock
///         instead of a full deployment — see test/mocks/MockAccessControlRegistry.sol.
interface IAccessControlRegistry {
    /// @notice Returns true if `institutionAddress` is currently an approved Issuer.
    function isApprovedIssuer(address institutionAddress) external view returns (bool);

    /// @notice Returns true if `majorId` refers to a registered major.
    function isValidMajor(uint16 majorId) external view returns (bool);
}

/// @title CredentialRegistry
/// @notice Core contract handling credential issuance, revocation, and
///         encrypted document access grants. Depends on AccessControlRegistry
///         only for two permission checks: confirming the caller is an
///         approved Issuer, and confirming a submitted majorId is valid.
///         Depends on the IAccessControlRegistry interface rather than the
///         concrete contract, so unit tests can substitute a lightweight mock
///         instead of deploying a full AccessControlRegistry — see the
///         Implementation Plan, section 2.1, for the reasoning.
/// @dev Deployed as an immutable contract — see NFR-20 in the Design Decisions Log.
///      Access grants are intentionally NOT modeled as a struct; see the
///      "Access Grants — Why Not a Struct?" section of the Design Decisions Log
///      for the full reasoning behind this choice.
contract CredentialRegistry {
    IAccessControlRegistry public immutable ACCESS_CONTROL;

    enum DocumentType {
        Bachelor,
        Master,
        Certificate,
        PhD,
        Diploma
    }

    /// @dev Only ever written on-chain as Active or Revoked. Expired is never
    ///      stored — it is derived at read time in getStatus() by comparing
    ///      block.timestamp to expiryDate. This matches FR-11: expiry happens
    ///      automatically, without any manual on-chain action.
    enum Status {
        Active,
        Expired,
        Revoked
    }

    struct Credential {
        bytes32 id;
        address owner;
        address issuer;
        string ipfsCid;
        DocumentType documentType;
        uint16 majorId;
        uint256 issueDate;
        bool isTimeLimited;
        uint256 expiryDate; // 0 if permanent
        Status status; // Active or Revoked only; never written as Expired
    }

    mapping(bytes32 => Credential) private credentials;

    /// @dev owner => list of credential ids issued to them, in issuance order.
    ///      Unlike institutionList, no dedupe logic is needed here since every
    ///      issueCredential call generates a brand-new, unique id — there is
    ///      no "re-issuing the same credential" case to guard against.
    ///      Satisfies FR-14.
    mapping(address => bytes32[]) private credentialsByOwner;

    /// @dev credentialId => granteeWallet => encryptedKeyForGrantee.
    ///      No struct: the presence (and value) of this entry IS the grant.
    ///      Descriptive metadata (when granted, whether later revoked) lives
    ///      only in events, not in contract storage — see Design Decisions Log 3.5.
    mapping(bytes32 => mapping(address => bytes)) private accessGrants;

    uint256 private nonce;

    event CredentialIssued(bytes32 indexed id, address indexed owner, address indexed issuer, uint256 timestamp);
    event CredentialRevoked(bytes32 indexed id, uint256 timestamp);
    event AccessGranted(bytes32 indexed credentialId, address indexed grantee, uint256 timestamp);
    event AccessRevoked(bytes32 indexed credentialId, address indexed grantee, uint256 timestamp);

    error NotApprovedIssuer();
    error InvalidMajor();
    error CredentialNotFound();
    error NotIssuerOfCredential();
    error NotOwnerOfCredential();
    error AlreadyRevoked();

    modifier onlyApprovedIssuer() {
        _onlyApprovedIssuer();
        _;
    }

    function _onlyApprovedIssuer() internal view {
        if (!ACCESS_CONTROL.isApprovedIssuer(msg.sender)) revert NotApprovedIssuer();
    }

    constructor(address _accessControl) {
        ACCESS_CONTROL = IAccessControlRegistry(_accessControl);
    }

    /// @notice Issues a new credential. Only callable by an approved Issuer.
    /// @param owner The student/graduate's wallet address.
    /// @param ipfsCid Content hash of the encrypted document on IPFS.
    /// @param ownerWrappedKey The AES key, wrapped with the owner's registered
    ///        encryption public key. Stored via the same accessGrants mapping
    ///        used for every other grant — the owner is simply the first
    ///        grantee of their own credential, retrievable the same way any
    ///        other grantee's key is: getWrappedKey(id, owner).
    /// @param documentType Bachelor, Master, Certificate, PhD, or Diploma.
    /// @param majorId Must reference a major already registered in AccessControlRegistry.
    /// @param isTimeLimited Whether this credential expires.
    /// @param expiryDate Expiry timestamp; ignored (should be 0) if isTimeLimited is false.
    /// @return id The unique identifier assigned to this credential.
    function issueCredential(
        address owner,
        string calldata ipfsCid,
        bytes calldata ownerWrappedKey,
        DocumentType documentType,
        uint16 majorId,
        bool isTimeLimited,
        uint256 expiryDate
    ) external onlyApprovedIssuer returns (bytes32 id) {
        if (!ACCESS_CONTROL.isValidMajor(majorId)) revert InvalidMajor();

        id = keccak256(abi.encodePacked(owner, msg.sender, ipfsCid, block.timestamp, nonce));
        nonce++;

        credentials[id] = Credential({
            id: id,
            owner: owner,
            issuer: msg.sender,
            ipfsCid: ipfsCid,
            documentType: documentType,
            majorId: majorId,
            issueDate: block.timestamp,
            isTimeLimited: isTimeLimited,
            expiryDate: isTimeLimited ? expiryDate : 0,
            status: Status.Active
        });

        credentialsByOwner[owner].push(id);
        accessGrants[id][owner] = ownerWrappedKey;

        emit CredentialIssued(id, owner, msg.sender, block.timestamp);
        emit AccessGranted(id, owner, block.timestamp);
    }

    /// @notice Revokes a credential. Only callable by the issuing institution.
    ///         Can be called regardless of whether the credential has expired —
    ///         expiry and revocation are independent, see the state machine
    ///         diagram in the Design Decisions Log.
    function revokeCredential(bytes32 id) external {
        Credential storage cred = credentials[id];
        if (cred.issuer == address(0)) revert CredentialNotFound();
        if (msg.sender != cred.issuer) revert NotIssuerOfCredential();
        if (cred.status == Status.Revoked) revert AlreadyRevoked();

        cred.status = Status.Revoked;

        emit CredentialRevoked(id, block.timestamp);
    }

    /// @notice Grants a Verifier access to the full document by storing an
    ///         AES key re-wrapped for their public key. Only the credential
    ///         Owner can call this.
    /// @param wrappedKey The AES key, re-encrypted with the grantee's public key.
    function grantAccess(bytes32 id, address grantee, bytes calldata wrappedKey) external {
        Credential storage cred = credentials[id];
        if (cred.owner == address(0)) revert CredentialNotFound();
        if (msg.sender != cred.owner) revert NotOwnerOfCredential();

        accessGrants[id][grantee] = wrappedKey;

        emit AccessGranted(id, grantee, block.timestamp);
    }

    /// @notice Revokes a previously granted access. Only the credential Owner can call this.
    function revokeAccess(bytes32 id, address grantee) external {
        Credential storage cred = credentials[id];
        if (cred.owner == address(0)) revert CredentialNotFound();
        if (msg.sender != cred.owner) revert NotOwnerOfCredential();

        delete accessGrants[id][grantee];

        emit AccessRevoked(id, grantee, block.timestamp);
    }

    /// @notice Returns the effective status of a credential, computing Expired
    ///         on the fly rather than relying on stored state.
    function getStatus(bytes32 id) public view returns (Status) {
        Credential storage cred = credentials[id];
        if (cred.issuer == address(0)) revert CredentialNotFound();
        if (cred.status == Status.Revoked) return Status.Revoked;
        if (cred.isTimeLimited && block.timestamp >= cred.expiryDate) return Status.Expired;
        return Status.Active;
    }

    /// @notice Returns every credential id ever issued to `owner`, in issuance
    ///         order. Combine with getCredential(id) to read each one's full
    ///         metadata and current status. Satisfies FR-14.
    function getCredentialsByOwner(address owner) external view returns (bytes32[] memory) {
        return credentialsByOwner[owner];
    }

    /// @notice Returns a credential's public metadata. No wallet connection
    ///         required to call this — matches FR-18.
    function getCredential(bytes32 id)
        external
        view
        returns (
            address owner,
            address issuer,
            string memory ipfsCid,
            DocumentType documentType,
            uint16 majorId,
            uint256 issueDate,
            bool isTimeLimited,
            uint256 expiryDate,
            Status status
        )
    {
        Credential storage cred = credentials[id];
        if (cred.issuer == address(0)) revert CredentialNotFound();

        return (
            cred.owner,
            cred.issuer,
            cred.ipfsCid,
            cred.documentType,
            cred.majorId,
            cred.issueDate,
            cred.isTimeLimited,
            cred.expiryDate,
            getStatus(id)
        );
    }

    /// @notice Returns the wrapped AES key for a specific grantee, so their
    ///         browser can decrypt it locally with their own private key.
    ///         Returns an empty bytes value if no access has been granted.
    function getWrappedKey(bytes32 id, address grantee) external view returns (bytes memory) {
        return accessGrants[id][grantee];
    }
}
