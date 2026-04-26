// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./SeerTokenomics.sol";

interface INodeRewardPoolNotifier {
    function notifyRewardReceived(uint256 amount) external;
}

/**
 * @title SEER Token
 * @notice SEER预测平台代币 - ERC20, 总量210,000,000
 * @dev
 *   - 纯 ERC20 代币, 税逻辑已解耦至 SwapPoolManager
 *   - DEX交易对地址受 transfer restriction 保护
 *   - 只有白名单地址 (SwapPoolManager等) 可与DEX pair交互
 *   - 防止用户绕过 Manager 直接通过 Router 免税交易
 */
contract SEER is Initializable, ERC20Upgradeable, ERC20BurnableUpgradeable, OwnableUpgradeable, UUPSUpgradeable {

    // ============================================================
    //                          状态变量
    // ============================================================

    /// @notice 基金会地址
    address public foundationWallet;

    /// @notice 节点奖池地址
    address public nodeRewardPool;

    /// @notice 累计销毁量
    uint256 public totalBurned;

    /// @notice 累计节点奖励
    uint256 public totalNodeRewards;

    /// @notice 累计基金会收入
    uint256 public totalFoundationFees;

    /// @notice DEX交易对地址 (需要扣税的地址)
    mapping(address => bool) public isTaxedPair;

    /// @notice 免税地址 (协议合约、Owner等)
    mapping(address => bool) public isExemptFromTax;

    /// @notice 是否启用交易税
    bool public taxEnabled = true;

    // ============================================================
    //                          事件
    // ============================================================

    event TaxCollected(
        address indexed from,
        address indexed to,
        uint256 totalTax,
        uint256 burned,
        uint256 toNodes,
        uint256 toFoundation
    );
    event TaxedPairUpdated(address indexed pair, bool isTaxed);
    event TaxExemptionUpdated(address indexed account, bool isExempt);
    event FoundationWalletUpdated(address indexed oldWallet, address indexed newWallet);
    event NodeRewardPoolUpdated(address indexed oldPool, address indexed newPool);
    event TaxToggled(bool enabled);

    // ============================================================
    //                          错误
    // ============================================================

    error ZeroAddress();
    error InvalidTaxRecipient();

    // ============================================================
    //                        构造函数
    // ============================================================

    constructor() {
        _disableInitializers();
    }

    /**
     * @param _foundationWallet 基金会钱包地址
     * @param _nodeRewardPool   节点奖池地址
     */
    function initialize(
        address _foundationWallet,
        address _nodeRewardPool
    ) public initializer {
        if (_foundationWallet == address(0) || _nodeRewardPool == address(0)) revert ZeroAddress();

        __ERC20_init("SEER Token", "SEER");
        __ERC20Burnable_init();
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();

        foundationWallet = _foundationWallet;
        nodeRewardPool = _nodeRewardPool;

        // 免税: 部署者、基金会、节点奖池
        isExemptFromTax[msg.sender] = true;
        isExemptFromTax[_foundationWallet] = true;
        isExemptFromTax[_nodeRewardPool] = true;

        // 铸造总供应量给部署者, 由部署脚本分配给各模块
        _mint(msg.sender, SeerTokenomics.TOTAL_SUPPLY);
    }

    // ============================================================
    //                      核心转账逻辑
    // ============================================================

    /**
     * @dev 重写_update以实现DEX pair transfer restriction
     * DEX交易对地址受保护: 只有白名单地址 (SwapPoolManager等) 可与pair交互
     * 税率计算和分配由 SwapPoolManager 独立处理
     */
    function _update(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        // 铸造/销毁不限制
        if (from == address(0) || to == address(0)) {
            super._update(from, to, amount);
            return;
        }

        // 限制未启用 或 白名单地址 => 放行
        if (!taxEnabled || isExemptFromTax[from] || isExemptFromTax[to]) {
            super._update(from, to, amount);
            return;
        }

        // DEX交易对地址受限: 必须通过 SwapPoolManager 交易
        if (isTaxedPair[from] || isTaxedPair[to]) {
            revert("Use SwapPoolManager for DEX trades");
        }

        // 普通转账不限制
        super._update(from, to, amount);
    }

    // ============================================================
    //                      管理函数
    // ============================================================

    /// @notice 设置DEX交易对地址 (会被扣税)
    function setTaxedPair(address pair, bool _isTaxed) external onlyOwner {
        if (pair == address(0)) revert ZeroAddress();
        isTaxedPair[pair] = _isTaxed;
        emit TaxedPairUpdated(pair, _isTaxed);
    }

    /// @notice 设置免税地址
    function setTaxExemption(address account, bool exempt) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        isExemptFromTax[account] = exempt;
        emit TaxExemptionUpdated(account, exempt);
    }

    /// @notice 更新基金会钱包
    function setFoundationWallet(address _wallet) external onlyOwner {
        if (_wallet == address(0)) revert ZeroAddress();
        address old = foundationWallet;
        foundationWallet = _wallet;
        isExemptFromTax[_wallet] = true;
        emit FoundationWalletUpdated(old, _wallet);
    }

    /// @notice 更新节点奖池地址
    function setNodeRewardPool(address _pool) external onlyOwner {
        if (_pool == address(0)) revert ZeroAddress();
        address old = nodeRewardPool;
        nodeRewardPool = _pool;
        isExemptFromTax[_pool] = true;
        emit NodeRewardPoolUpdated(old, _pool);
    }

    /// @notice 开关交易税
    function setTaxEnabled(bool _enabled) external onlyOwner {
        taxEnabled = _enabled;
        emit TaxToggled(_enabled);
    }

    // ============================================================
    //                      查询函数
    // ============================================================

    /// @notice 当前流通供应量 (总量 - 销毁量)
    function circulatingSupply() external view returns (uint256) {
        return totalSupply(); // totalSupply already accounts for burns via _update(addr, 0, amt)
    }

    /// @notice 获取代币精度
    function decimals() public pure override returns (uint8) {
        return SeerTokenomics.SEER_DECIMALS;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
