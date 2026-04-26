// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./KNTTokenomics.sol";

interface IKNTMiningToken is IERC20 {
    function burn(uint256 amount) external;
}

contract KNTLpMining is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeERC20 for IKNTMiningToken;

    struct UserInfo {
        bool registered;
        address referrer;
        uint256 lpAmount;
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

    IKNTMiningToken public immutable knt;
    IERC20 public immutable lpToken;

    uint256 public immutable startTimestamp;
    uint256 public lastRewardDay;

    uint256 public totalLpAmount;
    uint256 public totalLpValueUsdt;
    uint256 public totalPower;
    uint256 public dynamicPool;
    uint256 public totalKntDistributed;

    uint256 public accStaticRewardPerPower;
    uint256 public accNodeRewardPerNode;

    mapping(address => UserInfo) public users;
    mapping(address => address[]) private directReferrals;
    address[] private nodeList;
    mapping(address => uint256) private nodeIndexPlusOne;

    event Registered(address indexed user, address indexed referrer);
    event LpDeposited(address indexed user, uint256 lpAmount, uint256 lpValueUsdt, uint256 addedPower);
    event LpWithdrawn(address indexed user, uint256 lpAmount, uint256 lpValueUsdt, uint256 kntBurned);
    event RewardClaimed(address indexed user, uint256 amount);
    event RewardsFunded(address indexed from, uint256 amount);
    event NodeStatusUpdated(address indexed user, bool isNode);
    event PoolUpdated(uint256 indexed dayKey, uint256 emission, uint256 staticAmount, uint256 dynamicAmount, uint256 nodeAmount);

    constructor(address knt_, address lpToken_, address initialOwner) Ownable(initialOwner) {
        require(knt_ != address(0) && lpToken_ != address(0), "Zero address");
        knt = IKNTMiningToken(knt_);
        lpToken = IERC20(lpToken_);
        startTimestamp = block.timestamp;
    }

    function fundRewards(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero amount");
        knt.safeTransferFrom(msg.sender, address(this), amount);
        emit RewardsFunded(msg.sender, amount);
    }

    function register(address referrer) external {
        _register(msg.sender, referrer);
    }

    function depositLp(uint256 lpAmount, uint256 lpValueUsdt, address referrer) external nonReentrant {
        require(lpAmount > 0 && lpValueUsdt > 0, "Zero amount");
        _updatePool();
        if (!users[msg.sender].registered) {
            _register(msg.sender, referrer);
        }
        _settleAccount(msg.sender);

        UserInfo storage user = users[msg.sender];
        bool wasEffective = user.lpValueUsdt >= KNTTokenomics.EFFECTIVE_DIRECT_LP_USDT;
        uint256 addedPower = lpValueUsdt * KNTTokenomics.POWER_PER_USDT;

        lpToken.safeTransferFrom(msg.sender, address(this), lpAmount);

        user.lpAmount += lpAmount;
        user.lpValueUsdt += lpValueUsdt;
        user.power += addedPower;
        if (user.lastPowerUpdateDay == 0) user.lastPowerUpdateDay = currentDay();

        totalLpAmount += lpAmount;
        totalLpValueUsdt += lpValueUsdt;
        totalPower += addedPower;

        _updateDirectPerformance(user.referrer, lpValueUsdt, wasEffective, user.lpValueUsdt, true);
        _refreshNodeStatus(msg.sender);
        _syncRewardDebt(msg.sender);

        emit LpDeposited(msg.sender, lpAmount, lpValueUsdt, addedPower);
    }

    function withdrawLp(uint256 lpAmount, uint256 lpValueUsdt, uint256 kntAmountToBurn) external nonReentrant {
        require(lpAmount > 0 && lpValueUsdt > 0, "Zero amount");
        _updatePool();
        _settleAccount(msg.sender);

        UserInfo storage user = users[msg.sender];
        require(user.lpAmount >= lpAmount && user.lpValueUsdt >= lpValueUsdt, "Insufficient LP");

        bool wasEffective = user.lpValueUsdt >= KNTTokenomics.EFFECTIVE_DIRECT_LP_USDT;
        uint256 removedPower = (user.power * lpValueUsdt) / user.lpValueUsdt;

        user.lpAmount -= lpAmount;
        user.lpValueUsdt -= lpValueUsdt;
        user.power -= removedPower;

        totalLpAmount -= lpAmount;
        totalLpValueUsdt -= lpValueUsdt;
        totalPower -= removedPower;

        lpToken.safeTransfer(msg.sender, lpAmount);

        if (kntAmountToBurn > 0) {
            knt.safeTransferFrom(msg.sender, address(this), kntAmountToBurn);
            knt.burn(kntAmountToBurn);
        }

        _updateDirectPerformance(user.referrer, lpValueUsdt, wasEffective, user.lpValueUsdt, false);
        _refreshNodeStatus(msg.sender);
        _syncRewardDebt(msg.sender);

        emit LpWithdrawn(msg.sender, lpAmount, lpValueUsdt, kntAmountToBurn);
    }

    function claim() external nonReentrant {
        _updatePool();
        _settleAccount(msg.sender);

        uint256 amount = users[msg.sender].pendingKnt;
        require(amount > 0, "No reward");
        users[msg.sender].pendingKnt = 0;
        totalKntDistributed += amount;
        knt.safeTransfer(msg.sender, amount);
        emit RewardClaimed(msg.sender, amount);
    }

    function currentDay() public view returns (uint256) {
        if (block.timestamp <= startTimestamp) return 0;
        return (block.timestamp - startTimestamp) / 1 days;
    }

    function currentDailyEmission() public view returns (uint256) {
        return dailyEmissionForDay(currentDay());
    }

    function dailyEmissionForDay(uint256 dayKey) public view returns (uint256) {
        uint256 steps = totalLpValueUsdt / KNTTokenomics.LP_PER_EMISSION_STEP_USDT;
        uint256 emission = KNTTokenomics.BASE_DAILY_EMISSION + (steps * KNTTokenomics.EMISSION_STEP_PER_10K_LP);
        if (emission > KNTTokenomics.MAX_DAILY_EMISSION) {
            emission = KNTTokenomics.MAX_DAILY_EMISSION;
        }

        uint256 rounds = (dayKey * 1 days) / KNTTokenomics.REDUCTION_PERIOD;
        if (rounds > KNTTokenomics.MAX_REDUCTION_ROUNDS) {
            rounds = KNTTokenomics.MAX_REDUCTION_ROUNDS;
        }
        for (uint256 i = 0; i < rounds; i++) {
            emission = (emission * (KNTTokenomics.BASIS_POINTS - KNTTokenomics.REDUCTION_BP)) / KNTTokenomics.BASIS_POINTS;
        }
        return emission;
    }

    function pendingReward(address account) external view returns (uint256) {
        UserInfo storage user = users[account];
        uint256 accStatic = accStaticRewardPerPower;
        uint256 accNode = accNodeRewardPerNode;
        uint256 activeNodeCount = nodeList.length;
        uint256 dayNow = currentDay();

        if (dayNow > lastRewardDay) {
            for (uint256 d = lastRewardDay; d < dayNow; d++) {
                uint256 emission = dailyEmissionForDay(d);
                if (totalPower > 0) {
                    accStatic += ((emission * KNTTokenomics.STATIC_SHARE_BP / KNTTokenomics.BASIS_POINTS) * 1e18) / totalPower;
                }
                if (activeNodeCount > 0) {
                    accNode += (emission * KNTTokenomics.NODE_SHARE_BP / KNTTokenomics.BASIS_POINTS) / activeNodeCount;
                }
            }
        }

        uint256 staticPending = user.power == 0 ? 0 : ((user.power * accStatic) / 1e18) - user.rewardDebt;
        uint256 nodePending = user.isNode ? accNode - user.nodeRewardDebt : 0;
        return user.pendingKnt + staticPending + nodePending;
    }

    function directReferralsOf(address account) external view returns (address[] memory) {
        return directReferrals[account];
    }

    function nodes() external view returns (address[] memory) {
        return nodeList;
    }

    function nodeCount() external view returns (uint256) {
        return nodeList.length;
    }

    function _register(address account, address referrer) internal {
        require(!users[account].registered, "Already registered");
        require(referrer != account, "Self referrer");

        if (referrer != address(0)) {
            require(users[referrer].registered || referrer == owner(), "Invalid referrer");
        } else if (account != owner()) {
            referrer = owner();
        }

        users[account].registered = true;
        users[account].referrer = referrer;
        users[account].lastPowerUpdateDay = currentDay();
        if (referrer != address(0)) {
            directReferrals[referrer].push(account);
        }
        emit Registered(account, referrer);
    }

    function _updatePool() internal {
        uint256 dayNow = currentDay();
        if (dayNow <= lastRewardDay) return;

        for (uint256 d = lastRewardDay; d < dayNow; d++) {
            uint256 emission = dailyEmissionForDay(d);
            uint256 staticAmount = (emission * KNTTokenomics.STATIC_SHARE_BP) / KNTTokenomics.BASIS_POINTS;
            uint256 dynamicAmount = (emission * KNTTokenomics.DYNAMIC_SHARE_BP) / KNTTokenomics.BASIS_POINTS;
            uint256 nodeAmount = emission - staticAmount - dynamicAmount;

            if (totalPower > 0) {
                accStaticRewardPerPower += (staticAmount * 1e18) / totalPower;
            }
            dynamicPool += dynamicAmount;
            if (nodeList.length > 0) {
                accNodeRewardPerNode += nodeAmount / nodeList.length;
            }

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
            updatedPower += (updatedPower * KNTTokenomics.POWER_COMPOUND_BP_PER_DAY) / KNTTokenomics.BASIS_POINTS;
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
        for (uint256 level = 1; current != address(0) && level <= KNTTokenomics.MAX_DYNAMIC_LEVEL; level++) {
            uint256 maxLevel = _maxRewardLevel(current);
            if (level <= maxLevel) {
                uint256 bp = _dynamicRateBP(level);
                uint256 reward = (staticReward * bp) / KNTTokenomics.BASIS_POINTS;
                if (reward > dynamicPool) reward = dynamicPool;
                if (reward > 0) {
                    users[current].pendingKnt += reward;
                    users[current].totalDynamicReward += reward;
                    dynamicPool -= reward;
                }
            }
            current = users[current].referrer;
        }
    }

    function _dynamicRateBP(uint256 level) internal pure returns (uint256) {
        if (level == 1) return KNTTokenomics.DIRECT_LEVEL_ONE_BP;
        if (level <= 10) return KNTTokenomics.DYNAMIC_LEVEL_2_TO_10_BP;
        return KNTTokenomics.DYNAMIC_LEVEL_11_TO_15_BP;
    }

    function _maxRewardLevel(address account) internal view returns (uint256) {
        uint256 directCount = directReferrals[account].length;
        uint256 maxLevel = directCount * 2;
        if (directCount >= 8) maxLevel = KNTTokenomics.MAX_DYNAMIC_LEVEL;
        if (maxLevel > KNTTokenomics.MAX_DYNAMIC_LEVEL) maxLevel = KNTTokenomics.MAX_DYNAMIC_LEVEL;
        return maxLevel;
    }

    function _updateDirectPerformance(
        address referrer,
        uint256 lpValueDelta,
        bool wasEffective,
        uint256 newSelfLpValue,
        bool increase
    ) internal {
        if (referrer == address(0)) return;

        _settleAccount(referrer);
        UserInfo storage parent = users[referrer];
        if (increase) {
            parent.directLpValueUsdt += lpValueDelta;
            if (!wasEffective && newSelfLpValue >= KNTTokenomics.EFFECTIVE_DIRECT_LP_USDT) {
                parent.directEffectiveCount += 1;
            }
        } else {
            parent.directLpValueUsdt = parent.directLpValueUsdt > lpValueDelta ? parent.directLpValueUsdt - lpValueDelta : 0;
            if (wasEffective && newSelfLpValue < KNTTokenomics.EFFECTIVE_DIRECT_LP_USDT && parent.directEffectiveCount > 0) {
                parent.directEffectiveCount -= 1;
            }
        }
        _refreshNodeStatus(referrer);
        _syncRewardDebt(referrer);
    }

    function _refreshNodeStatus(address account) internal {
        UserInfo storage user = users[account];
        bool qualifies = user.lpValueUsdt >= KNTTokenomics.NODE_SELF_LP_USDT
            && user.directLpValueUsdt >= KNTTokenomics.NODE_DIRECT_LP_USDT
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
}
