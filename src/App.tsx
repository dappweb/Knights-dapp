import { AlertTriangle } from "lucide-react";
import React, { Suspense, lazy, useEffect, useState } from "react";
import { Toaster } from "react-hot-toast";
import ErrorBoundary from "../components/ErrorBoundary";
import ForcedReferrerBinding from "../components/ForcedReferrerBinding";
import { SkeletonCard } from "../components/LoadingSkeletons";
import Navbar from "../components/Navbar";
import NoticeBar from "../components/NoticeBar";
import PullToRefresh from "../components/PullToRefresh";
import { GlobalRefreshProvider } from "../hooks/useGlobalRefresh";
import { disableErrorNotifications } from "../utils/toastConfig";
import { LanguageProvider, useLanguage } from "./LanguageContext";
import { ThemeProvider } from "./ThemeContext";
import { AppTab } from "./types";
import { Web3Provider, useWeb3 } from "./Web3Context";

const lazyWithRetry = <T extends React.ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  moduleKey: string
) =>
  lazy(async () => {
    try {
      return await importer();
    } catch (error: any) {
      const message = String(error?.message || "").toLowerCase();
      const isChunkLoadError =
        message.includes("failed to fetch dynamically imported module") ||
        message.includes("loading chunk") ||
        message.includes("importing a module script failed");
      const isModuleInitError =
        message.includes("before initialization") ||
        message.includes("cannot access") ||
        message.includes("undefined is not an object") ||
        message.includes("is not defined");

      if ((isChunkLoadError || isModuleInitError) && typeof window !== "undefined") {
        const retryKey = `knights:lazy-retry:${moduleKey}`;
        const hasRetried = sessionStorage.getItem(retryKey) === "1";

        if (!hasRetried) {
          sessionStorage.setItem(retryKey, "1");
          window.location.reload();
        } else {
          sessionStorage.removeItem(retryKey);
        }
      }

      throw error;
    }
  });

// Lazy load heavy components
const StatsPanel = lazyWithRetry(() => import("../components/StatsPanel"), "StatsPanel");
const NodeRecruitmentCampaign = lazyWithRetry(() => import("../components/NodeRecruitmentCampaign"), "NodeRecruitmentCampaign");
const SwapPanel = lazyWithRetry(() => import("../components/SwapPanel"), "SwapPanel");
const LpMiningPanel = lazyWithRetry(() => import("../components/LpMiningPanel"), "LpMiningPanel");
const BurnQueuePanel = lazyWithRetry(() => import("../components/BurnQueuePanel"), "BurnQueuePanel");
const MigrationNftPanel = lazyWithRetry(() => import("../components/MigrationNftPanel"), "MigrationNftPanel");
const AirdropPanel = lazyWithRetry(() => import("../components/AirdropPanel"), "AirdropPanel");
const MiningPanel = lazyWithRetry(() => import("../components/MiningPanel"), "MiningPanel");
const TeamLevel = lazyWithRetry(() => import("../components/TeamLevel"), "TeamLevel");
const AdminPanel = lazyWithRetry(() => import("../components/AdminPanel"), "AdminPanel");
const TransactionHistory = lazyWithRetry(() => import("../components/TransactionHistory"), "TransactionHistory");
const Web3Providers = lazyWithRetry(() => import("./Web3Providers"), "Web3Providers");

