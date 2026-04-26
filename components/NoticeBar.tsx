import { Volume2, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useLanguage } from "../src/LanguageContext";
import { fetchAnnouncements, getAnnouncementContent, NOTICE_FALLBACKS } from "../src/services/announcementStorage";

interface NoticeBarProps {
  message?: string;
}

const NoticeBar: React.FC<NoticeBarProps> = ({ message }) => {
  const { language } = useLanguage();
  const [visible, setVisible] = useState(true);
  const [notice, setNotice] = useState(message || "");
  const fallbackNotice = NOTICE_FALLBACKS.zh;

  useEffect(() => {
    if (message) {
      setNotice(message);
      setVisible(true);
    }
  }, [message]);

  // 异步拉取远程公告
  useEffect(() => {
    if (message) return;

    // 先用本地缓存即时展示
    const cached = getAnnouncementContent(language);
    setNotice(cached || fallbackNotice);
    setVisible(true);

    // 再异步刷新远程数据
    fetchAnnouncements().then((data) => {
      const lang = language === "en" ? "en" : "zh";
      setNotice(data[lang] || fallbackNotice);
    }).catch(() => {});
  }, [language, message]);

  useEffect(() => {
    if (!notice) {
      setNotice(fallbackNotice);
    }
  }, [notice]);

  if (!visible || !notice) return null;

  return (
    <div className="bg-indigo-900/30 border-b border-indigo-500/15 px-4 py-2 flex items-center gap-3">
      <Volume2 size={14} className="text-violet-400 flex-shrink-0 animate-pulse" />
      <div className="flex-1 overflow-hidden">
        <p className="text-indigo-100 text-xs whitespace-nowrap animate-marquee">
          {notice}
        </p>
      </div>
      <button
        onClick={() => setVisible(false)}
        className="text-slate-400 hover:text-white flex-shrink-0 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
};

export default NoticeBar;
