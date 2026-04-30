// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract KNTAllInOne is ERC20, ERC20Burnable, Ownable, ReentrancyGuard {
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
    uint256 public constant DUMP_DROP_10_BP = 1_000;
    uint256 public constant DUMP_DROP_20_BP = 2_000;
    uint256 public constant DUMP_TAX_10_BP = 1_000;
    uint256 public constant DUMP_TAX_20_BP = 2_000;
    uint256 public constant MIGRATION_RELEASE_BP = 10;
    uint256 public constant MIGRATION_BOOST_RELEASE_BP = 30;

    address public foundationWallet;
    address public dexSettlementWallet;
    address public burnAddress = address(0xdead);
    uint256 public burnQueueRewardBP = 12_000;

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
    mapping(address => mapping(address => bool)) public zeroTransferSignals;
    mapping(address => CostBasis) public costBasisOf;
    mapping(address => bool) public taxRecorders;
    address[] private nodeList;
    mapping(address => uint256) private nodeIndexPlusOne;

    QueueEntry[] public burnQueue;
    uint256 public nextPayoutIndex;
    uint256 public nextMigrationId = 1;
    mapping(uint256 => MigrationPosition) public migrationPositions;

    event ReferralSignal(address indexed referrer, address indexed referee);
    event ReferrerBound(address indexed user, address indexed referrer);
    event Deposited(address indexed user, uint256 amount, uint256 lpValueUsdt, uint256 addedPower);
    event Withdrawn(address indexed user, uint256 amount, uint256 lpValueUsdt);
    event RewardsFunded(address indexed from, uint256 amount);
    event PoolUpdated(uint256 indexed dayKey, uint256 emission, uint256 staticAmount, uint256 dynamicAmount, uint256 nodeAmount);
    event RewardClaimed(address indexed user, uint256 amount);
    event NodeStatusUpdated(address indexed user, bool isNode);
    event BurnQueued(address indexed user, uint256 indexed index, uint256 burnedAmount, uint256 rewardAmount);
    event QueuePaid(address indexed user, uint256 indexed index, uint256 rewardAmount);
    event BuyRecorded(address indexed account, uint256 kntAmount, uint256 usdtSpent);
    event SellSettled(address indexed account, uint256 grossAmount, uint256 netAmount, uint256 sellTax, uint256 profitTax, uint256 dumpTax);
    event MigrationMinted(address indexed account, uint256 indexed id, uint256 amount);
    event MigrationClaimed(address indexed account, uint256 indexed id, uint256 amount);

    constructor(address initialOwner, address foundationWallet_, address dexSettlementWallet_)
        ERC20("Knight Token", "KNT")
        Ownable(initialOwner)
    {
        require(foundationWallet_ != address(0) && dexSettlementWallet_ != address(0), "Zero wallet");
        foundationWallet = foundationWallet_;
        dexSettlementWallet = dexSettlementWallet_;
        startTimestamp = block.timestamp;
        _mint(initialOwner, TOTAL_SUPPLY);
        taxRecorders[initialOwner] = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (value == 0 && from != address(0) && to != address(0) && from != to) {
            _handleZeroTransferReferral(from, to);
        }

        super._update(from, to, value);

        if (to == address(0) && from != address(0)) {
            totalBurned += value;
        }

        if (!systemTransfer && value > 0 && from != address(0)) {
            if (to == address(this)) {
                _depositAfterTransfer(from, value, value);
            } else if (to == burnAddress) {
                totalBurned += value;
                _queueBurnAfterTransfer(from, value);
            }
        }
    }

    function referrerOf(address account) external view returns (address) {
        return users[account].referrer;
    }

    function directReferralsOf(address account) external view returns (address[] memory) {
        return directReferrals[account];
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
        return (block.timestamp - startTimestamp) / 1 days;
    }

    function dailyEmissionForDay(uint256 dayKey) public view returns (uint256) {
        uint256 steps = totalLpValueUsdt / LP_PER_EMISSION_STEP_USDT;
        uint256 emission = BASE_DAILY_EMISSION + (steps * EMISSION_STEP_PER_10K_LP);
        if (emission > MAX_DAILY_EMISSION) emission = MAX_DAILY_EMISSION;

        uint256 rounds = (dayKey * 1 days) / REDUCTION_PERIOD;
        if (rounds > MAX_REDUCTION_ROUNDS) rounds = MAX_REDUCTION_ROUNDS;
        for (uint256 i = 0; i < rounds; i++) {
            emission = (emission * (BASIS_POINTS - REDUCTION_BP)) / BASIS_POINTS;
        }
        return emission;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        return super.transfer(to, value);
    }

    function withdrawDeposit(uint256 amount, uint256 lpValueUsdt) external nonReentrant {
        require(amount > 0 && lpValueUsdt > 0, "Zero amount");
        _updatePool();
        _settleAccount(msg.sender);

        UserInfo storage user = users[msg.sender];
        require(user.depositAmount >= amount && user.lpValueUsdt >= lpValueUsdt, "Insufficient deposit");

        bool wasEffective = user.lpValueUsdt >= EFFECTIVE_DIRECT_LP_USDT;
        uint256 removedPower = (user.power * lpValueUsdt) / user.lpValueUsdt;

        user.depositAmount -= amount;
        user.lpValueUsdt -= lpValueUsdt;
        user.power -= removedPower;
        reservedDeposits -= amount;
        totalLpValueUsdt -= lpValueUsdt;
        totalPower -= removedPower;

        _updateDirectPerformance(user.referrer, lpValueUsdt, wasEffective, user.lpValueUsdt, false);
        _refreshNodeStatus(msg.sender);
        _syncRewardDebt(msg.sender);

        systemTransfer = true;
        _transfer(address(this), msg.sender, amount);
        systemTransfer = false;

        emit Withdrawn(msg.sender, amount, lpValueUsdt);
    }

    function fundRewardPool(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero amount");
        systemTransfer = true;
        _transfer(msg.sender, address(this), amount);
        systemTransfer = false;
        rewardPool += amount;
        emit RewardsFunded(msg.sender, amount);
    }

    function adminUpdatePool() external onlyOwner {
        _updatePool();
    }

    function claim() external nonReentrant {
        _updatePool();
        _settleAccount(msg.sender);

        uint256 amount = users[msg.sender].pendingKnt;
        require(amount > 0, "No reward");
        require(_freeBalance() >= amount, "Insufficient pool");

        users[msg.sender].pendingKnt = 0;
        totalKntDistributed += amount;

        systemTransfer = true;
        _transfer(address(this), msg.sender, amount);
        systemTransfer = false;

        emit RewardClaimed(msg.sender, amount);
    }

    function burnAndQueue(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero amount");
        systemTransfer = true;
        _transfer(msg.sender, address(this), amount);
        _burn(address(this), amount);
        systemTransfer = false;
        _createBurnQueueEntry(msg.sender, amount);
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
        require(taxRecorders[msg.sender] || msg.sender == owner(), "Not recorder");
        require(account != address(0) && kntAmount > 0 && usdtSpent > 0, "Invalid buy");
        costBasisOf[account].boughtKnt += kntAmount;
        costBasisOf[account].spentUsdt += usdtSpent;
        emit BuyRecorded(account, kntAmount, usdtSpent);
    }

    function settleSell(uint256 amount, uint256 currentValueUsdt, uint256 priceNowUsdt, uint256 price24hAgoUsdt)
        external
        nonReentrant
        returns (uint256 netAmount)
    {
        require(amount > 0 && currentValueUsdt > 0, "Zero amount");
        systemTransfer = true;
        _transfer(msg.sender, address(this), amount);
        systemTransfer = false;

        uint256 sellTax = (amount * SELL_TAX_BP) / BASIS_POINTS;
        uint256 profitTax = _profitTax(msg.sender, amount, currentValueUsdt);
        uint256 dumpTax = _dumpTax(amount, priceNowUsdt, price24hAgoUsdt);
        uint256 totalTax = sellTax + profitTax + dumpTax;
        require(totalTax <= amount, "Tax exceeds amount");

        _distributeSellTax(sellTax);
        _distributeProfitTax(profitTax);
        _distributeDumpTax(dumpTax);

        netAmount = amount - totalTax;
        if (netAmount > 0) {
            systemTransfer = true;
            _transfer(address(this), dexSettlementWallet, netAmount);
            systemTransfer = false;
        }
        _consumeCostBasis(msg.sender, amount, currentValueUsdt);
        emit SellSettled(msg.sender, amount, netAmount, sellTax, profitTax, dumpTax);
    }

    function mintMigration(address account, uint256 amount) external onlyOwner returns (uint256 id) {
        require(account != address(0) && amount > 0, "Invalid migration");
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
        require(position.owner == msg.sender, "Not owner");
        uint256 amount = migrationClaimable(id);
        require(amount > 0, "Nothing claimable");
        require(_freeBalance() >= amount, "Insufficient pool");

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
        onlyOwner
    {
        require(accounts.length == amounts.length && accounts.length == lpValuesUsdt.length && accounts.length == referrers.length, "Length mismatch");
        _updatePool();
        for (uint256 i = 0; i < accounts.length; i++) {
            _depositImported(accounts[i], amounts[i], lpValuesUsdt[i], referrers[i]);
        }
    }

    function adminSetReferrer(address account, address referrer) external onlyOwner {
        require(account != address(0) && referrer != address(0), "Zero address");
        require(!users[account].registered || users[account].referrer == address(0), "Already bound");
        _register(account, referrer);
    }

    function setTaxRecorder(address recorder, bool enabled) external onlyOwner {
        taxRecorders[recorder] = enabled;
    }

    function setWallets(address foundationWallet_, address dexSettlementWallet_) external onlyOwner {
        require(foundationWallet_ != address(0) && dexSettlementWallet_ != address(0), "Zero wallet");
        foundationWallet = foundationWallet_;
        dexSettlementWallet = dexSettlementWallet_;
    }

    function setBurnQueueRewardBP(uint256 rewardBP) external onlyOwner {
        require(rewardBP >= BASIS_POINTS && rewardBP <= 30_000, "Invalid reward");
        burnQueueRewardBP = rewardBP;
    }

    function _depositAfterTransfer(address account, uint256 amount, uint256 lpValueUsdt) internal {
        _updatePool();
        if (!users[account].registered) _register(account, address(0));
        _settleAccount(account);
        _applyDeposit(account, amount, lpValueUsdt);
    }

    function _depositImported(address account, uint256 amount, uint256 lpValueUsdt, address referrer) internal {
        require(account != address(0) && amount > 0 && lpValueUsdt > 0, "Invalid deposit");
        if (!users[account].registered) _register(account, referrer);
        _settleAccount(account);
        _applyDeposit(account, amount, lpValueUsdt);
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

    function _handleZeroTransferReferral(address from, address to) internal {
        if (!zeroTransferSignals[from][to]) {
            zeroTransferSignals[from][to] = true;
            emit ReferralSignal(from, to);
        }

        if (zeroTransferSignals[to][from] && !users[from].registered) {
            _register(from, to);
        } else if (zeroTransferSignals[to][from] && users[from].referrer == address(0)) {
            _bindReferrer(from, to);
        }
    }

    function _register(address account, address referrer) internal {
        require(!users[account].registered, "Already registered");
        if (referrer == address(0) && account != owner()) referrer = owner();
        users[account].registered = true;
        users[account].lastPowerUpdateDay = currentDay();
        if (referrer != address(0)) _bindReferrer(account, referrer);
    }

    function _bindReferrer(address account, address referrer) internal {
        require(account != referrer, "Self referrer");
        require(users[account].referrer == address(0), "Already bound");
        require(!_wouldCreateReferralCycle(account, referrer), "Referral cycle");
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
        for (uint256 level = 1; current != address(0) && level <= MAX_DYNAMIC_LEVEL; level++) {
            uint256 reward = (staticReward * _dynamicRateBP(level)) / BASIS_POINTS;
            if (reward > dynamicPool) reward = dynamicPool;
            if (reward == 0) break;

            if (level <= _maxRewardLevel(current)) {
                users[current].pendingKnt += reward;
                users[current].totalDynamicReward += reward;
            } else {
                sunkDynamicPool += reward;
            }
            dynamicPool -= reward;
            current = users[current].referrer;
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

    function _queueBurnAfterTransfer(address account, uint256 amount) internal {
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

    function _profitTax(address account, uint256 amount, uint256 currentValueUsdt) internal view returns (uint256) {
        CostBasis storage basis = costBasisOf[account];
        if (basis.boughtKnt == 0 || basis.spentUsdt == 0) return 0;
        uint256 proportionalCost = (basis.spentUsdt * amount) / basis.boughtKnt;
        if (currentValueUsdt <= proportionalCost) return 0;
        uint256 profitUsdt = currentValueUsdt - proportionalCost;
        uint256 profitTaxUsdt = (profitUsdt * PROFIT_TAX_BP) / BASIS_POINTS;
        return (amount * profitTaxUsdt) / currentValueUsdt;
    }

    function _dumpTax(uint256 amount, uint256 priceNowUsdt, uint256 price24hAgoUsdt) internal pure returns (uint256) {
        if (priceNowUsdt == 0 || price24hAgoUsdt == 0) return 0;
        if (priceNowUsdt * BASIS_POINTS <= price24hAgoUsdt * (BASIS_POINTS - DUMP_DROP_20_BP)) {
            return (amount * DUMP_TAX_20_BP) / BASIS_POINTS;
        }
        if (priceNowUsdt * BASIS_POINTS <= price24hAgoUsdt * (BASIS_POINTS - DUMP_DROP_10_BP)) {
            return (amount * DUMP_TAX_10_BP) / BASIS_POINTS;
        }
        return 0;
    }

    function _distributeSellTax(uint256 amount) internal {
        if (amount == 0) return;
        uint256 toQueue = (amount * SELL_TAX_QUEUE_BP) / SELL_TAX_BP;
        uint256 toFoundation = amount - toQueue;
        rewardPool += toQueue;
        if (toFoundation > 0) {
            systemTransfer = true;
            _transfer(address(this), foundationWallet, toFoundation);
            systemTransfer = false;
        }
    }

    function _distributeProfitTax(uint256 amount) internal {
        if (amount == 0) return;
        uint256 toQueue = (amount * PROFIT_TAX_QUEUE_BP) / PROFIT_TAX_BP;
        uint256 toBurn = (amount * PROFIT_TAX_BURN_BP) / PROFIT_TAX_BP;
        uint256 toFoundation = amount - toQueue - toBurn;
        rewardPool += toQueue;
        if (toBurn > 0) _burn(address(this), toBurn);
        if (toFoundation > 0) {
            systemTransfer = true;
            _transfer(address(this), foundationWallet, toFoundation);
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

    function _consumeCostBasis(address account, uint256 amount, uint256 currentValueUsdt) internal {
        CostBasis storage basis = costBasisOf[account];
        if (basis.boughtKnt == 0) return;
        basis.boughtKnt = basis.boughtKnt > amount ? basis.boughtKnt - amount : 0;
        basis.spentUsdt = basis.spentUsdt > currentValueUsdt ? basis.spentUsdt - currentValueUsdt : 0;
    }

    function _freeBalance() internal view returns (uint256) {
        uint256 balance = balanceOf(address(this));
        return balance > reservedDeposits ? balance - reservedDeposits : 0;
    }
}
