// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract TestPancakeRouter {
    using SafeERC20 for IERC20;

    struct SwapRecord {
        uint256 amountIn;
        uint256 amountOut;
        uint256 amountOutMin;
        address tokenIn;
        address tokenOut;
        address viaToken;
        address to;
        uint256 deadline;
    }

    struct LiquidityRecord {
        address tokenA;
        address tokenB;
        uint256 amountADesired;
        uint256 amountBDesired;
        uint256 amountAUsed;
        uint256 amountBUsed;
        uint256 amountAMin;
        uint256 amountBMin;
        address to;
        uint256 deadline;
    }

    mapping(bytes32 => uint256) public swapOutputs;
    uint256 public liquidityToMint;
    SwapRecord[] private swapRecords;
    LiquidityRecord[] private liquidityRecords;

    event SwapRecorded(
        uint256 indexed index,
        uint256 amountIn,
        uint256 amountOut,
        uint256 amountOutMin,
        address tokenIn,
        address tokenOut,
        address viaToken,
        address to,
        uint256 deadline
    );
    event LiquidityRecorded(
        uint256 indexed index,
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAUsed,
        uint256 amountBUsed,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline,
        uint256 liquidity
    );

    function setSwapOutput(address tokenIn, address tokenOut, uint256 amountOut) external {
        swapOutputs[_swapKey(tokenIn, tokenOut)] = amountOut;
    }

    function setSwapOutputEqualInput(address tokenIn, address tokenOut) external {
        swapOutputs[_swapKey(tokenIn, tokenOut)] = type(uint256).max;
    }

    function setLiquidityToMint(uint256 amount) external {
        liquidityToMint = amount;
    }

    function swapRecordCount() external view returns (uint256) {
        return swapRecords.length;
    }

    function liquidityRecordCount() external view returns (uint256) {
        return liquidityRecords.length;
    }

    function swapRecord(uint256 index) external view returns (SwapRecord memory) {
        return swapRecords[index];
    }

    function liquidityRecord(uint256 index) external view returns (LiquidityRecord memory) {
        return liquidityRecords[index];
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        require(path.length >= 2, "Invalid path");
        address tokenIn = path[0];
        address tokenOut = path[path.length - 1];
        uint256 configuredOutput = swapOutputs[_swapKey(tokenIn, tokenOut)];
        uint256 amountOut = configuredOutput == type(uint256).max ? amountIn : configuredOutput;
        require(amountOut >= amountOutMin, "Insufficient output");

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(to, amountOut);

        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountOut;
        for (uint256 i = 1; i + 1 < path.length; i++) {
            amounts[i] = amountOut;
        }

        address viaToken = path.length > 2 ? path[1] : address(0);
        swapRecords.push(SwapRecord({
            amountIn: amountIn,
            amountOut: amountOut,
            amountOutMin: amountOutMin,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            viaToken: viaToken,
            to: to,
            deadline: deadline
        }));
        emit SwapRecorded(swapRecords.length - 1, amountIn, amountOut, amountOutMin, tokenIn, tokenOut, viaToken, to, deadline);
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        require(amountADesired >= amountAMin && amountBDesired >= amountBMin, "Insufficient liquidity input");

        amountA = amountADesired;
        amountB = amountBDesired;
        liquidity = liquidityToMint;

        IERC20(tokenA).safeTransferFrom(msg.sender, address(this), amountA);
        IERC20(tokenB).safeTransferFrom(msg.sender, address(this), amountB);

        liquidityRecords.push(LiquidityRecord({
            tokenA: tokenA,
            tokenB: tokenB,
            amountADesired: amountADesired,
            amountBDesired: amountBDesired,
            amountAUsed: amountA,
            amountBUsed: amountB,
            amountAMin: amountAMin,
            amountBMin: amountBMin,
            to: to,
            deadline: deadline
        }));
        emit LiquidityRecorded(
            liquidityRecords.length - 1,
            tokenA,
            tokenB,
            amountADesired,
            amountBDesired,
            amountA,
            amountB,
            amountAMin,
            amountBMin,
            to,
            deadline,
            liquidity
        );
    }

    function _swapKey(address tokenIn, address tokenOut) private pure returns (bytes32) {
        return keccak256(abi.encode(tokenIn, tokenOut));
    }
}

contract TestPancakeProxy {
    using SafeERC20 for IERC20;

    struct SwapByUsdtRecord {
        uint256 amountIn;
        uint256 amountOut;
        uint256 amountOutMin;
        address to;
        uint256 deadline;
    }

    address public immutable usdtToken;
    address public immutable labubuToken;
    uint256 public swapByUsdtOutput;
    SwapByUsdtRecord[] private swapByUsdtRecords;

    event SwapByUsdtRecorded(
        uint256 indexed index,
        uint256 amountIn,
        uint256 amountOut,
        uint256 amountOutMin,
        address to,
        uint256 deadline
    );

    constructor(address usdtToken_, address labubuToken_) {
        usdtToken = usdtToken_;
        labubuToken = labubuToken_;
    }

    function setSwapByUsdtOutput(uint256 amountOut) external {
        swapByUsdtOutput = amountOut;
    }

    function swapByUsdtRecordCount() external view returns (uint256) {
        return swapByUsdtRecords.length;
    }

    function swapByUsdtRecord(uint256 index) external view returns (SwapByUsdtRecord memory) {
        return swapByUsdtRecords[index];
    }

    function swapByBnb(uint256, uint256, address, uint256) external pure returns (uint256) {
        revert("Not implemented");
    }

    function swapByUsdt(
        uint256 amountIn,
        uint256 amountOutMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountOut) {
        amountOut = swapByUsdtOutput;
        require(amountOut >= amountOutMin, "Insufficient output");

        IERC20(usdtToken).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(labubuToken).safeTransfer(to, amountOut);

        swapByUsdtRecords.push(SwapByUsdtRecord({
            amountIn: amountIn,
            amountOut: amountOut,
            amountOutMin: amountOutMin,
            to: to,
            deadline: deadline
        }));
        emit SwapByUsdtRecorded(swapByUsdtRecords.length - 1, amountIn, amountOut, amountOutMin, to, deadline);
    }
}
