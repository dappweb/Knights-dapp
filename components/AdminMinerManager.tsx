import { ethers } from "ethers";
import { Ban, Edit2, Layers, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useWeb3 } from "../src/Web3Context";
import AnimatedButton from "./AnimatedButton";

interface MinerRecord {
  address: string;
  minerId: number;
  tier: number;
  costUsdt: bigint;
  vaultA: bigint;
  vaultB: bigint;
  active: boolean;
  purchaseTime: number;
  lastClaimTime: number;
  totalClaimed: bigint;
  isAutoGifted: boolean;
  cycleDays: number;
}

interface EditForm {
  minerId: number;
  address: string;
  tier: number;
  costUsdt: string;
  vaultA: string;
  vaultB: string;
  cycleDays: string;
  active: boolean;
  originalActive: boolean;
  originalTier: number;
  originalCostUsdt: string;
  originalVaultA: string;
  originalVaultB: string;
  originalCycleDays: string;
}

interface NodeLotRecord {
  lotId: number;
  tier: number;
  weight: bigint;
  costUsdt: bigint;
  allocatedRights: bigint;
  claimedRights: bigint;
  pendingRights: bigint;
  purchaseTime: number;
  protectedUntil: number;
  active: boolean;
}

interface MinerTierSpec {
  id: number;
  name: string;
  priceUsdt: string;
  multiplier: string;
  cycleDays: string;
  bVaultUsdt: string;
  sold: number;
  total: number;
  enabled: boolean;
}

const MINER_TIER_NAMES: Record<number, string> = {
  0: "基础矿机",
  1: "V1 矿机",
  2: "V2 矿机",
  3: "V3 矿机",
};

const DEFAULT_MINER_SPEC = (id: number): MinerTierSpec => ({
  id,
  name: MINER_TIER_NAMES[id] || `Tier ${id}`,
  priceUsdt: "0",
  multiplier: "1",
  cycleDays: "365",
  bVaultUsdt: "0",
  sold: 0,
  total: 0,
  enabled: true,
});

