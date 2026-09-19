// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CredentialRegistry} from "../src/CredentialRegistry.sol";
import {CredentialRegistryTestBase} from "./base/CredentialRegistryTestBase.sol";

/// @title CredentialRegistryFuzzTest
/// @notice Randomized-input tests. Each test asserts a property that should
///         hold for ANY valid input, not just the hand-picked examples in
///         CredentialRegistry.t.sol. Foundry runs each with 256 random inputs
///         by default (set in foundry.toml [fuzz]).
contract CredentialRegistryFuzzTest is CredentialRegistryTestBase {
    /// @notice Any valid DocumentType and majorId combination should issue
    ///         and be stored exactly as submitted.
    function testFuzz_issueCredential_withRandomMajorAndDocType(uint8 docTypeRaw, uint16 majorId) public {
        docTypeRaw = uint8(bound(docTypeRaw, 0, 4)); // 5 DocumentType values
        majorId = uint16(bound(majorId, 0, 4)); // valid range per setUp

        vm.prank(issuer);
        bytes32 id = registry.issueCredential(
            owner, "QmTestCID123", "wrapped-key-bytes", CredentialRegistry.DocumentType(docTypeRaw), majorId, false, 0
        );

        (,,, CredentialRegistry.DocumentType storedType, uint16 storedMajor,,,,) = registry.getCredential(id);
        assertEq(uint8(storedType), docTypeRaw);
        assertEq(storedMajor, majorId);
    }

    /// @notice Credentials should issue correctly to any non-zero owner address,
    ///         not just the fixed `owner` fixture used in the unit tests.
    function testFuzz_issueCredential_toAnyOwnerAddress(address randomOwner) public {
        vm.assume(randomOwner != address(0));

        vm.prank(issuer);
        bytes32 id = registry.issueCredential(
            randomOwner, "QmTestCID123", "wrapped-key-bytes", CredentialRegistry.DocumentType.Bachelor, 0, false, 0
        );

        (address credOwner,,,,,,,,) = registry.getCredential(id);
        assertEq(credOwner, randomOwner);

        bytes32[] memory owned = registry.getCredentialsByOwner(randomOwner);
        assertEq(owned.length, 1);
        assertEq(owned[0], id);
    }

    /// @notice The exact boundary of getStatus: one second before expiryDate
    ///         must read Active, and the exact expiryDate timestamp itself
    ///         must already read Expired (the check is `>=`, not `>`).
    function testFuzz_getStatus_expiryBoundary(uint256 durationSeconds) public {
        durationSeconds = bound(durationSeconds, 2, 3650 days);
        uint256 issuedAt = block.timestamp;
        bytes32 id = _issueTimeLimited(issuedAt + durationSeconds);

        vm.warp(issuedAt + durationSeconds - 1);
        assertEq(uint8(registry.getStatus(id)), uint8(CredentialRegistry.Status.Active));

        vm.warp(issuedAt + durationSeconds);
        assertEq(uint8(registry.getStatus(id)), uint8(CredentialRegistry.Status.Expired));
    }

    /// @notice grantAccess should store the exact bytes submitted for any
    ///         grantee address and any key payload, and getWrappedKey should
    ///         return exactly that value back.
    function testFuzz_grantAccess_arbitraryGranteeAndKey(address grantee, bytes calldata wrappedKey) public {
        bytes32 id = _issuePermanent();

        vm.prank(owner);
        registry.grantAccess(id, grantee, wrappedKey);

        assertEq(registry.getWrappedKey(id, grantee), wrappedKey);
    }

    /// @notice Revoking access for a random grantee should always clear
    ///         exactly that grantee's entry, regardless of who they are.
    function testFuzz_revokeAccess_clearsArbitraryGrantee(address grantee) public {
        bytes32 id = _issuePermanent();

        vm.startPrank(owner);
        registry.grantAccess(id, grantee, "some-wrapped-key");
        registry.revokeAccess(id, grantee);
        vm.stopPrank();

        assertEq(registry.getWrappedKey(id, grantee), "");
    }

    /// @notice No matter which of the two valid roles calls revokeCredential
    ///         (only the issuer should succeed), every other random address
    ///         must be rejected.
    function testFuzz_revokeCredential_onlyIssuerEverSucceeds(address caller) public {
        bytes32 id = _issuePermanent();
        vm.assume(caller != issuer);

        vm.prank(caller);
        vm.expectRevert(CredentialRegistry.NotIssuerOfCredential.selector);
        registry.revokeCredential(id);

        // Sanity: the real issuer still succeeds afterward.
        vm.prank(issuer);
        registry.revokeCredential(id);
        assertEq(uint8(registry.getStatus(id)), uint8(CredentialRegistry.Status.Revoked));
    }
}
