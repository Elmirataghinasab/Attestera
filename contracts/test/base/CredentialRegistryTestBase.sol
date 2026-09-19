// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CredentialRegistry} from "../../src/CredentialRegistry.sol";
import {MockAccessControlRegistry} from "../mocks/MockAccessControlRegistry.sol";

/// @title CredentialRegistryTestBase
/// @notice Shared setUp and helpers for CredentialRegistry's unit, fuzz, and
///         invariant test suites, so all three stay in sync with the same
///         deployment and fixture addresses without duplicating setUp logic.
///         Deliberately has no test_ functions itself — it is a base contract,
///         not a suite to run on its own.
contract CredentialRegistryTestBase is Test {
    CredentialRegistry registry;
    MockAccessControlRegistry mockAccessControl;

    address issuer = makeAddr("issuer");
    address unapprovedIssuer = makeAddr("unapprovedIssuer");
    address owner = makeAddr("owner");
    address verifier = makeAddr("verifier");
    address stranger = makeAddr("stranger");

    event CredentialIssued(bytes32 indexed id, address indexed owner, address indexed issuer, uint256 timestamp);
    event CredentialRevoked(bytes32 indexed id, uint256 timestamp);
    event AccessGranted(bytes32 indexed credentialId, address indexed grantee, uint256 timestamp);
    event AccessRevoked(bytes32 indexed credentialId, address indexed grantee, uint256 timestamp);

    function setUp() public virtual {
        mockAccessControl = new MockAccessControlRegistry();
        registry = new CredentialRegistry(address(mockAccessControl));

        mockAccessControl.setApprovedIssuer(issuer, true);
        mockAccessControl.setValidMajorCount(5); // majorIds 0-4 are valid
    }

    /// @dev Issues a standard permanent Bachelor's credential and returns its id.
    function _issuePermanent() internal returns (bytes32) {
        vm.prank(issuer);
        return registry.issueCredential(
            owner, "QmTestCID123", "wrapped-key-bytes", CredentialRegistry.DocumentType.Bachelor, 0, false, 0
        );
    }

    /// @dev Issues a time-limited credential expiring at the given timestamp.
    function _issueTimeLimited(uint256 expiryDate) internal returns (bytes32) {
        vm.prank(issuer);
        return registry.issueCredential(
            owner, "QmTestCID123", "wrapped-key-bytes", CredentialRegistry.DocumentType.Certificate, 0, true, expiryDate
        );
    }
}
