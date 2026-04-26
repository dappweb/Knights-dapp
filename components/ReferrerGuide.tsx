import React, { useState } from "react";
import { useLanguage } from "../src/LanguageContext";
import { X, ChevronRight, AlertCircle, CheckCircle2, Lightbulb, Users, Gift, Lock, TrendingUp } from "lucide-react";

interface ReferrerGuideProps {
  onClose: () => void;
  onSelectOption: (option: 'manual' | 'default') => void;
}

const ReferrerGuide: React.FC<ReferrerGuideProps> = ({ onClose, onSelectOption }) => {
  const { t } = useLanguage();
  const [expandedStep, setExpandedStep] = useState<number | null>(0);

  const steps = [
    {
      title: t.guide?.step1Title || "什么是推荐人？",
      icon: Users,
      content: t.guide?.step1Content || "推荐人是邀请您加入 KNIGHTS 的用户。推荐人必须已在系统中注册，绑定后无法修改。"
    },
    {
      title: t.guide?.step2Title || "为什么需要推荐人？",
      icon: Gift,
      content: t.guide?.step2Content || "推荐人是组建团队的基础。绑定后可参与团队关系与培育奖励：直推N人可拿N代，默认每代1%、最多10代（以链上配置为准）。"
    },
    {
      title: t.guide?.step3Title || "没有推荐人怎么办？",
      icon: AlertCircle,
      content: t.guide?.step3Content || "系统提供两种选择：\n1. 手动输入朋友的钱包地址（前提是朋友已注册）\n2. 使用平台默认推荐人（通常是项目方 owner）"
    },
    {
      title: t.guide?.step4Title || "绑定后的权益",
      icon: TrendingUp,
      content: t.guide?.step4Content || "绑定推荐人后即可开始购买矿机、挖矿、获取收益。团队业绩会自动在推荐链中传播，促进等级升级。"
    }
  ];

  return (
    <div className="guide-root">
      {/* 背景覆盖 */}
      <div
        className="guide-overlay"
        onClick={onClose}
      />

      {/* 引导卡片 */}
      <div className="guide-shell guide-modal">
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="guide-close-btn"
        >
          <X size={20} />
        </button>

        {/* 标题 */}
        <div className="guide-header">
          <div className="guide-header-row">
            <div className="guide-header-left">
              <Lightbulb className="w-6 h-6 guide-section-icon" />
              <h2 className="guide-title">
                {t.guide?.title || "推荐人绑定新手指引"}
              </h2>
            </div>
            <span className="guide-badge">
              4 步完成
            </span>
          </div>
          <p className="guide-subtitle">
            {t.guide?.subtitle || "5 分钟快速了解推荐人绑定流程"}
          </p>
        </div>

        {/* 内容 */}
        <div className="guide-body">
          <div className="guide-hint">
            <p className="guide-hint-text">
              先了解绑定规则，再选择推荐人方式，最后完成链上确认。
            </p>
          </div>

          {/* 步骤列表 */}
          <div className="guide-step-list">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              const isExpanded = expandedStep === idx;

              return (
                <button
                  key={idx}
                  onClick={() => setExpandedStep(isExpanded ? null : idx)}
                  className="guide-step-trigger group"
                >
                  <div
                    className={`guide-step ${
                      isExpanded
                        ? "guide-step-active"
                        : "guide-step-inactive"
                    }`}
                  >
                    {/* 标题行 */}
                    <div className="guide-step-row">
                      <div className="guide-step-main">
                        <div
                          className={`guide-step-icon ${
                            isExpanded
                              ? "guide-step-icon-active"
                              : "guide-step-icon-inactive"
                          }`}
                        >
                          <Icon size={20} />
                        </div>
                        <div>
                          <h3 className="guide-step-title">
                            <span className="guide-step-index">Step {idx + 1}</span>
                            {step.title}
                          </h3>
                        </div>
                      </div>
                      <ChevronRight
                        size={20}
                        className={`guide-chevron transition-transform ${
                          isExpanded ? "rotate-90" : ""
                        }`}
                      />
                    </div>

                    {/* 展开内容 */}
                    {isExpanded && (
                      <div className="guide-step-content">
                        <p className="guide-step-body">
                          {step.content}
                        </p>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* 分隔线 */}
          <div className="guide-divider" />

          {/* 快速选择 */}
          <div>
            <h3 className="guide-section-title">
              <Lock size={16} className="guide-section-icon" />
              {t.guide?.chooseOption || "现在选择推荐人"}
            </h3>

            <div className="guide-option-section">
              {/* 选项1 - 手动输入 */}
              <button
                onClick={() => onSelectOption('manual')}
                className="guide-option guide-option-manual group"
              >
                <div className="guide-option-row">
                  <div className="guide-option-copy">
                    <p className="guide-option-title guide-option-title-manual">
                      <CheckCircle2 size={16} />
                      {t.guide?.option1 || "选项 1：输入朋友的钱包地址"}
                    </p>
                    <p className="guide-option-desc">
                      {t.guide?.option1Desc || "适合已有推荐人的用户（朋友钱包地址）"}
                    </p>
                  </div>
                  <ChevronRight size={18} className="guide-option-chevron guide-option-chevron-manual" />
                </div>
              </button>

              {/* 选项2 - 使用默认 */}
              <button
                onClick={() => onSelectOption('default')}
                className="guide-option guide-option-default group"
              >
                <div className="guide-option-row">
                  <div className="guide-option-copy">
                    <p className="guide-option-title guide-option-title-default">
                      <CheckCircle2 size={16} />
                      {t.guide?.option2 || "选项 2：使用平台默认推荐人"}
                    </p>
                    <p className="guide-option-desc">
                      {t.guide?.option2Desc || "没有推荐人的用户（系统自动分配）"}
                    </p>
                  </div>
                  <ChevronRight size={18} className="guide-option-chevron guide-option-chevron-default" />
                </div>
              </button>
            </div>
          </div>

          {/* 提示框 */}
          <div className="guide-warning">
            <div className="guide-warning-row">
              <AlertCircle size={16} className="guide-warning-icon" />
              <div className="guide-warning-copy">
                <p className="guide-warning-title">
                  {t.guide?.importantTitle || "⚠️ 重要提示"}
                </p>
                <ul className="guide-warning-list">
                  <li>• {t.guide?.tip1 || "推荐人绑定后无法修改，请谨慎选择"}</li>
                  <li>• {t.guide?.tip2 || "推荐人必须已在系统中注册"}</li>
                  <li>• {t.guide?.tip3 || "绑定后才能购买矿机和获取收益"}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* 页脚 */}
        <div className="guide-footer">
          <button
            onClick={onClose}
            className="guide-btn guide-btn-secondary"
          >
            {t.guide?.close || "关闭"}
          </button>
          <button
            onClick={() => onSelectOption('default')}
            className="guide-btn guide-btn-primary"
          >
            {t.guide?.startNow || "开始绑定"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReferrerGuide;
