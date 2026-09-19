// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControlRegistry} from "../../src/CredentialRegistry.sol";

/// @title MockAccessControlRegistry
/// @notice A minimal, manually-controllable stand-in for AccessControlRegistry,
///         used only in CredentialRegistry's unit tests. This is the entire
///         payoff of depending on IAccessControlRegistry instead of the
///         concrete contract (see Implementation Plan, section 2.1): tests
///         can flip permissions directly with setters, with no need to
///         deploy or configure a real AccessControlRegistry alongside them.
contract MockAccessControlRegistry is IAccessControlRegistry {
    mapping(address => bool) public approvedIssuers;
    uint16 public validMajorCount;

    /// @notice Test helper: marks `issuer` as approved or not approved.
    function setApprovedIssuer(address issuer, bool approved) external {
        approvedIssuers[issuer] = approved;
    }

    /// @notice Test helper: sets how many majorIds count as valid, i.e.
    ///         majorId < validMajorCount will pass isValidMajor.
    function setValidMajorCount(uint16 count) external {
        validMajorCount = count;
    }

    function isApprovedIssuer(address institutionAddress) external view override returns (bool) {
        return approvedIssuers[institutionAddress];
    }

    function isValidMajor(uint16 majorId) external view override returns (bool) {
        return majorId < validMajorCount;
    }
}
