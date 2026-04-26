// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./SeerTokenomics.sol";

/**
 * @title MinerNode
 * @notice 节点管理合约，支持单节点 lot 的节点币权分发与领取
 * @dev
 *   - 节点分红按地址聚合权重结算
 *   - 节点币权按每一笔节点购买独立记录、独立领取
 *   - 保留地址级汇总查询，便于前端展示
 */
contract MinerNode is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    struct NodeInfo {
        uint256 weight;
        uint256 rewardDebt;
        uint256 pendingReward;
        bool isNode;
    }

    struct NodeLot {
        uint256 lotId;
        address owner;
        uint256 tier;
        uint256 weight;
        uint256 costUsdt;
        uint256 allocatedRights;
        uint256 claimedRights;
        uint256 purchaseTime;
        uint256 protectedUntil;
        bool active;
    }

    struct NodeLotView {
        uint256 lotId;
        uint256 tier;
        uint256 weight;
        uint256 costUsdt;
        uint256 allocatedRights;
        uint256 claimedRights;
        uint256 pendingRights;
        uint256 purchaseTime;
        uint256 protectedUntil;
        bool active;
    }

    struct NodeTierConfig {
        uint256 weight;
        uint256 allocatedRights;
        uint256 maxCount;
        bool enabled;
    }

    IERC20 public seerToken;
    address public protocolAddress;

    mapping(address => NodeInfo) public nodes;

    address[] public nodeAddresses;
    mapping(address => uint256) public nodeIndex;

    uint256 public totalWeight;
    uint256 public accRewardPerWeight;
    uint256 public totalDistributed;
    uint256 public pendingUndistributedRewards;

    uint256 public nodeCount;

    /// @notice 已售节点数量，用于销售配额检查，不随失效回退
    uint256 public v1NodeCount;
    uint256 public v2NodeCount;
    uint256 public v3NodeCount;

    mapping(address => uint256) public nodeCurrentTier;
    mapping(address => uint256) public nodeMaxTier;
    mapping(address => uint256) public nodeProtectionUntil;

    mapping(address => uint256) public nodeRightsAllocated;
    mapping(address => uint256) public nodeRightsClaimed;
    uint256 public totalNodeRightsAllocated;
    uint256 public totalNodeRightsClaimed;
    uint256 public nodeRightsPoolFunded;
    uint256 public nodeRightsPoolClaimed;

    uint256 public nodeRightsUnlockedBP;
    uint256 public nodeRightsUnlockBasePrice;

    uint256 public nextNodeLotId;
    mapping(uint256 => NodeLot) public nodeLots;
    mapping(address => uint256[]) private userNodeLotIds;

    mapping(uint8 => NodeTierConfig) private nodeTierConfigs;

    uint256 constant WEIGHT_V1 = 1;
    uint256 constant WEIGHT_V2 = 3;
    uint256 constant WEIGHT_V3 = 10;

    event NodeRegistered(address indexed node, uint256 weight, uint256 tier);
    event NodeRemoved(address indexed node);
    event NodeRemovalSkipped(address indexed node, uint256 protectedUntil);
    event NodeTierUpgraded(address indexed node, uint256 oldTier, uint256 newTier);
    event NodeProtectionUpdated(address indexed node, uint256 protectedUntil);

    event NodeLotRegistered(address indexed node, uint256 indexed lotId, uint256 tier, uint256 weight, uint256 costUsdt, uint256 protectedUntil);
    event NodeLotDeactivated(address indexed node, uint256 indexed lotId, uint256 tier);

    event NodeRightsAllocated(address indexed node, uint256 tier, uint256 addedAmount, uint256 totalAllocated);
    event NodeRightsUnlocked(uint256 oldUnlockedBP, uint256 newUnlockedBP, uint256 newBasePrice);
    event NodeRightsClaimed(address indexed node, uint256 amount, uint256 totalClaimedByNode);
    event NodeRightsClaimedByLot(address indexed node, uint256 indexed lotId, uint256 amount, uint256 totalClaimedByLot);
    event NodeRightsPoolFunded(address indexed sender, uint256 amount, uint256 totalFunded);

    error NodeQuotaExceeded(uint256 tier, uint256 current, uint256 max);
    error InsufficientNodeRightsPool(uint256 requiredAmount, uint256 availableAmount);
    error InvalidNodeLot(uint256 lotId);
    error NotNodeLotOwner(uint256 lotId, address caller);

    event RewardDistributed(uint256 amount, uint256 newAccRewardPerWeight);
    event RewardQueued(uint256 amount, uint256 totalQueued);
    event RewardClaimed(address indexed node, uint256 amount);
    event ProtocolAddressUpdated(address indexed oldAddr, address indexed newAddr);
    event NodeTierConfigUpdated(
        uint8 indexed tier,
        uint256 weight,
        uint256 allocatedRights,
        uint256 maxCount,
        bool enabled
    );

    error NodeTierDisabled(uint256 tier);

    constructor() {
        _disableInitializers();
    }

    function initialize(address _seerToken) public initializer {
        require(_seerToken != address(0), "Zero address");

        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        seerToken = IERC20(_seerToken);
        nodeRightsUnlockBasePrice = SeerTokenomics.INITIAL_PRICE_USDT;

        _setNodeTierConfig(1, WEIGHT_V1, SeerTokenomics.NODE_V1_TOKEN_RIGHTS, SeerTokenomics.NODE_V1_MAX_COUNT, true);
        _setNodeTierConfig(2, WEIGHT_V2, SeerTokenomics.NODE_V2_TOKEN_RIGHTS, SeerTokenomics.NODE_V2_MAX_COUNT, true);
        _setNodeTierConfig(3, WEIGHT_V3, SeerTokenomics.NODE_V3_TOKEN_RIGHTS, SeerTokenomics.NODE_V3_MAX_COUNT, true);
    }

    modifier onlyProtocolOrOwner() {
        require(msg.sender == protocolAddress || msg.sender == owner(), "Not authorized");
        _;
    }

    function registerNode(address _node, uint256 _minerTier, uint256 _costUsdt) external onlyProtocolOrOwner returns (uint256 lotId) {
        require(_node != address(0), "Zero address");
        require(_minerTier >= 1 && _minerTier <= 3, "Invalid tier");
        require(_costUsdt > 0, "Zero cost");

        NodeTierConfig storage tierConfig = nodeTierConfigs[uint8(_minerTier)];
        if (!tierConfig.enabled) revert NodeTierDisabled(_minerTier);

        _requireTierQuota(_minerTier);

        if (nodes[_node].isNode) {
            _settleReward(_node);
        }

        lotId = ++nextNodeLotId;
        uint256 weight = _tierToWeight(_minerTier);
        uint256 protectedUntil = block.timestamp + SeerTokenomics.NODE_LEVEL_PROTECTION_PERIOD;
        uint256 allocatedRights = _tierToNodeRights(_minerTier);

        nodeLots[lotId] = NodeLot({
            lotId: lotId,
            owner: _node,
            tier: _minerTier,
            weight: weight,
            costUsdt: _costUsdt,
            allocatedRights: allocatedRights,
            claimedRights: 0,
            purchaseTime: block.timestamp,
            protectedUntil: protectedUntil,
            active: true
        });
        userNodeLotIds[_node].push(lotId);

        _increaseTierCount(_minerTier);

        nodeRightsAllocated[_node] += allocatedRights;
        totalNodeRightsAllocated += allocatedRights;
        emit NodeRightsAllocated(_node, _minerTier, allocatedRights, nodeRightsAllocated[_node]);

        uint256 oldTier = nodeCurrentTier[_node];
        if (_minerTier > nodeMaxTier[_node]) {
            nodeMaxTier[_node] = _minerTier;
        }

        _syncNodeState(_node);

        if (nodeCurrentTier[_node] > oldTier && oldTier > 0) {
            emit NodeTierUpgraded(_node, oldTier, nodeCurrentTier[_node]);
        }
        emit NodeProtectionUpdated(_node, nodeProtectionUntil[_node]);
        emit NodeLotRegistered(_node, lotId, _minerTier, weight, _costUsdt, protectedUntil);

        _flushQueuedRewards();
    }

    function removeNode(address _node) external onlyProtocolOrOwner {
        uint256[] storage lotIds = userNodeLotIds[_node];
        for (uint256 i = 0; i < lotIds.length; i++) {
            _deactivateNodeLot(_node, lotIds[i]);
        }
    }

    function removeNodeLot(address _node, uint256 _lotId) external onlyProtocolOrOwner {
        _deactivateNodeLot(_node, _lotId);
    }

    function notifyPriceUpdate(uint256 _newPriceUsdt) external onlyProtocolOrOwner {
        require(_newPriceUsdt > 0, "Invalid price");
        if (nodeRightsUnlockedBP >= SeerTokenomics.BASIS_POINTS) return;
        if (_newPriceUsdt <= nodeRightsUnlockBasePrice) return;

        uint256 delta = _newPriceUsdt - nodeRightsUnlockBasePrice;
        uint256 steps = delta / SeerTokenomics.NODE_RIGHTS_UNLOCK_PRICE_STEP;
        if (steps == 0) return;

        uint256 oldUnlocked = nodeRightsUnlockedBP;
        uint256 addedBp = steps * SeerTokenomics.NODE_RIGHTS_UNLOCK_RATE_BP;
        uint256 newUnlocked = oldUnlocked + addedBp;
        if (newUnlocked > SeerTokenomics.BASIS_POINTS) {
            newUnlocked = SeerTokenomics.BASIS_POINTS;
        }

        nodeRightsUnlockedBP = newUnlocked;
        nodeRightsUnlockBasePrice += steps * SeerTokenomics.NODE_RIGHTS_UNLOCK_PRICE_STEP;

        emit NodeRightsUnlocked(oldUnlocked, newUnlocked, nodeRightsUnlockBasePrice);
    }

    function distributeReward(uint256 amount) external {
        require(amount > 0, "Zero amount");

        seerToken.safeTransferFrom(msg.sender, address(this), amount);

        if (totalWeight == 0) {
            pendingUndistributedRewards += amount;
            emit RewardQueued(amount, pendingUndistributedRewards);
            return;
        }

        _distribute(amount);
    }

    function notifyRewardReceived(uint256 amount) external {
        require(msg.sender == address(seerToken), "Only token");
        require(amount > 0, "Zero amount");

        if (totalWeight == 0) {
            pendingUndistributedRewards += amount;
            emit RewardQueued(amount, pendingUndistributedRewards);
            return;
        }

        _distribute(amount);
    }

    function claimReward() external nonReentrant {
        if (nodes[msg.sender].isNode) {
            _settleReward(msg.sender);
        }

        uint256 reward = nodes[msg.sender].pendingReward;
        require(reward > 0, "No reward");

        nodes[msg.sender].pendingReward = 0;
        seerToken.safeTransfer(msg.sender, reward);

        emit RewardClaimed(msg.sender, reward);
    }

    function claimNodeRights() external nonReentrant {
        uint256[] storage lotIds = userNodeLotIds[msg.sender];
        uint256 totalAmount = 0;

        for (uint256 i = 0; i < lotIds.length; i++) {
            uint256 lotId = lotIds[i];
            uint256 lotPending = _pendingNodeRightsByLot(lotId);
            if (lotPending == 0) continue;

            NodeLot storage lot = nodeLots[lotId];
            lot.claimedRights += lotPending;
            totalAmount += lotPending;

            emit NodeRightsClaimedByLot(msg.sender, lotId, lotPending, lot.claimedRights);
        }

        require(totalAmount > 0, "No node rights");

        uint256 available = nodeRightsPoolFunded - nodeRightsPoolClaimed;
        if (available < totalAmount) {
            revert InsufficientNodeRightsPool(totalAmount, available);
        }

        nodeRightsClaimed[msg.sender] += totalAmount;
        totalNodeRightsClaimed += totalAmount;
        nodeRightsPoolClaimed += totalAmount;
        seerToken.safeTransfer(msg.sender, totalAmount);

        emit NodeRightsClaimed(msg.sender, totalAmount, nodeRightsClaimed[msg.sender]);
    }

    function claimNodeRightsByLot(uint256 _lotId) external nonReentrant {
        NodeLot storage lot = nodeLots[_lotId];
        if (lot.lotId == 0) revert InvalidNodeLot(_lotId);
        if (lot.owner != msg.sender) revert NotNodeLotOwner(_lotId, msg.sender);

        uint256 amount = _pendingNodeRightsByLot(_lotId);
        require(amount > 0, "No node rights");

        uint256 available = nodeRightsPoolFunded - nodeRightsPoolClaimed;
        if (available < amount) {
            revert InsufficientNodeRightsPool(amount, available);
        }

        lot.claimedRights += amount;
        nodeRightsClaimed[msg.sender] += amount;
        totalNodeRightsClaimed += amount;
        nodeRightsPoolClaimed += amount;
        seerToken.safeTransfer(msg.sender, amount);

        emit NodeRightsClaimedByLot(msg.sender, _lotId, amount, lot.claimedRights);
        emit NodeRightsClaimed(msg.sender, amount, nodeRightsClaimed[msg.sender]);
    }

    function fundNodeRightsPool(uint256 amount) external onlyOwner {
        require(amount > 0, "Zero amount");
        seerToken.safeTransferFrom(msg.sender, address(this), amount);
        nodeRightsPoolFunded += amount;
        emit NodeRightsPoolFunded(msg.sender, amount, nodeRightsPoolFunded);
    }

    function _deactivateNodeLot(address _node, uint256 _lotId) internal {
        NodeLot storage lot = nodeLots[_lotId];
        if (lot.lotId == 0) revert InvalidNodeLot(_lotId);
        if (lot.owner != _node) revert NotNodeLotOwner(_lotId, _node);
        if (!lot.active) return;

        if (block.timestamp < lot.protectedUntil) {
            emit NodeRemovalSkipped(_node, lot.protectedUntil);
            return;
        }

        if (nodes[_node].isNode) {
            _settleReward(_node);
        }

        lot.active = false;
        emit NodeLotDeactivated(_node, _lotId, lot.tier);
        _syncNodeState(_node);
    }

    function _syncNodeState(address _node) internal {
        (uint256 activeWeight, uint256 activeTier, uint256 maxProtectedUntil, bool hasActiveLot) = _getActiveNodeState(_node);

        NodeInfo storage summary = nodes[_node];
        bool wasNode = summary.isNode;

        if (wasNode) {
            totalWeight -= summary.weight;
        }

        summary.weight = activeWeight;
        summary.rewardDebt = hasActiveLot ? (activeWeight * accRewardPerWeight) / 1e18 : 0;
        summary.isNode = hasActiveLot;

        if (hasActiveLot) {
            totalWeight += activeWeight;
        }

        nodeCurrentTier[_node] = activeTier;
        nodeProtectionUntil[_node] = maxProtectedUntil;

        if (!wasNode && hasActiveLot) {
            nodeAddresses.push(_node);
            nodeIndex[_node] = nodeAddresses.length;
            nodeCount++;
            emit NodeRegistered(_node, activeWeight, activeTier);
        } else if (wasNode && !hasActiveLot) {
            uint256 idx = nodeIndex[_node];
            if (idx > 0) {
                uint256 lastIdx = nodeAddresses.length;
                if (idx != lastIdx) {
                    address lastNode = nodeAddresses[lastIdx - 1];
                    nodeAddresses[idx - 1] = lastNode;
                    nodeIndex[lastNode] = idx;
                }
                nodeAddresses.pop();
                delete nodeIndex[_node];
            }
            if (nodeCount > 0) {
                nodeCount--;
            }
            emit NodeRemoved(_node);
        }
    }

    function _getActiveNodeState(address _node) internal view returns (uint256 activeWeight, uint256 activeTier, uint256 maxProtectedUntil, bool hasActiveLot) {
        uint256[] storage lotIds = userNodeLotIds[_node];
        for (uint256 i = 0; i < lotIds.length; i++) {
            NodeLot storage lot = nodeLots[lotIds[i]];
            if (!lot.active) continue;

            hasActiveLot = true;
            activeWeight += lot.weight;
            if (lot.tier > activeTier) {
                activeTier = lot.tier;
            }
            if (lot.protectedUntil > maxProtectedUntil) {
                maxProtectedUntil = lot.protectedUntil;
            }
        }
    }

    function _settleReward(address _node) internal {
        NodeInfo storage node = nodes[_node];
        if (node.weight > 0) {
            uint256 accumulated = (node.weight * accRewardPerWeight) / 1e18;
            uint256 pending = accumulated - node.rewardDebt;
            node.pendingReward += pending;
            node.rewardDebt = accumulated;
        }
    }

    function _distribute(uint256 amount) internal {
        accRewardPerWeight += (amount * 1e18) / totalWeight;
        totalDistributed += amount;
        emit RewardDistributed(amount, accRewardPerWeight);
    }

    function _flushQueuedRewards() internal {
        uint256 queued = pendingUndistributedRewards;
        if (queued > 0 && totalWeight > 0) {
            pendingUndistributedRewards = 0;
            _distribute(queued);
        }
    }

    function _tierToWeight(uint256 _tier) internal view returns (uint256) {
        NodeTierConfig storage config = nodeTierConfigs[uint8(_tier)];
        require(config.weight > 0, "Invalid tier");
        return config.weight;
    }

    function _tierToNodeRights(uint256 _tier) internal view returns (uint256) {
        return nodeTierConfigs[uint8(_tier)].allocatedRights;
    }

    function _requireTierQuota(uint256 _tier) internal view {
        NodeTierConfig storage config = nodeTierConfigs[uint8(_tier)];
        uint256 current = _soldCountForTier(_tier);
        if (config.maxCount > 0 && current >= config.maxCount) {
            revert NodeQuotaExceeded(_tier, current, config.maxCount);
        }
    }

    function _increaseTierCount(uint256 _tier) internal {
        if (_tier == 1) v1NodeCount++;
        else if (_tier == 2) v2NodeCount++;
        else if (_tier == 3) v3NodeCount++;
    }

    function _pendingNodeRights(address _node) internal view returns (uint256 totalPending) {
        uint256[] storage lotIds = userNodeLotIds[_node];
        for (uint256 i = 0; i < lotIds.length; i++) {
            totalPending += _pendingNodeRightsByLot(lotIds[i]);
        }
    }

    function _pendingNodeRightsByLot(uint256 _lotId) internal view returns (uint256) {
        NodeLot storage lot = nodeLots[_lotId];
        if (lot.lotId == 0 || lot.allocatedRights == 0 || nodeRightsUnlockedBP == 0) {
            return 0;
        }

        uint256 unlockedAmount = (lot.allocatedRights * nodeRightsUnlockedBP) / SeerTokenomics.BASIS_POINTS;
        if (unlockedAmount <= lot.claimedRights) {
            return 0;
        }
        return unlockedAmount - lot.claimedRights;
    }

    function pendingReward(address _node) external view returns (uint256) {
        NodeInfo storage node = nodes[_node];
        if (node.weight == 0) {
            return node.pendingReward;
        }

        uint256 accumulated = (node.weight * accRewardPerWeight) / 1e18;
        return node.pendingReward + accumulated - node.rewardDebt;
    }

    function pendingNodeRights(address _node) external view returns (uint256) {
        return _pendingNodeRights(_node);
    }

    function pendingNodeRightsByLot(uint256 _lotId) external view returns (uint256) {
        return _pendingNodeRightsByLot(_lotId);
    }

    function getNodeRightsInfo(address _node)
        external
        view
        returns (
            uint256 allocated,
            uint256 claimed,
            uint256 pending,
            uint256 unlockedBP,
            uint256 currentTier,
            uint256 maxTier,
            uint256 protectedUntil
        )
    {
        allocated = nodeRightsAllocated[_node];
        claimed = nodeRightsClaimed[_node];
        pending = _pendingNodeRights(_node);
        unlockedBP = nodeRightsUnlockedBP;
        currentTier = nodeCurrentTier[_node];
        maxTier = nodeMaxTier[_node];
        protectedUntil = nodeProtectionUntil[_node];
    }

    function getUserNodeLotIds(address _node) external view returns (uint256[] memory) {
        return userNodeLotIds[_node];
    }

    function getUserNodeLots(address _node) external view returns (NodeLotView[] memory lots) {
        uint256[] storage lotIds = userNodeLotIds[_node];
        lots = new NodeLotView[](lotIds.length);

        for (uint256 i = 0; i < lotIds.length; i++) {
            NodeLot storage lot = nodeLots[lotIds[i]];
            lots[i] = NodeLotView({
                lotId: lot.lotId,
                tier: lot.tier,
                weight: lot.weight,
                costUsdt: lot.costUsdt,
                allocatedRights: lot.allocatedRights,
                claimedRights: lot.claimedRights,
                pendingRights: _pendingNodeRightsByLot(lot.lotId),
                purchaseTime: lot.purchaseTime,
                protectedUntil: lot.protectedUntil,
                active: lot.active
            });
        }
    }

    function areAllNodeQuotasFilled() external view returns (bool) {
        return _isTierSoldOut(1) && _isTierSoldOut(2) && _isTierSoldOut(3);
    }

    function getNodeTierConfig(uint8 _tier) external view returns (
        uint256 weight,
        uint256 allocatedRights,
        uint256 maxCount,
        uint256 soldCount,
        bool enabled
    ) {
        require(_tier >= 1 && _tier <= 3, "Invalid tier");
        NodeTierConfig storage config = nodeTierConfigs[_tier];
        require(config.weight > 0, "Invalid tier");
        return (
            config.weight,
            config.allocatedRights,
            config.maxCount,
            _soldCountForTier(_tier),
            config.enabled
        );
    }

    function isNodeProtected(address _node) external view returns (bool) {
        return block.timestamp < nodeProtectionUntil[_node];
    }

    function getAllNodes() external view returns (address[] memory) {
        return nodeAddresses;
    }

    function setProtocolAddress(address _protocol) external onlyOwner {
        address old = protocolAddress;
        protocolAddress = _protocol;
        emit ProtocolAddressUpdated(old, _protocol);
    }

    function setNodeTierConfig(
        uint8 _tier,
        uint256 _weight,
        uint256 _allocatedRights,
        uint256 _maxCount,
        bool _enabled
    ) external onlyOwner {
        require(_tier >= 1 && _tier <= 3, "Invalid tier");
        require(_weight > 0, "Invalid weight");
        require(_allocatedRights > 0, "Invalid rights");

        _setNodeTierConfig(_tier, _weight, _allocatedRights, _maxCount, _enabled);
        emit NodeTierConfigUpdated(_tier, _weight, _allocatedRights, _maxCount, _enabled);
    }

    function initializeV2() external reinitializer(2) {
        if (nodeTierConfigs[1].weight == 0) {
            _setNodeTierConfig(1, WEIGHT_V1, SeerTokenomics.NODE_V1_TOKEN_RIGHTS, SeerTokenomics.NODE_V1_MAX_COUNT, true);
        }
        if (nodeTierConfigs[2].weight == 0) {
            _setNodeTierConfig(2, WEIGHT_V2, SeerTokenomics.NODE_V2_TOKEN_RIGHTS, SeerTokenomics.NODE_V2_MAX_COUNT, true);
        }
        if (nodeTierConfigs[3].weight == 0) {
            _setNodeTierConfig(3, WEIGHT_V3, SeerTokenomics.NODE_V3_TOKEN_RIGHTS, SeerTokenomics.NODE_V3_MAX_COUNT, true);
        }
    }

    function _setNodeTierConfig(
        uint8 _tier,
        uint256 _weight,
        uint256 _allocatedRights,
        uint256 _maxCount,
        bool _enabled
    ) internal {
        nodeTierConfigs[_tier] = NodeTierConfig({
            weight: _weight,
            allocatedRights: _allocatedRights,
            maxCount: _maxCount,
            enabled: _enabled
        });
    }

    function _soldCountForTier(uint256 _tier) internal view returns (uint256) {
        if (_tier == 1) return v1NodeCount;
        if (_tier == 2) return v2NodeCount;
        if (_tier == 3) return v3NodeCount;
        return 0;
    }

    function _isTierSoldOut(uint8 _tier) internal view returns (bool) {
        NodeTierConfig storage config = nodeTierConfigs[_tier];
        if (config.maxCount == 0) {
            return false;
        }
        return _soldCountForTier(_tier) >= config.maxCount;
    }

    // ============================================================
    //                    管理员矿机编辑功能
    // ============================================================

    event AdminMinerDeactivated(address indexed admin, address indexed owner, uint256 minerId, uint256 timestamp);
    event AdminMinerActivated(address indexed admin, address indexed owner, uint256 minerId, uint256 timestamp);
    event AdminNodeLotDeactivated(address indexed admin, address indexed owner, uint256 indexed lotId, uint256 timestamp);

    /**
     * @notice Admin禁用用户矿机
     * 需要在SeerProtocol中对接此函数
     */
    function deactivateMiner(address _user, uint256 _minerId) external onlyProtocolOrOwner {
        require(_user != address(0), "Zero address");
        // 此函数在SeerProtocol中实现具体逻辑
        // 这里只是占位，实际删除/禁用由Protocol合约处理
        emit AdminMinerDeactivated(msg.sender, _user, _minerId, block.timestamp);
    }

    /**
     * @notice Admin启用用户矿机
     */
    function activateMiner(address _user, uint256 _minerId) external onlyProtocolOrOwner {
        require(_user != address(0), "Zero address");
        emit AdminMinerActivated(msg.sender, _user, _minerId, block.timestamp);
    }

    /**
     * @notice Admin禁用节点Lot
     */
    function adminDeactivateNodeLot(address _user, uint256 _lotId) external onlyProtocolOrOwner {
        require(_user != address(0), "Zero address");
        NodeLot storage lot = nodeLots[_lotId];
        if (lot.lotId == 0) revert InvalidNodeLot(_lotId);
        if (lot.owner != _user) revert NotNodeLotOwner(_lotId, _user);
        require(lot.active, "Node lot already inactive");
        require(block.timestamp >= lot.protectedUntil, "Node lot protected");

        if (nodes[_user].isNode) {
            _settleReward(_user);
        }

        lot.active = false;
        emit NodeLotDeactivated(_user, _lotId, lot.tier);
        _syncNodeState(_user);
        emit AdminNodeLotDeactivated(msg.sender, _user, _lotId, block.timestamp);
    }

    // ============================================================
    //                  三种节点属性编辑函数
    // ============================================================

    event AdminNodeTierEdited(address indexed admin, address indexed owner, uint256 indexed lotId, uint256 tier);
    event AdminNodeWeightEdited(address indexed admin, address indexed owner, uint256 indexed lotId, uint256 weight);
    event AdminNodeCostEdited(address indexed admin, address indexed owner, uint256 indexed lotId, uint256 cost);

    /**
     * @notice Admin编辑节点等级
     */
    function adminEditNodeTier(address _user, uint256 _lotId, uint8 _newTier) external onlyProtocolOrOwner {
        require(_user != address(0), "Zero address");
        require(_newTier >= 1 && _newTier <= 3, "Invalid tier");
        NodeLot storage lot = nodeLots[_lotId];
        if (lot.lotId == 0) revert InvalidNodeLot(_lotId);
        if (lot.owner != _user) revert NotNodeLotOwner(_lotId, _user);

        if (lot.active && nodes[_user].isNode) {
            _settleReward(_user);
        }

        uint256 oldAllocatedRights = lot.allocatedRights;
        uint256 newAllocatedRights = _tierToNodeRights(_newTier);
        if (newAllocatedRights < lot.claimedRights) {
            newAllocatedRights = lot.claimedRights;
        }

        lot.tier = _newTier;
        lot.weight = _tierToWeight(_newTier);
        lot.allocatedRights = newAllocatedRights;

        if (newAllocatedRights > oldAllocatedRights) {
            uint256 delta = newAllocatedRights - oldAllocatedRights;
            nodeRightsAllocated[_user] += delta;
            totalNodeRightsAllocated += delta;
        } else if (oldAllocatedRights > newAllocatedRights) {
            uint256 delta = oldAllocatedRights - newAllocatedRights;
            nodeRightsAllocated[_user] -= delta;
            totalNodeRightsAllocated -= delta;
        }

        if (_newTier > nodeMaxTier[_user]) {
            nodeMaxTier[_user] = _newTier;
        }

        _syncNodeState(_user);
        emit AdminNodeTierEdited(msg.sender, _user, _lotId, _newTier);
    }

    /**
     * @notice Admin编辑节点权重
     */
    function adminEditNodeWeight(address _user, uint256 _lotId, uint256 _newWeight) external onlyProtocolOrOwner {
        require(_user != address(0), "Zero address");
        require(_newWeight > 0, "Weight must be > 0");
        NodeLot storage lot = nodeLots[_lotId];
        if (lot.lotId == 0) revert InvalidNodeLot(_lotId);
        if (lot.owner != _user) revert NotNodeLotOwner(_lotId, _user);

        if (lot.active && nodes[_user].isNode) {
            _settleReward(_user);
        }

        lot.weight = _newWeight;
        _syncNodeState(_user);
        emit AdminNodeWeightEdited(msg.sender, _user, _lotId, _newWeight);
    }

    /**
     * @notice Admin编辑节点成本
     */
    function adminEditNodeCost(address _user, uint256 _lotId, uint256 _newCostUsdt) external onlyProtocolOrOwner {
        require(_user != address(0), "Zero address");
        require(_newCostUsdt > 0, "Cost must be > 0");
        NodeLot storage lot = nodeLots[_lotId];
        if (lot.lotId == 0) revert InvalidNodeLot(_lotId);
        if (lot.owner != _user) revert NotNodeLotOwner(_lotId, _user);

        lot.costUsdt = _newCostUsdt;
        emit AdminNodeCostEdited(msg.sender, _user, _lotId, _newCostUsdt);
    }

    /**
     * @notice 查询特定用户的所有矿机状态（用于Admin查看）
     */
    function getUserMinerStatsForAdmin(address _user) external view returns (
        uint256 totalMiners,
        uint256 activeMiners,
        uint256 totalInvestedUsdt,
        uint256[] memory minerTiers,
        bool[] memory minerActive
    ) {
        // 此函数需要在SeerProtocol中实现
        require(_user != address(0), "Zero address");
    }

    /**
     * @notice 查询特定节点Lot的详细信息（用于Admin查看）
     */
    function getNodeLotDetailsForAdmin(uint256 _lotId) external view returns (
        address owner,
        uint256 tier,
        uint256 weight,
        uint256 costUsdt,
        uint256 allocatedRights,
        uint256 claimedRights,
        uint256 purchaseTime,
        uint256 protectedUntil,
        bool active,
        uint256 pendingRights
    ) {
        NodeLot storage lot = nodeLots[_lotId];
        if (lot.lotId == 0) revert InvalidNodeLot(_lotId);

        return (
            lot.owner,
            lot.tier,
            lot.weight,
            lot.costUsdt,
            lot.allocatedRights,
            lot.claimedRights,
            lot.purchaseTime,
            lot.protectedUntil,
            lot.active,
            _pendingNodeRightsByLot(_lotId)
        );
    }

    /**
     * @notice Admin查询用户的所有活跃节点Lot
     */
    function getUserActiveNodeLotsForAdmin(address _user) external view returns (NodeLotView[] memory activeLots) {
        uint256[] storage lotIds = userNodeLotIds[_user];
        uint256 activeCount = 0;

        // 计算活跃Lot数量
        for (uint256 i = 0; i < lotIds.length; i++) {
            if (nodeLots[lotIds[i]].active) {
                activeCount++;
            }
        }

        activeLots = new NodeLotView[](activeCount);
        uint256 idx = 0;

        for (uint256 i = 0; i < lotIds.length; i++) {
            NodeLot storage lot = nodeLots[lotIds[i]];
            if (!lot.active) continue;

            activeLots[idx] = NodeLotView({
                lotId: lot.lotId,
                tier: lot.tier,
                weight: lot.weight,
                costUsdt: lot.costUsdt,
                allocatedRights: lot.allocatedRights,
                claimedRights: lot.claimedRights,
                pendingRights: _pendingNodeRightsByLot(lot.lotId),
                purchaseTime: lot.purchaseTime,
                protectedUntil: lot.protectedUntil,
                active: lot.active
            });
            idx++;
        }
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
