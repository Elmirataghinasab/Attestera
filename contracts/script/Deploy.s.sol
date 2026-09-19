// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AccessControlRegistry} from "../src/AccessControlRegistry.sol";
import {CredentialRegistry} from "../src/CredentialRegistry.sol";

/// @title Deploy
/// @notice Deploys AccessControlRegistry and CredentialRegistry in the only
///         order that works: AccessControlRegistry first, since
///         CredentialRegistry's constructor needs its address.
///         See Implementation Plan, section 4.2, for the full deployment plan.
///
/// Usage:
///   forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast --verify
///
/// Required environment variables (.env, gitignored):
///   PRIVATE_KEY               deployer wallet, also becomes Admin
///   ARBITRUM_SEPOLIA_RPC_URL  RPC endpoint for Arbitrum Sepolia
///   ARBISCAN_API_KEY          for contract verification on Arbiscan
contract Deploy is Script {
    function run() external returns (AccessControlRegistry accessControl, CredentialRegistry credentialRegistry) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying with address:", deployer);
        console.log("This address will become the system Admin.");

        vm.startBroadcast(deployerPrivateKey);

        // Step 1: AccessControlRegistry first. The deployer becomes Admin.
        accessControl = new AccessControlRegistry(deployer);
        console.log("AccessControlRegistry deployed at:", address(accessControl));

        // Step 2: CredentialRegistry, wired to the AccessControlRegistry
        // address from step 1 — this order cannot be reversed.
        credentialRegistry = new CredentialRegistry(address(accessControl));
        console.log("CredentialRegistry deployed at:", address(credentialRegistry));

        vm.stopBroadcast();

        console.log("");
        console.log("Deployment complete. Save these addresses for the frontend config:");
        console.log("ACCESS_CONTROL_REGISTRY_ADDRESS=", address(accessControl));
        console.log("CREDENTIAL_REGISTRY_ADDRESS=", address(credentialRegistry));
    }
}