const AdminMinerManager: React.FC = () => {
  const {
    protocolContract, usdtDecimals, minerNodeContract, adminRole
  } = useWeb3();

  const canManageProduct = adminRole === "SUPER_ADMIN";

  const [miners, setMiners] = useState<MinerRecord[]>([]);
  const [nodeLots, setNodeLots] = useState<NodeLotRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [nodeLoading, setNodeLoading] = useState(false);
  const [searchAddress, setSearchAddress] = useState("");
  const [trackedAddress, setTrackedAddress] = useState("");
  const [selectedMiner, setSelectedMiner] = useState<EditForm | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [pageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [tierSpecs, setTierSpecs] = useState<MinerTierSpec[]>([]);
  const [tierConfigEditable, setTierConfigEditable] = useState(true);
  const [editingTierSpec, setEditingTierSpec] = useState<MinerTierSpec | null>(null);
  const [showTierSpecModal, setShowTierSpecModal] = useState(false);
  const [isCreatingTierSpec, setIsCreatingTierSpec] = useState(false);

  const fetchTierSpecs = useCallback(async () => {
    if (!protocolContract) return;

    try {
      const tierIds = [0, 1, 2, 3];
      let hasLegacyFallback = false;
      const results = await Promise.allSettled(
        tierIds.map(async (tierId) => {
          let config: any = null;
          let fallbackInfo: any = null;
          try {
            config = await (protocolContract as any).getMinerTierConfig(tierId);
          } catch {
            fallbackInfo = await (protocolContract as any).getMinerTierInfo(tierId);
            hasLegacyFallback = true;
          }

          const costRaw = config ? (config.costUsdt ?? config[0]) : (fallbackInfo.cost ?? fallbackInfo[0]);
          const multiplierRaw = config ? (config.multiplier ?? config[1]) : (fallbackInfo.multiplier ?? fallbackInfo[1]);
          const cycleRaw = config ? (config.cycleDays ?? config[2]) : (fallbackInfo.cycleDays ?? fallbackInfo[2]);
          const bVaultRaw = config ? (config.bVaultUsdt ?? config[3]) : (fallbackInfo.bVaultUsdt ?? fallbackInfo[3]);

          return {
            id: tierId,
            name: MINER_TIER_NAMES[tierId] || `Tier ${tierId}`,
            priceUsdt: ethers.formatUnits(costRaw, usdtDecimals),
            multiplier: ((Number(multiplierRaw)) / 1000).toString(),
            cycleDays: String(Number(cycleRaw)),
            bVaultUsdt: ethers.formatUnits(bVaultRaw, usdtDecimals),
            sold: config ? Number(config.soldCount ?? config[4]) : 0,
            total: config ? Number(config.maxSupply ?? config[5]) : 0,
            enabled: config ? (() => {
              const rawEnabled = config.enabled ?? config[6];
              const isZeroState =
                BigInt(config.costUsdt ?? config[0] ?? 0) === 0n &&
                Number(config.soldCount ?? config[4] ?? 0) === 0 &&
                Number(config.maxSupply ?? config[5] ?? 0) === 0;
              return isZeroState ? true : Boolean(rawEnabled);
            })() : true,
          } satisfies MinerTierSpec;
        })
      );

      const failed: number[] = [];
      const specs = tierIds.map((tierId, idx) => {
        const item = results[idx];
        if (item.status === "fulfilled") {
          return item.value;
        }
        failed.push(tierId);
        return DEFAULT_MINER_SPEC(tierId);
      });

      setTierSpecs(specs);
      setTierConfigEditable(!hasLegacyFallback);
      if (failed.length > 0) {
        toast.error(`部分矿机规格读取失败，已回显默认值: ${failed.join(",")}`);
      } else if (hasLegacyFallback) {
        toast("已从旧版链上接口回显矿机配置；编辑功能需升级协议后可用");
      }
    } catch (err: any) {
      toast.error(err?.reason || err?.message || "获取矿机规格失败");
      setTierSpecs([0, 1, 2, 3].map((tierId) => DEFAULT_MINER_SPEC(tierId)));
      setTierConfigEditable(false);
    }
  }, [protocolContract, usdtDecimals]);

  useEffect(() => {
    fetchTierSpecs();
  }, [fetchTierSpecs]);

  const handleEditTierSpec = useCallback((spec: MinerTierSpec) => {
    if (!canManageProduct) {
      toast.error("【manager管理员】仅可查看，不能编辑/下架产品");
      return;
    }
    setIsCreatingTierSpec(false);
    setEditingTierSpec({ ...spec });
    setShowTierSpecModal(true);
  }, [canManageProduct]);

  const handleCreateTierSpec = useCallback(() => {
    if (!canManageProduct) {
      toast.error("【manager管理员】仅可查看，不能编辑/下架产品");
      return;
    }
    if (!tierConfigEditable) {
      toast.error("当前链上版本不支持新增矿机规格");
      return;
    }
    const nextId = tierSpecs.length > 0 ? Math.max(...tierSpecs.map((s) => s.id)) + 1 : 4;
    setIsCreatingTierSpec(true);
    setEditingTierSpec({
      ...DEFAULT_MINER_SPEC(nextId),
      name: `Tier ${nextId}`,
      enabled: true,
    });
    setShowTierSpecModal(true);
  }, [tierSpecs, tierConfigEditable, canManageProduct]);

  const closeTierSpecModal = useCallback(() => {
    setShowTierSpecModal(false);
    setEditingTierSpec(null);
    setIsCreatingTierSpec(false);
  }, []);

  const handleToggleTierSpec = useCallback(async (spec: MinerTierSpec) => {
    if (!protocolContract) return;
    if (!canManageProduct) {
      toast.error("【manager管理员】仅可查看，不能编辑/下架产品");
      return;
    }
    if (!tierConfigEditable) {
      toast.error("当前链上版本仅支持回显，暂不支持矿机规格编辑，请先升级协议");
      return;
    }

    try {
      const tx = await (protocolContract as any).setMinerTierConfig(
        spec.id,
        ethers.parseUnits(spec.priceUsdt || "0", usdtDecimals),
        Math.round(Number(spec.multiplier || "0") * 1000),
        Number(spec.cycleDays || "0"),
        ethers.parseUnits(spec.bVaultUsdt || "0", usdtDecimals),
        !spec.enabled
      );
      await tx.wait();
      toast.success("矿机规格状态已更新");
      await fetchTierSpecs();
    } catch (err: any) {
      toast.error(err?.reason || err?.message || "更新矿机规格状态失败");
    }
  }, [protocolContract, usdtDecimals, fetchTierSpecs, tierConfigEditable, canManageProduct]);

  const handleSaveTierSpec = useCallback(async () => {
    if (!editingTierSpec || !protocolContract) return;
    if (!canManageProduct) {
      toast.error("【manager管理员】仅可查看，不能编辑/下架产品");
      return;
    }
    if (!tierConfigEditable) {
      if (isCreatingTierSpec) {
        toast.error("当前链上版本不支持新增矿机规格");
        return;
      }
      if (editingTierSpec.id < 0 || editingTierSpec.id > 3) {
        toast.error("旧版协议仅支持编辑 0-3 档矿机周期");
        return;
      }

      const cycleByTier: Record<number, number> = {
        0: Number(tierSpecs.find((s) => s.id === 0)?.cycleDays ?? 0),
        1: Number(tierSpecs.find((s) => s.id === 1)?.cycleDays ?? 0),
        2: Number(tierSpecs.find((s) => s.id === 2)?.cycleDays ?? 0),
        3: Number(tierSpecs.find((s) => s.id === 3)?.cycleDays ?? 0),
      };
      cycleByTier[editingTierSpec.id] = Number(editingTierSpec.cycleDays || 0);

      if (Object.values(cycleByTier).some((v) => !Number.isFinite(v) || v <= 0)) {
        toast.error("周期(天)必须为正整数");
        return;
      }

      try {
        const tx = await (protocolContract as any).setMinerCycleDays(
          cycleByTier[0],
          cycleByTier[1],
          cycleByTier[2],
          cycleByTier[3]
        );
        await tx.wait();
        closeTierSpecModal();
        toast.success("已保存链上矿机周期配置");
        await fetchTierSpecs();
      } catch (err: any) {
        toast.error(err?.reason || err?.message || "保存矿机周期失败");
      }
      return;
    }

    if (editingTierSpec.id < 0 || editingTierSpec.id > 255) {
      toast.error("规格 ID 必须在 0-255 之间");
      return;
    }

    if (isCreatingTierSpec && tierSpecs.some((s) => s.id === editingTierSpec.id)) {
      toast.error("规格 ID 已存在，请更换后重试");
      return;
    }

    try {
      const tx = await (protocolContract as any).setMinerTierConfig(
        editingTierSpec.id,
        ethers.parseUnits(editingTierSpec.priceUsdt || "0", usdtDecimals),
        Math.round(Number(editingTierSpec.multiplier || "0") * 1000),
        Number(editingTierSpec.cycleDays || "0"),
        ethers.parseUnits(editingTierSpec.bVaultUsdt || "0", usdtDecimals),
        editingTierSpec.enabled
      );
      await tx.wait();

      const inventoryTx = await (protocolContract as any).setMinerTierInventory(
        editingTierSpec.id,
        editingTierSpec.sold,
        editingTierSpec.total
      );
      await inventoryTx.wait();

      closeTierSpecModal();
      toast.success(isCreatingTierSpec ? "矿机规格已新增" : "矿机规格已保存到链上");
      await fetchTierSpecs();
    } catch (err: any) {
      toast.error(err?.reason || err?.message || "保存矿机规格失败");
    }
  }, [editingTierSpec, protocolContract, usdtDecimals, fetchTierSpecs, isCreatingTierSpec, tierSpecs, closeTierSpecModal, tierConfigEditable, canManageProduct]);

  const handleDeleteTierSpec = useCallback(async (spec: MinerTierSpec) => {
    if (!protocolContract) return;
    if (!canManageProduct) {
      toast.error("【manager管理员】仅可查看，不能编辑/下架产品");
      return;
    }
    if (!tierConfigEditable) {
      toast.error("当前链上版本仅支持回显，暂不支持矿机规格编辑，请先升级协议");
      return;
    }
    if (!window.confirm(`确定删除矿机规格 #${spec.id} 吗？此操作会将该规格清零并下架。`)) return;

    try {
      const tx = await (protocolContract as any).setMinerTierConfig(spec.id, 0, 0, 0, 0, false);
      await tx.wait();
      const inventoryTx = await (protocolContract as any).setMinerTierInventory(spec.id, 0, 0);
      await inventoryTx.wait();
      toast.success(`矿机规格 #${spec.id} 已删除`);
      await fetchTierSpecs();
    } catch (err: any) {
      toast.error(err?.reason || err?.message || "删除矿机规格失败");
    }
  }, [protocolContract, fetchTierSpecs, tierConfigEditable, canManageProduct]);

  // 查询用户的所有矿机
  const fetchUserMiners = useCallback(async (targetAddress: string, options?: { silent?: boolean; skipLoading?: boolean }) => {
    if (!protocolContract || !targetAddress) {
      if (!options?.silent) {
        toast.error("请输入用户地址");
      }
      return;
    }

    if (!options?.skipLoading) {
      setLoading(true);
    }
    try {
      const count = await protocolContract.getUserMinerCount(targetAddress);
      const minerList: MinerRecord[] = [];

      for (let i = 0; i < Number(count); i++) {
        try {
          const miner = await protocolContract.getUserMiner(targetAddress, i);
          minerList.push({
            address: targetAddress,
            minerId: i,
            tier: Number(miner.tier ?? miner[0]),
            costUsdt: miner.costUsdt ?? miner[1],
            vaultA: miner.vaultA_usdt ?? miner[2],
            vaultB: miner.vaultB_usdt ?? miner[3],
            active: miner.active ?? miner[8],
            purchaseTime: Number(miner.purchaseTime ?? miner[4]),
            lastClaimTime: Number(miner.lastClaimTime ?? miner[5]),
            totalClaimed: miner.totalClaimed ?? miner[6],
            isAutoGifted: miner.isAutoGifted ?? false,
            cycleDays: Number(miner.cycleDays ?? 0),
          });
        } catch (err) {
          console.error(`Failed to fetch miner ${i}:`, err);
        }
      }

      setMiners(minerList);
      setCurrentPage(1);
      if (!options?.silent) {
        toast.success(`已查询 ${minerList.length} 个矿机`);
      }
    } catch (err: any) {
      if (!options?.silent) {
        toast.error(err?.reason || "查询失败");
      }
    } finally {
      if (!options?.skipLoading) {
        setLoading(false);
      }
    }
  }, [protocolContract]);

  const fetchUserNodeLots = useCallback(async (targetAddress: string, options?: { silent?: boolean; skipLoading?: boolean }) => {
    if (!minerNodeContract) return;

    if (!options?.skipLoading) {
      setNodeLoading(true);
    }
    try {
      const lots = await (minerNodeContract as any).getUserNodeLots(targetAddress);
      const parsed: NodeLotRecord[] = (lots || []).map((lot: any) => ({
        lotId: Number(lot.lotId ?? lot[0]),
        tier: Number(lot.tier ?? lot[1]),
        weight: BigInt(lot.weight ?? lot[2]),
        costUsdt: BigInt(lot.costUsdt ?? lot[3]),
        allocatedRights: BigInt(lot.allocatedRights ?? lot[4]),
        claimedRights: BigInt(lot.claimedRights ?? lot[5]),
        pendingRights: BigInt(lot.pendingRights ?? lot[6]),
        purchaseTime: Number(lot.purchaseTime ?? lot[7]),
        protectedUntil: Number(lot.protectedUntil ?? lot[8]),
        active: Boolean(lot.active ?? lot[9]),
      }));
      setNodeLots(parsed);
    } catch (err: any) {
      if (!options?.silent) {
        toast.error(err?.reason || err?.message || "节点Lot查询失败");
      }
    } finally {
      if (!options?.skipLoading) {
        setNodeLoading(false);
      }
    }
  }, [minerNodeContract]);

  const handleSearch = useCallback(async () => {
    const target = searchAddress.trim();
    if (!target) {
      toast.error("请输入用户地址");
      return;
    }
    if (!ethers.isAddress(target)) {
      toast.error("地址格式无效");
      return;
    }

    setTrackedAddress(target);
    await Promise.all([
      fetchUserMiners(target),
      fetchUserNodeLots(target),
    ]);
  }, [searchAddress, fetchUserMiners, fetchUserNodeLots]);

  useEffect(() => {
    if (!trackedAddress) return;

    const timer = setInterval(() => {
      void fetchTierSpecs();
      void fetchUserMiners(trackedAddress, { silent: true, skipLoading: true });
      void fetchUserNodeLots(trackedAddress, { silent: true, skipLoading: true });
    }, 15000);

    return () => clearInterval(timer);
  }, [trackedAddress, fetchTierSpecs, fetchUserMiners, fetchUserNodeLots]);

  // 编辑矿机
  const handleEditMiner = (miner: MinerRecord) => {
    if (!canManageProduct) {
      toast.error("【manager管理员】仅可查看，不能编辑/下架产品");
      return;
    }
    const costUsdtFormatted = ethers.formatUnits(miner.costUsdt, usdtDecimals);
    const vaultAFormatted = ethers.formatUnits(miner.vaultA, usdtDecimals);
    const vaultBFormatted = ethers.formatUnits(miner.vaultB, usdtDecimals);
    setSelectedMiner({
      minerId: miner.minerId,
      address: miner.address,
      tier: miner.tier,
      costUsdt: costUsdtFormatted,
      vaultA: vaultAFormatted,
      vaultB: vaultBFormatted,
      cycleDays: String(miner.cycleDays),
      active: miner.active,
      originalActive: miner.active,
      originalTier: miner.tier,
      originalCostUsdt: costUsdtFormatted,
      originalVaultA: vaultAFormatted,
      originalVaultB: vaultBFormatted,
      originalCycleDays: String(miner.cycleDays),
    });
    setShowDetail(true);
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!selectedMiner || !protocolContract) return;
    if (!canManageProduct) {
      toast.error("【manager管理员】仅可查看，不能编辑/下架产品");
      return;
    }

    setLoading(true);
    try {
      let hasChanges = false;
      let successCount = 0;

      // 编辑等级
      if (Number(selectedMiner.tier) !== Number(selectedMiner.originalTier)) {
        try {
          const tx = await (protocolContract as any).editMinerTier(
            selectedMiner.address,
            selectedMiner.minerId,
            Number(selectedMiner.tier)
          );
          await tx.wait();
          successCount++;
          hasChanges = true;
        } catch (err: any) {
          console.error("Failed to edit tier:", err);
          toast.error(`编辑等级失败: ${err?.reason || err?.message}`);
        }
      }

      // 编辑成本
      if (selectedMiner.costUsdt !== selectedMiner.originalCostUsdt) {
        try {
          const costAmount = ethers.parseUnits(selectedMiner.costUsdt, usdtDecimals);
          const tx = await (protocolContract as any).editMinerCost(
            selectedMiner.address,
            selectedMiner.minerId,
            costAmount
          );
          await tx.wait();
          successCount++;
          hasChanges = true;
        } catch (err: any) {
          console.error("Failed to edit cost:", err);
          toast.error(`编辑成本失败: ${err?.reason || err?.message}`);
        }
      }

      // 编辑金库A
      if (selectedMiner.vaultA !== selectedMiner.originalVaultA) {
        try {
          const vaultAmount = ethers.parseUnits(selectedMiner.vaultA, usdtDecimals);
          const tx = await (protocolContract as any).editMinerVaultA(
            selectedMiner.address,
            selectedMiner.minerId,
            vaultAmount
          );
          await tx.wait();
          successCount++;
          hasChanges = true;
        } catch (err: any) {
          console.error("Failed to edit vault A:", err);
          toast.error(`编辑金库A失败: ${err?.reason || err?.message}`);
        }
      }

      // 编辑金库B
      if (selectedMiner.vaultB !== selectedMiner.originalVaultB) {
        try {
          const vaultAmount = ethers.parseUnits(selectedMiner.vaultB, usdtDecimals);
          const tx = await (protocolContract as any).editMinerVaultB(
            selectedMiner.address,
            selectedMiner.minerId,
            vaultAmount
          );
          await tx.wait();
          successCount++;
          hasChanges = true;
        } catch (err: any) {
          console.error("Failed to edit vault B:", err);
          toast.error(`编辑金库B失败: ${err?.reason || err?.message}`);
        }
      }

      // 编辑释放周期
      if (selectedMiner.cycleDays !== selectedMiner.originalCycleDays) {
        try {
          const tx = await (protocolContract as any).editMinerCycleDays(
            selectedMiner.address,
            selectedMiner.minerId,
            Number(selectedMiner.cycleDays)
          );
          await tx.wait();
          successCount++;
          hasChanges = true;
        } catch (err: any) {
          console.error("Failed to edit cycle days:", err);
          toast.error(`编辑释放周期失败: ${err?.reason || err?.message}`);
        }
      }

      // 编辑激活状态
      if (selectedMiner.active !== selectedMiner.originalActive) {
        try {
          const actionFn = selectedMiner.active ? "activateMiner" : "deactivateMiner";
          const tx = await (protocolContract as any)[actionFn](
            selectedMiner.address,
            selectedMiner.minerId
          );
          await tx.wait();
          successCount++;
          hasChanges = true;
        } catch (err: any) {
          console.error("Failed to edit status:", err);
          toast.error(`编辑状态失败: ${err?.reason || err?.message}`);
        }
      }

      if (hasChanges) {
        toast.success(`成功编辑 ${successCount} 项属性`);
        await fetchUserMiners(selectedMiner.address);
        setSelectedMiner(null);
        setShowDetail(false);
      } else {
        toast("未检测到变更");
      }
    } catch (err: any) {
      console.error("Unexpected error:", err);
      toast.error(err?.reason || "保存失败");
    } finally {
      setLoading(false);
    }
  };

  // 删除矿机
  const handleDeleteMiner = async (miner: MinerRecord) => {
    if (!canManageProduct) {
      toast.error("【manager管理员】仅可查看，不能编辑/下架产品");
      return;
    }
    if (!window.confirm(`确定要删除这个矿机吗？地址: ${miner.address.slice(0, 10)}...`)) {
      return;
    }

    setLoading(true);
    try {
      if (typeof (protocolContract as any).removeMiner === "function") {
        const tx = await (protocolContract as any).removeMiner(miner.address, miner.minerId);
        await tx.wait();
        toast.success("矿机已删除");
        await fetchUserMiners(miner.address);
      } else {
        toast.error("协议合约未暴露删除矿机函数");
      }
    } catch (err: any) {
      toast.error(err?.reason || "删除失败");
    } finally {
      setLoading(false);
    }
  };

  // 批量禁用
  const handleBatchDisable = async () => {
    if (!canManageProduct) {
      toast.error("【manager管理员】仅可查看，不能编辑/下架产品");
      return;
    }
    if (!protocolContract) return;
    const activeMiners = miners.filter(m => m.active);
    
    if (activeMiners.length === 0) {
      toast.error("没有活跃矿机可禁用");
      return;
    }

    if (!window.confirm(`确定要禁用 ${activeMiners.length} 个矿机吗？`)) return;

    setLoading(true);
    try {
      let successCount = 0;
      for (const miner of activeMiners) {
        try {
          if (typeof (protocolContract as any).deactivateMiner === "function") {
            const tx = await (protocolContract as any).deactivateMiner(
              miner.address,
              miner.minerId
            );
            await tx.wait();
            successCount++;
          }
        } catch (err) {
          console.error(`Failed to disable miner ${miner.minerId}:`, err);
        }
      }
      toast.success(`已禁用 ${successCount} 个矿机`);
      if (searchAddress.trim()) {
        await fetchUserMiners(searchAddress.trim());
      }
    } catch (err: any) {
      toast.error(err?.reason || "批量操作失败");
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivateNodeLot = async (lotId: number) => {
    if (!canManageProduct) {
      toast.error("【manager管理员】仅可查看，不能编辑/下架产品");
      return;
    }
    const owner = searchAddress.trim();
    if (!protocolContract || !owner) return;
    if (!window.confirm(`确定禁用节点 Lot #${lotId} 吗？`)) return;

    setNodeLoading(true);
    try {
      if (typeof (protocolContract as any).adminDeactivateNodeLot !== "function") {
        toast.error("协议合约未暴露节点Lot禁用函数");
        return;
      }

      const tx = await (protocolContract as any).adminDeactivateNodeLot(owner, lotId);
      await tx.wait();
      toast.success(`节点Lot #${lotId} 已禁用`);
      await fetchUserNodeLots(owner);
    } catch (err: any) {
      toast.error(err?.reason || err?.message || "禁用节点Lot失败");
    } finally {
      setNodeLoading(false);
    }
  };

  // 分页
  const paginatedMiners = miners.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  const totalPages = Math.ceil(miners.length / pageSize);

  const tierNames = ["Basic", "V1", "V2", "V3"];

  return (
    <div className="space-y-4">
      {/* 矿机规格管理 */}
      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold text-lg">矿机规格管理</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreateTierSpec}
              disabled={!canManageProduct || !tierConfigEditable}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-sm hover:bg-emerald-500/30 transition inline-flex items-center gap-1 disabled:opacity-50"
            >
              <Plus size={14} /> 新增
            </button>
            <button
              onClick={fetchTierSpecs}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-indigo-400/30 text-white text-sm hover:bg-indigo-500/20 transition inline-flex items-center gap-1"
            >
              <RefreshCw size={14} /> 刷新
            </button>
          </div>
        </div>

        {!tierConfigEditable && (
          <p className="text-amber-300 text-xs">
            当前链上协议为旧版接口：已回显真实矿机配置（来自 getMinerTierInfo），但规格编辑需升级协议到支持 setMinerTierConfig。
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-indigo-500/25">
                <th className="text-left px-3 py-2 text-slate-400">ID</th>
                <th className="text-left px-3 py-2 text-slate-400">名称</th>
                <th className="text-left px-3 py-2 text-slate-400">价格(U)</th>
                <th className="text-left px-3 py-2 text-slate-400">倍率</th>
                <th className="text-left px-3 py-2 text-slate-400">周期(天)</th>
                <th className="text-left px-3 py-2 text-slate-400">B仓(U)</th>
                <th className="text-left px-3 py-2 text-slate-400">已售/总量</th>
                <th className="text-left px-3 py-2 text-slate-400">状态</th>
                <th className="text-left px-3 py-2 text-slate-400">操作</th>
              </tr>
            </thead>
            <tbody>
              {tierSpecs.map((spec) => (
                <tr key={spec.id} className="border-b border-indigo-500/10 hover:bg-indigo-500/5 transition">
                  <td className="px-3 py-2 text-white">{spec.id}</td>
                  <td className="px-3 py-2 text-white">{spec.name}</td>
                  <td className="px-3 py-2 text-white">{spec.priceUsdt}</td>
                  <td className="px-3 py-2 text-white">{spec.multiplier}x</td>
                  <td className="px-3 py-2 text-white">{spec.cycleDays}</td>
                  <td className="px-3 py-2 text-white">{spec.bVaultUsdt}</td>
                  <td className="px-3 py-2 text-white">{spec.sold}/{spec.total}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${spec.enabled ? "bg-amber-400/20 text-amber-300" : "bg-slate-500/20 text-slate-300"}`}>
                      {spec.enabled ? "已上架" : "下架"}
                    </span>
                  </td>
                  <td className="px-3 py-2 flex items-center gap-2">
                    <button
                      onClick={() => handleToggleTierSpec(spec)}
                      disabled={!canManageProduct}
                      className={`px-2 py-1 rounded text-xs ${spec.enabled ? "bg-red-500/20 text-red-300 hover:bg-red-500/30" : "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"} disabled:opacity-50`}
                    >
                      {spec.enabled ? "下架" : "上架"}
                    </button>
                    <button
                      onClick={() => handleEditTierSpec(spec)}
                      disabled={!canManageProduct}
                      className="px-2 py-1 rounded text-xs bg-white/5 text-white hover:bg-indigo-500/20 disabled:opacity-50"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDeleteTierSpec(spec)}
                      disabled={!canManageProduct}
                      className="px-2 py-1 rounded text-xs bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 disabled:opacity-50"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
              {tierSpecs.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-4 text-center text-slate-400">暂无规格数据</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 搜索区 */}
      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4 space-y-3">
        <h3 className="text-white font-bold text-lg flex items-center gap-2">
          <Search size={18} /> 矿机查询与编辑
        </h3>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="输入用户钱包地址 (0x...)"
            value={searchAddress}
            onChange={(e) => setSearchAddress(e.target.value)}
            className="flex-1 px-3 py-2 bg-[#13102B]/70 border border-indigo-500/25 rounded-lg text-white placeholder-slate-500"
          />
          <AnimatedButton
            onClick={handleSearch}
            loading={loading || nodeLoading}
            variant="primary"
            className="px-4 py-2"
          >
            查询
          </AnimatedButton>
        </div>
      </div>

      {/* 矿机列表 */}
      {miners.length > 0 && (
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-bold">
              查询结果: {miners.length} 个矿机
            </h3>
            <AnimatedButton
              onClick={handleBatchDisable}
              loading={loading}
              disabled={!canManageProduct}
              variant="danger"
              className="px-3 py-1 text-xs"
            >
              批量禁用活跃矿机
            </AnimatedButton>
          </div>

          {/* 表格 */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-indigo-500/25">
                  <th className="text-left px-3 py-2 text-slate-400">矿机ID</th>
                  <th className="text-left px-3 py-2 text-slate-400">等级</th>
                  <th className="text-left px-3 py-2 text-slate-400">成本(USDT)</th>
                  <th className="text-left px-3 py-2 text-slate-400">A仓(USDT)</th>
                  <th className="text-left px-3 py-2 text-slate-400">B仓(USDT)</th>
                  <th className="text-left px-3 py-2 text-slate-400">状态</th>
                  <th className="text-left px-3 py-2 text-slate-400">购买时间</th>
                  <th className="text-left px-3 py-2 text-slate-400">操作</th>
                </tr>
              </thead>
              <tbody>
                {paginatedMiners.map((miner, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-indigo-500/10 hover:bg-indigo-500/5 transition"
                  >
                    <td className="px-3 py-2 text-white font-mono">#{miner.minerId}</td>
                    <td className="px-3 py-2 text-amber-400 font-semibold">
                      {tierNames[miner.tier] || `T${miner.tier}`}
                      {miner.isAutoGifted && <span className="text-xs text-cyan-400 ml-1">(赠)</span>}
                    </td>
                    <td className="px-3 py-2 text-white">
                      {Number(ethers.formatUnits(miner.costUsdt, usdtDecimals)).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-emerald-400">
                      {Number(ethers.formatUnits(miner.vaultA, usdtDecimals)).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-blue-400">
                      {Number(ethers.formatUnits(miner.vaultB, usdtDecimals)).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          miner.active
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-slate-500/20 text-slate-300"
                        }`}
                      >
                        {miner.active ? "活跃" : "已禁用"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-400 text-xs">
                      {new Date(miner.purchaseTime * 1000).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 flex gap-1">
                      <button
                        onClick={() => handleEditMiner(miner)}
                        disabled={!canManageProduct}
                        className="p-1 rounded hover:bg-indigo-500/20 transition disabled:opacity-50"
                        title="编辑"
                      >
                        <Edit2 size={14} className="text-indigo-400" />
                      </button>
                      <button
                        onClick={() => handleDeleteMiner(miner)}
                        disabled={!canManageProduct}
                        className="p-1 rounded hover:bg-red-500/20 transition disabled:opacity-50"
                        title="删除"
                      >
                        <Trash2 size={14} className="text-red-400" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-2 py-1 rounded border border-indigo-500/25 text-sm text-slate-400 disabled:opacity-50"
              >
                上一页
              </button>
              <span className="text-sm text-slate-400">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-2 py-1 rounded border border-indigo-500/25 text-sm text-slate-400 disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          )}
        </div>
      )}

      {/* 节点 Lot 列表 */}
      {nodeLots.length > 0 && (
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4 space-y-3">
          <h3 className="text-white font-bold flex items-center gap-2">
            <Layers size={16} className="text-cyan-400" />
            节点 Lot 管理: {nodeLots.length} 条
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-indigo-500/25">
                  <th className="text-left px-3 py-2 text-slate-400">LotID</th>
                  <th className="text-left px-3 py-2 text-slate-400">等级</th>
                  <th className="text-left px-3 py-2 text-slate-400">成本(USDT)</th>
                  <th className="text-left px-3 py-2 text-slate-400">币权已领/总额</th>
                  <th className="text-left px-3 py-2 text-slate-400">状态</th>
                  <th className="text-left px-3 py-2 text-slate-400">操作</th>
                </tr>
              </thead>
              <tbody>
                {nodeLots.map((lot) => (
                  <tr key={lot.lotId} className="border-b border-indigo-500/10 hover:bg-indigo-500/5 transition">
                    <td className="px-3 py-2 text-white font-mono">#{lot.lotId}</td>
                    <td className="px-3 py-2 text-amber-400">V{lot.tier}</td>
                    <td className="px-3 py-2 text-white">
                      {Number(ethers.formatUnits(lot.costUsdt, usdtDecimals)).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {Number(ethers.formatEther(lot.claimedRights)).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                      /
                      {Number(ethers.formatEther(lot.allocatedRights)).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          lot.active
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-slate-500/20 text-slate-300"
                        }`}
                      >
                        {lot.active ? "活跃" : "已禁用"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        disabled={!canManageProduct || !lot.active || nodeLoading}
                        onClick={() => handleDeactivateNodeLot(lot.lotId)}
                        className="p-1 rounded hover:bg-red-500/20 transition disabled:opacity-50"
                        title="禁用节点Lot"
                      >
                        <Ban size={14} className="text-red-400" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 编辑模态框 */}
      {showDetail && selectedMiner && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1A1532] border border-indigo-500/25 rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-lg">编辑矿机属性</h3>
              <button
                onClick={() => setShowDetail(false)}
                className="p-1 hover:bg-indigo-500/20 rounded"
              >
                <X size={16} className="text-slate-400" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <label className="text-slate-400 block mb-1">地址</label>
                <p className="text-white font-mono text-xs break-all bg-slate-800/50 px-2 py-1.5 rounded">
                  {selectedMiner.address}
                </p>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">矿机ID</label>
                <p className="text-white bg-slate-800/50 px-2 py-1.5 rounded">#{selectedMiner.minerId}</p>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">等级 <span className="text-red-400">*可编辑</span></label>
                <select
                  value={selectedMiner.tier}
                  onChange={(e) =>
                    setSelectedMiner({
                      ...selectedMiner,
                      tier: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-800/50 border border-indigo-500/30 rounded text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="0">Basic</option>
                  <option value="1">V1</option>
                  <option value="2">V2</option>
                  <option value="3">V3</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">成本 (USDT) <span className="text-red-400">*可编辑</span></label>
                <input
                  type="number"
                  step="0.01"
                  value={selectedMiner.costUsdt}
                  onChange={(e) =>
                    setSelectedMiner({
                      ...selectedMiner,
                      costUsdt: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-800/50 border border-indigo-500/30 rounded text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">金库A (USDT) <span className="text-red-400">*可编辑</span></label>
                <input
                  type="number"
                  step="0.01"
                  value={selectedMiner.vaultA}
                  onChange={(e) =>
                    setSelectedMiner({
                      ...selectedMiner,
                      vaultA: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-800/50 border border-indigo-500/30 rounded text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">金库B (USDT) <span className="text-red-400">*可编辑</span></label>
                <input
                  type="number"
                  step="0.01"
                  value={selectedMiner.vaultB}
                  onChange={(e) =>
                    setSelectedMiner({
                      ...selectedMiner,
                      vaultB: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-800/50 border border-indigo-500/30 rounded text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">释放周期 (天) <span className="text-red-400">*可编辑</span></label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={selectedMiner.cycleDays}
                  onChange={(e) =>
                    setSelectedMiner({
                      ...selectedMiner,
                      cycleDays: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-800/50 border border-indigo-500/30 rounded text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-indigo-500/15">
                <input
                  type="checkbox"
                  id="miner-active"
                  checked={selectedMiner.active}
                  onChange={(e) =>
                    setSelectedMiner({
                      ...selectedMiner,
                      active: e.target.checked,
                    })
                  }
                  className="w-4 h-4"
                />
                <label htmlFor="miner-active" className="text-slate-300 cursor-pointer">
                  激活状态 (停用时会禁止挖矿)
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t border-indigo-500/15">
              <AnimatedButton
                onClick={handleSaveEdit}
                loading={loading}
                disabled={!canManageProduct}
                variant="primary"
                className="flex-1 py-2 text-sm"
              >
                <Save size={14} className="inline mr-1" /> 保存更改
              </AnimatedButton>
              <button
                onClick={() => setShowDetail(false)}
                className="flex-1 px-3 py-2 rounded border border-slate-500/25 text-white text-sm hover:bg-slate-500/10"
              >
                取消
              </button>
            </div>

            <p className="text-xs text-slate-500 text-center pt-2 border-t border-slate-700">
              💡 标记为 *可编辑 的属性支持修改。所有变更直接通过链上合约生效。
            </p>
          </div>
        </div>
      )}

      {/* 规格编辑模态 */}
      {showTierSpecModal && editingTierSpec && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1A1532] border border-indigo-500/25 rounded-xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-lg">{isCreatingTierSpec ? "新增矿机规格" : "编辑矿机规格"}</h3>
              <button onClick={closeTierSpecModal} className="p-1 rounded hover:bg-indigo-500/20">
                <X size={16} className="text-slate-400" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <label className="text-slate-400 block mb-1">ID</label>
                <input
                  type="number"
                  min="0"
                  max="255"
                  disabled={!isCreatingTierSpec}
                  value={editingTierSpec.id}
                  onChange={(e) => setEditingTierSpec({ ...editingTierSpec, id: Number(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-800/50 border border-indigo-500/30 rounded text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">名称</label>
                <input
                  disabled={!isCreatingTierSpec}
                  value={editingTierSpec.name}
                  onChange={(e) => setEditingTierSpec({ ...editingTierSpec, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800/50 border border-indigo-500/30 rounded text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">价格(U)</label>
                <input
                  type="number"
                  disabled={!tierConfigEditable}
                  value={editingTierSpec.priceUsdt}
                  onChange={(e) => setEditingTierSpec({ ...editingTierSpec, priceUsdt: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800/50 border border-indigo-500/30 rounded text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">倍率</label>
                <input
                  type="number"
                  step="0.1"
                  disabled={!tierConfigEditable}
                  value={editingTierSpec.multiplier}
                  onChange={(e) => setEditingTierSpec({ ...editingTierSpec, multiplier: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800/50 border border-indigo-500/30 rounded text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">周期(天)</label>
                <input
                  type="number"
                  min="1"
                  value={editingTierSpec.cycleDays}
                  onChange={(e) => setEditingTierSpec({ ...editingTierSpec, cycleDays: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800/50 border border-indigo-500/30 rounded text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">B仓(U)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={!tierConfigEditable}
                  value={editingTierSpec.bVaultUsdt}
                  onChange={(e) => setEditingTierSpec({ ...editingTierSpec, bVaultUsdt: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800/50 border border-indigo-500/30 rounded text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">已售</label>
                  <input
                    type="number"
                    min="0"
                    disabled={!tierConfigEditable}
                    value={editingTierSpec.sold}
                    onChange={(e) => setEditingTierSpec({ ...editingTierSpec, sold: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-indigo-500/30 rounded text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">总量</label>
                  <input
                    type="number"
                    min="0"
                    disabled={!tierConfigEditable}
                    value={editingTierSpec.total}
                    onChange={(e) => setEditingTierSpec({ ...editingTierSpec, total: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-indigo-500/30 rounded text-white"
                  />
                </div>
              </div>

              {!tierConfigEditable && (
                <p className="text-amber-300 text-xs">
                  旧版协议可编辑项仅包含“周期(天)”，其余字段为只读回显。
                </p>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <AnimatedButton onClick={handleSaveTierSpec} disabled={!canManageProduct} variant="primary" className="flex-1 py-2 text-sm">
                <Save size={14} className="inline mr-1" /> 保存
              </AnimatedButton>
              <button
                onClick={closeTierSpecModal}
                className="flex-1 px-3 py-2 rounded border border-slate-500/25 text-white text-sm hover:bg-slate-500/10"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminMinerManager;
