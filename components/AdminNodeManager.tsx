import { ethers } from "ethers";
import { Ban, Edit2, Layers, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useWeb3 } from "../src/Web3Context";
import AnimatedButton from "./AnimatedButton";

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

interface NodeEditForm {
  address: string;
  lotId: number;
  tier: number;
  weight: string;
  costUsdt: string;
  originalTier: number;
  originalWeight: string;
  originalCostUsdt: string;
}

interface NodeTierSpec {
  id: number;
  name: string;
  priceUsdt: string;
  weight: number;
  rightsSeer: string;
  sold: number;
  total: number;
  enabled: boolean;
}

const NODE_TIER_NAMES: Record<number, string> = {
  1: "V1 节点",
  2: "V2 节点",
  3: "V3 节点",
};

const DEFAULT_NODE_SPEC = (id: number): NodeTierSpec => ({
  id,
  name: NODE_TIER_NAMES[id] || `Tier ${id}`,
  priceUsdt: "0",
  weight: 1,
  rightsSeer: "0",
  sold: 0,
  total: 0,
  enabled: true,
});

const AdminNodeManager: React.FC = () => {
  const { protocolContract, minerNodeContract, usdtDecimals, adminRole } = useWeb3();

  const canManageProduct = adminRole === "SUPER_ADMIN";

  const [nodeLots, setNodeLots] = useState<NodeLotRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchAddress, setSearchAddress] = useState("");
  const [trackedAddress, setTrackedAddress] = useState("");
  const [selectedNodeLot, setSelectedNodeLot] = useState<NodeLotRecord | null>(null);
  const [editForm, setEditForm] = useState<NodeEditForm | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [pageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [tierSpecs, setTierSpecs] = useState<NodeTierSpec[]>([]);
  const [editingTierSpec, setEditingTierSpec] = useState<NodeTierSpec | null>(null);
  const [showTierSpecModal, setShowTierSpecModal] = useState(false);
  const [isCreatingTierSpec, setIsCreatingTierSpec] = useState(false);

  const fetchTierSpecs = useCallback(async () => {
    if (!protocolContract || !minerNodeContract) return;

    try {
      const tierIds = [1, 2, 3];
      const results = await Promise.allSettled(
        tierIds.map(async (tierId) => {
          const [nodeConfig, minerConfig] = await Promise.all([
            (minerNodeContract as any).getNodeTierConfig(tierId),
            (protocolContract as any).getMinerTierConfig(tierId),
          ]);

          return {
            id: tierId,
            name: NODE_TIER_NAMES[tierId] || `Tier ${tierId}`,
            priceUsdt: ethers.formatUnits(minerConfig.costUsdt ?? minerConfig[0], usdtDecimals),
            weight: Number(nodeConfig.weight ?? nodeConfig[0]),
            rightsSeer: ethers.formatEther(nodeConfig.allocatedRights ?? nodeConfig[1]),
            sold: Number(nodeConfig.soldCount ?? nodeConfig[3]),
            total: Number(nodeConfig.maxCount ?? nodeConfig[2]),
            enabled: (() => {
              const rawEnabled = nodeConfig.enabled ?? nodeConfig[4];
              const isZeroState =
                Number(nodeConfig.weight ?? nodeConfig[0] ?? 0) === 0 &&
                BigInt(nodeConfig.allocatedRights ?? nodeConfig[1] ?? 0) === 0n &&
                Number(nodeConfig.maxCount ?? nodeConfig[2] ?? 0) === 0 &&
                Number(nodeConfig.soldCount ?? nodeConfig[3] ?? 0) === 0;
              return isZeroState ? true : Boolean(rawEnabled);
            })(),
          } satisfies NodeTierSpec;
        })
      );

      const failed: number[] = [];
      const specs = tierIds.map((tierId, idx) => {
        const item = results[idx];
        if (item.status === "fulfilled") {
          return item.value;
        }
        failed.push(tierId);
        return DEFAULT_NODE_SPEC(tierId);
      });

      setTierSpecs(specs);
      if (failed.length > 0) {
        toast.error(`部分节点规格读取失败，已回显默认值: ${failed.join(",")}`);
      }
    } catch (err: any) {
      toast.error(err?.reason || err?.message || "获取节点规格失败");
      setTierSpecs([1, 2, 3].map((tierId) => DEFAULT_NODE_SPEC(tierId)));
    }
  }, [protocolContract, minerNodeContract, usdtDecimals]);

  useEffect(() => {
    fetchTierSpecs();
  }, [fetchTierSpecs]);

  const handleEditTierSpec = useCallback((spec: NodeTierSpec) => {
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
    const nextId = tierSpecs.length > 0 ? Math.max(...tierSpecs.map((s) => s.id)) + 1 : 4;
    setIsCreatingTierSpec(true);
    setEditingTierSpec({
      ...DEFAULT_NODE_SPEC(nextId),
      name: `Tier ${nextId}`,
      enabled: true,
    });
    setShowTierSpecModal(true);
  }, [tierSpecs, canManageProduct]);

  const closeTierSpecModal = useCallback(() => {
    setShowTierSpecModal(false);
    setEditingTierSpec(null);
    setIsCreatingTierSpec(false);
  }, []);

  const handleToggleTierSpec = useCallback(async (spec: NodeTierSpec) => {
    if (!minerNodeContract) return;
    if (!canManageProduct) {
      toast.error("【manager管理员】仅可查看，不能编辑/下架产品");
      return;
    }

    try {
      const tx = await (minerNodeContract as any).setNodeTierConfig(
        spec.id,
        spec.weight,
        ethers.parseEther(spec.rightsSeer || "0"),
        spec.total,
        !spec.enabled
      );
      await tx.wait();
      toast.success("节点规格状态已更新");
      await fetchTierSpecs();
    } catch (err: any) {
      toast.error(err?.reason || err?.message || "更新节点规格状态失败");
    }
  }, [minerNodeContract, fetchTierSpecs, canManageProduct]);

  const handleSaveTierSpec = useCallback(async () => {
    if (!editingTierSpec || !protocolContract || !minerNodeContract) return;
    if (!canManageProduct) {
      toast.error("【manager管理员】仅可查看，不能编辑/下架产品");
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
      const currentMinerConfig = await (protocolContract as any).getMinerTierConfig(editingTierSpec.id).catch(() => null);
      const baseMinerConfig = await (protocolContract as any).getMinerTierConfig(1).catch(() => null);

      const multiplier = currentMinerConfig?.multiplier ?? currentMinerConfig?.[1] ?? baseMinerConfig?.multiplier ?? baseMinerConfig?.[1] ?? 1000;
      const cycleDays = currentMinerConfig?.cycleDays ?? currentMinerConfig?.[2] ?? baseMinerConfig?.cycleDays ?? baseMinerConfig?.[2] ?? 365;
      const bVaultUsdt = currentMinerConfig?.bVaultUsdt ?? currentMinerConfig?.[3] ?? baseMinerConfig?.bVaultUsdt ?? baseMinerConfig?.[3] ?? 0;

      const priceTx = await (protocolContract as any).setMinerTierConfig(
        editingTierSpec.id,
        ethers.parseUnits(editingTierSpec.priceUsdt || "0", usdtDecimals),
        multiplier,
        cycleDays,
        bVaultUsdt,
        editingTierSpec.enabled
      );
      await priceTx.wait();

      const nodeTx = await (minerNodeContract as any).setNodeTierConfig(
        editingTierSpec.id,
        editingTierSpec.weight,
        ethers.parseEther(editingTierSpec.rightsSeer || "0"),
        editingTierSpec.total,
        editingTierSpec.enabled
      );
      await nodeTx.wait();

      closeTierSpecModal();
      toast.success(isCreatingTierSpec ? "节点规格已新增" : "节点规格已保存到链上");
      await fetchTierSpecs();
    } catch (err: any) {
      toast.error(err?.reason || err?.message || "保存节点规格失败");
    }
  }, [editingTierSpec, protocolContract, minerNodeContract, usdtDecimals, fetchTierSpecs, isCreatingTierSpec, tierSpecs, closeTierSpecModal, canManageProduct]);

  const handleDeleteTierSpec = useCallback(async (spec: NodeTierSpec) => {
    if (!protocolContract || !minerNodeContract) return;
    if (!canManageProduct) {
      toast.error("【manager管理员】仅可查看，不能编辑/下架产品");
      return;
    }
    if (!window.confirm(`确定删除节点规格 #${spec.id} 吗？此操作会将规格参数清零并下架。`)) return;

    try {
      const priceTx = await (protocolContract as any).setMinerTierConfig(spec.id, 0, 1000, 365, 0, false);
      await priceTx.wait();
      const nodeTx = await (minerNodeContract as any).setNodeTierConfig(spec.id, 0, 0, 0, false);
      await nodeTx.wait();
      toast.success(`节点规格 #${spec.id} 已删除`);
      await fetchTierSpecs();
    } catch (err: any) {
      toast.error(err?.reason || err?.message || "删除节点规格失败");
    }
  }, [protocolContract, minerNodeContract, fetchTierSpecs, canManageProduct]);

  // 查询用户的所有节点批次
  const fetchUserNodeLots = useCallback(async (targetAddress: string, options?: { silent?: boolean; skipLoading?: boolean }) => {
    if (!minerNodeContract || !targetAddress) {
      if (!options?.silent) {
        toast.error("请输入用户地址");
      }
      return;
    }

    if (!ethers.isAddress(targetAddress)) {
      if (!options?.silent) {
        toast.error("无效的以太坊地址");
      }
      return;
    }

    if (!options?.skipLoading) {
      setLoading(true);
    }
    try {
      const lots = await (minerNodeContract as any).getUserNodeLots(targetAddress);
      const nodeLotList: NodeLotRecord[] = (lots || []).map((nodeLot: any) => ({
        lotId: Number(nodeLot.lotId ?? nodeLot[0]),
        tier: Number(nodeLot.tier ?? nodeLot[1]),
        weight: BigInt(nodeLot.weight ?? nodeLot[2]),
        costUsdt: BigInt(nodeLot.costUsdt ?? nodeLot[3]),
        allocatedRights: BigInt(nodeLot.allocatedRights ?? nodeLot[4] ?? 0),
        claimedRights: BigInt(nodeLot.claimedRights ?? nodeLot[5] ?? 0),
        pendingRights: BigInt(nodeLot.pendingRights ?? nodeLot[6] ?? 0),
        purchaseTime: Number(nodeLot.purchaseTime ?? nodeLot[7]),
        protectedUntil: Number(nodeLot.protectedUntil ?? nodeLot[8]),
        active: Boolean(nodeLot.active ?? nodeLot[9]),
      }));

      setNodeLots(nodeLotList);
      if (nodeLotList.length === 0 && !options?.silent) {
        toast.success("该用户无节点批次");
      }
      setCurrentPage(1);
    } catch (err: any) {
      console.error("获取节点批次失败:", err);
      if (!options?.silent) {
        toast.error(err?.message || "获取节点批次失败");
      }
    } finally {
      if (!options?.skipLoading) {
        setLoading(false);
      }
    }
  }, [minerNodeContract]);

  // 打开编辑表单
  const handleEditNodeLot = (nodeLot: NodeLotRecord, address: string) => {
    if (!canManageProduct) {
      toast.error("【manager管理员】仅可查看，不能编辑/下架产品");
      return;
    }
    const weightStr = Number(nodeLot.weight).toString();
    const costStr = ethers.formatUnits(nodeLot.costUsdt, usdtDecimals);
    setEditForm({
      address,
      lotId: nodeLot.lotId,
      tier: nodeLot.tier,
      weight: weightStr,
      costUsdt: costStr,
      originalTier: nodeLot.tier,
      originalWeight: weightStr,
      originalCostUsdt: costStr,
    });
    setShowEditModal(true);
  };

  // 保存编辑
  const handleSaveNodeEdit = useCallback(async () => {
    if (!editForm || !protocolContract) return;
    if (!canManageProduct) {
      toast.error("【manager管理员】仅可查看，不能编辑/下架产品");
      return;
    }

    setLoading(true);
    try {
      let successCount = 0;

      // 编辑等级
      if (Number(editForm.tier) !== Number(editForm.originalTier)) {
        try {
          const tx = await (protocolContract as any).editNodeTier(
            editForm.address,
            editForm.lotId,
            Number(editForm.tier)
          );
          await tx.wait();
          successCount++;
        } catch (err: any) {
          console.error("Failed to edit tier:", err);
          toast.error(`编辑等级失败: ${err?.reason || err?.message}`);
        }
      }

      // 编辑权重
      if (editForm.weight !== editForm.originalWeight) {
        try {
          const tx = await (protocolContract as any).editNodeWeight(
            editForm.address,
            editForm.lotId,
            Number(editForm.weight)
          );
          await tx.wait();
          successCount++;
        } catch (err: any) {
          console.error("Failed to edit weight:", err);
          toast.error(`编辑权重失败: ${err?.reason || err?.message}`);
        }
      }

      // 编辑成本
      if (editForm.costUsdt !== editForm.originalCostUsdt) {
        try {
          const costAmount = ethers.parseUnits(editForm.costUsdt, usdtDecimals);
          const tx = await (protocolContract as any).editNodeCost(
            editForm.address,
            editForm.lotId,
            costAmount
          );
          await tx.wait();
          successCount++;
        } catch (err: any) {
          console.error("Failed to edit cost:", err);
          toast.error(`编辑成本失败: ${err?.reason || err?.message}`);
        }
      }

      if (successCount > 0) {
        toast.success(`成功编辑 ${successCount} 项属性`);
        setShowEditModal(false);
        setEditForm(null);
        await fetchUserNodeLots(editForm.address);
      } else {
        toast("未检测到变更");
      }
    } catch (err: any) {
      console.error("Unexpected error:", err);
      toast.error(err?.reason || "保存失败");
    } finally {
      setLoading(false);
    }
  }, [editForm, protocolContract, fetchUserNodeLots, usdtDecimals, canManageProduct]);

  // 停用节点批次
  const handleDeactivateNodeLot = useCallback(async (address: string, lotId: number) => {
    if (!canManageProduct) {
      toast.error("【manager管理员】仅可查看，不能编辑/下架产品");
      return;
    }
    if (!protocolContract) {
      toast.error("合约未加载");
      return;
    }

    if (!window.confirm(`确定要停用该节点批次吗？(LotID: ${lotId})`)) {
      return;
    }

    setLoading(true);
    try {
      const tx = await protocolContract.adminDeactivateNodeLot(address, lotId);
      toast.loading("交易提交中...");
      await tx.wait();
      toast.success("节点批次已停用");
      await fetchUserNodeLots(address);
    } catch (err: any) {
      console.error("停用节点批次失败:", err);
      toast.error(err?.message || "停用节点批次失败");
    } finally {
      setLoading(false);
    }
  }, [protocolContract, fetchUserNodeLots, canManageProduct]);

  const handleDeleteNodeLot = useCallback(async (address: string, lotId: number) => {
    if (!canManageProduct) {
      toast.error("【manager管理员】仅可查看，不能编辑/下架产品");
      return;
    }
    if (!minerNodeContract) {
      toast.error("节点合约未加载");
      return;
    }

    if (!window.confirm(`确定删除该节点批次吗？(LotID: ${lotId})`)) {
      return;
    }

    setLoading(true);
    try {
      if (typeof (minerNodeContract as any).removeNodeLot !== "function") {
        toast.error("节点合约未暴露删除函数");
        return;
      }

      const tx = await (minerNodeContract as any).removeNodeLot(address, lotId);
      await tx.wait();
      toast.success("节点批次已删除");
      await fetchUserNodeLots(address);
    } catch (err: any) {
      toast.error(err?.reason || err?.message || "删除节点批次失败");
    } finally {
      setLoading(false);
    }
  }, [minerNodeContract, fetchUserNodeLots, canManageProduct]);

  // 搜索处理
  const handleSearch = useCallback(async () => {
    const target = searchAddress.trim();
    setTrackedAddress(target);
    await fetchUserNodeLots(target);
  }, [searchAddress, fetchUserNodeLots]);

  useEffect(() => {
    if (!trackedAddress) return;

    const timer = setInterval(() => {
      void fetchTierSpecs();
      void fetchUserNodeLots(trackedAddress, { silent: true, skipLoading: true });
    }, 15000);

    return () => clearInterval(timer);
  }, [trackedAddress, fetchTierSpecs, fetchUserNodeLots]);

  // 分页处理
  const paginatedNodeLots = nodeLots.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  const totalPages = Math.ceil(nodeLots.length / pageSize);

  return (
    <div className="space-y-6">
      {/* 节点规格管理 */}
      <div className="bg-slate-800/30 rounded-lg border border-slate-700/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold">节点规格管理</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreateTierSpec}
              disabled={!canManageProduct}
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

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/40 border-b border-slate-700/30">
              <tr>
                <th className="px-4 py-3 text-left text-slate-300">ID</th>
                <th className="px-4 py-3 text-left text-slate-300">名称</th>
                <th className="px-4 py-3 text-left text-slate-300">价格(U)</th>
                <th className="px-4 py-3 text-left text-slate-300">权重</th>
                      <th className="px-4 py-3 text-left text-slate-300">币权(KNIGHTS)</th>
                <th className="px-4 py-3 text-left text-slate-300">已售/总量</th>
                <th className="px-4 py-3 text-left text-slate-300">状态</th>
                <th className="px-4 py-3 text-left text-slate-300">操作</th>
              </tr>
            </thead>
            <tbody>
              {tierSpecs.map((spec) => (
                <tr key={spec.id} className="border-b border-slate-700/20 hover:bg-slate-800/20 transition">
                  <td className="px-4 py-3 text-white">{spec.id}</td>
                  <td className="px-4 py-3 text-white">{spec.name}</td>
                  <td className="px-4 py-3 text-white">{spec.priceUsdt}</td>
                  <td className="px-4 py-3 text-white">{spec.weight}</td>
                  <td className="px-4 py-3 text-white">{spec.rightsSeer}</td>
                  <td className="px-4 py-3 text-white">{spec.sold}/{spec.total}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${spec.enabled ? "bg-amber-500/20 text-amber-300" : "bg-slate-500/20 text-slate-300"}`}>
                      {spec.enabled ? "已上架" : "下架"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
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
                    </div>
                  </td>
                </tr>
              ))}
              {tierSpecs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-4 text-center text-slate-400">暂无规格数据</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="relative">
        <label className="text-slate-300 text-sm font-semibold block mb-2">
          用户地址
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="输入用户钱包地址搜索..."
            value={searchAddress}
            onChange={(e) => setSearchAddress(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50"
          />
          <AnimatedButton
            onClick={handleSearch}
            loading={loading}
            disabled={loading}
            className="px-6 py-3"
          >
            <Search size={16} className="mr-1" /> 搜索
          </AnimatedButton>
        </div>
      </div>

      {/* 节点批次表格 */}
      {nodeLots.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <Layers size={18} /> 节点批次列表 ({nodeLots.length})
          </h3>

          <div className="bg-slate-800/30 rounded-lg overflow-x-auto border border-slate-700/30">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/50 border-b border-slate-700/30">
                <tr>
                  <th className="px-4 py-3 text-left text-slate-300">批次ID</th>
                  <th className="px-4 py-3 text-left text-slate-300">等级</th>
                  <th className="px-4 py-3 text-left text-slate-300">权重</th>
                  <th className="px-4 py-3 text-left text-slate-300">成本(USDT)</th>
                  <th className="px-4 py-3 text-left text-slate-300">已领取权利</th>
                  <th className="px-4 py-3 text-left text-slate-300">待领取权利</th>
                  <th className="px-4 py-3 text-left text-slate-300">状态</th>
                  <th className="px-4 py-3 text-left text-slate-300">操作</th>
                </tr>
              </thead>
              <tbody>
                {paginatedNodeLots.map((nodeLot) => (
                  <tr
                    key={nodeLot.lotId}
                    className="border-b border-slate-700/20 hover:bg-slate-800/20 transition"
                  >
                    <td className="px-4 py-3 text-white font-mono">#{nodeLot.lotId}</td>
                    <td className="px-4 py-3 text-white">Tier {nodeLot.tier}</td>
                    <td className="px-4 py-3 text-white">{Number(nodeLot.weight)}</td>
                    <td className="px-4 py-3 text-white">
                      {Number(ethers.formatUnits(nodeLot.costUsdt, usdtDecimals)).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-emerald-400">
                      {Number(ethers.formatUnits(nodeLot.claimedRights, 18)).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-amber-400">
                      {Number(ethers.formatUnits(nodeLot.pendingRights, 18)).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          nodeLot.active
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {nodeLot.active ? "激活" : "已停用"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditNodeLot(nodeLot, searchAddress)}
                          disabled={!canManageProduct}
                          className="p-1 hover:bg-indigo-500/20 rounded text-slate-400 hover:text-indigo-400 transition disabled:opacity-50"
                          title="编辑属性"
                        >
                          <Edit2 size={14} />
                        </button>
                        {nodeLot.active && (
                          <button
                            onClick={() => handleDeactivateNodeLot(searchAddress, nodeLot.lotId)}
                            disabled={!canManageProduct || loading}
                            className="p-1 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400 transition disabled:opacity-50"
                            title="停用此节点批次"
                          >
                            <Ban size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteNodeLot(searchAddress, nodeLot.lotId)}
                          disabled={!canManageProduct || loading}
                          className="p-1 hover:bg-rose-500/20 rounded text-slate-400 hover:text-rose-400 transition disabled:opacity-50"
                          title="删除此节点批次"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 rounded bg-slate-700/50 hover:bg-slate-600 disabled:opacity-50 text-sm"
              >
                上一页
              </button>
              <span className="text-slate-400 text-sm">
                第 {currentPage} / {totalPages} 页
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 rounded bg-slate-700/50 hover:bg-slate-600 disabled:opacity-50 text-sm"
              >
                下一页
              </button>
            </div>
          )}
        </div>
      )}

      {/* 详情模态 */}
      {showDetail && selectedNodeLot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-xl border border-indigo-500/20 p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-bold">节点批次详情</h3>
              <button
                onClick={() => setShowDetail(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-slate-700/30">
                <span className="text-slate-400">批次ID</span>
                <span className="text-white font-mono">#{selectedNodeLot.lotId}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-700/30">
                <span className="text-slate-400">等级</span>
                <span className="text-white">Tier {selectedNodeLot.tier}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-700/30">
                <span className="text-slate-400">权重</span>
                <span className="text-white">{Number(selectedNodeLot.weight)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-700/30">
                <span className="text-slate-400">成本(USDT)</span>
                <span className="text-white">
                  {Number(ethers.formatUnits(selectedNodeLot.costUsdt, usdtDecimals)).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-700/30">
                <span className="text-slate-400">已分配权利</span>
                <span className="text-emerald-400">
                  {Number(ethers.formatUnits(selectedNodeLot.allocatedRights, 18)).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-700/30">
                <span className="text-slate-400">已领取权利</span>
                <span className="text-emerald-400">
                  {Number(ethers.formatUnits(selectedNodeLot.claimedRights, 18)).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-700/30">
                <span className="text-slate-400">待领取权利</span>
                <span className="text-amber-400">
                  {Number(ethers.formatUnits(selectedNodeLot.pendingRights, 18)).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-700/30">
                <span className="text-slate-400">购买时间</span>
                <span className="text-white">
                  {new Date(selectedNodeLot.purchaseTime * 1000).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-700/30">
                <span className="text-slate-400">保护期至</span>
                <span className="text-white">
                  {new Date(selectedNodeLot.protectedUntil * 1000).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-400">状态</span>
                <span
                  className={`px-2 py-1 rounded text-xs font-semibold ${
                    selectedNodeLot.active
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-red-500/20 text-red-400"
                  }`}
                >
                  {selectedNodeLot.active ? "激活" : "已停用"}
                </span>
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              {selectedNodeLot.active && (
                <AnimatedButton
                  onClick={() => {
                    handleDeactivateNodeLot(searchAddress, selectedNodeLot.lotId);
                    setShowDetail(false);
                  }}
                  loading={loading}
                  disabled={!canManageProduct}
                  variant="danger"
                  className="flex-1"
                >
                  <Ban size={14} className="mr-1" /> 停用节点批次
                </AnimatedButton>
              )}
              <button
                onClick={() => {
                  handleDeleteNodeLot(searchAddress, selectedNodeLot.lotId);
                  setShowDetail(false);
                }}
                disabled={!canManageProduct}
                className="flex-1 px-4 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold transition disabled:opacity-50"
              >
                删除
              </button>
              <button
                onClick={() => setShowDetail(false)}
                className="flex-1 px-4 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-600 text-white font-semibold transition"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑模态 */}
      {showEditModal && editForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1A1532] border border-indigo-500/25 rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-bold">编辑节点属性</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <label className="text-slate-400 block mb-1">地址</label>
                <p className="text-white font-mono text-xs break-all bg-slate-800/50 px-2 py-1.5 rounded">
                  {editForm.address}
                </p>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">批次ID</label>
                <p className="text-white bg-slate-800/50 px-2 py-1.5 rounded">#{editForm.lotId}</p>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">等级 <span className="text-red-400">*可编辑</span></label>
                <select
                  value={editForm.tier}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      tier: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-800/50 border border-indigo-500/30 rounded text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="1">V1</option>
                  <option value="2">V2</option>
                  <option value="3">V3</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">权重 <span className="text-red-400">*可编辑</span></label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={editForm.weight}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      weight: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-800/50 border border-indigo-500/30 rounded text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">成本 (USDT) <span className="text-red-400">*可编辑</span></label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.costUsdt}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      costUsdt: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-800/50 border border-indigo-500/30 rounded text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t border-indigo-500/15">
              <AnimatedButton
                onClick={handleSaveNodeEdit}
                loading={loading}
                disabled={!canManageProduct}
                variant="primary"
                className="flex-1 py-2 text-sm"
              >
                <Save size={14} className="inline mr-1" /> 保存更改
              </AnimatedButton>
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-3 py-2 rounded border border-slate-500/25 text-white text-sm hover:bg-slate-500/10 transition"
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

      {nodeLots.length === 0 && !loading && searchAddress && (
        <div className="text-center py-8 text-slate-400">
          <p>该用户无节点批次数据</p>
        </div>
      )}

      {/* 规格编辑模态 */}
      {showTierSpecModal && editingTierSpec && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1A1532] border border-indigo-500/25 rounded-xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-lg">{isCreatingTierSpec ? "新增节点规格" : "编辑节点规格"}</h3>
              <button onClick={closeTierSpecModal} className="text-slate-400 hover:text-white">
                <X size={20} />
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
                  value={editingTierSpec.priceUsdt}
                  onChange={(e) => setEditingTierSpec({ ...editingTierSpec, priceUsdt: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800/50 border border-indigo-500/30 rounded text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">权重</label>
                  <input
                    type="number"
                    min="1"
                    value={editingTierSpec.weight}
                    onChange={(e) => setEditingTierSpec({ ...editingTierSpec, weight: Number(e.target.value) || 1 })}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-indigo-500/30 rounded text-white"
                  />
                </div>
                <div>
                    <label className="text-slate-400 block mb-1">币权(KNIGHTS)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editingTierSpec.rightsSeer}
                    onChange={(e) => setEditingTierSpec({ ...editingTierSpec, rightsSeer: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-indigo-500/30 rounded text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">已售</label>
                  <input
                    type="number"
                    min="0"
                    disabled
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
                    value={editingTierSpec.total}
                    onChange={(e) => setEditingTierSpec({ ...editingTierSpec, total: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-indigo-500/30 rounded text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <AnimatedButton onClick={handleSaveTierSpec} disabled={!canManageProduct} variant="primary" className="flex-1 py-2 text-sm">
                <Save size={14} className="inline mr-1" /> 保存
              </AnimatedButton>
              <button
                onClick={closeTierSpecModal}
                className="flex-1 px-3 py-2 rounded border border-slate-500/25 text-white text-sm hover:bg-slate-500/10 transition"
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

export default AdminNodeManager;
