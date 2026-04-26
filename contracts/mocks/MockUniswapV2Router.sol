// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockUniswapV2Router
 * @notice 简化版 Uniswap V2 Router, 用于测试 SwapPoolManager
 * @dev 以 1:1 比率执行代币交换
 */
contract MockUniswapV2Router {
    address public tokenA; // SEER
    address public tokenB; // USDT

    constructor(address _tokenA, address _tokenB) {
        tokenA = _tokenA;
        tokenB = _tokenB;
    }

    function getAmountsOut(uint amountIn, address[] calldata path)
        external pure returns (uint[] memory amounts)
    {
        amounts = new uint[](path.length);
        amounts[0] = amountIn;
        for (uint i = 1; i < path.length; i++) {
            amounts[i] = amountIn; // 1:1 ratio
        }
    }

    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint /* deadline */
    ) external returns (uint[] memory amounts) {
        require(path.length >= 2, "Invalid path");

        amounts = new uint[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountIn; // 1:1

        require(amounts[path.length - 1] >= amountOutMin, "INSUFFICIENT_OUTPUT_AMOUNT");

        // Pull input token from sender
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);

        // Send output token to recipient
        IERC20(path[path.length - 1]).transfer(to, amountIn);

        return amounts;
    }
}
