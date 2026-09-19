// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CredentialRegistry} from "../../src/CredentialRegistry.sol";
import {MockAccessControlRegistry} from "../mocks/MockAccessControlRegistry.sol";

/// @title CredentialRegistryHandler
/// @notice Performs bounded, always-valid random actions against a real
///         CredentialRegistry, and tracks ghost state the invariant test can
///         check against. Every public function here is a candidate "step"
///         the invariant fuzzer can call, in any order, any number of times.
/// @dev Inputs are bounded (not just filtered with vm.assume) so that runs
///      spend their budget on meaningfully different sequences instead of
///      mostly rejecting invalid ones.
contract CredentialRegistryHandler is Test {
    CredentialRegistry public registry;
    MockAccessControlRegistry public mockAccessControl;
    address public issuer;

    /// @dev Ghost record of every credential id ever issued, in order —
    ///      the invariant test walks this list to check properties on
    ///      every credential that has ever existed.
    bytes32[] public issuedIds;

    /// @dev Ghost record of which issued ids have been revoked through this
    ///      handler, used to check that revocation is permanent.
    mapping(bytes32 => bool) public wasRevoked;

    constructor(CredentialRegistry _registry, MockAccessControlRegistry _mockAccessControl, address _issuer) {
        registry = _registry;
        mockAccessControl = _mockAccessControl;
        issuer = _issuer;
    }

    function issuedCount() external view returns (uint256) {
        return issuedIds.length;
    }

    /// @notice Issues a new credential to a deterministic-but-varied owner
    ///         address, permanent or time-limited depending on the fuzzed flag.
    function issueCredential(bool isTimeLimited, uint256 expiryOffsetSeconds, uint8 docTypeRaw, uint256 ownerSeed)
        public
    {
        expiryOffsetSeconds = bound(expiryOffsetSeconds, 1 days, 3650 days);
        docTypeRaw = uint8(bound(docTypeRaw, 0, 4));
        address owner = address(uint160(bound(ownerSeed, 1, type(uint160).max)));

        vm.prank(issuer);
        bytes32 id = registry.issueCredential(
            owner,
            "QmHandlerCID",
            "wrapped-key",
            CredentialRegistry.DocumentType(docTypeRaw),
            0,
            isTimeLimited,
            isTimeLimited ? block.timestamp + expiryOffsetSeconds : 0
        );

        issuedIds.push(id);
    }

    /// @notice Revokes a previously issued credential, picked by index.
    ///         No-ops if nothing has been issued yet, or if that credential
    ///         is already revoked — matching the real contract's own guard,
    ///         so this never reverts and never wastes a fuzz run.
    function revokeCredential(uint256 idSeed) public {
        if (issuedIds.length == 0) return;
        bytes32 id = issuedIds[idSeed % issuedIds.length];

        if (registry.getStatus(id) == CredentialRegistry.Status.Revoked) return;

        vm.prank(issuer);
        registry.revokeCredential(id);
        wasRevoked[id] = true;
    }

    /// @notice Grants access on a previously issued credential to a fuzzed
    ///         grantee address, called by that credential's real owner.
    function grantAccess(uint256 idSeed, address grantee, bytes calldata wrappedKey) public {
        if (issuedIds.length == 0) return;
        bytes32 id = issuedIds[idSeed % issuedIds.length];

        (address owner,,,,,,,,) = registry.getCredential(id);

        vm.prank(owner);
        registry.grantAccess(id, grantee, wrappedKey);
    }

    /// @notice Moves time forward, so expiry-related state changes.
    function warp(uint256 secondsForward) public {
        secondsForward = bound(secondsForward, 0, 400 days);
        vm.warp(block.timestamp + secondsForward);
    }
}
