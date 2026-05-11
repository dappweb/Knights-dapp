// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IPancakeV2Router {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);

}

contract KNTAllInOneUpgradeable {
    using SafeERC20 for IERC20;

    error KntError();

    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant TOTAL_SUPPLY = 210_000_000 ether;

    uint256 public constant BASE_DAILY_EMISSION = 1_560 ether;
    uint256 public constant MAX_DAILY_EMISSION = 3_360 ether;
    uint256 public constant EMISSION_STEP_PER_10K_LP = 100 ether;
    uint256 public constant LP_PER_EMISSION_STEP_USDT = 10_000 ether;
    uint256 public constant STATIC_SHARE_BP = 5_000;
    uint256 public constant DYNAMIC_SHARE_BP = 4_000;
    uint256 public constant NODE_SHARE_BP = 1_000;
    uint256 public constant POWER_PER_USDT = 6;
    uint256 public constant POWER_COMPOUND_BP_PER_DAY = 120;
    uint256 public constant REDUCTION_PERIOD = 50 days;
    uint256 public constant REDUCTION_BP = 2_000;
    uint256 public constant MAX_REDUCTION_ROUNDS = 10;

    uint256 public constant NODE_SELF_LP_USDT = 1_000 ether;
    uint256 public constant NODE_DIRECT_LP_USDT = 3_000 ether;
    uint256 public constant EFFECTIVE_DIRECT_LP_USDT = 100 ether;
    uint256 public constant DIRECT_LEVEL_ONE_BP = 2_000;
    uint256 public constant DYNAMIC_LEVEL_2_TO_10_BP = 500;
    uint256 public constant DYNAMIC_LEVEL_11_TO_15_BP = 300;
    uint256 public constant MAX_DYNAMIC_LEVEL = 15;

    uint256 public constant SELL_TAX_BP = 500;
    uint256 public constant SELL_TAX_QUEUE_BP = 200;
    uint256 public constant PROFIT_TAX_BP = 3_000;
    uint256 public constant PROFIT_TAX_QUEUE_BP = 500;
    uint256 public constant PROFIT_TAX_BURN_BP = 1_000;
    uint256 public constant MIGRATION_RELEASE_BP = 10;
    uint256 public constant MIGRATION_BOOST_RELEASE_BP = 30;

    address public foundationWallet;
    address public dexSettlementWallet;
    address public projectSinkWallet;
    address public ecosystemWallet;
    address public pancakeRouter;
    address public usdtToken;
    address public labubuToken;
    address public labubuKntPair;
    address public burnAddress = address(0xdead);
    uint256 public burnQueueRewardBP = 12_000;
    uint256 public referralSignalAmount;

    uint256 public startTimestamp;
    uint256 public lastRewardDay;
    uint256 public rewardPool;
    uint256 public reservedDeposits;
    uint256 public totalLpValueUsdt;
    uint256 public totalPower;
    uint256 public totalKntDistributed;
    uint256 public dynamicPool;
    uint256 public sunkDynamicPool;
    uint256 public accStaticRewardPerPower;
    uint256 public accNodeRewardPerNode;
    uint256 public totalBurned;
    uint256 public globalLpValueUsdt;
    uint256 public latestKntPriceUsdt;
    uint256 public price24hAgoUsdt;
    uint256 public latestPriceUpdatedAt;
    uint256 public rewardPeriodSeconds;

    string private tokenName;
    string private tokenSymbol;
    uint256 private tokenTotalSupply;
    address private contractOwner;
    bool private initialized;
    uint256 private reentrancyStatus;
    mapping(address => uint256) private tokenBalances;
    mapping(address => mapping(address => uint256)) private tokenAllowances;

    bool private systemTransfer;

    struct UserInfo {
        bool registered;
        address referrer;
        uint256 depositAmount;
        uint256 lpValueUsdt;
        uint256 power;
        uint256 lastPowerUpdateDay;
        uint256 rewardDebt;
        uint256 pendingKnt;
        uint256 directLpValueUsdt;
        uint256 directEffectiveCount;
        bool isNode;
        uint256 nodeRewardDebt;
        uint256 totalStaticReward;
        uint256 totalDynamicReward;
        uint256 totalNodeReward;
    }

    struct CostBasis {
        uint256 boughtKnt;
        uint256 spentUsdt;
    }

    struct QueueEntry {
        address account;
        uint256 burnedAmount;
        uint256 rewardAmount;
        bool paid;
    }

    struct MigrationPosition {
        address owner;
        uint256 originalAmount;
        uint256 claimedAmount;
        uint256 lastClaimDay;
    }

    mapping(address => UserInfo) public users;
    mapping(address => address[]) private directReferrals;
    mapping(address => mapping(address => bool)) public referralSignals;
    mapping(address => CostBasis) public costBasisOf;
    mapping(address => bool) public admins;
    mapping(address => bool) public managers;
    mapping(address => bool) public taxRecorders;
    mapping(address => bool) public keepers;
    mapping(address => bool) public ammPairs;
    mapping(bytes32 => bool) public processedUsdtDeposits;
    address[] private nodeList;
    mapping(address => uint256) private nodeIndexPlusOne;

    QueueEntry[] public burnQueue;
    uint256 public nextPayoutIndex;
    uint256 public nextMigrationId = 1;
    mapping(uint256 => MigrationPosition) public migrationPositions;
    mapping(bytes32 => bool) public processedKeeperActions;
    address public labubuSwapIntermediateToken;

    event ReferralSignal(address indexed from, address indexed to, uint256 amount);
    event ReferrerBound(address indexed user, address indexed referrer);
    event Deposited(address indexed user, uint256 amount, uint256 lpValueUsdt, uint256 addedPower);
    event UsdtDeposited(
        address indexed user,
        uint256 usdtAmount,
        uint256 kntUsed,
        uint256 labubuUsed,
        uint256 lpAmount,
        uint256 lpValueUsdt
    );
    event RewardsFunded(address indexed from, uint256 amount);
    event PoolUpdated(uint256 indexed dayKey, uint256 emission, uint256 staticAmount, uint256 dynamicAmount, uint256 nodeAmount);
    event RewardDistributed(address indexed user, address indexed operator, uint256 amount);
    event StaticRewardAccrued(address indexed user, uint256 amount);
    event DynamicRewardAccrued(address indexed source, address indexed receiver, uint256 indexed level, uint256 amount);
    event NodeStatusUpdated(address indexed user, bool isNode);
    event BurnQueued(address indexed user, uint256 indexed index, uint256 burnedAmount, uint256 rewardAmount);
    event QueuePaid(address indexed user, uint256 indexed index, uint256 rewardAmount);
    event BuyRecorded(address indexed account, uint256 kntAmount, uint256 usdtSpent);
    event SellSettled(address indexed account, uint256 grossAmount, uint256 netAmount, uint256 sellTax, uint256 profitTax, uint256 dumpTax);
    event FoundationTaxConverted(address indexed foundationWallet, uint256 kntAmount, uint256 labubuAmount);
    event DynamicSunk(address indexed source, uint256 amount);
    event LiquidityKntBurned(address indexed account, uint256 amount);
    event UserLpCredited(address indexed account, uint256 lpAmount, uint256 lpValueUsdt);
    event KeeperLpReduced(address indexed account, address indexed operator, uint256 lpAmount, uint256 lpValueUsdt);
    event KeeperBurned(address indexed account, address indexed operator, uint256 amount);
    event KeeperActionProcessed(bytes32 indexed actionId, bytes32 indexed sourceTxHash, uint256 indexed sourceLogIndex, address account, bytes32 actionType);
    event MigrationMinted(address indexed account, uint256 indexed id, uint256 amount);
    event MigrationClaimed(address indexed account, uint256 indexed id, uint256 amount);
    event LiquidityConfigUpdated(address router, address usdtToken, address labubuToken, address labubuKntPair);
    event AdminUpdated(address indexed admin, bool enabled);
    event ManagerUpdated(address indexed manager, bool enabled);
    event KeeperUpdated(address indexed keeper, bool enabled);
    event AmmPairUpdated(address indexed pair, bool enabled);
    event GlobalLpValueUpdated(uint256 oldValue, uint256 newValue);
    event KntPriceUpdated(uint256 priceNowUsdt, uint256 price24hAgoUsdt);
    event UsdtDepositProcessed(bytes32 indexed depositId, address indexed account, address indexed operator, uint256 amount);
    event RewardPeriodUpdated(uint256 oldPeriodSeconds, uint256 newPeriodSeconds);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier initializer() {
        _require(!initialized);
        initialized = true;
        _;
    }

    modifier onlyOwner() {
        _require(_isAdminOrOwner(msg.sender));
        _;
    }

    modifier onlyAdminOrOwner() {
        _require(_isAdminOrOwner(msg.sender));
        _;
    }

    modifier onlyManagerOrAbove() {
        _require(_isManagerOrAbove(msg.sender));
        _;
    }

    modifier onlyKeeperOrAbove() {
        _require(_isKeeperOrAbove(msg.sender));
        _;
    }

    modifier nonReentrant() {
        _require(reentrancyStatus != 2);
        reentrancyStatus = 2;
        _;
        reentrancyStatus = 1;
    }

    function _require(bool condition) internal pure {
        if (!condition) revert KntError();
    }

    function initialize(
        address initialOwner,
        address foundationWallet_,
        address dexSettlementWallet_,
        address pancakeRouter_,
        address usdtToken_,
        address labubuToken_
    ) external initializer {
        _require(foundationWallet_ != address(0) && dexSettlementWallet_ != address(0));
        _require(initialOwner != address(0));

        tokenName = "Knight Token";
        tokenSymbol = "KNT";
        contractOwner = initialOwner;
        reentrancyStatus = 1;
        foundationWallet = foundationWallet_;
        dexSettlementWallet = dexSettlementWallet_;
        projectSinkWallet = foundationWallet_;
        ecosystemWallet = foundationWallet_;
        pancakeRouter = pancakeRouter_;
        usdtToken = usdtToken_;
        labubuToken = labubuToken_;
        burnAddress = address(0xdead);
        burnQueueRewardBP = 12_000;
        nextMigrationId = 1;
        rewardPeriodSeconds = 1 days;
        startTimestamp = block.timestamp;
        _mint(initialOwner, TOTAL_SUPPLY);
        taxRecorders[initialOwner] = true;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    function name() external view returns (string memory) {
        return tokenName;
    }

    function symbol() external view returns (string memory) {
        return tokenSymbol;
    }

    function decimals() public pure returns (uint8) {
        return 18;
    }

    function totalSupply() public view returns (uint256) {
        return tokenTotalSupply;
    }

    function balanceOf(address account) public view returns (uint256) {
        return tokenBalances[account];
    }

    function allowance(address owner_, address spender) public view returns (uint256) {
        return tokenAllowances[owner_][spender];
    }

    function owner() public view returns (address) {
        return contractOwner;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        _require(newOwner != address(0));
        address oldOwner = contractOwner;
        contractOwner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function approve(address spender, uint256 value) public returns (bool) {
        tokenAllowances[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
    }

    function burnFrom(address account, uint256 amount) public {
        _spendAllowance(account, msg.sender, amount);
        _burn(account, amount);
    }

    function _update(address from, address to, uint256 value) internal {
        if (
            !systemTransfer
                && referralSignalAmount > 0
                && value == referralSignalAmount
                && from != address(0)
                && to != address(0)
                && from != address(this)
                && to != address(this)
                && from.code.length == 0
                && to.code.length == 0
                && from != to
        ) {
            _handleReferralSignal(from, to, value);
        }

        if (!systemTransfer && value > 0 && from != address(0) && to == burnAddress) {
            _burnAndQueue(from, value);
            return;
        }

        if (!systemTransfer && value > 0 && from != address(0) && to != address(0) && !ammPairs[from] && ammPairs[to]) {
            _settleAmmSell(from, to, value);
            return;
        }

        _rawUpdate(from, to, value);

        if (to == address(0) && from != address(0)) {
            totalBurned += value;
        }

        // Pair outgoing transfers can be either swaps or Pancake LP withdrawals.
        // Cost basis is recorded explicitly through recordBuy to avoid treating LP exits as buys.
    }

    function referrerOf(address account) external view returns (address) {
        return users[account].referrer;
    }

    function directReferralsOf(address account) external view returns (address[] memory) {
        return directReferrals[account];
    }

    function roleOf(address account)
        external
        view
        returns (bool isOwnerRole, bool isAdminRole, bool isManagerRole, bool isKeeperRole, bool isTaxRecorderRole)
    {
        isOwnerRole = account == owner();
        isAdminRole = admins[account];
        isManagerRole = managers[account];
        isKeeperRole = keepers[account];
        isTaxRecorderRole = taxRecorders[account];
    }

    function isAdminOrOwner(address account) external view returns (bool) {
        return _isAdminOrOwner(account);
    }

    function isManagerOrAbove(address account) external view returns (bool) {
        return _isManagerOrAbove(account);
    }

    function isKeeperOrAbove(address account) external view returns (bool) {
        return _isKeeperOrAbove(account);
    }

    function bindReferrer(address referrer) external {
        _require(referrer != address(0));
        if (!users[msg.sender].registered) {
            _register(msg.sender, referrer);
        } else {
            _bindReferrer(msg.sender, referrer);
        }
    }

    function nodeCount() external view returns (uint256) {
        return nodeList.length;
    }

    function nodes() external view returns (address[] memory) {
        return nodeList;
    }

    function burnQueueLength() external view returns (uint256) {
        return burnQueue.length;
    }

    function currentDay() public view returns (uint256) {
        if (block.timestamp <= startTimestamp) return 0;
        return (block.timestamp - startTimestamp) / rewardPeriodSeconds;
    }

    function dailyEmissionForDay(uint256 dayKey) public view returns (uint256) {
        uint256 lpBasis = globalLpValueUsdt > totalLpValueUsdt ? globalLpValueUsdt : totalLpValueUsdt;
        uint256 steps = lpBasis / LP_PER_EMISSION_STEP_USDT;
        uint256 emission = BASE_DAILY_EMISSION + (steps * EMISSION_STEP_PER_10K_LP);
        if (emission > MAX_DAILY_EMISSION) emission = MAX_DAILY_EMISSION;

        uint256 reductionPeriods = REDUCTION_PERIOD / rewardPeriodSeconds;
        if (reductionPeriods == 0) reductionPeriods = 1;
        uint256 rounds = dayKey / reductionPeriods;
        if (rounds > MAX_REDUCTION_ROUNDS) rounds = MAX_REDUCTION_ROUNDS;
        for (uint256 i = 0; i < rounds; i++) {
            emission = (emission * (BASIS_POINTS - REDUCTION_BP)) / BASIS_POINTS;
        }
        return emission;
    }

    function transfer(address to, uint256 value) public returns (bool) {
        if (!systemTransfer && to == address(0)) {
            _burnAndQueue(msg.sender, value);
            return true;
        }
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) public returns (bool) {
        if (!systemTransfer && to == address(0)) {
            _spendAllowance(from, msg.sender, value);
            _burnAndQueue(from, value);
            return true;
        }
        _spendAllowance(from, msg.sender, value);
        _transfer(from, to, value);
        return true;
    }

    function processUsdtDeposit(
        address account,
        uint256 amount,
        bytes32 depositId,
        uint256 minKntBought,
        uint256 minLabubuBought,
        uint256 minKntToLp,
        uint256 minLabubuToLp,
        uint256 minLpAmount,
        uint256 deadline
    ) external nonReentrant onlyKeeperOrAbove returns (uint256 liquidity) {
        _require(account != address(0));
        _require(amount > 0);
        _require(depositId != bytes32(0));
        _require(!processedUsdtDeposits[depositId]);
        _require(IERC20(usdtToken).balanceOf(address(this)) >= amount);
        processedUsdtDeposits[depositId] = true;
        liquidity = _processUsdtDeposit(account, amount, minKntBought, minLabubuBought, minKntToLp, minLabubuToLp, minLpAmount, deadline);
        _distributePendingLineage(account);
        emit UsdtDepositProcessed(depositId, account, msg.sender, amount);
    }

    function fundRewardPool(uint256 amount) external nonReentrant {
        _require(amount > 0);
        systemTransfer = true;
        _transfer(msg.sender, address(this), amount);
        systemTransfer = false;
        rewardPool += amount;
        emit RewardsFunded(msg.sender, amount);
    }

    function adminUpdatePool() external onlyKeeperOrAbove {
        _updatePool();
    }

    function keeperDistributeRewards(address[] calldata accounts) external nonReentrant onlyKeeperOrAbove {
        _updatePool();
        for (uint256 i = 0; i < accounts.length; i++) {
            address account = accounts[i];
            if (account == address(0)) continue;
            _settleAccount(account);
            _distributePendingReward(account);
        }
    }

    function burnAndQueue(uint256 amount) external nonReentrant {
        _require(amount > 0);
        _burnAndQueue(msg.sender, amount);
    }

    function keeperBurnFrom(address account, uint256 amount) external nonReentrant onlyKeeperOrAbove {
        _require(account != address(0) && account != address(this) && !ammPairs[account]);
        _require(amount > 0);
        _burn(account, amount);
        emit KeeperBurned(account, msg.sender, amount);
    }

    function keeperBurnFromSource(address account, uint256 amount, bytes32 sourceTxHash, uint256 sourceLogIndex)
        external
        nonReentrant
        onlyKeeperOrAbove
    {
        bytes32 actionId = _useKeeperAction(account, sourceTxHash, sourceLogIndex, keccak256("KNT_BURN"));
        _require(account != address(0) && account != address(this) && !ammPairs[account]);
        _require(amount > 0);
        _burn(account, amount);
        emit KeeperBurned(account, msg.sender, amount);
        emit KeeperActionProcessed(actionId, sourceTxHash, sourceLogIndex, account, keccak256("KNT_BURN"));
    }

    function keeperReduceUserLp(address account, uint256 amount, uint256 lpValueUsdt) external nonReentrant onlyKeeperOrAbove {
        _require(account != address(0));
        _require(amount > 0 && lpValueUsdt > 0);
        _updatePool();
        _settleAccount(account);
        _removeDeposit(account, amount, lpValueUsdt);
        emit KeeperLpReduced(account, msg.sender, amount, lpValueUsdt);
    }

    function keeperReduceUserLpFromSource(address account, uint256 amount, uint256 lpValueUsdt, bytes32 sourceTxHash, uint256 sourceLogIndex)
        external
        nonReentrant
        onlyKeeperOrAbove
    {
        bytes32 actionId = _useKeeperAction(account, sourceTxHash, sourceLogIndex, keccak256("LP_REDUCE"));
        _require(account != address(0));
        _require(amount > 0 && lpValueUsdt > 0);
        _updatePool();
        _settleAccount(account);
        _removeDeposit(account, amount, lpValueUsdt);
        emit KeeperLpReduced(account, msg.sender, amount, lpValueUsdt);
        emit KeeperActionProcessed(actionId, sourceTxHash, sourceLogIndex, account, keccak256("LP_REDUCE"));
    }

    function keeperReduceUserLpAmountFromSource(address account, uint256 amount, bytes32 sourceTxHash, uint256 sourceLogIndex)
        external
        nonReentrant
        onlyKeeperOrAbove
    {
        bytes32 actionId = _useKeeperAction(account, sourceTxHash, sourceLogIndex, keccak256("LP_REDUCE"));
        _require(account != address(0));
        _require(amount > 0);
        _updatePool();
        _settleAccount(account);
        UserInfo storage user = users[account];
        _require(user.depositAmount >= amount && user.depositAmount > 0);
        uint256 lpValueUsdt = (user.lpValueUsdt * amount) / user.depositAmount;
        _require(lpValueUsdt > 0);
        _removeDeposit(account, amount, lpValueUsdt);
        emit KeeperLpReduced(account, msg.sender, amount, lpValueUsdt);
        emit KeeperActionProcessed(actionId, sourceTxHash, sourceLogIndex, account, keccak256("LP_REDUCE"));
    }

    function processBurnQueue(uint256 maxCount) external nonReentrant returns (uint256 paidCount) {
        uint256 i = nextPayoutIndex;
        while (i < burnQueue.length && paidCount < maxCount) {
            QueueEntry storage entry = burnQueue[i];
            if (entry.paid) {
                i++;
                continue;
            }
            if (rewardPool < entry.rewardAmount || _freeBalance() < entry.rewardAmount) break;

            entry.paid = true;
            rewardPool -= entry.rewardAmount;
            systemTransfer = true;
            _transfer(address(this), entry.account, entry.rewardAmount);
            systemTransfer = false;
            emit QueuePaid(entry.account, i, entry.rewardAmount);

            i++;
            paidCount++;
        }
        nextPayoutIndex = i;
    }

    function recordBuy(address account, uint256 kntAmount, uint256 usdtSpent) external {
        _require(taxRecorders[msg.sender] || _isAdminOrOwner(msg.sender));
        _require(account != address(0) && kntAmount > 0 && usdtSpent > 0);
        costBasisOf[account].boughtKnt += kntAmount;
        costBasisOf[account].spentUsdt += usdtSpent;
        emit BuyRecorded(account, kntAmount, usdtSpent);
    }

    function settleSell(uint256 amount, uint256 currentValueUsdt, uint256 priceNowUsdt_, uint256 price24hAgoUsdt_)
        external
        nonReentrant
        returns (uint256 netAmount)
    {
        _require(amount > 0 && currentValueUsdt > 0);
        systemTransfer = true;
        _transfer(msg.sender, address(this), amount);
        systemTransfer = false;

        uint256 sellTax = (amount * SELL_TAX_BP) / BASIS_POINTS;
        uint256 profitTax = _profitTax(msg.sender, amount, currentValueUsdt);
        uint256 dumpTax = _dumpTax(amount, priceNowUsdt_, price24hAgoUsdt_);
        uint256 totalTax = sellTax + profitTax + dumpTax;
        _require(totalTax <= amount);

        _distributeSellTax(sellTax);
        _distributeProfitTax(profitTax);
        _distributeDumpTax(dumpTax);

        netAmount = amount - totalTax;
        if (netAmount > 0) {
            systemTransfer = true;
            _transfer(address(this), dexSettlementWallet, netAmount);
            systemTransfer = false;
        }
        _consumeCostBasis(msg.sender, amount);
        emit SellSettled(msg.sender, amount, netAmount, sellTax, profitTax, dumpTax);
    }

    function mintMigration(address account, uint256 amount) external onlyAdminOrOwner returns (uint256 id) {
        _require(account != address(0) && amount > 0);
        id = nextMigrationId++;
        migrationPositions[id] = MigrationPosition({
            owner: account,
            originalAmount: amount,
            claimedAmount: 0,
            lastClaimDay: currentDay()
        });
        emit MigrationMinted(account, id, amount);
    }

    function claimMigration(uint256 id) external nonReentrant {
        MigrationPosition storage position = migrationPositions[id];
        _require(position.owner == msg.sender);
        uint256 amount = migrationClaimable(id);
        _require(amount > 0);
        _require(_freeBalance() >= amount);

        position.claimedAmount += amount;
        position.lastClaimDay = currentDay();
        systemTransfer = true;
        _transfer(address(this), msg.sender, amount);
        systemTransfer = false;
        emit MigrationClaimed(msg.sender, id, amount);
    }

    function migrationClaimable(uint256 id) public view returns (uint256) {
        MigrationPosition storage position = migrationPositions[id];
        if (position.owner == address(0) || position.claimedAmount >= position.originalAmount) return 0;
        uint256 elapsedDays = currentDay() - position.lastClaimDay;
        if (elapsedDays == 0) return 0;
        uint256 bp = users[position.owner].directLpValueUsdt >= NODE_DIRECT_LP_USDT
            ? MIGRATION_BOOST_RELEASE_BP
            : MIGRATION_RELEASE_BP;
        uint256 amount = (position.originalAmount * bp * elapsedDays) / BASIS_POINTS;
        uint256 remaining = position.originalAmount - position.claimedAmount;
        return amount > remaining ? remaining : amount;
    }

    function adminImportDeposits(address[] calldata accounts, uint256[] calldata amounts, uint256[] calldata lpValuesUsdt, address[] calldata referrers)
        external
        onlyAdminOrOwner
    {
        _require(accounts.length == amounts.length && accounts.length == lpValuesUsdt.length && accounts.length == referrers.length);
        _updatePool();
        for (uint256 i = 0; i < accounts.length; i++) {
            _depositImported(accounts[i], amounts[i], lpValuesUsdt[i], referrers[i]);
        }
    }

    function adminSetReferrer(address account, address referrer) external onlyAdminOrOwner {
        _require(account != address(0) && referrer != address(0));
        _require(!users[account].registered || users[account].referrer == address(0));
        _register(account, referrer);
    }

    function setAdmin(address admin, bool enabled) external onlyAdminOrOwner {
        _require(admin != address(0));
        admins[admin] = enabled;
        emit AdminUpdated(admin, enabled);
    }

    function setManager(address manager, bool enabled) external onlyAdminOrOwner {
        _require(manager != address(0));
        managers[manager] = enabled;
        emit ManagerUpdated(manager, enabled);
    }

    function setTaxRecorder(address recorder, bool enabled) external onlyManagerOrAbove {
        _require(recorder != address(0));
        taxRecorders[recorder] = enabled;
    }

    function setKeeper(address keeper, bool enabled) external onlyManagerOrAbove {
        _require(keeper != address(0));
        keepers[keeper] = enabled;
        emit KeeperUpdated(keeper, enabled);
    }

    function setAmmPair(address pair, bool enabled) external onlyManagerOrAbove {
        _require(pair != address(0));
        ammPairs[pair] = enabled;
        emit AmmPairUpdated(pair, enabled);
    }

    function keeperUpdateGlobalLpValue(uint256 newValue) external onlyKeeperOrAbove {
        uint256 oldValue = globalLpValueUsdt;
        globalLpValueUsdt = newValue;
        emit GlobalLpValueUpdated(oldValue, newValue);
    }

    function keeperUpdateKntPrices(uint256 priceNowUsdt_, uint256 price24hAgoUsdt_) external onlyKeeperOrAbove {
        _require(priceNowUsdt_ > 0);
        latestKntPriceUsdt = priceNowUsdt_;
        price24hAgoUsdt = price24hAgoUsdt_;
        latestPriceUpdatedAt = block.timestamp;
        emit KntPriceUpdated(priceNowUsdt_, price24hAgoUsdt_);
    }

    function setWallets(address foundationWallet_, address dexSettlementWallet_) external onlyAdminOrOwner {
        _require(foundationWallet_ != address(0) && dexSettlementWallet_ != address(0));
        foundationWallet = foundationWallet_;
        dexSettlementWallet = dexSettlementWallet_;
    }

    function setProjectSinkWallet(address projectSinkWallet_) external onlyAdminOrOwner {
        _require(projectSinkWallet_ != address(0));
        projectSinkWallet = projectSinkWallet_;
    }

    function setEcosystemWallet(address ecosystemWallet_) external onlyAdminOrOwner {
        _require(ecosystemWallet_ != address(0));
        ecosystemWallet = ecosystemWallet_;
    }

    function setLiquidityConfig(address pancakeRouter_, address usdtToken_, address labubuToken_, address labubuKntPair_) external onlyManagerOrAbove {
        _require(pancakeRouter_ != address(0) && usdtToken_ != address(0) && labubuToken_ != address(0));
        _require(
            labubuSwapIntermediateToken == address(0) || (labubuSwapIntermediateToken != usdtToken_ && labubuSwapIntermediateToken != labubuToken_));
        pancakeRouter = pancakeRouter_;
        usdtToken = usdtToken_;
        labubuToken = labubuToken_;
        labubuKntPair = labubuKntPair_;
        if (labubuKntPair_ != address(0)) {
            ammPairs[labubuKntPair_] = true;
            emit AmmPairUpdated(labubuKntPair_, true);
        }
        emit LiquidityConfigUpdated(pancakeRouter_, usdtToken_, labubuToken_, labubuKntPair_);
    }

    function setLabubuSwapIntermediateToken(address intermediateToken_) external onlyManagerOrAbove {
        _require(intermediateToken_ == address(0) || (intermediateToken_ != usdtToken && intermediateToken_ != labubuToken));
        labubuSwapIntermediateToken = intermediateToken_;
    }

    function setBurnQueueRewardBP(uint256 rewardBP) external onlyManagerOrAbove {
        _require(rewardBP >= BASIS_POINTS && rewardBP <= 30_000);
        burnQueueRewardBP = rewardBP;
    }

    function setReferralSignalAmount(uint256 amount) external onlyManagerOrAbove {
        referralSignalAmount = amount;
    }

    function setRewardPeriodSeconds(uint256 periodSeconds) external onlyManagerOrAbove {
        _require(periodSeconds >= 10 minutes && periodSeconds <= 1 days);
        _updatePool();
        uint256 oldPeriodSeconds = rewardPeriodSeconds;
        rewardPeriodSeconds = periodSeconds;
        emit RewardPeriodUpdated(oldPeriodSeconds, periodSeconds);
    }

    function _isAdminOrOwner(address account) internal view returns (bool) {
        return account == owner() || admins[account];
    }

    function _isManagerOrAbove(address account) internal view returns (bool) {
        return _isAdminOrOwner(account) || managers[account];
    }

    function _isKeeperOrAbove(address account) internal view returns (bool) {
        return _isManagerOrAbove(account) || keepers[account];
    }

    function _depositImported(address account, uint256 amount, uint256 lpValueUsdt, address referrer) internal {
        _require(account != address(0) && amount > 0 && lpValueUsdt > 0);
        if (!users[account].registered) _register(account, referrer);
        _settleAccount(account);
        _applyDeposit(account, amount, lpValueUsdt);
    }

    function _processUsdtDeposit(
        address account,
        uint256 amount,
        uint256 minKntBought,
        uint256 minLabubuBought,
        uint256 minKntToLp,
        uint256 minLabubuToLp,
        uint256 minLpAmount,
        uint256 deadline
    ) internal returns (uint256 liquidity) {
        _require(
            pancakeRouter != address(0) && usdtToken != address(0) && labubuToken != address(0) && labubuKntPair != address(0));
        _require(deadline >= block.timestamp);

        _updatePool();
        if (!users[account].registered) _register(account, address(0));
        _settleAccount(account);

        IERC20(usdtToken).forceApprove(pancakeRouter, amount);

        address intermediateToken = labubuSwapIntermediateToken;
        address[] memory labubuPath = new address[](intermediateToken == address(0) ? 2 : 3);
        labubuPath[0] = usdtToken;
        if (intermediateToken == address(0)) {
            labubuPath[1] = labubuToken;
        } else {
            labubuPath[1] = intermediateToken;
            labubuPath[2] = labubuToken;
        }
        uint256[] memory labubuAmounts = IPancakeV2Router(pancakeRouter).swapExactTokensForTokens(
            amount,
            minLabubuBought,
            labubuPath,
            address(this),
            deadline
        );

        uint256 labubuBought = labubuAmounts[labubuAmounts.length - 1];
        uint256 labubuToKnt = labubuBought / 2;
        uint256 labubuToLp = labubuBought - labubuToKnt;
        _require(labubuToKnt > 0 && labubuToLp > 0);

        IERC20(labubuToken).forceApprove(pancakeRouter, labubuToKnt);

        address[] memory kntPath = new address[](2);
        kntPath[0] = labubuToken;
        kntPath[1] = address(this);
        uint256[] memory kntAmounts = IPancakeV2Router(pancakeRouter).swapExactTokensForTokens(
            labubuToKnt,
            minKntBought,
            kntPath,
            dexSettlementWallet,
            deadline
        );

        uint256 kntBought = kntAmounts[kntAmounts.length - 1];
        IERC20(address(this)).safeTransferFrom(dexSettlementWallet, address(this), kntBought);

        IERC20(address(this)).forceApprove(pancakeRouter, kntBought);
        IERC20(labubuToken).forceApprove(pancakeRouter, labubuToLp);

        uint256 kntUsed;
        uint256 labubuUsed;
        systemTransfer = true;
        (kntUsed, labubuUsed, liquidity) = IPancakeV2Router(pancakeRouter).addLiquidity(
            address(this),
            labubuToken,
            kntBought,
            labubuToLp,
            minKntToLp,
            minLabubuToLp,
            account,
            deadline
        );
        systemTransfer = false;
        _require(liquidity >= minLpAmount);

        uint256 kntRefund = kntBought - kntUsed;
        uint256 labubuRefund = labubuToLp - labubuUsed;
        if (kntRefund > 0) {
            _burn(address(this), kntRefund);
            emit LiquidityKntBurned(account, kntRefund);
        }
        if (labubuRefund > 0) {
            IERC20(labubuToken).safeTransfer(account, labubuRefund);
        }

        _applyDeposit(account, liquidity, amount);
        emit UserLpCredited(account, liquidity, amount);
        emit UsdtDeposited(account, amount, kntUsed, labubuUsed, liquidity, amount);
    }

    function _applyDeposit(address account, uint256 amount, uint256 lpValueUsdt) internal {
        UserInfo storage user = users[account];
        bool wasEffective = user.lpValueUsdt >= EFFECTIVE_DIRECT_LP_USDT;
        uint256 addedPower = lpValueUsdt * POWER_PER_USDT;

        user.depositAmount += amount;
        user.lpValueUsdt += lpValueUsdt;
        user.power += addedPower;
        if (user.lastPowerUpdateDay == 0) user.lastPowerUpdateDay = currentDay();

        reservedDeposits += amount;
        totalLpValueUsdt += lpValueUsdt;
        totalPower += addedPower;

        _updateDirectPerformance(user.referrer, lpValueUsdt, wasEffective, user.lpValueUsdt, true);
        _refreshNodeStatus(account);
        _syncRewardDebt(account);
        emit Deposited(account, amount, lpValueUsdt, addedPower);
    }

    function _removeDeposit(address account, uint256 amount, uint256 lpValueUsdt) internal {
        UserInfo storage user = users[account];
        _require(user.depositAmount >= amount && user.lpValueUsdt >= lpValueUsdt);

        bool wasEffective = user.lpValueUsdt >= EFFECTIVE_DIRECT_LP_USDT;
        uint256 removedPower = lpValueUsdt == user.lpValueUsdt ? user.power : (user.power * lpValueUsdt) / user.lpValueUsdt;

        user.depositAmount -= amount;
        user.lpValueUsdt -= lpValueUsdt;
        user.power -= removedPower;
        reservedDeposits -= amount;
        totalLpValueUsdt -= lpValueUsdt;
        totalPower -= removedPower;

        _updateDirectPerformance(user.referrer, lpValueUsdt, wasEffective, user.lpValueUsdt, false);
        _refreshNodeStatus(account);
        _syncRewardDebt(account);
    }

    function _useKeeperAction(address account, bytes32 sourceTxHash, uint256 sourceLogIndex, bytes32 actionType) internal returns (bytes32 actionId) {
        _require(sourceTxHash != bytes32(0));
        actionId = keccak256(abi.encode(actionType, sourceTxHash, sourceLogIndex, account));
        _require(!processedKeeperActions[actionId]);
        processedKeeperActions[actionId] = true;
    }

    function _handleReferralSignal(address from, address to, uint256 amount) internal {
        if (!referralSignals[from][to]) {
            referralSignals[from][to] = true;
            emit ReferralSignal(from, to, amount);
        }

        if (referralSignals[to][from] && !users[from].registered) {
            _register(from, to);
        } else if (referralSignals[to][from] && users[from].referrer == address(0)) {
            _bindReferrer(from, to);
        }
    }

    function _register(address account, address referrer) internal {
        _require(!users[account].registered);
        if (referrer == address(0) && account != owner()) referrer = owner();
        users[account].registered = true;
        users[account].lastPowerUpdateDay = currentDay();
        if (referrer != address(0)) _bindReferrer(account, referrer);
    }

    function _bindReferrer(address account, address referrer) internal {
        _require(account != referrer);
        _require(users[account].referrer == address(0));
        _require(!_wouldCreateReferralCycle(account, referrer));
        users[account].referrer = referrer;
        directReferrals[referrer].push(account);
        emit ReferrerBound(account, referrer);
    }

    function _wouldCreateReferralCycle(address account, address referrer) internal view returns (bool) {
        address current = referrer;
        for (uint256 depth = 0; current != address(0) && depth < 64; depth++) {
            if (current == account) return true;
            current = users[current].referrer;
        }
        return false;
    }

    function _updatePool() internal {
        uint256 dayNow = currentDay();
        if (dayNow <= lastRewardDay) return;
        for (uint256 d = lastRewardDay; d < dayNow; d++) {
            uint256 emission = dailyEmissionForDay(d);
            if (emission > rewardPool) emission = rewardPool;
            if (emission == 0) {
                lastRewardDay = d + 1;
                continue;
            }
            rewardPool -= emission;
            uint256 staticAmount = (emission * STATIC_SHARE_BP) / BASIS_POINTS;
            uint256 dynamicAmount = (emission * DYNAMIC_SHARE_BP) / BASIS_POINTS;
            uint256 nodeAmount = emission - staticAmount - dynamicAmount;

            if (totalPower > 0) accStaticRewardPerPower += (staticAmount * 1e18) / totalPower;
            dynamicPool += dynamicAmount;
            if (nodeList.length > 0) accNodeRewardPerNode += nodeAmount / nodeList.length;
            emit PoolUpdated(d, emission, staticAmount, dynamicAmount, nodeAmount);
        }
        lastRewardDay = dayNow;
    }

    function _settleAccount(address account) internal {
        UserInfo storage user = users[account];
        if (!user.registered) return;
        _touchPower(account);

        if (user.power > 0) {
            uint256 accumulated = (user.power * accStaticRewardPerPower) / 1e18;
            uint256 staticPending = accumulated - user.rewardDebt;
            if (staticPending > 0) {
                user.pendingKnt += staticPending;
                user.totalStaticReward += staticPending;
                emit StaticRewardAccrued(account, staticPending);
                _distributeDynamic(account, staticPending);
            }
        }

        if (user.isNode) {
            uint256 nodePending = accNodeRewardPerNode - user.nodeRewardDebt;
            if (nodePending > 0) {
                user.pendingKnt += nodePending;
                user.totalNodeReward += nodePending;
            }
        }
        _syncRewardDebt(account);
    }

    function _distributePendingLineage(address account) internal {
        address current = account;
        for (uint256 level = 0; current != address(0) && level <= MAX_DYNAMIC_LEVEL; level++) {
            _distributePendingReward(current);
            current = users[current].referrer;
        }
        _distributePendingReward(projectSinkWallet);
    }

    function _distributePendingReward(address account) internal returns (uint256 amount) {
        amount = users[account].pendingKnt;
        if (amount == 0 || _freeBalance() < amount) return 0;

        users[account].pendingKnt = 0;
        totalKntDistributed += amount;
        systemTransfer = true;
        _transfer(address(this), account, amount);
        systemTransfer = false;
        emit RewardDistributed(account, msg.sender, amount);
    }

    function _touchPower(address account) internal {
        UserInfo storage user = users[account];
        if (user.power == 0) {
            user.lastPowerUpdateDay = currentDay();
            return;
        }
        uint256 dayNow = currentDay();
        if (dayNow <= user.lastPowerUpdateDay) return;
        uint256 updatedPower = user.power;
        for (uint256 d = user.lastPowerUpdateDay; d < dayNow; d++) {
            updatedPower += (updatedPower * POWER_COMPOUND_BP_PER_DAY) / BASIS_POINTS;
        }
        if (updatedPower > user.power) {
            totalPower += updatedPower - user.power;
            user.power = updatedPower;
        }
        user.lastPowerUpdateDay = dayNow;
    }

    function _syncRewardDebt(address account) internal {
        UserInfo storage user = users[account];
        user.rewardDebt = (user.power * accStaticRewardPerPower) / 1e18;
        user.nodeRewardDebt = user.isNode ? accNodeRewardPerNode : 0;
    }

    function _distributeDynamic(address source, uint256 staticReward) internal {
        address current = users[source].referrer;
        uint256 sunkAmount;
        for (uint256 level = 1; level <= MAX_DYNAMIC_LEVEL; level++) {
            uint256 reward = (staticReward * _dynamicRateBP(level)) / BASIS_POINTS;
            if (reward > dynamicPool) reward = dynamicPool;
            if (reward == 0) break;

            if (current != address(0) && level <= _maxRewardLevel(current)) {
                users[current].pendingKnt += reward;
                users[current].totalDynamicReward += reward;
                emit DynamicRewardAccrued(source, current, level, reward);
            } else {
                sunkAmount += reward;
            }
            dynamicPool -= reward;
            current = current == address(0) ? address(0) : users[current].referrer;
        }

        if (sunkAmount > 0) {
            sunkDynamicPool += sunkAmount;
            users[projectSinkWallet].pendingKnt += sunkAmount;
            users[projectSinkWallet].totalDynamicReward += sunkAmount;
            emit DynamicSunk(source, sunkAmount);
        }
    }

    function _dynamicRateBP(uint256 level) internal pure returns (uint256) {
        if (level == 1) return DIRECT_LEVEL_ONE_BP;
        if (level <= 10) return DYNAMIC_LEVEL_2_TO_10_BP;
        return DYNAMIC_LEVEL_11_TO_15_BP;
    }

    function _maxRewardLevel(address account) internal view returns (uint256) {
        uint256 directCount = users[account].directEffectiveCount;
        uint256 maxLevel = directCount * 2;
        if (directCount >= 8) maxLevel = MAX_DYNAMIC_LEVEL;
        if (maxLevel > MAX_DYNAMIC_LEVEL) maxLevel = MAX_DYNAMIC_LEVEL;
        return maxLevel;
    }

    function _updateDirectPerformance(address referrer, uint256 lpValueDelta, bool wasEffective, uint256 newSelfLpValue, bool increase) internal {
        if (referrer == address(0)) return;
        _settleAccount(referrer);
        UserInfo storage parent = users[referrer];
        if (increase) {
            parent.directLpValueUsdt += lpValueDelta;
            if (!wasEffective && newSelfLpValue >= EFFECTIVE_DIRECT_LP_USDT) parent.directEffectiveCount += 1;
        } else {
            parent.directLpValueUsdt = parent.directLpValueUsdt > lpValueDelta ? parent.directLpValueUsdt - lpValueDelta : 0;
            if (wasEffective && newSelfLpValue < EFFECTIVE_DIRECT_LP_USDT && parent.directEffectiveCount > 0) {
                parent.directEffectiveCount -= 1;
            }
        }
        _refreshNodeStatus(referrer);
        _syncRewardDebt(referrer);
    }

    function _refreshNodeStatus(address account) internal {
        UserInfo storage user = users[account];
        bool qualifies = user.lpValueUsdt >= NODE_SELF_LP_USDT
            && user.directLpValueUsdt >= NODE_DIRECT_LP_USDT
            && user.directEffectiveCount > 0;
        if (qualifies == user.isNode) return;

        if (qualifies) {
            user.isNode = true;
            nodeList.push(account);
            nodeIndexPlusOne[account] = nodeList.length;
            user.nodeRewardDebt = accNodeRewardPerNode;
        } else {
            user.isNode = false;
            uint256 indexPlusOne = nodeIndexPlusOne[account];
            if (indexPlusOne > 0) {
                uint256 index = indexPlusOne - 1;
                uint256 lastIndex = nodeList.length - 1;
                if (index != lastIndex) {
                    address moved = nodeList[lastIndex];
                    nodeList[index] = moved;
                    nodeIndexPlusOne[moved] = index + 1;
                }
                nodeList.pop();
                delete nodeIndexPlusOne[account];
            }
            user.nodeRewardDebt = 0;
        }
        emit NodeStatusUpdated(account, qualifies);
    }

    function _burnAndQueue(address account, uint256 amount) internal {
        _require(amount > 0);
        _burn(account, amount);
        _createBurnQueueEntry(account, amount);
    }

    function _createBurnQueueEntry(address account, uint256 amount) internal {
        uint256 rewardAmount = (amount * burnQueueRewardBP) / BASIS_POINTS;
        burnQueue.push(QueueEntry({
            account: account,
            burnedAmount: amount,
            rewardAmount: rewardAmount,
            paid: false
        }));
        emit BurnQueued(account, burnQueue.length - 1, amount, rewardAmount);
    }

    function _recordBuyByPrice(address account, uint256 kntAmount) internal {
        if (latestKntPriceUsdt == 0 || account == address(0)) return;
        uint256 usdtSpent = (kntAmount * latestKntPriceUsdt) / 1e18;
        costBasisOf[account].boughtKnt += kntAmount;
        costBasisOf[account].spentUsdt += usdtSpent;
        emit BuyRecorded(account, kntAmount, usdtSpent);
    }

    function _settleAmmSell(address account, address pair, uint256 amount) internal {
        uint256 currentValueUsdt = latestKntPriceUsdt == 0 ? 0 : (amount * latestKntPriceUsdt) / 1e18;
        uint256 sellTax = (amount * SELL_TAX_BP) / BASIS_POINTS;
        uint256 profitTax = currentValueUsdt == 0 ? 0 : _profitTax(account, amount, currentValueUsdt);
        uint256 dumpTax = _dumpTax(amount, latestKntPriceUsdt, price24hAgoUsdt);
        uint256 totalTax = sellTax + profitTax + dumpTax;
        _require(totalTax <= amount);

        uint256 netAmount = amount - totalTax;
        if (totalTax > 0) {
            _rawUpdate(account, address(this), totalTax);
        }
        _distributeSellTax(sellTax);
        _distributeProfitTax(profitTax);
        _distributeDumpTax(dumpTax);
        if (netAmount > 0) {
            _rawUpdate(account, pair, netAmount);
        }
        if (currentValueUsdt > 0) {
            _consumeCostBasis(account, amount);
        }
        emit SellSettled(account, amount, netAmount, sellTax, profitTax, dumpTax);
    }

    function _profitTax(address account, uint256 amount, uint256 currentValueUsdt) internal view returns (uint256) {
        CostBasis storage basis = costBasisOf[account];
        if (basis.boughtKnt == 0 || basis.spentUsdt == 0) return 0;
        uint256 proportionalCost = (basis.spentUsdt * amount) / basis.boughtKnt;
        if (currentValueUsdt <= proportionalCost) return 0;
        uint256 profitUsdt = currentValueUsdt - proportionalCost;
        uint256 profitTaxUsdt = (profitUsdt * PROFIT_TAX_BP) / BASIS_POINTS;
        return (amount * profitTaxUsdt) / currentValueUsdt;
    }

    function _dumpTax(uint256 amount, uint256 priceNowUsdt_, uint256 price24hAgoUsdt_) internal pure returns (uint256) {
        if (priceNowUsdt_ == 0 || price24hAgoUsdt_ == 0 || priceNowUsdt_ >= price24hAgoUsdt_) return 0;
        return (amount * (price24hAgoUsdt_ - priceNowUsdt_)) / price24hAgoUsdt_;
    }

    function _distributeSellTax(uint256 amount) internal {
        if (amount == 0) return;
        uint256 toQueue = (amount * SELL_TAX_QUEUE_BP) / SELL_TAX_BP;
        uint256 toFoundation = amount - toQueue;
        rewardPool += toQueue;
        if (toFoundation > 0) {
            _swapFoundationTaxToLabubu(toFoundation);
        }
    }

    function _swapFoundationTaxToLabubu(uint256 kntAmount) internal {
        _require(pancakeRouter != address(0) && labubuToken != address(0));
        IERC20(address(this)).forceApprove(pancakeRouter, kntAmount);

        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = labubuToken;

        systemTransfer = true;
        uint256[] memory amounts = IPancakeV2Router(pancakeRouter).swapExactTokensForTokens(
            kntAmount,
            0,
            path,
            foundationWallet,
            block.timestamp
        );
        systemTransfer = false;

        emit FoundationTaxConverted(foundationWallet, kntAmount, amounts[amounts.length - 1]);
    }

    function _distributeProfitTax(uint256 amount) internal {
        if (amount == 0) return;
        uint256 toQueue = (amount * PROFIT_TAX_QUEUE_BP) / PROFIT_TAX_BP;
        uint256 toBurn = (amount * PROFIT_TAX_BURN_BP) / PROFIT_TAX_BP;
        uint256 toEcosystem = amount - toQueue - toBurn;
        rewardPool += toQueue;
        if (toBurn > 0) _burn(address(this), toBurn);
        if (toEcosystem > 0) {
            systemTransfer = true;
            _transfer(address(this), ecosystemWallet, toEcosystem);
            systemTransfer = false;
        }
    }

    function _distributeDumpTax(uint256 amount) internal {
        if (amount == 0) return;
        uint256 toBurn = amount / 2;
        uint256 toQueue = amount - toBurn;
        rewardPool += toQueue;
        if (toBurn > 0) _burn(address(this), toBurn);
    }

    function _consumeCostBasis(address account, uint256 amount) internal {
        CostBasis storage basis = costBasisOf[account];
        if (basis.boughtKnt == 0) return;
        if (amount >= basis.boughtKnt) {
            basis.boughtKnt = 0;
            basis.spentUsdt = 0;
            return;
        }

        uint256 proportionalCost = (basis.spentUsdt * amount) / basis.boughtKnt;
        basis.boughtKnt -= amount;
        basis.spentUsdt = basis.spentUsdt > proportionalCost ? basis.spentUsdt - proportionalCost : 0;
    }

    function _transfer(address from, address to, uint256 value) internal {
        _require(from != address(0) && to != address(0));
        _update(from, to, value);
    }

    function _mint(address account, uint256 value) internal {
        _require(account != address(0));
        _update(address(0), account, value);
    }

    function _burn(address account, uint256 value) internal {
        _require(account != address(0));
        _update(account, address(0), value);
    }

    function _rawUpdate(address from, address to, uint256 value) internal {
        if (from == address(0)) {
            tokenTotalSupply += value;
        } else {
            uint256 fromBalance = tokenBalances[from];
            _require(fromBalance >= value);
            unchecked {
                tokenBalances[from] = fromBalance - value;
            }
        }

        if (to == address(0)) {
            tokenTotalSupply -= value;
        } else {
            tokenBalances[to] += value;
        }

        emit Transfer(from, to, value);
    }

    function _spendAllowance(address owner_, address spender, uint256 value) internal {
        uint256 currentAllowance = tokenAllowances[owner_][spender];
        if (currentAllowance != type(uint256).max) {
            _require(currentAllowance >= value);
            unchecked {
                tokenAllowances[owner_][spender] = currentAllowance - value;
            }
            emit Approval(owner_, spender, tokenAllowances[owner_][spender]);
        }
    }

    function _freeBalance() internal view returns (uint256) {
        return balanceOf(address(this));
    }
}
