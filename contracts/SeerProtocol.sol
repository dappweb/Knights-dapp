// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./SeerTokenomics.sol";
import "./SEER.sol";
import "./lib/SeerTypes.sol";
import "./lib/LibSeerAdmin.sol";
import "./lib/LibSeerClaim.sol";

interface IAirdropManager {
    function claimAirdrop(address _user) external;
    function unlockAirdrop(address _user) external;
}

interface IMinerNode {
    function registerNode(address _node, uint256 _minerTier, uint256 _costUsdt) external returns (uint256 lotId);
    function removeNode(address _node) external;
    function removeNodeLot(address _node, uint256 _lotId) external;
    function adminDeactivateNodeLot(address _node, uint256 _lotId) external;
    function notifyPriceUpdate(uint256 _newPriceUsdt) external;
    function areAllNodeQuotasFilled() external view returns (bool);
    function adminEditNodeTier(address _user, uint256 _lotId, uint8 _newTier) external;
    function adminEditNodeWeight(address _user, uint256 _lotId, uint256 _newWeight) external;
    function adminEditNodeCost(address _user, uint256 _lotId, uint256 _newCostUsdt) external;
}

/**
 * @title SeerProtocol
 * @notice SEER平台主协议合约 — "U进币出"核心逻辑
 * @dev 功能模块:
 *   1. 用户注册 (推荐人绑定, 8层推荐链)
 *   2. 矿机购买 (4档: 100U/1000U/3000U/10000U)
 *   3. 挖矿产出 & 领取 (A仓100%提现 + B仓70%提现/30%投注)
 *   4. 团队等级 (V1-V5, 按团队累计业绩自动升级)
 *   5. 奖励分配 (培育奖励: 直推N人拿N代, 每代固定比例, 默认1%×10代)
 *   6. 每日签到 (持仓量0.5%)
 *   7. 双仓位收益管理 (A/B联动与B仓出局机制)
 *   8. 提现 (免费提现 + 按团队等级日释放)
 */
