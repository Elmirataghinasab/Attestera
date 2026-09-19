// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CredentialRegistry} from "../src/CredentialRegistry.sol";
import {CredentialRegistryTestBase} from "./base/CredentialRegistryTestBase.sol";

/// @title CredentialRegistryTest
/// @notice Unit tests only — happy paths, reverts, and events with fixed
///         inputs. Randomized-input tests live in CredentialRegistry.fuzz.t.sol,
///         and multi-call sequence properties live in
///         CredentialRegistry.invariant.t.sol. Keeping these separate makes
///         it obvious which failure mode any given red test represents.
contract CredentialRegistryTest is CredentialRegistryTestBase {
    // ---------------------------------------------------------------------
    // issueCredential
    // ---------------------------------------------------------------------

    function test_issueCredential_succeeds_whenIssuerApproved() public {
        bytes32 id = _issuePermanent();

        (address credOwner, address credIssuer,,,,,,,) = registry.getCredential(id);
        assertEq(credOwner, owner);
        assertEq(credIssuer, issuer);
    }

    function test_issueCredential_emitsEvent() public {
        vm.expectEmit(false, true, true, false);
        emit CredentialIssued(bytes32(0), owner, issuer, block.timestamp);

        vm.prank(issuer);
        registry.issueCredential(
            owner, "QmTestCID123", "wrapped-key-bytes", CredentialRegistry.DocumentType.Bachelor, 0, false, 0
        );
    }

    function test_issueCredential_reverts_whenIssuerNotApproved() public {
        vm.prank(unapprovedIssuer);
        vm.expectRevert(CredentialRegistry.NotApprovedIssuer.selector);
        registry.issueCredential(
            owner, "QmTestCID123", "wrapped-key-bytes", CredentialRegistry.DocumentType.Bachelor, 0, false, 0
        );
    }

    function test_issueCredential_reverts_whenMajorInvalid() public {
        vm.prank(issuer);
        vm.expectRevert(CredentialRegistry.InvalidMajor.selector);
        registry.issueCredential(
            owner,
            "QmTestCID123",
            "wrapped-key-bytes",
            CredentialRegistry.DocumentType.Bachelor,
            99, // out of range, only 0-4 are valid per setUp
            false,
            0
        );
    }

    function test_issueCredential_generatesUniqueId() public {
        bytes32 id1 = _issuePermanent();
        bytes32 id2 = _issuePermanent();
        assertTrue(id1 != id2);
    }

    function test_issueCredential_permanentCredential_hasZeroExpiry() public {
        bytes32 id = _issuePermanent();

        (,,,,,, bool isTimeLimited, uint256 expiryDate,) = registry.getCredential(id);
        assertFalse(isTimeLimited);
        assertEq(expiryDate, 0);
    }

    function test_issueCredential_addsToOwnersList() public {
        bytes32 id1 = _issuePermanent();
        bytes32 id2 = _issuePermanent();

        bytes32[] memory owned = registry.getCredentialsByOwner(owner);
        assertEq(owned.length, 2);
        assertEq(owned[0], id1);
        assertEq(owned[1], id2);
    }

    /// @notice The owner must be able to retrieve their OWN wrapped key via
    ///         the same getWrappedKey function verifiers use — this was a
    ///         real bug caught while wiring up the frontend: the wrapped key
    ///         passed into issueCredential was being stored in a dead struct
    ///         field with no getter, so the owner had no way to ever read it
    ///         back. The fix treats the owner as the first grantee of their
    ///         own credential, via accessGrants, not a separate code path.
    function test_issueCredential_ownerCanRetrieveTheirOwnWrappedKey() public {
        vm.prank(issuer);
        bytes32 id = registry.issueCredential(
            owner, "QmTestCID123", "owners-wrapped-key", CredentialRegistry.DocumentType.Bachelor, 0, false, 0
        );

        assertEq(registry.getWrappedKey(id, owner), "owners-wrapped-key");
    }

    function test_issueCredential_emitsAccessGrantedForOwner() public {
        vm.expectEmit(false, true, false, false);
        emit AccessGranted(bytes32(0), owner, block.timestamp);

        vm.prank(issuer);
        registry.issueCredential(
            owner, "QmTestCID123", "owners-wrapped-key", CredentialRegistry.DocumentType.Bachelor, 0, false, 0
        );
    }

    // ---------------------------------------------------------------------
    // revokeCredential
    // ---------------------------------------------------------------------

    function test_revokeCredential_succeeds_whenCalledByIssuer() public {
        bytes32 id = _issuePermanent();

        vm.prank(issuer);
        registry.revokeCredential(id);

        assertEq(uint8(registry.getStatus(id)), uint8(CredentialRegistry.Status.Revoked));
    }

    function test_revokeCredential_reverts_whenNotIssuer() public {
        bytes32 id = _issuePermanent();

        vm.prank(stranger);
        vm.expectRevert(CredentialRegistry.NotIssuerOfCredential.selector);
        registry.revokeCredential(id);
    }

    function test_revokeCredential_reverts_whenAlreadyRevoked() public {
        bytes32 id = _issuePermanent();

        vm.startPrank(issuer);
        registry.revokeCredential(id);

        vm.expectRevert(CredentialRegistry.AlreadyRevoked.selector);
        registry.revokeCredential(id);
        vm.stopPrank();
    }

    function test_revokeCredential_reverts_whenNotFound() public {
        vm.prank(issuer);
        vm.expectRevert(CredentialRegistry.CredentialNotFound.selector);
        registry.revokeCredential(bytes32(uint256(0xdead)));
    }

    // ---------------------------------------------------------------------
    // grantAccess / revokeAccess
    // ---------------------------------------------------------------------

    function test_grantAccess_succeeds_whenCalledByOwner() public {
        bytes32 id = _issuePermanent();

        vm.prank(owner);
        registry.grantAccess(id, verifier, "wrapped-key-for-verifier");

        assertEq(registry.getWrappedKey(id, verifier), "wrapped-key-for-verifier");
    }

    function test_grantAccess_emitsEvent() public {
        bytes32 id = _issuePermanent();

        vm.expectEmit(true, true, false, false);
        emit AccessGranted(id, verifier, block.timestamp);

        vm.prank(owner);
        registry.grantAccess(id, verifier, "wrapped-key-for-verifier");
    }

    function test_grantAccess_reverts_whenNotOwner() public {
        bytes32 id = _issuePermanent();

        vm.prank(stranger);
        vm.expectRevert(CredentialRegistry.NotOwnerOfCredential.selector);
        registry.grantAccess(id, verifier, "wrapped-key-for-verifier");
    }

    function test_revokeAccess_deletesEntry() public {
        bytes32 id = _issuePermanent();

        vm.startPrank(owner);
        registry.grantAccess(id, verifier, "wrapped-key-for-verifier");
        registry.revokeAccess(id, verifier);
        vm.stopPrank();

        assertEq(registry.getWrappedKey(id, verifier), "");
    }

    function test_revokeAccess_reverts_whenNotOwner() public {
        bytes32 id = _issuePermanent();

        vm.prank(owner);
        registry.grantAccess(id, verifier, "wrapped-key-for-verifier");

        vm.prank(stranger);
        vm.expectRevert(CredentialRegistry.NotOwnerOfCredential.selector);
        registry.revokeAccess(id, verifier);
    }

    // ---------------------------------------------------------------------
    // getStatus — the core state machine logic
    // ---------------------------------------------------------------------

    function test_getStatus_returnsActive_forFreshCredential() public {
        bytes32 id = _issuePermanent();
        assertEq(uint8(registry.getStatus(id)), uint8(CredentialRegistry.Status.Active));
    }

    function test_getStatus_returnsActive_forTimeLimitedBeforeExpiry() public {
        bytes32 id = _issueTimeLimited(block.timestamp + 365 days);
        assertEq(uint8(registry.getStatus(id)), uint8(CredentialRegistry.Status.Active));
    }

    function test_getStatus_returnsExpired_afterExpiryDate() public {
        bytes32 id = _issueTimeLimited(block.timestamp + 30 days);

        vm.warp(block.timestamp + 31 days);

        assertEq(uint8(registry.getStatus(id)), uint8(CredentialRegistry.Status.Expired));
    }

    function test_getStatus_permanentCredential_neverExpires() public {
        bytes32 id = _issuePermanent();

        vm.warp(block.timestamp + 100 * 365 days);

        assertEq(uint8(registry.getStatus(id)), uint8(CredentialRegistry.Status.Active));
    }

    function test_getStatus_returnsRevoked_regardlessOfExpiry() public {
        // A permanent credential, revoked — proves Revoked doesn't require expiry.
        bytes32 permanentId = _issuePermanent();
        vm.prank(issuer);
        registry.revokeCredential(permanentId);
        assertEq(uint8(registry.getStatus(permanentId)), uint8(CredentialRegistry.Status.Revoked));

        // An already-expired credential, revoked afterward — proves both arrows
        // into Revoked from the state machine diagram work correctly.
        bytes32 expiredId = _issueTimeLimited(block.timestamp + 1 days);
        vm.warp(block.timestamp + 2 days);
        assertEq(uint8(registry.getStatus(expiredId)), uint8(CredentialRegistry.Status.Expired));

        vm.prank(issuer);
        registry.revokeCredential(expiredId);
        assertEq(uint8(registry.getStatus(expiredId)), uint8(CredentialRegistry.Status.Revoked));
    }

    function test_getStatus_reverts_whenNotFound() public {
        vm.expectRevert(CredentialRegistry.CredentialNotFound.selector);
        registry.getStatus(bytes32(uint256(0xdead)));
    }

    // ---------------------------------------------------------------------
    // getCredential
    // ---------------------------------------------------------------------

    function test_getCredential_callableByAnyone_noWalletRequired() public {
        bytes32 id = _issuePermanent();

        // Called from a completely unrelated address — matches FR-18.
        vm.prank(stranger);
        (address credOwner,,,,,,,,) = registry.getCredential(id);
        assertEq(credOwner, owner);
    }

    function test_getCredential_reflectsComputedExpiredStatus() public {
        bytes32 id = _issueTimeLimited(block.timestamp + 1 days);
        vm.warp(block.timestamp + 2 days);

        (,,,,,,,, CredentialRegistry.Status status) = registry.getCredential(id);
        assertEq(uint8(status), uint8(CredentialRegistry.Status.Expired));
    }
}
