// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISEER is IERC20 {
    function burn(uint256 amount) external;
}

interface IUniswapV2Router02 {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);

    function getAmountsOut(uint amountIn, address[] calldata path)
        external view returns (uint[] memory amounts);
}

interface INodeRewardPoolNotifier {
    function notifyRewardReceived(uint256 amount) external;
}

/**
 * @title SwapPoolManager
 * @notice DEX 交易税收管理器 — 解耦 SEER ERC20 与交易税
 * @dev
 *   - 用户通过本合约进行 SEER ↔ USDT 兑换
 *   - 卖出时: 先从输入 SEER 中扣税, 剩余部分送入 DEX Router 兑换
 *   - 买入时: 先通过 DEX Router 兑换得到 SEER, 再从中扣税
 *   - 税率和分配比例均可由 Owner 动态调整
 *   - SEER 代币本身变为纯 ERC20, 无内置税逻辑
 */
contract SwapPoolManager is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable {
    using SafeERC20 for IERC20;
    using SafeERC20 for ISEER;

    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant MAX_TAX_BP = 2000; // 最高 20%

    // ============================================================
    //                        状态变量
    // ============================================================

    ISEER public seerToken;
    IERC20 public usdtToken;
    IUniswapV2Router02 public dexRouter;

    address public foundationWallet;
    address public nodeRewardPool;

    /// @notice 买入税率 (基数10000)
    uint256 public buyTaxBP;
    /// @notice 卖出税率 (基数10000)
    uint256 public sellTaxBP;

    /// @notice 税收中销毁比例 (基数10000, 相对于税额)
    uint256 public burnShareBP;
    /// @notice 税收中节点奖池比例 (基数10000, 相对于税额)
    uint256 public nodeShareBP;
    // foundationShareBP = BASIS_POINTS - burnShareBP - nodeShareBP

    // ─── 统计 ───
    uint256 public totalTaxCollected;
    uint256 public totalBurned;
    uint256 public totalNodeRewards;
    uint256 public totalFoundationFees;
    uint256 public totalSwapCount;

    // ============================================================
    //                          事件
    // ============================================================

    event TaxCollected(address indexed user, bool indexed isBuy, uint256 taxAmount, uint256 burned, uint256 toNodes, uint256 toFoundation);
    event SwapSEERForUSDT(address indexed user, uint256 seerIn, uint256 usdtOut, uint256 tax);
    event SwapUSDTForSEER(address indexed user, uint256 usdtIn, uint256 seerOut, uint256 tax);
    event TaxRatesUpdated(uint256 buyTaxBP, uint256 sellTaxBP);
    event TaxDistributionUpdated(uint256 burnShareBP, uint256 nodeShareBP, uint256 foundationShareBP);
    event DexRouterUpdated(address indexed oldRouter, address indexed newRouter);
    event FoundationWalletUpdated(address indexed oldWallet, address indexed newWallet);
    event NodeRewardPoolUpdated(address indexed oldPool, address indexed newPool);

    // ============================================================
    //                          错误
    // ============================================================

    error ZeroAddress();
    error ZeroAmount();
    error InvalidTaxRate();
    error InvalidDistribution();
    error InsufficientOutput();

    // ============================================================
    //                        初始化
    // ============================================================

    constructor() { _disableInitializers(); }

    function initialize(
        address _seerToken,
        address _usdtToken,
        address _dexRouter,
        address _foundationWallet,
        address _nodeRewardPool
    ) public initializer {
        if (_seerToken == address(0) || _usdtToken == address(0) || _dexRouter == address(0)) revert ZeroAddress();
        if (_foundationWallet == address(0) || _nodeRewardPool == address(0)) revert ZeroAddress();

        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        seerToken = ISEER(_seerToken);
        usdtToken = IERC20(_usdtToken);
        dexRouter = IUniswapV2Router02(_dexRouter);
        foundationWallet = _foundationWallet;
        nodeRewardPool = _nodeRewardPool;

        // 默认: 2% 买/卖税, 50/25/25 分配
        buyTaxBP = 200;
        sellTaxBP = 200;
        burnShareBP = 5000;
        nodeShareBP = 2500;
    }

    // ============================================================
    //                      兑换函数
    // ============================================================

    /**
     * @notice 卖出 SEER 换 USDT
     * @param amountIn   输入的 SEER 数量 (含税)
     * @param amountOutMin 最少获得 USDT
     * @param to         接收地址, address(0) 则发给 msg.sender
     */
    function swapSEERForUSDT(
        uint256 amountIn,
        uint256 amountOutMin,
        address to
    ) external nonReentrant returns (uint256 usdtReceived) {
        if (amountIn == 0) revert ZeroAmount();
        if (to == address(0)) to = msg.sender;

        // 1. 收 SEER
        seerToken.safeTransferFrom(msg.sender, address(this), amountIn);

        // 2. 扣税
        uint256 tax = (amountIn * sellTaxBP) / BASIS_POINTS;
        uint256 afterTax = amountIn - tax;

        if (tax > 0) _distributeTax(tax, false);

        // 3. 送入 Router 兑换
        seerToken.approve(address(dexRouter), afterTax);

        address[] memory path = new address[](2);
        path[0] = address(seerToken);
        path[1] = address(usdtToken);

        uint[] memory amounts = dexRouter.swapExactTokensForTokens(
            afterTax, amountOutMin, path, to, block.timestamp
        );

        usdtReceived = amounts[amounts.length - 1];
        totalSwapCount++;

        emit SwapSEERForUSDT(msg.sender, amountIn, usdtReceived, tax);
    }

    /**
     * @notice 买入 SEER (用 USDT)
     * @param amountIn   输入的 USDT 数量
     * @param amountOutMin 最少获得 SEER (扣税后)
     * @param to         接收地址, address(0) 则发给 msg.sender
     */
    function swapUSDTForSEER(
        uint256 amountIn,
        uint256 amountOutMin,
        address to
    ) external nonReentrant returns (uint256 seerReceived) {
        if (amountIn == 0) revert ZeroAmount();
        if (to == address(0)) to = msg.sender;

        // 1. 收 USDT
        usdtToken.safeTransferFrom(msg.sender, address(this), amountIn);

        // 2. 送入 Router 兑换 SEER → 本合约
        usdtToken.approve(address(dexRouter), amountIn);

        address[] memory path = new address[](2);
        path[0] = address(usdtToken);
        path[1] = address(seerToken);

        uint[] memory amounts = dexRouter.swapExactTokensForTokens(
            amountIn, 0, path, address(this), block.timestamp
        );

        uint256 rawSeerOut = amounts[amounts.length - 1];

        // 3. 扣税
        uint256 tax = (rawSeerOut * buyTaxBP) / BASIS_POINTS;
        seerReceived = rawSeerOut - tax;

        if (seerReceived < amountOutMin) revert InsufficientOutput();

        if (tax > 0) _distributeTax(tax, true);

        // 4. 发送 SEER 给用户
        seerToken.safeTransfer(to, seerReceived);
        totalSwapCount++;

        emit SwapUSDTForSEER(msg.sender, amountIn, seerReceived, tax);
    }

    // ============================================================
    //                      报价函数
    // ============================================================

    /**
     * @notice 报价: 卖出 SEER 能得到多少 USDT
     * @return amountOut    扣税后最终 USDT 数量
     * @return taxAmount    扣税的 SEER 数量
     * @return afterTaxInput 送入 Router 的 SEER 数量
     */
    function quoteSEERForUSDT(uint256 amountIn) external view returns (
        uint256 amountOut,
        uint256 taxAmount,
        uint256 afterTaxInput
    ) {
        taxAmount = (amountIn * sellTaxBP) / BASIS_POINTS;
        afterTaxInput = amountIn - taxAmount;

        address[] memory path = new address[](2);
        path[0] = address(seerToken);
        path[1] = address(usdtToken);

        try dexRouter.getAmountsOut(afterTaxInput, path) returns (uint[] memory amounts) {
            amountOut = amounts[amounts.length - 1];
        } catch {
            amountOut = 0;
        }
    }

    /**
     * @notice 报价: 用 USDT 买入能得到多少 SEER
     * @return amountOut    扣税后用户实际获得 SEER
     * @return taxAmount    扣税的 SEER 数量
     * @return rawSeerOut   Router 原始输出 SEER (税前)
     */
    function quoteUSDTForSEER(uint256 amountIn) external view returns (
        uint256 amountOut,
        uint256 taxAmount,
        uint256 rawSeerOut
    ) {
        address[] memory path = new address[](2);
        path[0] = address(usdtToken);
        path[1] = address(seerToken);

        try dexRouter.getAmountsOut(amountIn, path) returns (uint[] memory amounts) {
            rawSeerOut = amounts[amounts.length - 1];
        } catch {
            rawSeerOut = 0;
        }

        taxAmount = (rawSeerOut * buyTaxBP) / BASIS_POINTS;
        amountOut = rawSeerOut - taxAmount;
    }

    // ============================================================
    //                      内部函数
    // ============================================================

    function _distributeTax(uint256 taxAmount, bool isBuy) internal {
        uint256 burnAmount = (taxAmount * burnShareBP) / BASIS_POINTS;
        uint256 nodeAmount = (taxAmount * nodeShareBP) / BASIS_POINTS;
        uint256 foundationAmount = taxAmount - burnAmount - nodeAmount;

        // 销毁
        if (burnAmount > 0) {
            seerToken.burn(burnAmount);
            totalBurned += burnAmount;
        }

        // 节点奖池
        if (nodeAmount > 0 && nodeRewardPool != address(0)) {
            seerToken.safeTransfer(nodeRewardPool, nodeAmount);
            totalNodeRewards += nodeAmount;

            if (nodeRewardPool.code.length > 0) {
                try INodeRewardPoolNotifier(nodeRewardPool).notifyRewardReceived(nodeAmount) {} catch {}
            }
        }

        // 基金会
        if (foundationAmount > 0 && foundationWallet != address(0)) {
            seerToken.safeTransfer(foundationWallet, foundationAmount);
            totalFoundationFees += foundationAmount;
        }

        totalTaxCollected += taxAmount;

        emit TaxCollected(msg.sender, isBuy, taxAmount, burnAmount, nodeAmount, foundationAmount);
    }

    // ============================================================
    //                      管理函数
    // ============================================================

    /// @notice 设置买/卖税率 (最高20%)
    function setTaxRates(uint256 _buyTaxBP, uint256 _sellTaxBP) external onlyOwner {
        if (_buyTaxBP > MAX_TAX_BP || _sellTaxBP > MAX_TAX_BP) revert InvalidTaxRate();
        buyTaxBP = _buyTaxBP;
        sellTaxBP = _sellTaxBP;
        emit TaxRatesUpdated(_buyTaxBP, _sellTaxBP);
    }

    /// @notice 设置税收分配比例 (burn + node ≤ 10000, 剩余给 foundation)
    function setTaxDistribution(uint256 _burnShareBP, uint256 _nodeShareBP) external onlyOwner {
        if (_burnShareBP + _nodeShareBP > BASIS_POINTS) revert InvalidDistribution();
        burnShareBP = _burnShareBP;
        nodeShareBP = _nodeShareBP;
        emit TaxDistributionUpdated(_burnShareBP, _nodeShareBP, BASIS_POINTS - _burnShareBP - _nodeShareBP);
    }

    /// @notice 更新 DEX Router 地址
    function setDexRouter(address _router) external onlyOwner {
        if (_router == address(0)) revert ZeroAddress();
        address old = address(dexRouter);
        dexRouter = IUniswapV2Router02(_router);
        emit DexRouterUpdated(old, _router);
    }

    /// @notice 更新基金会钱包
    function setFoundationWallet(address _wallet) external onlyOwner {
        if (_wallet == address(0)) revert ZeroAddress();
        address old = foundationWallet;
        foundationWallet = _wallet;
        emit FoundationWalletUpdated(old, _wallet);
    }

    /// @notice 更新节点奖池地址
    function setNodeRewardPool(address _pool) external onlyOwner {
        if (_pool == address(0)) revert ZeroAddress();
        address old = nodeRewardPool;
        nodeRewardPool = _pool;
        emit NodeRewardPoolUpdated(old, _pool);
    }

    /// @notice 紧急提取卡死代币
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