const AppContent: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<AppTab>(AppTab.HOME);
  const [appError, setAppError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showNodeMenu, setShowNodeMenu] = useState(true);
  const [showNodePurchase, setShowNodePurchase] = useState(true);
  const [showMinerMenu, setShowMinerMenu] = useState(true);
  const { t } = useLanguage();
  const { isAdmin, isConnected, adminRole, protocolContract, account, showForcedReferrerBinding, dismissForcedReferrerBinding } = useWeb3();

  const handleRefresh = async () => {
    await new Promise((r) => setTimeout(r, 800));
    window.location.reload();
  };

  const handleAppError = (error: Error) => {
    console.error("App-level error:", error);
    setAppError(error.message);
  };

  useEffect(() => {
    disableErrorNotifications();
    const timer = setTimeout(() => setIsInitialized(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkNodeAccess = async () => {
      if (!protocolContract) {
        if (!cancelled) {
          setShowNodeMenu(true);
          setShowNodePurchase(true);
          setShowMinerMenu(true);
        }
        return;
      }

      try {
        const [nodeOpen, minerOpen] = await Promise.all([
          protocolContract.nodeSaleOpen().catch(() => true),
          protocolContract.minerSaleOpen().catch(() => true),
        ]);

        if (!cancelled) {
          // 仅使用 Admin 开关控制，不再基于销售阶段或购买记录自动判断
          setShowNodePurchase(nodeOpen);
          setShowNodeMenu(nodeOpen);
          setShowMinerMenu(minerOpen);
        }
      } catch (err) {
        console.error("Failed to check node access status:", err);
        if (!cancelled) {
          setShowNodeMenu(true);
          setShowNodePurchase(true);
          setShowMinerMenu(true);
        }
      }
    };

    checkNodeAccess();
    const interval = window.setInterval(checkNodeAccess, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [protocolContract, account]);

  useEffect(() => {
    if (!showNodeMenu && currentTab === AppTab.NODE) {
      setCurrentTab(AppTab.HOME);
    }
    if (!showMinerMenu && currentTab === AppTab.MINER) {
      setCurrentTab(AppTab.HOME);
    }
  }, [showNodeMenu, showMinerMenu, currentTab]);

  const scrollToAirdropSection = () => {
    const section = document.getElementById("home-airdrop-section");
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Preload component on hover
  const preloadComponent = (tab: AppTab) => {
    switch (tab) {
      case AppTab.NODE:
        import("../components/NodeRecruitmentCampaign");
        break;
      case AppTab.SWAP:
        import("../components/SwapPanel");
        break;
      case AppTab.LP_MINING:
        import("../components/LpMiningPanel");
        break;
      case AppTab.BURN_QUEUE:
        import("../components/BurnQueuePanel");
        break;
      case AppTab.MIGRATION:
        import("../components/MigrationNftPanel");
        break;
      case AppTab.MINER:
        import("../components/MiningPanel");
        break;
      case AppTab.TEAM:
        import("../components/TeamLevel");
        break;
      case AppTab.HISTORY:
        import("../components/TransactionHistory");
        break;
      case AppTab.ADMIN:
        import("../components/AdminPanel");
        break;
    }
  };

  // Loading splash
  if (!isInitialized) {
    return (
      <div className="theme-page min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden">
        <div className="theme-overlay absolute inset-0 z-0" />
        <div className="theme-glow-primary absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl animate-pulse" />
        <div className="theme-glow-secondary absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="z-10 flex flex-col items-center">
          <h1 className="theme-title text-3xl md:text-4xl font-bold tracking-widest animate-pulse mb-2">
            KNIGHTS <span className="text-amber-300">Protocol</span>
          </h1>
          <p className="theme-muted text-xs md:text-sm animate-pulse">Initializing...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (appError) {
    return (
      <div className="theme-page min-h-screen flex items-center justify-center p-4">
        <div className="theme-card max-w-md w-full border border-rose-500/30 rounded-2xl p-8 text-center backdrop-blur-sm">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/30">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="theme-title text-2xl font-bold mb-2">Application Error</h2>
          <p className="theme-muted mb-6">{appError}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-gradient-to-r from-amber-400 to-amber-700 hover:from-amber-300 hover:to-amber-600 text-[#070B10] font-bold rounded-xl transition-all transform active:scale-95 shadow-lg shadow-amber-500/20"
          >
            Reload Application
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="theme-page min-h-screen selection:bg-amber-300 selection:text-[#070B10] font-sans pb-20 md:pb-8 relative overflow-x-hidden"
    >
      {/* 背景遮罩 */}
      <div className="theme-overlay fixed inset-0 z-0" />

      {/* 动态光效 */}
      <div className="fixed inset-0 z-0">
        <div className="theme-glow-primary absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl animate-pulse" />
        <div className="theme-glow-secondary absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      {/* 强制推荐人绑定窗口 */}
      <ForcedReferrerBinding
        isOpen={showForcedReferrerBinding}
        onClose={dismissForcedReferrerBinding}
      />

      <Navbar
        currentTab={currentTab}
        showNodeMenu={showNodeMenu}
        showMinerMenu={showMinerMenu}
        setTab={(tab) => {
          setCurrentTab(tab);
          preloadComponent(tab);
        }}
      />

      <PullToRefresh onRefresh={handleRefresh} className="pt-20 md:pt-24 relative z-10">
        <main className="px-3 sm:px-4 md:px-6 lg:px-8 mb-16 md:mb-0">
          <NoticeBar />

          {currentTab === AppTab.HOME && (
            <ErrorBoundary onError={handleAppError}>
              <Suspense fallback={<SkeletonCard />}>
                <StatsPanel
                  stats={null as any}
                  onJoinClick={() => setCurrentTab(AppTab.MINER)}
                  onBuyTicketClick={() => setCurrentTab(AppTab.MINER)}
                  onAirdropClick={scrollToAirdropSection}
                />
              </Suspense>
              <Suspense fallback={<SkeletonCard />}>
                <div id="home-airdrop-section" className="scroll-mt-24">
                  <AirdropPanel />
                </div>
              </Suspense>
            </ErrorBoundary>
          )}

          {currentTab === AppTab.NODE && showNodeMenu && (
            <ErrorBoundary onError={handleAppError}>
              <Suspense fallback={<SkeletonCard />}>
                <NodeRecruitmentCampaign showPurchaseSection={showNodePurchase} />
              </Suspense>
            </ErrorBoundary>
          )}

          {currentTab === AppTab.SWAP && (
            <ErrorBoundary onError={handleAppError}>
              <Suspense fallback={<SkeletonCard />}>
                <SwapPanel />
              </Suspense>
            </ErrorBoundary>
          )}

          {currentTab === AppTab.LP_MINING && (
            <ErrorBoundary onError={handleAppError}>
              <Suspense fallback={<SkeletonCard />}>
                <LpMiningPanel />
              </Suspense>
            </ErrorBoundary>
          )}

          {currentTab === AppTab.BURN_QUEUE && (
            <ErrorBoundary onError={handleAppError}>
              <Suspense fallback={<SkeletonCard />}>
                <BurnQueuePanel />
              </Suspense>
            </ErrorBoundary>
          )}

          {currentTab === AppTab.MIGRATION && (
            <ErrorBoundary onError={handleAppError}>
              <Suspense fallback={<SkeletonCard />}>
                <MigrationNftPanel />
              </Suspense>
            </ErrorBoundary>
          )}

          {currentTab === AppTab.MINER && showMinerMenu && (
            <ErrorBoundary onError={handleAppError}>
              <Suspense fallback={<SkeletonCard />}>
                <MiningPanel />
              </Suspense>
            </ErrorBoundary>
          )}

          {currentTab === AppTab.TEAM && (
            <ErrorBoundary onError={handleAppError}>
              <Suspense fallback={<SkeletonCard />}>
                <TeamLevel />
              </Suspense>
            </ErrorBoundary>
          )}

          {currentTab === AppTab.HISTORY && (
            <ErrorBoundary onError={handleAppError}>
              <Suspense fallback={<SkeletonCard />}>
                <TransactionHistory />
              </Suspense>
            </ErrorBoundary>
          )}

          {currentTab === AppTab.ADMIN && isAdmin && isConnected && (
            <ErrorBoundary onError={handleAppError}>
              <Suspense fallback={<SkeletonCard />}>
                <AdminPanel />
              </Suspense>
            </ErrorBoundary>
          )}

          {currentTab === AppTab.ADMIN && (!isAdmin || !isConnected) && (
            <div className="max-w-4xl mx-auto p-6 text-center">
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-8">
                <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">访问被拒绝</h2>
                <p className="text-gray-400 mb-4">
                  {!isConnected ? "请先连接钱包" : "仅超级管理员或运营管理员可访问管理面板"}
                </p>
                {isConnected && (
                  <p className="text-gray-500 text-xs mb-4">当前角色：{adminRole}</p>
                )}
                <button
                  onClick={() => setCurrentTab(AppTab.HOME)}
                  className="px-6 py-2 bg-gradient-to-r from-amber-400 to-amber-700 hover:from-amber-300 hover:to-amber-600 text-[#070B10] font-bold rounded-lg transition-colors"
                >
                  返回首页
                </button>
              </div>
            </div>
          )}
        </main>
      </PullToRefresh>

      {/* Footer */}
      <footer className="theme-footer mt-20 border-t py-8 relative z-10">
        <div className="max-w-7xl mx-auto px-4 text-center theme-muted text-sm">
          <p className="mb-2">{t.footer?.rights || "© 2026 KNIGHTS. All rights reserved."}</p>
          <p>{t.footer?.audit || "Smart contracts audited"}</p>
        </div>
      </footer>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <Suspense
      fallback={
        <div className="theme-page min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden">
          <div className="theme-overlay absolute inset-0 z-0" />
          <div className="z-10 flex flex-col items-center">
            <h1 className="theme-title text-3xl md:text-4xl font-bold tracking-widest animate-pulse mb-2">
              KNIGHTS
            </h1>
            <p className="theme-muted text-xs md:text-sm animate-pulse">Loading Web3...</p>
          </div>
        </div>
      }
    >
      <ThemeProvider>
        <Web3Providers>
          <LanguageProvider>
            <Web3Provider>
              <GlobalRefreshProvider>
                <AppContent />
                <Toaster position="top-center" />
              </GlobalRefreshProvider>
            </Web3Provider>
          </LanguageProvider>
        </Web3Providers>
      </ThemeProvider>
    </Suspense>
  );
};

export default App;
