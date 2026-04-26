// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SeerTypes.sol";

interface IMinerNodeLibExt {
    function adminEditNodeTier(address _user, uint256 _lotId, uint8 _newTier) external;
    function adminEditNodeWeight(address _user, uint256 _lotId, uint256 _newWeight) external;
    function adminEditNodeCost(address _user, uint256 _lotId, uint256 _newCostUsdt) external;
    function adminDeactivateNodeLot(address _user, uint256 _lotId) external;
    function registerNode(address _node, uint256 _minerTier, uint256 _costUsdt) external returns (uint256 lotId);
}

/**
 * @title LibSeerAdmin
 * @notice 管理员编辑矿机/节点属性的外部库 (DELEGATECALL, 节省主合约字节码).
 */
library LibSeerAdmin {
    event AdminMinerTierEdited(address indexed admin, address indexed user, uint256 indexed minerId, uint8 oldTier, uint8 newTier);
    event AdminMinerCostEdited(address indexed admin, address indexed user, uint256 indexed minerId, uint256 oldCost, uint256 newCost);
    event AdminMinerVaultAEdited(address indexed admin, address indexed user, uint256 indexed minerId, uint256 oldValue, uint256 newValue);
    event AdminMinerVaultBEdited(address indexed admin, address indexed user, uint256 indexed minerId, uint256 oldValue, uint256 newValue);
    event AdminMinerCycleDaysEdited(address indexed admin, address indexed user, uint256 indexed minerId, uint256 oldDays, uint256 newDays);
    event AdminNodeTierEdited(address indexed admin, address indexed user, uint256 indexed lotId, uint8 oldTier, uint8 newTier);
    event AdminNodeWeightEdited(address indexed admin, address indexed user, uint256 indexed lotId, uint256 oldWeight, uint256 newWeight);
    event AdminNodeCostEdited(address indexed admin, address indexed user, uint256 indexed lotId, uint256 oldCost, uint256 newCost);

    function editMinerTier(
        mapping(address => SeerTypes.MinerInfo[]) storage userMiners,
        mapping(address => mapping(uint256 => uint256)) storage minerNodeLotIds,
        address minerNodeAddr,
        address _user,
        uint256 _minerId,
        uint8 _newTier
    ) external {
        require(_newTier <= 3, "Invalid tier");
        SeerTypes.MinerInfo[] storage miners = userMiners[_user];
        require(_minerId < miners.length, "Invalid miner index");

        SeerTypes.MinerInfo storage miner = miners[_minerId];
        uint8 oldTier = uint8(miner.tier);
        if (oldTier == _newTier) return;

        uint256 lotId = minerNodeLotIds[_user][_minerId];
        bool wasNodeTier = oldTier != uint8(SeerTypes.MinerTier.Basic);
        bool isNodeTier = _newTier != uint8(SeerTypes.MinerTier.Basic);

        miner.tier = SeerTypes.MinerTier(_newTier);

        if (!miner.isAutoGifted && minerNodeAddr != address(0)) {
            IMinerNodeLibExt mn = IMinerNodeLibExt(minerNodeAddr);
            if (wasNodeTier && isNodeTier && lotId != 0) {
                mn.adminEditNodeTier(_user, lotId, _newTier);
            } else if (wasNodeTier && !isNodeTier && lotId != 0) {
                mn.adminDeactivateNodeLot(_user, lotId);
                delete minerNodeLotIds[_user][_minerId];
            } else if (!wasNodeTier && isNodeTier && miner.active) {
                uint256 newLotId = mn.registerNode(_user, _newTier, miner.costUsdt);
                minerNodeLotIds[_user][_minerId] = newLotId;
            }
        }

        emit AdminMinerTierEdited(msg.sender, _user, _minerId, oldTier, _newTier);
    }

    function editMinerCost(
        mapping(address => SeerTypes.MinerInfo[]) storage userMiners,
        address _user,
        uint256 _minerId,
        uint256 _newCostUsdt
    ) external {
        require(_newCostUsdt > 0, "Cost must be > 0");
        SeerTypes.MinerInfo[] storage miners = userMiners[_user];
        require(_minerId < miners.length, "Invalid miner index");

        uint256 oldCost = miners[_minerId].costUsdt;
        miners[_minerId].costUsdt = _newCostUsdt;
        emit AdminMinerCostEdited(msg.sender, _user, _minerId, oldCost, _newCostUsdt);
    }

    function editMinerVaultA(
        mapping(address => SeerTypes.MinerInfo[]) storage userMiners,
        address _user,
        uint256 _minerId,
        uint256 _newVaultA
    ) external {
        SeerTypes.MinerInfo[] storage miners = userMiners[_user];
        require(_minerId < miners.length, "Invalid miner index");
        require(_newVaultA <= miners[_minerId].vaultA_initialUsdt, "VaultA exceeds initial");

        uint256 oldValue = miners[_minerId].vaultA_usdt;
        miners[_minerId].vaultA_usdt = _newVaultA;
        emit AdminMinerVaultAEdited(msg.sender, _user, _minerId, oldValue, _newVaultA);
    }

    function editMinerVaultB(
        mapping(address => SeerTypes.MinerInfo[]) storage userMiners,
        address _user,
        uint256 _minerId,
        uint256 _newVaultB
    ) external {
        SeerTypes.MinerInfo[] storage miners = userMiners[_user];
        require(_minerId < miners.length, "Invalid miner index");
        require(_newVaultB <= miners[_minerId].vaultB_initialUsdt, "VaultB exceeds initial");

        uint256 oldValue = miners[_minerId].vaultB_usdt;
        miners[_minerId].vaultB_usdt = _newVaultB;
        emit AdminMinerVaultBEdited(msg.sender, _user, _minerId, oldValue, _newVaultB);
    }

    function editMinerCycleDays(
        mapping(address => SeerTypes.MinerInfo[]) storage userMiners,
        address _user,
        uint256 _minerId,
        uint256 _newCycleDays
    ) external {
        require(_newCycleDays > 0, "Cycle must be > 0");
        SeerTypes.MinerInfo[] storage miners = userMiners[_user];
        require(_minerId < miners.length, "Invalid miner index");

        uint256 oldDays = miners[_minerId].cycleDays;
        miners[_minerId].cycleDays = _newCycleDays;
        emit AdminMinerCycleDaysEdited(msg.sender, _user, _minerId, oldDays, _newCycleDays);
    }

    function editNodeTier(address minerNodeAddr, address _user, uint256 _lotId, uint8 _newTier) external {
        require(_newTier >= 1 && _newTier <= 3, "Invalid tier");
        require(minerNodeAddr != address(0), "MinerNode not set");
        IMinerNodeLibExt(minerNodeAddr).adminEditNodeTier(_user, _lotId, _newTier);
        emit AdminNodeTierEdited(msg.sender, _user, _lotId, 0, _newTier);
    }

    function editNodeWeight(address minerNodeAddr, address _user, uint256 _lotId, uint256 _newWeight) external {
        require(_newWeight > 0, "Weight must be > 0");
        require(minerNodeAddr != address(0), "MinerNode not set");
        IMinerNodeLibExt(minerNodeAddr).adminEditNodeWeight(_user, _lotId, _newWeight);
        emit AdminNodeWeightEdited(msg.sender, _user, _lotId, 0, _newWeight);
    }

    function editNodeCost(address minerNodeAddr, address _user, uint256 _lotId, uint256 _newCostUsdt) external {
        require(_newCostUsdt > 0, "Cost must be > 0");
        require(minerNodeAddr != address(0), "MinerNode not set");
        IMinerNodeLibExt(minerNodeAddr).adminEditNodeCost(_user, _lotId, _newCostUsdt);
        emit AdminNodeCostEdited(msg.sender, _user, _lotId, 0, _newCostUsdt);
    }

    // ─────────────────────────────────────────────────────────────
    //  矿机生命周期管理
    // ─────────────────────────────────────────────────────────────

    event AdminMinerDeactivated(address indexed admin, address indexed user, uint256 indexed minerId, uint256 timestamp);
    event AdminMinerActivated(address indexed admin, address indexed user, uint256 indexed minerId, uint256 timestamp);
    event AdminMinerRemoved(address indexed admin, address indexed user, uint256 indexed minerId, uint256 timestamp);

    /// @return deltaActive 对主合约 totalActiveMiners 的增量 (-1 表示扣减 1, +1 增加, 0 不变)
    function deactivateMiner(
        mapping(address => SeerTypes.MinerInfo[]) storage userMiners,
        mapping(address => mapping(uint256 => uint256)) storage minerNodeLotIds,
        address minerNodeAddr,
        address _user,
        uint256 _minerId
    ) external returns (int256 deltaActive) {
        SeerTypes.MinerInfo[] storage miners = userMiners[_user];
        require(_minerId < miners.length, "Invalid miner index");
        SeerTypes.MinerInfo storage miner = miners[_minerId];
        require(miner.active, "Miner already inactive");

        if (miner.tier != SeerTypes.MinerTier.Basic && !miner.isAutoGifted && minerNodeAddr != address(0)) {
            uint256 lotId = minerNodeLotIds[_user][_minerId];
            if (lotId != 0) {
                IMinerNodeLibExt(minerNodeAddr).adminDeactivateNodeLot(_user, lotId);
                delete minerNodeLotIds[_user][_minerId];
            }
        }

        miner.active = false;
        deltaActive = -1;
        emit AdminMinerDeactivated(msg.sender, _user, _minerId, block.timestamp);
    }

    function activateMiner(
        mapping(address => SeerTypes.MinerInfo[]) storage userMiners,
        mapping(address => mapping(uint256 => uint256)) storage minerNodeLotIds,
        address minerNodeAddr,
        address _user,
        uint256 _minerId
    ) external returns (int256 deltaActive) {
        SeerTypes.MinerInfo[] storage miners = userMiners[_user];
        require(_minerId < miners.length, "Invalid miner index");
        SeerTypes.MinerInfo storage miner = miners[_minerId];
        require(!miner.active, "Miner already active");

        miner.active = true;
        deltaActive = 1;

        if (miner.tier != SeerTypes.MinerTier.Basic && !miner.isAutoGifted && minerNodeAddr != address(0)) {
            uint256 lotId = IMinerNodeLibExt(minerNodeAddr).registerNode(_user, uint256(miner.tier), miner.costUsdt);
            minerNodeLotIds[_user][_minerId] = lotId;
        }

        emit AdminMinerActivated(msg.sender, _user, _minerId, block.timestamp);
    }

    function removeMiner(
        mapping(address => SeerTypes.MinerInfo[]) storage userMiners,
        mapping(address => mapping(uint256 => uint256)) storage minerNodeLotIds,
        address minerNodeAddr,
        address _user,
        uint256 _minerId
    ) external returns (int256 deltaActive) {
        SeerTypes.MinerInfo[] storage miners = userMiners[_user];
        uint256 len = miners.length;
        require(_minerId < len, "Invalid miner index");

        SeerTypes.MinerInfo memory removed = miners[_minerId];
        uint256 lotId = minerNodeLotIds[_user][_minerId];

        if (removed.active) deltaActive = -1;

        if (lotId != 0 && minerNodeAddr != address(0)) {
            IMinerNodeLibExt(minerNodeAddr).adminDeactivateNodeLot(_user, lotId);
        }

        uint256 lastIndex = len - 1;
        if (_minerId != lastIndex) {
            miners[_minerId] = miners[lastIndex];
            uint256 movedLotId = minerNodeLotIds[_user][lastIndex];
            if (movedLotId != 0) {
                minerNodeLotIds[_user][_minerId] = movedLotId;
            } else {
                delete minerNodeLotIds[_user][_minerId];
            }
        }

        miners.pop();
        delete minerNodeLotIds[_user][lastIndex];

        emit AdminMinerRemoved(msg.sender, _user, _minerId, block.timestamp);
    }
}
