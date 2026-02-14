// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PaperclipProtocol.sol";

/**
 * @title DeployPaperclip
 * @notice Deployment script for Monad testnet.
 *
 * Usage:
 *   source .env
 *   forge script script/Deploy.s.sol:DeployPaperclip \
 *     --rpc-url $MONAD_RPC_URL \
 *     --private-key $DEPLOYER_PRIVATE_KEY \
 *     --broadcast
 */
contract DeployPaperclip is Script {
    uint64 constant BASE_REWARD_UNIT = 100;

    function run() external {
        vm.startBroadcast();

        // 1. Deploy contract
        PaperclipProtocol protocol = new PaperclipProtocol();
        console.log("PaperclipProtocol deployed at:", address(protocol));

        // 2. Initialize protocol
        protocol.initialize(BASE_REWARD_UNIT);
        console.log("Protocol initialized with base_reward_unit:", BASE_REWARD_UNIT);
        console.log("Authority:", protocol.authority());

        vm.stopBroadcast();
    }
}
