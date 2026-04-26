// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./KNTTokenomics.sol";

interface IKNTMigrationBoost {
    function users(address account) external view returns (
        bool registered,
        address referrer,
        uint256 lpAmount,
        uint256 lpValueUsdt,
        uint256 power,
        uint256 lastPowerUpdateDay,
        uint256 rewardDebt,
        uint256 pendingKnt,
        uint256 directLpValueUsdt,
        uint256 directEffectiveCount,
        bool isNode,
        uint256 nodeRewardDebt,
        uint256 totalStaticReward,
        uint256 totalDynamicReward,
        uint256 totalNodeReward
    );
}

contract KNTMigrationNFT is ERC721, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct MigrationPosition {
        uint256 originalAmount;
        uint256 claimedAmount;
        uint256 lastClaimDay;
    }

    IERC20 public immutable knt;
    IKNTMigrationBoost public mining;
    uint256 public nextTokenId = 1;
    uint256 public startTimestamp;

    mapping(uint256 => MigrationPosition) public positions;

    event MigrationMinted(address indexed account, uint256 indexed tokenId, uint256 amount);
    event MigrationClaimed(address indexed account, uint256 indexed tokenId, uint256 amount);
    event MiningContractUpdated(address indexed oldMining, address indexed newMining);

    constructor(address knt_, address mining_, address initialOwner)
        ERC721("KNT Migration Position", "KNT-MP")
        Ownable(initialOwner)
    {
        require(knt_ != address(0), "KNT required");
        knt = IERC20(knt_);
        mining = IKNTMigrationBoost(mining_);
        startTimestamp = block.timestamp;
    }

    function fund(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero amount");
        knt.safeTransferFrom(msg.sender, address(this), amount);
    }

    function mintMigration(address account, uint256 amount) external onlyOwner returns (uint256 tokenId) {
        require(account != address(0), "Zero address");
        require(amount > 0, "Zero amount");
        tokenId = nextTokenId++;
        _safeMint(account, tokenId);
        positions[tokenId] = MigrationPosition({
            originalAmount: amount,
            claimedAmount: 0,
            lastClaimDay: currentDay()
        });
        emit MigrationMinted(account, tokenId, amount);
    }

    function claim(uint256 tokenId) external nonReentrant {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        uint256 amount = claimable(tokenId);
        require(amount > 0, "Nothing claimable");

        MigrationPosition storage position = positions[tokenId];
        position.claimedAmount += amount;
        position.lastClaimDay = currentDay();

        knt.safeTransfer(msg.sender, amount);
        emit MigrationClaimed(msg.sender, tokenId, amount);
    }

    function claimable(uint256 tokenId) public view returns (uint256) {
        _requireOwned(tokenId);
        MigrationPosition storage position = positions[tokenId];
        if (position.claimedAmount >= position.originalAmount) return 0;

        uint256 elapsedDays = currentDay() - position.lastClaimDay;
        if (elapsedDays == 0) return 0;

        uint256 bp = _boosted(ownerOf(tokenId))
            ? KNTTokenomics.MIGRATION_BOOST_RELEASE_BP
            : KNTTokenomics.MIGRATION_RELEASE_BP;
        uint256 amount = (position.originalAmount * bp * elapsedDays) / KNTTokenomics.BASIS_POINTS;
        uint256 remaining = position.originalAmount - position.claimedAmount;
        return amount > remaining ? remaining : amount;
    }

    function currentDay() public view returns (uint256) {
        if (block.timestamp <= startTimestamp) return 0;
        return (block.timestamp - startTimestamp) / 1 days;
    }

    function setMining(address mining_) external onlyOwner {
        address old = address(mining);
        mining = IKNTMigrationBoost(mining_);
        emit MiningContractUpdated(old, mining_);
    }

    function _boosted(address account) internal view returns (bool) {
        if (address(mining) == address(0)) return false;
        try mining.users(account) returns (
            bool,
            address,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256 directLpValueUsdt,
            uint256,
            bool,
            uint256,
            uint256,
            uint256,
            uint256
        ) {
            return directLpValueUsdt >= KNTTokenomics.NODE_DIRECT_LP_USDT;
        } catch {
            return false;
        }
    }
}
