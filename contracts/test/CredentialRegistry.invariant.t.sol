// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CredentialRegistry} from "../src/CredentialRegistry.sol";
import {MockAccessControlRegistry} from "./mocks/MockAccessControlRegistry.sol";
import {CredentialRegistryHandler} from "./invariant/CredentialRegistryHandler.sol";

/// @title CredentialRegistryInvariantTest
/// @notice Properties that must hold no matter WHAT sequence of valid calls
///         happens, in whatever order, however many times. Foundry drives
///         the Handler through hundreds of random call sequences and checks
///         every invariant_* function after each one. This catches bugs that
///         only show up after a specific multi-step sequence — the kind unit
///         tests, which each only run one scenario, cannot find.
contract CredentialRegistryInvariantTest is Test {
    CredentialRegistry registry;
    MockAccessControlRegistry mockAccessControl;
    CredentialRegistryHandler handler;

    address issuer = makeAddr("issuer");

    function setUp() public {
        mockAccessControl = new MockAccessControlRegistry();
        registry = new CredentialRegistry(address(mockAccessControl));
        mockAccessControl.setApprovedIssuer(issuer, true);
        mockAccessControl.setValidMajorCount(5);

        handler = new CredentialRegistryHandler(registry, mockAccessControl, issuer);

        // Restrict the invariant fuzzer to only calling the Handler, and
        // only its intended entry points — not the real contracts directly,
        // and not the Handler's constructor or view helpers.
        targetContract(address(handler));
    }

    /// @notice Once a credential has been revoked, no sequence of further
    ///         calls can ever move it out of the Revoked state. Revocation
    ///         is a one-way door — this is the property the whole state
    ///         machine design depends on.
    function invariant_revocationIsPermanent() public view {
        uint256 count = handler.issuedCount();
        for (uint256 i = 0; i < count; i++) {
            bytes32 id = handler.issuedIds(i);
            if (handler.wasRevoked(id)) {
                assertEq(
                    uint8(registry.getStatus(id)),
                    uint8(CredentialRegistry.Status.Revoked),
                    "a revoked credential must never leave the Revoked state"
                );
            }
        }
    }

    /// @notice Every credential ever issued must remain queryable forever —
    ///         getCredential must never revert for a real id, and its stored
    ///         owner must never be the zero address, no matter what else has
    ///         happened to the contract since issuance.
    function invariant_allIssuedCredentialsRemainQueryable() public view {
        uint256 count = handler.issuedCount();
        for (uint256 i = 0; i < count; i++) {
            bytes32 id = handler.issuedIds(i);
            (address owner,,,,,,,,) = registry.getCredential(id);
            assertTrue(owner != address(0), "an issued credential's owner must never read as zero");
        }
    }

    /// @notice Every credential id must appear in its own owner's list
    ///         returned by getCredentialsByOwner — this is the property that
    ///         makes FR-14 (view all credentials linked to a wallet) actually
    ///         reliable, regardless of how many other credentials, grants,
    ///         or revocations have happened in between.
    function invariant_everyCredentialAppearsInOwnersList() public view {
        uint256 count = handler.issuedCount();
        for (uint256 i = 0; i < count; i++) {
            bytes32 id = handler.issuedIds(i);
            (address owner,,,,,,,,) = registry.getCredential(id);

            bytes32[] memory ownedIds = registry.getCredentialsByOwner(owner);
            bool found = false;
            for (uint256 j = 0; j < ownedIds.length; j++) {
                if (ownedIds[j] == id) {
                    found = true;
                    break;
                }
            }
            assertTrue(found, "an issued credential must appear in its owner's credential list");
        }
    }

    /// @notice Every issued credential id must be unique, even across long,
    ///         arbitrary sequences of interleaved issuances — not just the
    ///         two-in-a-row case the unit test checks. A collision here would
    ///         mean two different credentials silently overwrite each other
    ///         in the credentials mapping.
    function invariant_allIssuedIdsAreUnique() public view {
        uint256 count = handler.issuedCount();
        for (uint256 i = 0; i < count; i++) {
            for (uint256 j = i + 1; j < count; j++) {
                assertTrue(handler.issuedIds(i) != handler.issuedIds(j), "two issued credentials must never share an id");
            }
        }
    }
}
