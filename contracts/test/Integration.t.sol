// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AccessControlRegistry} from "../src/AccessControlRegistry.sol";
import {CredentialRegistry} from "../src/CredentialRegistry.sol";

/// @title Integration
/// @notice Exercises AccessControlRegistry and CredentialRegistry together,
///         as real deployed contracts talking to each other — not mocks.
///         This is the test that actually proves the sequence diagrams in
///         the Design Decisions Log are correct, not just illustrative.
contract IntegrationTest is Test {
    AccessControlRegistry accessControl;
    CredentialRegistry credentialRegistry;

    address admin = makeAddr("admin");
    address university = makeAddr("university");
    address student = makeAddr("student");
    address employer = makeAddr("employer");

    function setUp() public {
        accessControl = new AccessControlRegistry(admin);
        credentialRegistry = new CredentialRegistry(address(accessControl));

        vm.startPrank(admin);
        accessControl.approveInstitution(university, "University of Tehran");
        accessControl.addMajor("Computer Science"); // majorId 0
        vm.stopPrank();
    }

    /// @notice Approve institution -> issue credential -> confirm Active ->
    ///         grant access to a verifier -> verifier reads the wrapped key ->
    ///         revoke -> confirm Revoked. Matches Figures 3, 4, and 5 in the
    ///         Design Decisions Log (Issue, Grant Access, Verify sequences).
    function test_fullLifecycle() public {
        // --- Issue Credential (Figure 3) ---
        vm.prank(university);
        bytes32 id = credentialRegistry.issueCredential(
            student,
            "QmStudentDiplomaCID",
            "wrapped-key-for-student",
            CredentialRegistry.DocumentType.Bachelor,
            0, // Computer Science
            false,
            0
        );

        assertEq(uint8(credentialRegistry.getStatus(id)), uint8(CredentialRegistry.Status.Active));

        (address owner, address issuer,,,,,,,) = credentialRegistry.getCredential(id);
        assertEq(owner, student);
        assertEq(issuer, university);

        // --- Grant Access (Figure 4) ---
        vm.prank(student);
        credentialRegistry.grantAccess(id, employer, "wrapped-key-for-employer");

        // --- Verify Credential (Figure 5) ---
        // Metadata check: no wallet needed, anyone can call it.
        vm.prank(employer);
        (,,,,,,,, CredentialRegistry.Status statusBeforeRevoke) = credentialRegistry.getCredential(id);
        assertEq(uint8(statusBeforeRevoke), uint8(CredentialRegistry.Status.Active));

        // Full document access: the employer reads the key wrapped specifically for them.
        bytes memory wrappedKey = credentialRegistry.getWrappedKey(id, employer);
        assertEq(wrappedKey, "wrapped-key-for-employer");

        // A random third party was never granted access.
        address randomThirdParty = makeAddr("randomThirdParty");
        assertEq(credentialRegistry.getWrappedKey(id, randomThirdParty), "");

        // --- Revoke ---
        vm.prank(university);
        credentialRegistry.revokeCredential(id);

        assertEq(uint8(credentialRegistry.getStatus(id)), uint8(CredentialRegistry.Status.Revoked));
    }

    /// @notice Issues a time-limited credential, warps past its expiry, confirms
    ///         it reads as Expired, and confirms it remains revocable afterward —
    ///         matching both transitions into Revoked on the state machine diagram.
    function test_expiryFlow() public {
        vm.prank(university);
        bytes32 id = credentialRegistry.issueCredential(
            student,
            "QmCertificateCID",
            "wrapped-key-for-student",
            CredentialRegistry.DocumentType.Certificate,
            0,
            true,
            block.timestamp + 180 days
        );

        assertEq(uint8(credentialRegistry.getStatus(id)), uint8(CredentialRegistry.Status.Active));

        vm.warp(block.timestamp + 181 days);
        assertEq(uint8(credentialRegistry.getStatus(id)), uint8(CredentialRegistry.Status.Expired));

        // Still revocable even after expiry — e.g. fraud discovered later.
        vm.prank(university);
        credentialRegistry.revokeCredential(id);
        assertEq(uint8(credentialRegistry.getStatus(id)), uint8(CredentialRegistry.Status.Revoked));
    }

    /// @notice An institution revoked at the AccessControlRegistry level can no
    ///         longer issue new credentials, even though credentials it already
    ///         issued remain valid and queryable. Confirms the cross-contract
    ///         permission check in CredentialRegistry actually reads live state.
    function test_revokedInstitution_cannotIssueNewCredentials_butOldOnesRemainValid() public {
        vm.prank(university);
        bytes32 oldId = credentialRegistry.issueCredential(
            student, "QmOldCID", "wrapped-key", CredentialRegistry.DocumentType.Bachelor, 0, false, 0
        );

        vm.prank(admin);
        accessControl.revokeInstitution(university);

        // New issuance now fails.
        vm.prank(university);
        vm.expectRevert(CredentialRegistry.NotApprovedIssuer.selector);
        credentialRegistry.issueCredential(
            student, "QmNewCID", "wrapped-key", CredentialRegistry.DocumentType.Bachelor, 0, false, 0
        );

        // The credential issued before revocation is untouched.
        assertEq(uint8(credentialRegistry.getStatus(oldId)), uint8(CredentialRegistry.Status.Active));
    }

    /// @notice A credential referencing a majorId that becomes invalid later
    ///         (which cannot actually happen since majors are append-only) —
    ///         instead this confirms a brand-new major is usable immediately
    ///         after being added, proving the two contracts read live state
    ///         rather than a stale snapshot.
    function test_newlyAddedMajor_isUsableImmediately() public {
        vm.prank(admin);
        uint16 newMajorId = accessControl.addMajor("Data Science");

        vm.prank(university);
        bytes32 id = credentialRegistry.issueCredential(
            student, "QmCID", "wrapped-key", CredentialRegistry.DocumentType.Master, newMajorId, false, 0
        );

        (,,,, uint16 storedMajorId,,,,) = credentialRegistry.getCredential(id);
        assertEq(storedMajorId, newMajorId);
    }
}
