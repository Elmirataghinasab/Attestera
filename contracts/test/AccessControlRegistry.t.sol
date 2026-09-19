// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AccessControlRegistry} from "../src/AccessControlRegistry.sol";

contract AccessControlRegistryTest is Test {
    AccessControlRegistry registry;

    address admin = makeAddr("admin");
    address institution1 = makeAddr("institution1");
    address institution2 = makeAddr("institution2");
    address stranger = makeAddr("stranger");

    event InstitutionApproved(address indexed institutionAddress, string name);
    event InstitutionRevoked(address indexed institutionAddress);
    event MajorAdded(uint16 indexed majorId, string name);
    event PublicKeyRegistered(address indexed user, bytes publicKey);

    function setUp() public {
        registry = new AccessControlRegistry(admin);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function test_admin_setAtDeployment() public view {
        assertEq(registry.ADMIN(), admin);
    }

    // ---------------------------------------------------------------------
    // approveInstitution
    // ---------------------------------------------------------------------

    function test_approveInstitution_succeeds_whenCalledByAdmin() public {
        vm.prank(admin);
        registry.approveInstitution(institution1, "University of Tehran");

        (address addr, string memory name, bool isApproved, uint256 approvedDate) = registry.institutions(institution1);
        assertEq(addr, institution1);
        assertEq(name, "University of Tehran");
        assertTrue(isApproved);
        assertEq(approvedDate, block.timestamp);
    }

    function test_approveInstitution_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit InstitutionApproved(institution1, "University of Tehran");

        vm.prank(admin);
        registry.approveInstitution(institution1, "University of Tehran");
    }

    function test_approveInstitution_reverts_whenNotAdmin() public {
        vm.prank(stranger);
        vm.expectRevert(AccessControlRegistry.NotAdmin.selector);
        registry.approveInstitution(institution1, "University of Tehran");
    }

    function test_approveInstitution_reverts_whenAlreadyApproved() public {
        vm.startPrank(admin);
        registry.approveInstitution(institution1, "University of Tehran");

        vm.expectRevert(AccessControlRegistry.InstitutionAlreadyApproved.selector);
        registry.approveInstitution(institution1, "University of Tehran (duplicate)");
        vm.stopPrank();
    }

    function test_approveInstitution_afterRevoke_reApproves_withoutDuplicateInList() public {
        vm.startPrank(admin);
        registry.approveInstitution(institution1, "University of Tehran");
        registry.revokeInstitution(institution1);
        registry.approveInstitution(institution1, "University of Tehran");
        vm.stopPrank();

        address[] memory all = registry.getAllInstitutions();
        assertEq(all.length, 1);
        assertEq(all[0], institution1);
    }

    // ---------------------------------------------------------------------
    // revokeInstitution
    // ---------------------------------------------------------------------

    function test_revokeInstitution_succeeds() public {
        vm.startPrank(admin);
        registry.approveInstitution(institution1, "University of Tehran");
        registry.revokeInstitution(institution1);
        vm.stopPrank();

        assertFalse(registry.isApprovedIssuer(institution1));
    }

    function test_revokeInstitution_emitsEvent() public {
        vm.prank(admin);
        registry.approveInstitution(institution1, "University of Tehran");

        vm.expectEmit(true, false, false, false);
        emit InstitutionRevoked(institution1);

        vm.prank(admin);
        registry.revokeInstitution(institution1);
    }

    function test_revokeInstitution_reverts_whenNotApproved() public {
        vm.prank(admin);
        vm.expectRevert(AccessControlRegistry.InstitutionNotApproved.selector);
        registry.revokeInstitution(institution1);
    }

    function test_revokeInstitution_reverts_whenNotAdmin() public {
        vm.prank(admin);
        registry.approveInstitution(institution1, "University of Tehran");

        vm.prank(stranger);
        vm.expectRevert(AccessControlRegistry.NotAdmin.selector);
        registry.revokeInstitution(institution1);
    }

    // ---------------------------------------------------------------------
    // addMajor
    // ---------------------------------------------------------------------

    function test_addMajor_incrementsCount() public {
        vm.startPrank(admin);
        uint16 id0 = registry.addMajor("Computer Science");
        uint16 id1 = registry.addMajor("Computer Engineering");
        vm.stopPrank();

        assertEq(id0, 0);
        assertEq(id1, 1);
        assertEq(registry.majorCount(), 2);
        assertEq(registry.majors(0), "Computer Science");
        assertEq(registry.majors(1), "Computer Engineering");
    }

    function test_addMajor_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit MajorAdded(0, "Computer Science");

        vm.prank(admin);
        registry.addMajor("Computer Science");
    }

    function test_addMajor_reverts_whenNotAdmin() public {
        vm.prank(stranger);
        vm.expectRevert(AccessControlRegistry.NotAdmin.selector);
        registry.addMajor("Computer Science");
    }

    // ---------------------------------------------------------------------
    // isApprovedIssuer / isValidMajor (the two functions CredentialRegistry calls)
    // ---------------------------------------------------------------------

    function test_isApprovedIssuer_returnsFalse_forUnknownAddress() public view {
        assertFalse(registry.isApprovedIssuer(stranger));
    }

    function test_isApprovedIssuer_returnsTrue_afterApproval() public {
        vm.prank(admin);
        registry.approveInstitution(institution1, "University of Tehran");

        assertTrue(registry.isApprovedIssuer(institution1));
    }

    function test_isValidMajor_returnsFalse_forOutOfRangeId() public view {
        assertFalse(registry.isValidMajor(0));
    }

    function test_isValidMajor_returnsTrue_forRegisteredId() public {
        vm.prank(admin);
        registry.addMajor("Computer Science");

        assertTrue(registry.isValidMajor(0));
        assertFalse(registry.isValidMajor(1));
    }

    // ---------------------------------------------------------------------
    // getAllInstitutions (FR-3)
    // ---------------------------------------------------------------------

    function test_getAllInstitutions_returnsAllApprovedIncludingRevoked() public {
        vm.startPrank(admin);
        registry.approveInstitution(institution1, "University of Tehran");
        registry.approveInstitution(institution2, "Tabriz University of Technology");
        registry.revokeInstitution(institution1);
        vm.stopPrank();

        address[] memory all = registry.getAllInstitutions();
        assertEq(all.length, 2);
        assertEq(all[0], institution1);
        assertEq(all[1], institution2);

        // Revoked institution still appears in the list, but isApproved is false —
        // consumers must check institutions(address).isApproved separately.
        assertFalse(registry.isApprovedIssuer(institution1));
        assertTrue(registry.isApprovedIssuer(institution2));
    }

    // ---------------------------------------------------------------------
    // registerPublicKey (encryption module support)
    // ---------------------------------------------------------------------
    // Test vector generated from a real secp256k1 keypair (Node's `crypto`
    // module, secp256k1 curve), with the address derived the same way
    // Ethereum does: the low 20 bytes of keccak256(uncompressed public key
    // without the 0x04 prefix). This is not a fabricated pair — it is
    // mathematically real, so a mismatched pair would genuinely fail.

    address constant REAL_ADDRESS = 0xb74B8623CaFb96EbfAc3912F16154371A808A1F4;
    bytes constant REAL_PUBLIC_KEY =
        hex"59b8bc9797fdcc2993a8d5ce00740906d478cd8b16b0280bdb2c24a6d6b4d35aedca7735fe9887ecfed8375d0336222e0ae9c6180392ef44bcc888b9755d1acc";

    function test_registerPublicKey_succeeds_withMatchingKeyAndAddress() public {
        vm.prank(REAL_ADDRESS);
        registry.registerPublicKey(REAL_PUBLIC_KEY);

        assertEq(registry.encryptionPublicKeys(REAL_ADDRESS), REAL_PUBLIC_KEY);
        assertTrue(registry.hasRegisteredPublicKey(REAL_ADDRESS));
    }

    function test_registerPublicKey_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit PublicKeyRegistered(REAL_ADDRESS, REAL_PUBLIC_KEY);

        vm.prank(REAL_ADDRESS);
        registry.registerPublicKey(REAL_PUBLIC_KEY);
    }

    function test_registerPublicKey_succeeds_evenWhenKeyDoesNotDeriveToCaller() public {
        // This is the crucial case: the registered key is a SEPARATE,
        // derived encryption keypair, not the caller's real wallet key, so
        // it will almost never derive back to the caller's own address —
        // and that must be fine, not a revert. See AccessControlRegistry's
        // registerPublicKey NatSpec for the full reasoning.
        vm.prank(stranger);
        registry.registerPublicKey(REAL_PUBLIC_KEY);

        assertEq(registry.encryptionPublicKeys(stranger), REAL_PUBLIC_KEY);
        assertTrue(registry.hasRegisteredPublicKey(stranger));
    }

    function test_registerPublicKey_reverts_whenWrongLength() public {
        vm.prank(REAL_ADDRESS);
        vm.expectRevert(AccessControlRegistry.InvalidPublicKeyLength.selector);
        registry.registerPublicKey(hex"1234"); // nowhere near 64 bytes
    }

    function test_hasRegisteredPublicKey_returnsFalse_beforeRegistration() public view {
        assertFalse(registry.hasRegisteredPublicKey(REAL_ADDRESS));
    }

    function test_registerPublicKey_allowsAnyCaller_notJustAdmin() public {
        // Deliberately NOT admin, NOT an institution — registerPublicKey is
        // open to every actor (Admin, Issuer, Owner, Verifier all need it).
        vm.prank(REAL_ADDRESS);
        registry.registerPublicKey(REAL_PUBLIC_KEY);
        assertTrue(registry.hasRegisteredPublicKey(REAL_ADDRESS));
    }
}
