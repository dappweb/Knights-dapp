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
 * @title AirdropManager
 * @notice SEER空投管理合约
 * @dev
 *   - 注册空投: 用户注册即得20 SEER (锁定状态)
 *   - 解锁条件: 购买100U以上矿机后解锁
 *   - 空投总额: 4,200,000 SEER (总量的2%)
 *   - 与SeerProtocol协同: Protocol购买矿机后调用unlock
 */
contract AirdropManager is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    // ============================================================
    //                        数据结构
    // ============================================================

    struct AirdropInfo {
        uint256 amount;        // 空投数量
        bool claimed;          // 是否已领取 (注册时自动标记)
        bool unlocked;         // 是否已解锁 (购买矿机后)
        bool withdrawn;        // 是否已提取
        uint256 claimTime;     // 领取时间
        uint256 unlockTime;    // 解锁时间
    }

    // ============================================================
    //                        状态变量
    // ============================================================

    /// @notice SEER代币
    IERC20 public seerToken;

    /// @notice 协议合约地址 (有权触发claim和unlock)
    address public protocolAddress;

    /// @notice 用户空投信息
    mapping(address => AirdropInfo) public airdrops;

    /// @notice 空投池剩余
    uint256 public airdropPoolRemaining;

    /// @notice 已领取总量
    uint256 public totalClaimed;

    /// @notice 已解锁总量
    uint256 public totalUnlocked;

    /// @notice 领取用户数
    uint256 public claimCount;

    // ============================================================
    //                          事件
    // ============================================================

    event AirdropClaimed(address indexed user, uint256 amount);
    event AirdropUnlocked(address indexed user, uint256 amount);
    event AirdropWithdrawn(address indexed user, uint256 amount);
    event AirdropPoolFunded(uint256 amount);
    event ProtocolAddressUpdated(address indexed oldAddr, address indexed newAddr);

    // ============================================================
    //                        构造函数
    // ============================================================

    constructor() {
        _disableInitializers();
    }

    function initialize(address _seerToken) public initializer {
        require(_seerToken != address(0), "Zero address");

        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        seerToken = IERC20(_seerToken);
    }

    // ============================================================
    //                      修饰符
    // ============================================================

    modifier onlyProtocolOrOwner() {
        require(msg.sender == protocolAddress || msg.sender == owner(), "Not authorized");
        _;
    }

    // ============================================================
    //                      空投池管理
    // ============================================================

    /**
     * @notice 向空投池注入SEER代币 (部署后由Owner调用)
     * @param amount SEER数量
     */
    function fundAirdropPool(uint256 amount) external onlyOwner {
        seerToken.safeTransferFrom(msg.sender, address(this), amount);
        airdropPoolRemaining += amount;
        emit AirdropPoolFunded(amount);
    }

    // ============================================================
    //                      空投领取
    // ============================================================

    /**
     * @notice 用户注册时领取空投 (由Protocol在register时调用)
     * @param _user 用户地址
     */
    function claimAirdrop(address _user) external onlyProtocolOrOwner {
        require(_user != address(0), "Zero address");
        require(!airdrops[_user].claimed, "Already claimed");
        require(airdropPoolRemaining >= SeerTokenomics.AIRDROP_REGISTER_AMOUNT, "Pool depleted");

        airdrops[_user] = AirdropInfo({
            amount: SeerTokenomics.AIRDROP_REGISTER_AMOUNT,
            claimed: true,
            unlocked: false,
            withdrawn: false,
            claimTime: block.timestamp,
            unlockTime: 0
        });

        airdropPoolRemaining -= SeerTokenomics.AIRDROP_REGISTER_AMOUNT;
        totalClaimed += SeerTokenomics.AIRDROP_REGISTER_AMOUNT;
        claimCount++;

        emit AirdropClaimed(_user, SeerTokenomics.AIRDROP_REGISTER_AMOUNT);
    }

    /**
     * @notice 解锁空投 (用户购买≥100U矿机后由Protocol调用)
     * @param _user 用户地址
     */
    function unlockAirdrop(address _user) external onlyProtocolOrOwner {
        AirdropInfo storage info = airdrops[_user];
        require(info.claimed, "Not claimed");
        require(!info.unlocked, "Already unlocked");

        info.unlocked = true;
        info.unlockTime = block.timestamp;
        totalUnlocked += info.amount;

        emit AirdropUnlocked(_user, info.amount);
    }

    /**
     * @notice 用户提取已解锁的空投SEER
     */
    function withdrawAirdrop() external nonReentrant {
        AirdropInfo storage info = airdrops[msg.sender];
        require(info.claimed, "No airdrop");
        require(info.unlocked, "Not unlocked");
        require(!info.withdrawn, "Already withdrawn");

        info.withdrawn = true;
        seerToken.safeTransfer(msg.sender, info.amount);

        emit AirdropWithdrawn(msg.sender, info.amount);
    }

    // ============================================================
    //                      查询函数
    // ============================================================

    /// @notice 查询用户空投状态
    function getAirdropInfo(address _user) external view returns (
        uint256 amount,
        bool claimed,
        bool unlocked,
        bool withdrawn
    ) {
        AirdropInfo storage info = airdrops[_user];
        return (info.amount, info.claimed, info.unlocked, info.withdrawn);
    }

    /// @notice 查询空投池剩余可发放次数
    function remainingAirdropSlots() external view returns (uint256) {
        if (SeerTokenomics.AIRDROP_REGISTER_AMOUNT == 0) return 0;
        return airdropPoolRemaining / SeerTokenomics.AIRDROP_REGISTER_AMOUNT;
    }

    // ============================================================
    //                      管理函数
    // ============================================================

    /// @notice 设置协议合约地址
    function setProtocolAddress(address _protocol) external onlyOwner {
        address old = protocolAddress;
        protocolAddress = _protocol;
        emit ProtocolAddressUpdated(old, _protocol);
    }

    /// @notice 紧急提取剩余空投池
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = seerToken.balanceOf(address(this));
        if (balance > 0) {
            seerToken.safeTransfer(owner(), balance);
            airdropPoolRemaining = 0;
        }
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
