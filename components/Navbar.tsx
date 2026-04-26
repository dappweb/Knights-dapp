import React, { useEffect, Suspense, lazy } from "react";
import { AppTab } from "../src/types";
import { Home, Pickaxe, Users, Settings, Globe, FileText, Wallet, ArrowLeftRight, ShieldCheck, Flame, Ticket, Coins } from "lucide-react";
import { useLanguage } from "../src/LanguageContext";
import { useWeb3 } from "../src/Web3Context";

const WalletConnectMenu = lazy(() => import("./WalletConnectMenu"));

interface NavbarProps {
  currentTab: AppTab;
  setTab: (tab: AppTab) => void;
  showNodeMenu?: boolean;
  showMinerMenu?: boolean;
}

const Navbar: React.FC<NavbarProps> = ({ currentTab, setTab, showNodeMenu = true, showMinerMenu = true }) => {
  const { t, language, setLanguage } = useLanguage();
  const { isAdmin } = useWeb3();
  const [enableWalletUI, setEnableWalletUI] = React.useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setEnableWalletUI(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  const navItems = [
    { tab: AppTab.LP_MINING, icon: Coins, label: "LP" },
    { tab: AppTab.BURN_QUEUE, icon: Flame, label: "销毁" },
    { tab: AppTab.MIGRATION, icon: Ticket, label: "平移" },
    { tab: AppTab.HOME, icon: Home, label: t.nav?.home || "首页" },
    ...(showNodeMenu ? [{ tab: AppTab.NODE, icon: ShieldCheck, label: t.nav?.node || "节点" }] : []),
    ...(showMinerMenu ? [{ tab: AppTab.MINER, icon: Pickaxe, label: t.nav?.miner || "矿机" }] : []),
    { tab: AppTab.SWAP, icon: ArrowLeftRight, label: t.nav?.swap || "兑换" },
    { tab: AppTab.TEAM, icon: Users, label: t.nav?.team || "团队" },
    { tab: AppTab.HISTORY, icon: FileText, label: t.nav?.history || "记录" },
  ];

  return (
    <>
      {/* Desktop & Top Bar */}
      <nav className="theme-topbar fixed left-0 right-0 top-0 z-50 backdrop-blur-md border-b shadow-lg shadow-amber-500/5">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 md:h-20">
            {/* Logo */}
            <div
              className="flex items-center cursor-pointer"
              onClick={() => setTab(AppTab.HOME)}
            >
              <img
                src="/knights-logo.svg"
                alt="KNIGHTS"
                className="h-10 md:h-12 w-auto object-contain"
              />
            </div>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-8">
              {navItems.map(({ tab, icon: Icon, label }) => (
                <button
                  key={tab}
                  onClick={() => setTab(tab)}
                  className={`flex items-center gap-2 font-bold transition-colors ${
                    currentTab === tab ? "text-amber-300" : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Icon size={18} /> {label}
                </button>
              ))}
              {isAdmin && (
                <button
                  onClick={() => setTab(AppTab.ADMIN)}
                  className={`flex items-center gap-2 font-bold transition-colors ${
                    currentTab === AppTab.ADMIN ? "text-red-400" : "text-gray-400 hover:text-red-400"
                  }`}
                >
                  <Settings size={18} /> Admin
                </button>
              )}
            </div>

            {/* Right: Language + Wallet */}
            <div className="flex items-center gap-2 md:gap-4">
              {/* Language Switcher */}
              <button
                onClick={() => {
                  const langs = ["zh", "en"] as const;
                  const idx = langs.indexOf(language as any);
                  const next = langs[(idx + 1) % langs.length];
                  setLanguage(next);
                }}
                className="theme-toggle p-1.5 md:p-2 transition-colors rounded-lg hover:text-amber-300 flex items-center gap-1 md:gap-2"
                title="Switch Language"
              >
                <Globe size={18} className="md:w-5 md:h-5" />
                <span className="text-xs md:text-sm font-bold">
                  {{ zh: "简", en: "EN" }[language] || "EN"}
                </span>
              </button>

              {/* Wallet Connect */}
              <div className="scale-90 md:scale-100 origin-right relative">
                {enableWalletUI ? (
                  <Suspense
                    fallback={
                      <button
                        className="bg-gradient-to-r from-amber-400 to-amber-700 text-[#070B10] font-bold py-2 px-4 rounded-xl flex items-center gap-2 shadow-lg shadow-amber-500/20"
                        disabled
                      >
                        <Wallet size={18} />
                        <span>{t.nav?.connect || "连接钱包"}</span>
                      </button>
                    }
                  >
                    <WalletConnectMenu />
                  </Suspense>
                ) : (
                  <button
                    className="bg-gradient-to-r from-amber-400 to-amber-700 text-[#070B10] font-bold py-2 px-4 rounded-xl flex items-center gap-2 shadow-lg shadow-amber-500/20"
                    disabled
                  >
                    <Wallet size={18} />
                    <span>{t.nav?.connect || "连接钱包"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Bottom Nav */}
      <div className="theme-topbar md:hidden fixed bottom-0 left-0 right-0 border-t pb-safe z-50 shadow-[0_-4px_20px_rgba(214,177,90,0.08)] backdrop-blur-md">
        <div className="flex justify-around items-center h-16">
          {navItems.map(({ tab, icon: Icon, label }) => (
            <button
              key={tab}
              onClick={() => setTab(tab)}
              className={`p-2 rounded-lg flex flex-col items-center gap-1 ${
                currentTab === tab ? "bg-amber-500/10" : ""
              }`}
              style={{ color: currentTab === tab ? "#D6B15A" : "#9BAABD" }}
            >
              <Icon size={20} />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          ))}
          {isAdmin && (
            <button
              onClick={() => setTab(AppTab.ADMIN)}
              className={`p-2 rounded-lg flex flex-col items-center gap-1 ${
                currentTab === AppTab.ADMIN ? "text-red-400 bg-red-500/10" : "text-gray-500"
              }`}
            >
              <Settings size={20} />
              <span className="text-[10px] font-medium">Admin</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default Navbar;