contract SeerProtocol is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    // ============================================================
    //                        数据结构
    // ============================================================

    /// @dev SeerTypes.MinerTier / SeerTypes.MinerInfo 已迁移到 contracts/lib/SeerTypes.sol
    ///      (本合约中统一写作 SeerTypes.MinerTier / SeerTypes.MinerInfo)
    ///      存储布局保持不变, 与历史 proxy 兼容.

    /// @notice 团队等级
    enum TeamLevel { None, V1, V2, V3, V4, V5 }

    /// @notice 销售阶段: 节点招募阶段 → 矿机销售阶段
    enum SalePhase { NODE_PHASE, MINER_PHASE }

    /// @notice 用户信息
    struct UserInfo {
        address referrer;          // 推荐人
        address[] directReferrals; // 直推列表
        TeamLevel teamLevel;       // 链上结算等级（按小区业绩）
        uint256 totalInvestedUsdt; // 个人业绩 USDT (购买成本 + 赠送矿机折算成本)
        uint256 teamVolumeUsdt;    // 团队总业绩 USDT (不含自己)
        uint256 seerBalance;       // 提现钱包 SEER (A仓全部 + B仓70%)
        uint256 seerBetting;       // 投注钱包 SEER (B仓30%, 仅可参与生态投注)
        uint256 totalEarnedSeer;   // 累计获得 SEER
        uint256 lastCheckinTime;   // 上次签到时间
        uint256 registrationTime;  // 注册时间
        bool registered;           // 是否已注册
    }

    /// @notice 矿机档位配置（支持管理员动态调整）
    struct MinerTierConfig {
        uint256 costUsdt;
        uint256 multiplier;
        uint256 cycleDays;
        uint256 bVaultUsdt;
        uint256 maxSupply;
        uint256 soldCount;
        bool enabled;
    }

    // ============================================================
    //                        状态变量
    // ============================================================

    IERC20 public usdt;
    SEER public seerToken;

    /// @notice 基金会钱包 (接收USDT投入)
    address public foundationWallet;

    /// @notice 用户信息映射
    mapping(address => UserInfo) public users;

    /// @notice 用户矿机列表 (一个用户可拥有多台矿机)
    mapping(address => SeerTypes.MinerInfo[]) public userMiners;

    /// @notice 挖矿总池 (剩余可产出SEER)
    uint256 public miningPoolRemaining;

    /// @notice 协议累计USDT收入
    uint256 public totalUsdtReceived;

    /// @notice 累计发放SEER
    uint256 public totalSeerDistributed;

    /// @notice 总注册用户数
    uint256 public totalUsers;

    /// @notice 总活跃矿机数
    uint256 public totalActiveMiners;

    /// @notice 当前SEER价格 (USDT, 6位精度, 可由Owner更新)
    uint256 public seerPriceUsdt;

    /// @notice 协议是否暂停
    bool public paused;

    /// @notice 空投管理合约
    IAirdropManager public airdropManager;

    /// @notice 节点管理合约
    IMinerNode public minerNode;

    /// @notice 各档矿机释放周期 (天) - 可由Owner调整, 新购矿机生效
    uint256 public basicMinerCycleDays;
    uint256 public v1MinerCycleDays;
    uint256 public v2MinerCycleDays;
    uint256 public v3MinerCycleDays;

    /// @notice 当前销售阶段
    SalePhase public salePhase;

    /// @notice 节点招募开始时间 (部署时设置)
    uint256 public nodeSaleStartTime;

    /// @notice 使用SEER购买矿机的手续费比例 (基数10000)
    uint256 public seerPurchaseFeeBP;

    /// @notice 培育奖励每代比例 (基数10000), 默认100=1%
    uint256 public nurtureRewardPerLayerBP;

    /// @notice 培育奖励最大代数, 默认10
    uint256 public nurtureRewardMaxLayers;

    /// @notice 购买矿机ID -> 节点lot ID，仅非Basic且非赠送矿机会写入
    mapping(address => mapping(uint256 => uint256)) public minerNodeLotIds;

    /// @notice 节点售卖页面是否开启
    bool public nodeSaleOpen;

    /// @notice 矿机售卖页面是否开启
    bool public minerSaleOpen;

    /// @notice 矿机档位配置
    mapping(uint8 => MinerTierConfig) private minerTierConfigs;

    /// @notice 超级管理员集合（不含owner）
    mapping(address => bool) private superAdmins;
    address[] private superAdminList;
    mapping(address => uint256) private superAdminIndexPlusOne;

    /// @notice 运营管理员集合
    mapping(address => bool) private managers;
    address[] private managerList;
    mapping(address => uint256) private managerIndexPlusOne;

    // ─────────────────────────────────────────────────────────────
    //  节点销售资金分配 (红框业务: 卖出节点资金使用方案 USDT)
    //  - 明帕  brightPaiBP (默认 10%) → 直推; 无直推兜底给 projectWallet
    //  - 暗帕  darkPaiBP   (默认 10%) → darkPaiWallet(零号线钱包)
    //  - 剩余 (默认 80%)              → projectWallet (项目方钱包)
    //  - 若 projectWallet 未配置, 回退到 foundationWallet 以兼容旧逻辑
    //  - 若 darkPaiWallet 未配置, 该份额转入 projectWallet
    //  - 仅作用于 USDT 支付路径 & tier != Basic (V1/V2/V3 节点)
    // ─────────────────────────────────────────────────────────────

    /// @notice 项目方钱包 (接收 80% 节点销售 USDT + 暗帕/明帕兜底)
    address public projectWallet;

    /// @notice 零号线 / 领导人钱包 (接收暗帕 10%, 领导人再自行分配)
    address public darkPaiWallet;

    /// @notice 明帕比例 (基数 10000, 默认 1000 = 10%)
    uint256 public brightPaiBP;

    /// @notice 暗帕比例 (基数 10000, 默认 1000 = 10%)
    uint256 public darkPaiBP;

    /// @notice 用户待释放池 SEER（未进入提现钱包的部分）
    mapping(address => uint256) public pendingReleaseSeer;

    /// @notice 用户最近一次日释放的自然日序号（UTC day）
    mapping(address => uint256) public lastPendingReleaseDay;

    // ============================================================
    //                          事件
    // ============================================================

    event UserRegistered(address indexed user, address indexed referrer, uint256 timestamp);
    event MinerPurchased(address indexed user, SeerTypes.MinerTier tier, uint256 costUsdt, uint256 minerId);
    event MinerAutoGifted(address indexed user, SeerTypes.MinerTier tier, uint256 minerId);
    event MiningClaimed(address indexed user, uint256 seerAmount, uint256 toWithdraw, uint256 toBetting);
    event MiningClaimedByMiner(address indexed user, uint256 indexed minerId, uint256 seerAmount, uint256 toWithdraw, uint256 toBetting);
    event VaultBExhausted(address indexed user, uint256 minerId);
    event ReferralReward(address indexed from, address indexed to, uint256 amount, uint256 layer);
    event DifferentialReward(address indexed from, address indexed to, uint256 amount);
    event EqualLevelBonus(address indexed from, address indexed to, uint256 amount);
    event CommunityTax(address indexed from, address indexed to, uint256 amount);
    event DailyCheckin(address indexed user, uint256 reward, uint256 timestamp);
    event TeamLevelUpgrade(address indexed user, TeamLevel oldLevel, TeamLevel newLevel);
    event Withdrawal(address indexed user, uint256 seerAmount, uint256 fee);
    event PendingReleaseUnlocked(address indexed user, uint256 unlockedAmount, uint256 pendingRemaining, uint256 dayKey);
    event PriceUpdated(uint256 oldPrice, uint256 newPrice);
    event ProtocolPaused(bool paused);
    event MiningPoolFunded(uint256 amount);
    event AirdropManagerUpdated(address indexed oldManager, address indexed newManager);
    event MinerNodeUpdated(address indexed oldMinerNode, address indexed newMinerNode);
    event MinerCycleDaysUpdated(uint256 basicDays, uint256 v1Days, uint256 v2Days, uint256 v3Days);
    event SalePhaseChanged(SalePhase indexed oldPhase, SalePhase indexed newPhase, string reason);
    event SeerPurchaseFeeUpdated(uint256 oldFeeBP, uint256 newFeeBP);
    event MinerPurchasedWithSEER(
        address indexed user,
        SeerTypes.MinerTier tier,
        uint256 costUsdt,
        uint256 seerAmount,
        uint256 seerFee,
        uint256 minerId
    );
    event NurtureRewardConfigUpdated(
        uint256 oldPerLayerBP,
        uint256 newPerLayerBP,
        uint256 oldMaxLayers,
        uint256 newMaxLayers
    );
    event NodeSaleOpenChanged(bool open);
    event MinerSaleOpenChanged(bool open);
    event AdminMinerDeactivated(address indexed admin, address indexed user, uint256 indexed minerId, uint256 timestamp);
    event AdminMinerActivated(address indexed admin, address indexed user, uint256 indexed minerId, uint256 timestamp);
    event AdminMinerRemoved(address indexed admin, address indexed user, uint256 indexed minerId, uint256 timestamp);
    event AdminNodeLotDeactivated(address indexed admin, address indexed user, uint256 indexed lotId, uint256 timestamp);
    event MinerTierConfigUpdated(
        uint8 indexed tier,
        uint256 costUsdt,
        uint256 multiplier,
        uint256 cycleDays,
        uint256 bVaultUsdt,
        bool enabled
    );
    event MinerTierInventoryUpdated(uint8 indexed tier, uint256 soldCount, uint256 maxSupply);
    event SuperAdminAdded(address indexed account, address indexed operator);
    event SuperAdminRemoved(address indexed account, address indexed operator);
    event ManagerAdded(address indexed account, address indexed operator);
    event ManagerRemoved(address indexed account, address indexed operator);
    event DynamicRewardSkipped(address indexed from, address indexed to, uint256 amount, uint8 rewardType, uint256 layer, uint8 reasonCode);
    event UserBettingBalanceAdjusted(address indexed operator, address indexed user, uint256 oldAmount, uint256 newAmount);
    event AdminBatchRegistered(address indexed admin, uint256 count, uint256 timestamp);

    // 节点销售资金分配事件
    event ProjectWalletUpdated(address indexed oldWallet, address indexed newWallet);
    event DarkPaiWalletUpdated(address indexed oldWallet, address indexed newWallet);
    event PaiPointBPUpdated(uint256 oldBrightBP, uint256 newBrightBP, uint256 oldDarkBP, uint256 newDarkBP);
    /// @notice 节点销售资金分配事件 (brightTo/darkTo/projectTo 可从 setter 事件 + referrer 组合推导)
    event PaiPointDistributed(
        address indexed user,
        address indexed referrer,
        uint256 brightPaiAmt,
        uint256 darkPaiAmt,
        uint256 projectAmt
    );

    // ============================================================
    //                          错误
    // ============================================================

    error NotRegistered();
    error AlreadyRegistered();
    error InvalidReferrer();
    error SelfReferral();
    error InvalidMinerTier();
    error InsufficientUSDT();
    error InsufficientBalance();
    error MiningPoolDepleted();
    error CheckinTooEarly();
    error ProtocolPausedError();
    error ZeroAmount();
    error NodeSaleClosed();
    error MinerSaleClosed();
    error MinerPurchaseLimitExceeded(uint8 tier, uint256 currentCount, uint256 limit);
    error InvalidMinerIndex(uint256 index, uint256 total);
    error MinerExpired();
    error NoActiveMiners();
    error NodeSaleNotActive();  // 节点招募阶段已结束, 不能购买新节点
    error NodePhaseMinerRestricted(); // 节点阶段只允许购买V1/V2/V3节点, 不提供Basic矿机
    error MinerTierDisabled(uint8 tier);
    error MinerTierSoldOut(uint8 tier, uint256 soldCount, uint256 maxSupply);

    // ============================================================
    //                        修饰符
    // ============================================================

    modifier whenNotPaused() {
        if (paused) revert ProtocolPausedError();
        _;
    }

    modifier onlyRegistered() {
        if (!users[msg.sender].registered) revert NotRegistered();
        _;
    }

    modifier onlyOwnerOrSuperAdmin() {
        require(msg.sender == owner() || superAdmins[msg.sender], "Not owner/super-admin");
        _;
    }

    modifier onlySuperAdminRole() {
        require(superAdmins[msg.sender], "Not super-admin");
        _;
    }

    modifier onlyConfigAdmin() {
        require(
            msg.sender == owner() || superAdmins[msg.sender] || managers[msg.sender],
            "Not config-admin"
        );
        _;
    }

    // ============================================================
    //                        构造函数
    // ============================================================

    constructor() {
        _disableInitializers();
    }

    /**
     * @notice 已被旧版部署消费, 保留签名以便 UUPS 升级器兼容.
     * @dev 由 `initializer` 修饰符锁定, 对已初始化的代理调用必然回滚;
     *      保留三参数签名仅为满足 OpenZeppelin 升级插件的 ABI 兼容校验.
     */
    function initialize(
        address /*_usdt*/,
        address /*_seerToken*/,
        address /*_foundationWallet*/
    ) public initializer {
        // no-op: proxy 已初始化, 任何后续调用都会在 `initializer` 检查处回滚
    }

    // ============================================================
    //                     挖矿池管理
    // ============================================================

    /**
     * @notice Owner向协议注入挖矿池SEER (部署后调用)
     * @param amount SEER数量
     */
    function fundMiningPool(uint256 amount) external onlyOwnerOrSuperAdmin {
        seerToken.transferFrom(msg.sender, address(this), amount);
        miningPoolRemaining += amount;
        emit MiningPoolFunded(amount);
    }

    // ============================================================
    //                     用户注册
    // ============================================================

    /**
     * @notice 用户注册 (绑定推荐人)
     * @param _referrer 推荐人地址 (第一个用户可传address(0)由Owner注册)
     */
    function register(address _referrer) external whenNotPaused {
        if (users[msg.sender].registered) revert AlreadyRegistered();
        if (_referrer == msg.sender) revert SelfReferral();

        address effectiveReferrer = _referrer;

        // 第一个用户允许无推荐人 (仅当无用户时)
        if (effectiveReferrer != address(0)) {
            if (!users[effectiveReferrer].registered) revert InvalidReferrer();
        } else {
            if (totalUsers == 0) {
                require(msg.sender == owner(), "Must have referrer");
            } else {
                effectiveReferrer = owner();
                if (effectiveReferrer == msg.sender || !users[effectiveReferrer].registered) {
                    revert InvalidReferrer();
                }
            }
        }

        UserInfo storage user = users[msg.sender];
        user.referrer = effectiveReferrer;
        user.registered = true;
        user.registrationTime = block.timestamp;

        if (effectiveReferrer != address(0)) {
            users[effectiveReferrer].directReferrals.push(msg.sender);
        }

        totalUsers++;

        if (address(airdropManager) != address(0)) {
            try airdropManager.claimAirdrop(msg.sender) {} catch {}
        }

        emit UserRegistered(msg.sender, effectiveReferrer, block.timestamp);
    }

    // ============================================================
    //                     矿机购买
    // ============================================================

    /**
     * @notice 购买矿机 (U进币出 - 双仓位模型)
     * @param tier 矿机等级 (0=Basic, 1=V1, 2=V2, 3=V3)
     *
     * A仓 (本金仓): 等值本金的SEER, 按初始总额线性释放→全部进提现钱包
     * B仓 (收益仓): 本金×倍率的收益上限SEER, 按初始总额线性释放→70%提现+30%投注
     */
    function purchaseMiner(SeerTypes.MinerTier tier) external whenNotPaused onlyRegistered nonReentrant {
        (uint256 cost, , uint256 cycleDays, ) = getMinerTierInfo(tier);

        _validateMinerPurchase(tier);

        // 转入USDT → 协议合约
        usdt.safeTransferFrom(msg.sender, address(this), cost);

        // 资金分流: 节点 (V1/V2/V3) 走"明帕/暗帕/项目方" 10/10/80 分配;
        //          Basic 矿机保持原有"100% → foundationWallet"逻辑
        if (tier != SeerTypes.MinerTier.Basic) {
            _distributeNodeSaleUsdt(msg.sender, cost);
        } else {
            usdt.safeTransfer(foundationWallet, cost);
        }

        uint256 minerId = _finalizeMinerPurchase(tier, cost, cycleDays);

        emit MinerPurchased(msg.sender, tier, cost, minerId);
    }

    /**
     * @notice 使用SEER购买矿机（按当前SEER/USDT价格换算）
     * @param tier 矿机等级 (0=Basic, 1=V1, 2=V2, 3=V3)
     */
    function purchaseMinerWithSEER(SeerTypes.MinerTier tier) external whenNotPaused onlyRegistered nonReentrant {
        (uint256 cost, , uint256 cycleDays, ) = getMinerTierInfo(tier);

        _validateMinerPurchase(tier);

        uint256 seerAmount = _usdtToSeer(cost);
        require(seerAmount > 0, "Invalid SEER quote");

        uint256 seerFee = (seerAmount * seerPurchaseFeeBP) / SeerTokenomics.BASIS_POINTS;
        uint256 totalSeerPayment = seerAmount + seerFee;

        // 转入SEER
        seerToken.transferFrom(msg.sender, address(this), totalSeerPayment);

        // 手续费销毁
        if (seerFee > 0) {
            seerToken.burn(seerFee);
        }

        // 主体支付转给基金会
        seerToken.transfer(foundationWallet, seerAmount);

        uint256 minerId = _finalizeMinerPurchase(tier, cost, cycleDays);

        emit MinerPurchased(msg.sender, tier, cost, minerId);
        emit MinerPurchasedWithSEER(msg.sender, tier, cost, seerAmount, seerFee, minerId);
    }

    /**
     * @notice 预估使用SEER购买矿机所需数量
     */
    function quoteSeerForMiner(SeerTypes.MinerTier tier) external view returns (
        uint256 seerAmount,
        uint256 seerFee,
        uint256 totalSeerPayment
    ) {
        (uint256 cost, , , ) = getMinerTierInfo(tier);
        seerAmount = _usdtToSeer(cost);
        seerFee = (seerAmount * seerPurchaseFeeBP) / SeerTokenomics.BASIS_POINTS;
        totalSeerPayment = seerAmount + seerFee;
    }

    /**
     * @notice 节点销售 USDT 分配 (红框业务: 10% 明帕 + 10% 暗帕 + 80% 项目方)
     * @dev 调用前合约须已持有 cost 数量 USDT.
     *      - 明帕 → 直推, 无推荐人兜底给 projectWallet
     *      - 暗帕 → darkPaiWallet, 未配置则并入 projectWallet
     *      - 项目方 → projectWallet, 未配置则回退到 foundationWallet
     *      - brightPaiBP + darkPaiBP 若为 0, 全额走项目方 (等价旧逻辑)
     */
    function _distributeNodeSaleUsdt(address buyer, uint256 cost) internal {
        address projectTo = projectWallet != address(0) ? projectWallet : foundationWallet;
        require(projectTo != address(0), "Project wallet not set");

        uint256 brightAmt = (cost * brightPaiBP) / SeerTokenomics.BASIS_POINTS;
        uint256 darkAmt = (cost * darkPaiBP) / SeerTokenomics.BASIS_POINTS;
        uint256 projectAmt = cost - brightAmt - darkAmt;

        address referrer = users[buyer].referrer;
        address brightTo = (referrer != address(0) && referrer != buyer) ? referrer : projectTo;
        address darkTo = darkPaiWallet != address(0) ? darkPaiWallet : projectTo;

        if (brightAmt > 0) usdt.safeTransfer(brightTo, brightAmt);
        if (darkAmt > 0) usdt.safeTransfer(darkTo, darkAmt);
        if (projectAmt > 0) usdt.safeTransfer(projectTo, projectAmt);

        emit PaiPointDistributed(
            buyer,
            referrer,
            brightAmt,
            darkAmt,
            projectAmt
        );
    }

    function _validateMinerPurchase(SeerTypes.MinerTier tier) internal {
        MinerTierConfig storage config = minerTierConfigs[uint8(tier)];
        if (!config.enabled) revert MinerTierDisabled(uint8(tier));
        if (config.maxSupply > 0 && config.soldCount >= config.maxSupply) {
            revert MinerTierSoldOut(uint8(tier), config.soldCount, config.maxSupply);
        }

        // ─── 自动判断销售阶段切换 ───────────────────────────────────
        // 节点招募期满15天后自动切换到矿机销售阶段
        if (salePhase == SalePhase.NODE_PHASE &&
            block.timestamp >= nodeSaleStartTime + SeerTokenomics.NODE_SALE_DURATION) {
            SalePhase old = salePhase;
            salePhase = SalePhase.MINER_PHASE;
            emit SalePhaseChanged(old, SalePhase.MINER_PHASE, "Node sale period expired");
        }

        if (salePhase == SalePhase.NODE_PHASE) {
            if (!nodeSaleOpen) revert NodeSaleClosed();

            // ── 节点招募阶段: 只允许购买V1/V2/V3节点, 有地址限购 ──
            if (tier == SeerTypes.MinerTier.Basic) revert NodePhaseMinerRestricted();

            uint256 currentMinerCount = _countTierMiners(msg.sender, tier);
            uint256 limit = _getMinerPurchaseLimit(tier);
            if (limit > 0 && currentMinerCount >= limit) {
                revert MinerPurchaseLimitExceeded(uint8(tier), currentMinerCount, limit);
            }
        } else {
            if (!minerSaleOpen) revert MinerSaleClosed();
        }
        // MINER_PHASE: 全档位无限购, 跳过限额检查
    }

    function _finalizeMinerPurchase(SeerTypes.MinerTier tier, uint256 cost, uint256 cycleDays) internal returns (uint256 minerId) {
        minerTierConfigs[uint8(tier)].soldCount += 1;

        // 计算 A仓 / B仓 上限 (均以USDT价值计, 6位精度)
        uint256 bVaultCap = _getBVaultUsdt(tier);  // 收益仓上限
        uint256 aVaultCap = cost;                   // 本金仓=购买额

        // 创建矿机 (A仓+B仓 初始填满)
        SeerTypes.MinerInfo memory miner = SeerTypes.MinerInfo({
            tier: tier,
            costUsdt: cost,
            vaultA_usdt: aVaultCap,
            vaultB_usdt: bVaultCap,
            purchaseTime: block.timestamp,
            lastClaimTime: block.timestamp,
            totalClaimed: 0,
            cycleDays: cycleDays,
            active: true,
            isAutoGifted: false,
            vaultA_initialUsdt: aVaultCap,
            vaultB_initialUsdt: bVaultCap,
            aReleasedDays: 0,
            bReleasedDays: 0
        });

        userMiners[msg.sender].push(miner);
        uint256 createdMinerId = userMiners[msg.sender].length - 1;

        totalUsdtReceived += cost;
        totalActiveMiners++;

        // 购买V1+矿机时自动赠送同等级矿机 (节点权益, 仅NODE_PHASE生效, 不消耗额外USDT)
        // 赠送矿机: A仓=0 (豁免联锁检查), B仓=标准收益上限
        uint256 performanceVolume = cost; // 默认仅计购买成本
        if (tier >= SeerTypes.MinerTier.V1 && salePhase == SalePhase.NODE_PHASE) {
            SeerTypes.MinerInfo memory giftMiner = SeerTypes.MinerInfo({
                tier: tier,
                costUsdt: 0,
                vaultA_usdt: 0,           // 赠送矿机无本金仓 (由协议覆盖)
                vaultB_usdt: bVaultCap,   // B仓享受同等收益上限
                purchaseTime: block.timestamp,
                lastClaimTime: block.timestamp,
                totalClaimed: 0,
                cycleDays: cycleDays,
                active: true,
                isAutoGifted: true,
                vaultA_initialUsdt: 0,
                vaultB_initialUsdt: bVaultCap,
                aReleasedDays: 0,
                bReleasedDays: 0
            });

            userMiners[msg.sender].push(giftMiner);
            uint256 giftMinerId = userMiners[msg.sender].length - 1;
            totalActiveMiners++;
            emit MinerAutoGifted(msg.sender, tier, giftMinerId);

            // Gifted miner value counts as performance at the paid tier price.
            performanceVolume += cost;
        }

        // Personal performance includes the paid miner and any gifted miner value.
        users[msg.sender].totalInvestedUsdt += performanceVolume;

        // Team performance is propagated upward only; the buyer's team volume excludes self.
        _updateTeamVolume(msg.sender, performanceVolume);

        if (address(airdropManager) != address(0) && cost >= SeerTokenomics.AIRDROP_UNLOCK_MIN_MINER_COST) {
            try airdropManager.unlockAirdrop(msg.sender) {} catch {}
        }

        if (tier != SeerTypes.MinerTier.Basic && address(minerNode) != address(0)) {
            uint256 nodeLotId = minerNode.registerNode(msg.sender, uint256(tier), cost);
            minerNodeLotIds[msg.sender][createdMinerId] = nodeLotId;

            if (salePhase == SalePhase.NODE_PHASE && minerNode.areAllNodeQuotasFilled()) {
                SalePhase old = salePhase;
                salePhase = SalePhase.MINER_PHASE;
                emit SalePhaseChanged(old, SalePhase.MINER_PHASE, "All node quotas sold out");
            }
        }

        return createdMinerId;
    }

    // ============================================================
    //                     挖矿领取
    // ============================================================

    /**
     * @notice 领取所有活跃矿机的挖矿收益 (双仓位释放)
     *
    * 释放规则:
    *   A仓按初始总额线性释放 → 全部进提现钱包(seerBalance)
    *   B仓按初始总额线性释放 → 70%提现 + 30%投注
     *   联锁约束: A仓剩余 < B仓剩余×20% 时, B仓暂停释放
     *   出局: B仓耗尽 → 矿机active=false
     */
    function claimMining() external whenNotPaused onlyRegistered nonReentrant {
        SeerTypes.MinerInfo[] storage miners = userMiners[msg.sender];

        uint256 totalWithdraw = 0;   // → seerBalance (提现钱包)
        uint256 totalBetting  = 0;   // → seerBetting (投注钱包)
        uint256 totalBRewardSeer = 0; // B仓当次释放总SEER (动态奖基数)

        for (uint256 i = 0; i < miners.length; i++) {
            if (!miners[i].active) continue;

            (uint256 withdrawPart, uint256 bettingPart, uint256 bRewardPart) = _claimMinerAtIndex(msg.sender, i);
            totalWithdraw += withdrawPart;
            totalBetting += bettingPart;
            totalBRewardSeer += bRewardPart;
        }

        uint256 totalSeer = totalWithdraw + totalBetting;
        if (totalSeer == 0) revert ZeroAmount();
        if (miningPoolRemaining < totalSeer) revert MiningPoolDepleted();

        _creditWithdrawPending(msg.sender, totalWithdraw);
        users[msg.sender].seerBetting  += totalBetting;
        users[msg.sender].totalEarnedSeer += totalSeer;

        miningPoolRemaining -= totalSeer;
        totalSeerDistributed += totalSeer;

        emit MiningClaimed(msg.sender, totalSeer, totalWithdraw, totalBetting);

        if (totalBRewardSeer > 0) {
            _distributeReferralRewards(msg.sender, totalBRewardSeer);
        }
    }

    /**
     * @notice 按单台矿机领取收益（逐矿机领取）
     * @param minerId 矿机索引
     */
    function claimMiningByMiner(uint256 minerId) external whenNotPaused onlyRegistered nonReentrant {
        SeerTypes.MinerInfo[] storage miners = userMiners[msg.sender];
        if (minerId >= miners.length) revert InvalidMinerIndex(minerId, miners.length);
        if (!miners[minerId].active) revert MinerExpired();

        (uint256 totalWithdraw, uint256 totalBetting, uint256 bRewardSeer) = _claimMinerAtIndex(msg.sender, minerId);

        uint256 totalSeer = totalWithdraw + totalBetting;
        if (totalSeer == 0) revert ZeroAmount();
        if (miningPoolRemaining < totalSeer) revert MiningPoolDepleted();

        _creditWithdrawPending(msg.sender, totalWithdraw);
        users[msg.sender].seerBetting  += totalBetting;
        users[msg.sender].totalEarnedSeer += totalSeer;

        miningPoolRemaining -= totalSeer;
        totalSeerDistributed += totalSeer;

        emit MiningClaimedByMiner(msg.sender, minerId, totalSeer, totalWithdraw, totalBetting);

        if (bRewardSeer > 0) {
            _distributeReferralRewards(msg.sender, bRewardSeer);
        }
    }

    // ============================================================
    //                     每日签到
    // ============================================================

    /**
     * @notice 每日签到领取0.5%持仓奖励
     */
    function dailyCheckin() external whenNotPaused onlyRegistered nonReentrant {
        UserInfo storage user = users[msg.sender];

        if (block.timestamp < user.lastCheckinTime + SeerTokenomics.CHECKIN_INTERVAL) {
            revert CheckinTooEarly();
        }

        uint256 totalHolding = user.seerBalance + user.seerBetting;
        if (totalHolding == 0) revert ZeroAmount();

        uint256 reward = (totalHolding * SeerTokenomics.DAILY_CHECKIN_RATE_BP) / SeerTokenomics.BASIS_POINTS;

        if (miningPoolRemaining < reward) revert MiningPoolDepleted();

        // 签到奖励也遵循70%提现 + 30%投注分配
        uint256 toBetting  = (reward * SeerTokenomics.VAULT_B_BETTING_SHARE_BP) / SeerTokenomics.BASIS_POINTS;
        uint256 toWithdraw = reward - toBetting;

        _creditWithdrawPending(msg.sender, toWithdraw);
        user.seerBetting  += toBetting;
        user.totalEarnedSeer += reward;
        user.lastCheckinTime = block.timestamp;

        miningPoolRemaining -= reward;
        totalSeerDistributed += reward;

        emit DailyCheckin(msg.sender, reward, block.timestamp);
    }

    // ============================================================
    //                     提现 (锁仓释放)
    // ============================================================

    /**
     * @notice 提现已释放到提现钱包的 SEER（不收手续费）
     * @dev 提现前会自动执行一次当日待释放池解锁
     * @param amount 提现数量
     */
    function withdraw(uint256 amount) external whenNotPaused onlyRegistered nonReentrant {
        _withdraw(msg.sender, amount);
    }

    function _withdraw(address _user, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        UserInfo storage user = users[_user];
        _releasePendingToWithdrawable(_user);
        if (user.seerBalance < amount) revert InsufficientBalance();

        user.seerBalance -= amount;

        seerToken.transfer(_user, amount);

        emit Withdrawal(_user, amount, 0);
    }

    // ============================================================
    //                  内部函数: 推荐奖励
    // ============================================================

    /**
     * @dev 分发培育奖励 (仅基于B仓释放):
     *      - 规则: 直推1人拿1代, 直推2人拿2代 ... 直推10人拿10代
     *      - 资格: 第N代上级须满足 directReferrals.length >= N
     *      - 比例: 每代固定 nurtureRewardPerLayerBP
     *      - 代数上限: nurtureRewardMaxLayers
     */
    function _distributeReferralRewards(address _user, uint256 _bRewardSeer) internal {
        if (_bRewardSeer == 0) return;

        uint256 layerReward = (_bRewardSeer * nurtureRewardPerLayerBP) / SeerTokenomics.BASIS_POINTS;
        if (layerReward == 0) return;

        address current = users[_user].referrer;
        uint256 layer = 1;

        while (current != address(0) && layer <= nurtureRewardMaxLayers) {
            // 第N代资格: 直推人数必须 >= N
            if (users[current].directReferrals.length >= layer) {
                _creditDynamicReward(_user, current, layerReward, layer);
            }
            current = users[current].referrer;
            layer++;
        }
    }

    function _creditDynamicReward(
        address from,
        address to,
        uint256 reward,
        uint256 layer
    ) internal {
        if (reward == 0) return;
        if (miningPoolRemaining < reward) {
            emit DynamicRewardSkipped(from, to, reward, 0, layer, 1);
            return;
        }

        _creditWithdrawPending(to, reward);
        users[to].totalEarnedSeer += reward;

        miningPoolRemaining -= reward;
        totalSeerDistributed += reward;

        emit ReferralReward(from, to, reward, layer);
    }

    /**
     * @dev 更新团队业绩 (向上全链路累计)
     */
    function _updateTeamVolume(address _user, uint256 _volumeUsdt) internal {
        address current = users[_user].referrer;

        while (current != address(0)) {
            users[current].teamVolumeUsdt += _volumeUsdt;

            _syncSettlementLevel(current);

            current = users[current].referrer;
        }
    }

    // ============================================================
    //                  内部函数: 等级计算
    // ============================================================

    function _calculateTeamLevel(uint256 _teamVolume) internal pure returns (TeamLevel) {
        if (_teamVolume >= SeerTokenomics.TEAM_V5_THRESHOLD) return TeamLevel.V5;
        if (_teamVolume >= SeerTokenomics.TEAM_V4_THRESHOLD) return TeamLevel.V4;
        if (_teamVolume >= SeerTokenomics.TEAM_V3_THRESHOLD) return TeamLevel.V3;
        if (_teamVolume >= SeerTokenomics.TEAM_V2_THRESHOLD) return TeamLevel.V2;
        if (_teamVolume >= SeerTokenomics.TEAM_V1_THRESHOLD) return TeamLevel.V1;
        return TeamLevel.None;
    }

    function _getBranchVolume(address _directChild) internal view returns (uint256) {
        // 分支业绩用于上级小区计算: 直推个人业绩 + 直推团队业绩。
        UserInfo storage child = users[_directChild];
        return child.totalInvestedUsdt + child.teamVolumeUsdt;
    }

    function _calculateSmallAreaVolume(address _user) internal view returns (uint256) {
        address[] storage directs = users[_user].directReferrals;
        uint256 directCount = directs.length;
        if (directCount <= 1) return 0;

        uint256 totalBranchVolume = 0;
        uint256 maxBranchVolume = 0;

        for (uint256 i = 0; i < directCount; i++) {
            uint256 branchVolume = _getBranchVolume(directs[i]);
            totalBranchVolume += branchVolume;
            if (branchVolume > maxBranchVolume) {
                maxBranchVolume = branchVolume;
            }
        }

        return totalBranchVolume - maxBranchVolume;
    }

    function _syncSettlementLevel(address _user) internal {
        TeamLevel newLevel = _calculateTeamLevel(_calculateSmallAreaVolume(_user));
        TeamLevel oldLevel = users[_user].teamLevel;
        if (newLevel == oldLevel) return;

        users[_user].teamLevel = newLevel;
        emit TeamLevelUpgrade(_user, oldLevel, newLevel);
    }

    function _getWithdrawReleaseBP(TeamLevel _level) internal pure returns (uint256) {
        if (_level == TeamLevel.V5) return SeerTokenomics.TEAM_V5_WITHDRAW_FEE_BP;
        if (_level == TeamLevel.V4) return SeerTokenomics.TEAM_V4_WITHDRAW_FEE_BP;
        if (_level == TeamLevel.V3) return SeerTokenomics.TEAM_V3_WITHDRAW_FEE_BP;
        if (_level == TeamLevel.V2) return SeerTokenomics.TEAM_V2_WITHDRAW_FEE_BP;
        if (_level == TeamLevel.V1) return SeerTokenomics.TEAM_V1_WITHDRAW_FEE_BP;
        return SeerTokenomics.TEAM_V1_WITHDRAW_FEE_BP; // 未达V1也按50%
    }

    function _currentDayKey() internal view returns (uint256) {
        return block.timestamp / 1 days;
    }

    function _creditWithdrawPending(address _user, uint256 amount) internal {
        if (amount == 0) return;
        pendingReleaseSeer[_user] += amount;
        _releasePendingToWithdrawable(_user);
    }

    function _releasePendingToWithdrawable(address _user) internal returns (uint256 unlocked) {
        uint256 pending = pendingReleaseSeer[_user];
        if (pending == 0) return 0;

        uint256 dayKey = _currentDayKey();
        if (lastPendingReleaseDay[_user] >= dayKey) return 0;

        lastPendingReleaseDay[_user] = dayKey;
        unlocked = (pending * _getWithdrawReleaseBP(users[_user].teamLevel)) / SeerTokenomics.BASIS_POINTS;
        if (unlocked == 0) return 0;

        pendingReleaseSeer[_user] = pending - unlocked;
        users[_user].seerBalance += unlocked;

        emit PendingReleaseUnlocked(_user, unlocked, pendingReleaseSeer[_user], dayKey);
    }

    /**
     * @dev 计算用户指定等级矿机的数量 (仅计数非赠送的矿机)
     */
    function _countTierMiners(address _user, SeerTypes.MinerTier _tier) internal view returns (uint256 count) {
        SeerTypes.MinerInfo[] storage miners = userMiners[_user];
        for (uint256 i = 0; i < miners.length; i++) {
            if (miners[i].tier == _tier && !miners[i].isAutoGifted) {
                count++;
            }
        }
    }

    /**
     * @dev 获取矿机等级的购买限额 (0表示无限制)
     */
    function _getMinerPurchaseLimit(SeerTypes.MinerTier _tier) internal pure returns (uint256) {
        if (_tier == SeerTypes.MinerTier.V1) return SeerTokenomics.MINER_V1_PURCHASE_LIMIT;
        if (_tier == SeerTypes.MinerTier.V2) return SeerTokenomics.MINER_V2_PURCHASE_LIMIT;
        if (_tier == SeerTypes.MinerTier.V3) return SeerTokenomics.MINER_V3_PURCHASE_LIMIT;
        return 0; // Basic矿机无限制
    }

    // ============================================================
    //                  内部函数: 挖矿计算
    // ============================================================

    /**
     * @dev 计算用户所有活跃矿机的待领取奖励 (双仓位预估)
     */
    function _calculatePendingRewards(address _user) internal view returns (uint256 totalReward) {
        SeerTypes.MinerInfo[] storage miners = userMiners[_user];
        uint256 len = miners.length;
        for (uint256 i = 0; i < len; i++) {
            (uint256 total, , , ) = LibSeerClaim.getPendingRewardByMiner(userMiners, seerPriceUsdt, _user, i);
            totalReward += total;
        }
    }

    function _claimMinerAtIndex(address _user, uint256 index)
        internal
        returns (uint256 withdrawPart, uint256 bettingPart, uint256 bRewardPart)
    {
        bool deactivated;
        (withdrawPart, bettingPart, bRewardPart, deactivated) = LibSeerClaim.claimMinerAtIndex(
            userMiners,
            minerNodeLotIds,
            address(minerNode),
            seerPriceUsdt,
            _user,
            index
        );
        if (deactivated) {
            _applyActiveDelta(-1);
        }
    }

    /**
     * @dev 获取矿机档位B仓收益上限 (USDT价值, 6位精度)
     */
    function _getBVaultUsdt(SeerTypes.MinerTier tier) internal view returns (uint256) {
        MinerTierConfig storage config = minerTierConfigs[uint8(tier)];
        if (config.costUsdt == 0) revert InvalidMinerTier();
        return config.bVaultUsdt;
    }

    function _hasActiveNodeMiner(address _user) internal view returns (bool) {
        SeerTypes.MinerInfo[] storage miners = userMiners[_user];
        for (uint256 i = 0; i < miners.length; i++) {
            if (miners[i].active && miners[i].tier != SeerTypes.MinerTier.Basic) {
                return true;
            }
        }
        return false;
    }

    // ============================================================
    //                  内部函数: 价格换算
    // ============================================================

    /**
     * @dev USDT金额换算为SEER数量
     * @param usdtAmount USDT金额 (6位精度)
     * @return SEER数量 (18位精度)
     */
    function _usdtToSeer(uint256 usdtAmount) internal view returns (uint256) {
        if (seerPriceUsdt == 0) return 0;
        // usdtAmount (6dec) / seerPriceUsdt (6dec) * 1e18
        return (usdtAmount * 1e18) / seerPriceUsdt;
    }

    /**
     * @dev SEER数量换算为USDT金额
     * @param seerAmount SEER数量 (18位精度)
     * @return USDT金额 (6位精度)
     */
    function _seerToUsdt(uint256 seerAmount) internal view returns (uint256) {
        // seerAmount (18dec) * seerPriceUsdt (6dec) / 1e18
        return (seerAmount * seerPriceUsdt) / 1e18;
    }

    // ============================================================
    //                      查询函数
    // ============================================================

    /// @notice 获取矿机档位信息 (双仓位模型)
    function getMinerTierInfo(SeerTypes.MinerTier tier) public view returns (
        uint256 cost,
        uint256 multiplier,
        uint256 cycleDays,
        uint256 bVaultUsdt  // B仓收益上限 (USDT价值)
    ) {
        MinerTierConfig storage config = minerTierConfigs[uint8(tier)];
        if (config.costUsdt == 0) revert InvalidMinerTier();
        return (config.costUsdt, config.multiplier, config.cycleDays, config.bVaultUsdt);
    }

    function getMinerTierConfig(uint8 tier) external view returns (
        uint256 costUsdt,
        uint256 multiplier,
        uint256 cycleDays,
        uint256 bVaultUsdt,
        uint256 soldCount,
        uint256 maxSupply,
        bool enabled
    ) {
        if (tier > uint8(SeerTypes.MinerTier.V3)) revert InvalidMinerTier();
        MinerTierConfig storage config = minerTierConfigs[tier];
        if (config.costUsdt == 0) revert InvalidMinerTier();
        return (
            config.costUsdt,
            config.multiplier,
            config.cycleDays,
            config.bVaultUsdt,
            config.soldCount,
            config.maxSupply,
            config.enabled
        );
    }

    /// @notice 获取用户各矿机的仓位详情
    function getMinerVaultInfo(address _user, uint256 index) external view returns (
        uint256 vaultA_remaining,
        uint256 vaultB_remaining,
        uint256 vaultA_dailyUsdt,
        uint256 vaultB_dailyUsdt,
        bool bPaused
    ) {
        SeerTypes.MinerInfo storage m = userMiners[_user][index];
        vaultA_remaining = m.vaultA_usdt;
        vaultB_remaining = m.vaultB_usdt;
        if (m.cycleDays > 0) {
            vaultA_dailyUsdt = m.vaultA_initialUsdt / m.cycleDays;
            vaultB_dailyUsdt = m.vaultB_initialUsdt / m.cycleDays;
        }
        bPaused = !m.isAutoGifted && m.vaultB_usdt > 0 &&
                  (m.vaultA_usdt * SeerTokenomics.BASIS_POINTS <
                   m.vaultB_usdt * SeerTokenomics.VAULT_A_MIN_RATIO_OF_B_BP);
    }

    /// @notice 获取用户基本信息
    function getUserInfo(address _user) external view returns (
        bool registered,
        address referrer,
        TeamLevel teamLevel,
        uint256 totalInvestedUsdt,
        uint256 teamVolumeUsdt,
        uint256 seerBalance,
        uint256 seerBetting,
        uint256 totalEarnedSeer,
        uint256 directReferralCount
    ) {
        UserInfo storage u = users[_user];
        return (
            u.registered,
            u.referrer,
            u.teamLevel,
            u.totalInvestedUsdt,
            u.teamVolumeUsdt,
            u.seerBalance,
            u.seerBetting,
            u.totalEarnedSeer,
            u.directReferrals.length
        );
    }

    /// @notice 获取提现状态：已释放余额、待释放池、今日可再释放数量、日释放比例、下次释放时间
    function getWithdrawState(address _user) external view returns (
        uint256 availableSeer,
        uint256 pendingSeer,
        uint256 releasableToday,
        uint256 dailyReleaseBP,
        uint256 nextReleaseTime
    ) {
        availableSeer = users[_user].seerBalance;
        pendingSeer = pendingReleaseSeer[_user];
        dailyReleaseBP = _getWithdrawReleaseBP(users[_user].teamLevel);

        uint256 dayKey = _currentDayKey();
        if (pendingSeer > 0 && lastPendingReleaseDay[_user] < dayKey) {
            releasableToday = (pendingSeer * dailyReleaseBP) / SeerTokenomics.BASIS_POINTS;
            nextReleaseTime = block.timestamp;
        } else {
            nextReleaseTime = (dayKey + 1) * 1 days;
        }
    }

    /// @notice 获取某个直推分支的业绩（= 该直推个人业绩 + 其团队业绩）
    function getBranchVolume(address _user, address _directChild) external view returns (uint256) {
        return users[_directChild].referrer == _user ? _getBranchVolume(_directChild) : 0;
    }

    /// @notice 获取用户小区业绩（所有直推分支之和减去最大分支）
    function getSmallAreaVolume(address _user) external view returns (uint256) {
        return _calculateSmallAreaVolume(_user);
    }

    /// @notice 获取用户矿机数量
    function getUserMinerCount(address _user) external view returns (uint256) {
        return userMiners[_user].length;
    }

    /// @notice 获取用户特定矿机信息
    function getUserMiner(address _user, uint256 index) external view returns (SeerTypes.MinerInfo memory) {
        return userMiners[_user][index];
    }

    /// @notice 获取用户待领取奖励
    function getPendingRewards(address _user) external view returns (uint256) {
        return _calculatePendingRewards(_user);
    }

    /// @notice 获取单台矿机待领取收益（总额 + 提现部分 + 投注部分）
    function getPendingRewardByMiner(address _user, uint256 index)
        external
        view
        returns (
            uint256 totalReward,
            uint256 toWithdraw,
            uint256 toBetting,
            bool bPaused
        )
    {
        return LibSeerClaim.getPendingRewardByMiner(userMiners, seerPriceUsdt, _user, index);
    }

    /// @notice 获取用户直推列表
    function getDirectReferrals(address _user) external view returns (address[] memory) {
        return users[_user].directReferrals;
    }

    /// @notice 获取用户直推数量
    function getDirectReferralCount(address _user) external view returns (uint256) {
        return users[_user].directReferrals.length;
    }

    /// @notice 获取用户指定索引的直推地址
    function getDirectReferral(address _user, uint256 index) external view returns (address) {
        return users[_user].directReferrals[index];
    }

    /// @notice 兼容旧前端字段
    function miningPool() external view returns (uint256) {
        return miningPoolRemaining;
    }

    /// @notice 获取用户能否签到
    function canCheckin(address _user) external view returns (bool) {
        UserInfo storage user = users[_user];
        if (!user.registered) return false;
        if (user.seerBalance + user.seerBetting == 0) return false;
        return block.timestamp >= user.lastCheckinTime + SeerTokenomics.CHECKIN_INTERVAL;
    }

    // ============================================================
    //                    链上角色管理
    // ============================================================

    function isSuperAdmin(address account) external view returns (bool) {
        return superAdmins[account];
    }

    function isManager(address account) external view returns (bool) {
        return managers[account];
    }

    function getSuperAdmins() external view returns (address[] memory) {
        return superAdminList;
    }

    function getManagers() external view returns (address[] memory) {
        return managerList;
    }

    function addSuperAdmin(address account) external onlyOwnerOrSuperAdmin {
        require(account != address(0), "Zero address");
        require(account != owner(), "Owner is implicit super-admin");
        _addSuperAdmin(account);
        emit SuperAdminAdded(account, msg.sender);
    }

    function removeSuperAdmin(address account) external onlyOwnerOrSuperAdmin {
        require(account != owner(), "Cannot remove owner");
        _removeSuperAdmin(account);
        emit SuperAdminRemoved(account, msg.sender);
    }

    function addManager(address account) external onlyOwnerOrSuperAdmin {
        require(account != address(0), "Zero address");
        _addManager(account);
        emit ManagerAdded(account, msg.sender);
    }

    function removeManager(address account) external onlyOwnerOrSuperAdmin {
        _removeManager(account);
        emit ManagerRemoved(account, msg.sender);
    }

    function _addSuperAdmin(address account) internal {
        require(!superAdmins[account], "Already super-admin");
        superAdmins[account] = true;
        superAdminList.push(account);
        superAdminIndexPlusOne[account] = superAdminList.length;
    }

    function _removeSuperAdmin(address account) internal {
        require(superAdmins[account], "Not super-admin");
        superAdmins[account] = false;

        uint256 index = superAdminIndexPlusOne[account] - 1;
        uint256 lastIndex = superAdminList.length - 1;
        if (index != lastIndex) {
            address moved = superAdminList[lastIndex];
            superAdminList[index] = moved;
            superAdminIndexPlusOne[moved] = index + 1;
        }
        superAdminList.pop();
        delete superAdminIndexPlusOne[account];
    }

    function _addManager(address account) internal {
        require(!managers[account], "Already manager");
        managers[account] = true;
        managerList.push(account);
        managerIndexPlusOne[account] = managerList.length;
    }

    function _removeManager(address account) internal {
        require(managers[account], "Not manager");
        managers[account] = false;

        uint256 index = managerIndexPlusOne[account] - 1;
        uint256 lastIndex = managerList.length - 1;
        if (index != lastIndex) {
            address moved = managerList[lastIndex];
            managerList[index] = moved;
            managerIndexPlusOne[moved] = index + 1;
        }
        managerList.pop();
        delete managerIndexPlusOne[account];
    }

    // ============================================================
    //                      管理函数
    // ============================================================

    /// @notice 更新SEER价格 (用于挖矿产出换算)
    function updatePrice(uint256 _newPriceUsdt) external onlyConfigAdmin {
        require(_newPriceUsdt > 0, "Invalid price");
        uint256 old = seerPriceUsdt;
        seerPriceUsdt = _newPriceUsdt;

        if (address(minerNode) != address(0)) {
            try minerNode.notifyPriceUpdate(_newPriceUsdt) {
            } catch {
            }
        }

        emit PriceUpdated(old, _newPriceUsdt);
    }

    /// @notice 暂停/恢复协议
    function setPaused(bool _paused) external onlyOwnerOrSuperAdmin {
        paused = _paused;
        emit ProtocolPaused(_paused);
    }

    /// @notice 设置空投管理合约地址
    function setAirdropManager(address _manager) external onlyOwnerOrSuperAdmin {
        address old = address(airdropManager);
        airdropManager = IAirdropManager(_manager);
        emit AirdropManagerUpdated(old, _manager);
    }

    /// @notice 设置节点管理合约地址
    function setMinerNode(address _minerNode) external onlyOwnerOrSuperAdmin {
        address old = address(minerNode);
        minerNode = IMinerNode(_minerNode);
        emit MinerNodeUpdated(old, _minerNode);
    }

    /// @notice 更新基金会钱包
    function setFoundationWallet(address _wallet) external onlyOwnerOrSuperAdmin {
        require(_wallet != address(0), "Zero address");
        foundationWallet = _wallet;
    }

    // ────────────────────────────────────────────────────────────
    //  节点销售资金分配管理 (红框业务)
    //
    //  部署/升级后, owner 或 superAdmin 必须调用以下 setter 之一激活红框方案:
    //    1. setProjectWallet(<项目方多签>)       -- 必选, 接收 80% 节点资金
    //    2. setDarkPaiWallet(<零号线多签>)       -- 可选, 不配置则暗帕也进 projectWallet
    //    3. setPaiPointBP(1000, 1000)            -- 可选, 默认即 10%/10%, 也可调为 0 关闭
    //
    //  若 projectWallet 未配置 (address(0)), 合约会回退到 foundationWallet,
    //  以保证升级后老流程不中断.
    // ────────────────────────────────────────────────────────────

    /// @notice 设置项目方钱包 (接收节点销售 USDT 的 80% + 明帕兜底)
    function setProjectWallet(address _wallet) external onlyOwnerOrSuperAdmin {
        require(_wallet != address(0), "Zero address");
        address old = projectWallet;
        projectWallet = _wallet;
        emit ProjectWalletUpdated(old, _wallet);
    }

    /// @notice 设置暗帕 / 零号线钱包 (接收节点销售 USDT 的 10%)
    /// @dev 传 address(0) 表示撤销, 暗帕份额将转入 projectWallet
    function setDarkPaiWallet(address _wallet) external onlyOwnerOrSuperAdmin {
        address old = darkPaiWallet;
        darkPaiWallet = _wallet;
        emit DarkPaiWalletUpdated(old, _wallet);
    }

    /// @notice 配置明帕 / 暗帕比例 (基数 10000)
    /// @param _brightBP 明帕比例, 红框默认 1000 (10%)
    /// @param _darkBP   暗帕比例, 红框默认 1000 (10%)
    /// @dev 两者之和必须 <= 10000; 置 0 则对应份额并入项目方
    function setPaiPointBP(uint256 _brightBP, uint256 _darkBP) external onlyOwnerOrSuperAdmin {
        require(_brightBP + _darkBP <= SeerTokenomics.BASIS_POINTS, "Sum exceeds 100%");
        uint256 oldBright = brightPaiBP;
        uint256 oldDark = darkPaiBP;
        brightPaiBP = _brightBP;
        darkPaiBP = _darkBP;
        emit PaiPointBPUpdated(oldBright, _brightBP, oldDark, _darkBP);
    }

    /// @notice 配置各档矿机线性释放周期（天），仅影响新购矿机
    function setMinerCycleDays(
        uint256 _basicDays,
        uint256 _v1Days,
        uint256 _v2Days,
        uint256 _v3Days
    ) external onlyConfigAdmin {
        require(_basicDays > 0 && _v1Days > 0 && _v2Days > 0 && _v3Days > 0, "Invalid cycle");
        basicMinerCycleDays = _basicDays;
        v1MinerCycleDays = _v1Days;
        v2MinerCycleDays = _v2Days;
        v3MinerCycleDays = _v3Days;
        minerTierConfigs[uint8(SeerTypes.MinerTier.Basic)].cycleDays = _basicDays;
        minerTierConfigs[uint8(SeerTypes.MinerTier.V1)].cycleDays = _v1Days;
        minerTierConfigs[uint8(SeerTypes.MinerTier.V2)].cycleDays = _v2Days;
        minerTierConfigs[uint8(SeerTypes.MinerTier.V3)].cycleDays = _v3Days;
        emit MinerCycleDaysUpdated(_basicDays, _v1Days, _v2Days, _v3Days);
    }

    function setMinerTierConfig(
        uint8 _tier,
        uint256 _costUsdt,
        uint256 _multiplier,
        uint256 _cycleDays,
        uint256 _bVaultUsdt,
        bool _enabled
    ) external onlyConfigAdmin {
        if (_tier > uint8(SeerTypes.MinerTier.V3)) revert InvalidMinerTier();
        require(_costUsdt > 0, "Invalid cost");
        require(_multiplier > 0, "Invalid multiplier");
        require(_cycleDays > 0, "Invalid cycle");
        require(_bVaultUsdt > 0, "Invalid B vault");

        _setMinerTierConfig(
            _tier,
            _costUsdt,
            _multiplier,
            _cycleDays,
            _bVaultUsdt,
            minerTierConfigs[_tier].maxSupply,
            minerTierConfigs[_tier].soldCount,
            _enabled
        );
        _syncCycleDaysState(_tier, _cycleDays);

        emit MinerTierConfigUpdated(_tier, _costUsdt, _multiplier, _cycleDays, _bVaultUsdt, _enabled);
    }

    function setMinerTierInventory(uint8 _tier, uint256 _soldCount, uint256 _maxSupply) external onlyConfigAdmin {
        if (_tier > uint8(SeerTypes.MinerTier.V3)) revert InvalidMinerTier();
        if (_maxSupply > 0) {
            require(_soldCount <= _maxSupply, "Sold exceeds supply");
        }

        MinerTierConfig storage config = minerTierConfigs[_tier];
        if (config.costUsdt == 0) revert InvalidMinerTier();

        config.soldCount = _soldCount;
        config.maxSupply = _maxSupply;

        emit MinerTierInventoryUpdated(_tier, _soldCount, _maxSupply);
    }

    /// @notice 配置SEER购买矿机手续费比例 (基数10000)
    function setSeerPurchaseFeeBP(uint256 _feeBP) external onlyConfigAdmin {
        require(_feeBP <= SeerTokenomics.BASIS_POINTS, "Fee too high");
        uint256 old = seerPurchaseFeeBP;
        seerPurchaseFeeBP = _feeBP;
        emit SeerPurchaseFeeUpdated(old, _feeBP);
    }

    /// @notice 配置培育奖励参数（每代比例、最大代数）
    /// @dev 总比例 = _perLayerBP * _maxLayers，必须 <= 100%
    function setNurtureRewardConfig(uint256 _perLayerBP, uint256 _maxLayers) external onlyConfigAdmin {
        require(_perLayerBP > 0, "Invalid per-layer BP");
        require(_maxLayers > 0, "Invalid max layers");
        require(_perLayerBP * _maxLayers <= SeerTokenomics.BASIS_POINTS, "Total reward too high");

        uint256 oldPerLayerBP = nurtureRewardPerLayerBP;
        uint256 oldMaxLayers = nurtureRewardMaxLayers;

        nurtureRewardPerLayerBP = _perLayerBP;
        nurtureRewardMaxLayers = _maxLayers;

        emit NurtureRewardConfigUpdated(oldPerLayerBP, _perLayerBP, oldMaxLayers, _maxLayers);
    }

    /// @notice 获取培育奖励总比例 (基数10000)
    /**
     * @notice Owner手动切换到矿机销售阶段 (节点卖完时提前触发)
     * @dev 节点招募阶段结束后: 停止销售节点, 开放全档位矿机无限购
     */
    function switchToMinerPhase() external onlyConfigAdmin {
        require(salePhase == SalePhase.NODE_PHASE, "Already in MINER_PHASE");
        SalePhase old = salePhase;
        salePhase = SalePhase.MINER_PHASE;
        emit SalePhaseChanged(old, SalePhase.MINER_PHASE, "Owner triggered: nodes sold out");
    }

    /// @notice Owner随时切换销售阶段 (双向开关)
    function setSalePhase(uint8 _phase) external onlyConfigAdmin {
        require(_phase <= 1, "Invalid phase");
        SalePhase newPhase = SalePhase(_phase);
        SalePhase old = salePhase;
        if (old == newPhase) return;
        salePhase = newPhase;
        if (newPhase == SalePhase.NODE_PHASE) {
            nodeSaleStartTime = block.timestamp;
        }
        emit SalePhaseChanged(old, newPhase, "Owner toggle");
    }

    /**
     * @notice Owner重置节点招募阶段 (仅用于测试/应急)
     * @dev 重置后节点销售计时器将重新开始
     */
    function resetToNodePhase() external onlyConfigAdmin {
        SalePhase old = salePhase;
        salePhase = SalePhase.NODE_PHASE;
        nodeSaleStartTime = block.timestamp;
        emit SalePhaseChanged(old, SalePhase.NODE_PHASE, "Owner reset to NODE_PHASE");
    }

    /// @notice 紧急提取 (仅Owner, 防止资金卡死)
    function emergencyWithdrawToken(address token, uint256 amount) external onlyOwnerOrSuperAdmin {
        IERC20(token).safeTransfer(owner(), amount);
    }

    /// @notice Admin手动设置用户团队等级 (用于特殊情况)
    function setUserTeamLevel(address _user, TeamLevel _level) external onlyOwnerOrSuperAdmin {
        require(users[_user].registered, "Not registered");
        TeamLevel old = users[_user].teamLevel;
        users[_user].teamLevel = _level;
        emit TeamLevelUpgrade(_user, old, _level);
    }

    /// @notice Admin手动调整用户seerBetting余额 (紧急修正)
    function setUserBettingBalance(address _user, uint256 _amount) external onlyOwnerOrSuperAdmin {
        require(users[_user].registered, "Not registered");
        uint256 oldAmount = users[_user].seerBetting;
        users[_user].seerBetting = _amount;
        emit UserBettingBalanceAdjusted(msg.sender, _user, oldAmount, _amount);
    }

    /// @notice Admin禁用指定用户矿机
    function deactivateMiner(address _user, uint256 _minerId) external onlyOwnerOrSuperAdmin {
        int256 d = LibSeerAdmin.deactivateMiner(userMiners, minerNodeLotIds, address(minerNode), _user, _minerId);
        _applyActiveDelta(d);
    }

    /// @notice Admin启用指定用户矿机
    function activateMiner(address _user, uint256 _minerId) external onlyOwnerOrSuperAdmin {
        int256 d = LibSeerAdmin.activateMiner(userMiners, minerNodeLotIds, address(minerNode), _user, _minerId);
        _applyActiveDelta(d);
    }

    /// @notice Admin删除指定用户矿机（会同步移除节点Lot）
    function removeMiner(address _user, uint256 _minerId) external onlyOwnerOrSuperAdmin {
        int256 d = LibSeerAdmin.removeMiner(userMiners, minerNodeLotIds, address(minerNode), _user, _minerId);
        _applyActiveDelta(d);
    }

    function _applyActiveDelta(int256 d) internal {
        if (d > 0) {
            totalActiveMiners += uint256(d);
        } else if (d < 0) {
            uint256 dec = uint256(-d);
            if (totalActiveMiners >= dec) totalActiveMiners -= dec;
        }
    }

    /// @notice Admin禁用指定节点Lot
    function adminDeactivateNodeLot(address _user, uint256 _lotId) external onlyOwnerOrSuperAdmin {
        require(address(minerNode) != address(0), "MinerNode not set");
        minerNode.adminDeactivateNodeLot(_user, _lotId);
        emit AdminNodeLotDeactivated(msg.sender, _user, _lotId, block.timestamp);
    }

    // ============================================================
    //                  矿机/节点属性编辑 (已外置到 LibSeerAdmin)
    // ============================================================
    // 事件声明已在 LibSeerAdmin 中, 主合约只保留壳函数以保持 ABI 不变.

    function editMinerTier(address _user, uint256 _minerId, uint8 _newTier) external onlyOwnerOrSuperAdmin {
        LibSeerAdmin.editMinerTier(userMiners, minerNodeLotIds, address(minerNode), _user, _minerId, _newTier);
    }

    function editMinerCost(address _user, uint256 _minerId, uint256 _newCostUsdt) external onlyOwnerOrSuperAdmin {
        LibSeerAdmin.editMinerCost(userMiners, _user, _minerId, _newCostUsdt);
    }

    function editMinerVaultA(address _user, uint256 _minerId, uint256 _newVaultA) external onlyOwnerOrSuperAdmin {
        LibSeerAdmin.editMinerVaultA(userMiners, _user, _minerId, _newVaultA);
    }

    function editMinerVaultB(address _user, uint256 _minerId, uint256 _newVaultB) external onlyOwnerOrSuperAdmin {
        LibSeerAdmin.editMinerVaultB(userMiners, _user, _minerId, _newVaultB);
    }

    function editMinerCycleDays(address _user, uint256 _minerId, uint256 _newCycleDays) external onlyOwnerOrSuperAdmin {
        LibSeerAdmin.editMinerCycleDays(userMiners, _user, _minerId, _newCycleDays);
    }

    function editNodeTier(address _user, uint256 _lotId, uint8 _newTier) external onlyOwnerOrSuperAdmin {
        LibSeerAdmin.editNodeTier(address(minerNode), _user, _lotId, _newTier);
    }

    function editNodeWeight(address _user, uint256 _lotId, uint256 _newWeight) external onlyOwnerOrSuperAdmin {
        LibSeerAdmin.editNodeWeight(address(minerNode), _user, _lotId, _newWeight);
    }

    function editNodeCost(address _user, uint256 _lotId, uint256 _newCostUsdt) external onlyOwnerOrSuperAdmin {
        LibSeerAdmin.editNodeCost(address(minerNode), _user, _lotId, _newCostUsdt);
    }

    /// @notice V2 初始化：设置售卖页面开关默认值
    function _setMinerTierConfig(
        uint8 _tier,
        uint256 _costUsdt,
        uint256 _multiplier,
        uint256 _cycleDays,
        uint256 _bVaultUsdt,
        uint256 _maxSupply,
        uint256 _soldCount,
        bool _enabled
    ) internal {
        minerTierConfigs[_tier] = MinerTierConfig({
            costUsdt: _costUsdt,
            multiplier: _multiplier,
            cycleDays: _cycleDays,
            bVaultUsdt: _bVaultUsdt,
            maxSupply: _maxSupply,
            soldCount: _soldCount,
            enabled: _enabled
        });
    }

    function _syncCycleDaysState(uint8 _tier, uint256 _cycleDays) internal {
        if (_tier == uint8(SeerTypes.MinerTier.Basic)) {
            basicMinerCycleDays = _cycleDays;
        } else if (_tier == uint8(SeerTypes.MinerTier.V1)) {
            v1MinerCycleDays = _cycleDays;
        } else if (_tier == uint8(SeerTypes.MinerTier.V2)) {
            v2MinerCycleDays = _cycleDays;
        } else if (_tier == uint8(SeerTypes.MinerTier.V3)) {
            v3MinerCycleDays = _cycleDays;
        }
    }

    /// @notice 开启/关闭节点售卖页面
    function setNodeSaleOpen(bool _open) external onlyOwnerOrSuperAdmin {
        nodeSaleOpen = _open;
        emit NodeSaleOpenChanged(_open);
    }

    /// @notice 开启/关闭矿机售卖页面
    function setMinerSaleOpen(bool _open) external onlyOwnerOrSuperAdmin {
        minerSaleOpen = _open;
        emit MinerSaleOpenChanged(_open);
    }

    /// @notice Admin批量注册/激活用户 (使指定地址可以作为推荐人被绑定)
    function adminBatchRegister(address[] calldata, address[] calldata) external view onlyOwnerOrSuperAdmin {
        revert();
    }

    /// @notice 清除用户注册数据 (保留owner不动)
    /// @param _user 要清除的用户地址
    function adminClearUserData(address _user) external onlyOwnerOrSuperAdmin {
        require(_user != address(0), "Invalid user");
        require(_user != owner(), "Cannot clear owner");

        UserInfo storage user = users[_user];
        if (!user.registered) {
            return;
        }

        uint256 minerCount = userMiners[_user].length;
        if (minerCount > 0) {
            if (totalActiveMiners >= minerCount) {
                totalActiveMiners -= minerCount;
            } else {
                totalActiveMiners = 0;
            }
        }

        delete userMiners[_user];
        if (totalUsers > 0) totalUsers--;
        delete users[_user];
    }

    function _authorizeUpgrade(address) internal override onlyOwnerOrSuperAdmin {}
}
