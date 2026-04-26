import React, { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Wallet, ChevronDown, Copy, Check, LogOut } from "lucide-react";
import { useLanguage } from "../src/LanguageContext";
import { useWeb3 } from "../src/Web3Context";

const WalletConnectMenu: React.FC = () => {
  const { t, language } = useLanguage();
  const { disconnectWallet } = useWeb3();
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyAddress = async (address: string | undefined) => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy address", err);
    }
  };

  return (
    <ConnectButton.Custom>
      {({ account: acct, chain, openConnectModal, authenticationStatus, mounted }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected = ready && authenticationStatus !== "unauthenticated" && acct;

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: { opacity: 0, pointerEvents: "none" as const, userSelect: "none" as const },
            })}
          >
            {!connected ? (
              <button
                onClick={openConnectModal}
                className="bg-indigo-500 hover:bg-indigo-400 text-white font-bold py-2 px-4 rounded-xl transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/20"
              >
                <Wallet size={18} />
                <span>{t.nav?.connect || "连接钱包"}</span>
              </button>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setShowWalletMenu(!showWalletMenu)}
                  className="bg-[#1A1532] hover:bg-[#231D42] border border-indigo-500/15 text-white font-bold py-2 px-4 rounded-xl transition-colors flex items-center gap-2"
                >
                  {chain?.hasIcon && (
                    <div
                      style={{
                        background: chain.iconBackground,
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        overflow: "hidden",
                        marginRight: 4,
                      }}
                    >
                      {chain.iconUrl && <img alt={chain.name ?? ""} src={chain.iconUrl} style={{ width: 18, height: 18 }} />}
                    </div>
                  )}
                  <span>{acct.displayName}</span>
                  <ChevronDown size={16} />
                </button>

                {showWalletMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowWalletMenu(false)} />
                    <div className="absolute right-0 mt-2 w-56 bg-[#1A1532] border border-indigo-500/20 rounded-xl shadow-xl z-20 overflow-hidden">
                      <button
                        onClick={() => copyAddress(acct.address)}
                        className="w-full px-4 py-3 text-left text-slate-300 hover:bg-[#231D42] hover:text-white transition-colors flex items-center gap-3"
                      >
                        {copied ? <Check size={16} className="text-violet-400" /> : <Copy size={16} />}
                        {language === "zh" ? "复制地址" : "Copy Address"}
                      </button>
                      <button
                        onClick={() => {
                          disconnectWallet();
                          setShowWalletMenu(false);
                        }}
                        className="w-full px-4 py-3 text-left text-rose-400 hover:bg-[#231D42] hover:text-rose-300 transition-colors flex items-center gap-3 border-t border-indigo-500/10"
                      >
                        <LogOut size={16} />
                        {language === "zh" ? "断开连接" : "Disconnect"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
};

export default WalletConnectMenu;
