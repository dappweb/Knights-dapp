// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./KNTTokenomics.sol";

interface IKNTBurnable is IERC20 {
    function burn(uint256 amount) external;
}

contract KNTBurnQueue is Ownable, ReentrancyGuard {
    using SafeERC20 for IKNTBurnable;

    struct QueueEntry {
        address account;
        uint256 burnedAmount;
        uint256 rewardAmount;
        bool paid;
    }

    IKNTBurnable public immutable knt;
    uint256 public rewardMultiplierBP = KNTTokenomics.BURN_QUEUE_REWARD_BP;
    uint256 public rewardPool;
    uint256 public nextPayoutIndex;

    QueueEntry[] public queue;

    event Queued(address indexed account, uint256 indexed index, uint256 burnedAmount, uint256 rewardAmount);
    event RewardFunded(address indexed from, uint256 amount);
    event QueuePaid(address indexed account, uint256 indexed index, uint256 rewardAmount);
    event RewardMultiplierUpdated(uint256 oldMultiplierBP, uint256 newMultiplierBP);

    constructor(address knt_, address initialOwner) Ownable(initialOwner) {
        require(knt_ != address(0), "KNT required");
        knt = IKNTBurnable(knt_);
    }

    function queueLength() external view returns (uint256) {
        return queue.length;
    }

    function fundRewardPool(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero amount");
        knt.safeTransferFrom(msg.sender, address(this), amount);
        rewardPool += amount;
        emit RewardFunded(msg.sender, amount);
    }

    function burnAndQueue(uint256 amount) external nonReentrant returns (uint256 index) {
        require(amount > 0, "Zero amount");
        knt.safeTransferFrom(msg.sender, address(this), amount);
        knt.burn(amount);

        uint256 rewardAmount = (amount * rewardMultiplierBP) / KNTTokenomics.BASIS_POINTS;
        queue.push(QueueEntry({
            account: msg.sender,
            burnedAmount: amount,
            rewardAmount: rewardAmount,
            paid: false
        }));
        index = queue.length - 1;
        emit Queued(msg.sender, index, amount, rewardAmount);
    }

    function processNext(uint256 maxCount) external nonReentrant returns (uint256 paidCount) {
        uint256 i = nextPayoutIndex;
        while (i < queue.length && paidCount < maxCount) {
            QueueEntry storage entry = queue[i];
            if (entry.paid) {
                i++;
                continue;
            }
            if (rewardPool < entry.rewardAmount) break;

            entry.paid = true;
            rewardPool -= entry.rewardAmount;
            knt.safeTransfer(entry.account, entry.rewardAmount);
            emit QueuePaid(entry.account, i, entry.rewardAmount);

            i++;
            paidCount++;
        }
        nextPayoutIndex = i;
    }

    function setRewardMultiplierBP(uint256 newMultiplierBP) external onlyOwner {
        require(newMultiplierBP >= KNTTokenomics.BASIS_POINTS, "Below 1x");
        require(newMultiplierBP <= 30_000, "Too high");
        uint256 old = rewardMultiplierBP;
        rewardMultiplierBP = newMultiplierBP;
        emit RewardMultiplierUpdated(old, newMultiplierBP);
    }
}
