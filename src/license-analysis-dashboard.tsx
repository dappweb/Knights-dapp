import React, { useState, useMemo } from 'react';
import { SPACETIME_LICENSE_ANALYSIS, LicenseCompatibilityAnalyzer, LicenseMigrationStrategy, CommercialUseDecisionFramework } from './spacetime-license-analysis';

export function SpacetimeLicenseAnalysisDashboard() {
  const [projectType, setProjectType] = useState<'dapp' | 'saas' | 'enterprise' | 'game' | 'mobile'>('dapp');
  const [projectScale, setProjectScale] = useState<'small' | 'medium' | 'large'>('small');
  const [projectTimeline, setProjectTimeline] = useState<'short' | 'medium' | 'long'>('medium');
  const [projectBudget, setProjectBudget] = useState<'limited' | 'moderate' | 'unlimited'>('moderate');

  const compatibilityAnalyzer = useMemo(() => new LicenseCompatibilityAnalyzer(projectType), [projectType]);
  const migrationStrategy = useMemo(() => new LicenseMigrationStrategy(), []);
  const decisionFramework = useMemo(() => new CommercialUseDecisionFramework({
    type: projectType,
    scale: projectScale,
    timeline: projectTimeline,
    budget: projectBudget
  }), [projectType, projectScale, projectTimeline, projectBudget]);

  const compatibility = compatibilityAnalyzer.analyzeCompatibility();
  const businessRisk = compatibilityAnalyzer.calculateBusinessRisk();
  const timeLeft = migrationStrategy.timeUntilOpenSource();
  const migrationPlan = migrationStrategy.generateMigrationPlan();
  const linkingException = migrationStrategy.explainLinkingException();
  const decision = decisionFramework.generateDecision();

  return (
    <div className="license-analysis-dashboard">
      <div className="analysis-header">
        <h2>SpacetimeDB 寮€婧愪笌鍟嗕笟浣跨敤璁稿彲璇佸垎鏋?/h2>
        <p className="subtitle">鍏ㄩ潰浜嗚ВBSL璁稿彲璇佹潯娆惧強鍟嗕笟搴旂敤鎸囧崡</p>
      </div>

      {/* 璁稿彲璇佹瑙?*/}
      <div className="license-overview">
        <h3>璁稿彲璇佹瑙?/h3>
        <div className="license-cards">
          <div className="license-card current">
            <h4>褰撳墠璁稿彲璇?/h4>
            <div className="license-name">Business Source License 1.1</div>
            <div className="license-status">寮€婧愪絾鍟嗕笟鍙楅檺</div>
            <div className="license-period">鏈夋晥鏈熻嚦 2031骞?鏈?0鏃?/div>
          </div>

          <div className="license-card future">
            <h4>鏈潵璁稿彲璇?/h4>
            <div className="license-name">AGPL v3.0 + Linking Exception</div>
            <div className="license-status">瀹屽叏寮€婧?/div>
            <div className="license-period">2031骞?鏈?0鏃ュ悗鐢熸晥</div>
          </div>
        </div>
      </div>

      {/* 鍏抽敭鏉℃ */}
      <div className="key-terms">
        <h3>鍏抽敭浣跨敤鏉℃</h3>
        <div className="terms-grid">
          <div className="term-card allowed">
            <h4>鉁?鍏佽浣跨敤</h4>
            <ul>
              {SPACETIME_LICENSE_ANALYSIS.useCases.allowed.map((use, index) => (
                <li key={index}>{use}</li>
              ))}
            </ul>
          </div>

          <div className="term-card restricted">
            <h4>鈿狅笍 鍙楅檺浣跨敤</h4>
            <ul>
              {SPACETIME_LICENSE_ANALYSIS.useCases.restricted.map((use, index) => (
                <li key={index}>{use}</li>
              ))}
            </ul>
          </div>

          <div className="term-card prohibited">
            <h4>鉂?绂佹浣跨敤</h4>
            <ul>
              {SPACETIME_LICENSE_ANALYSIS.useCases.prohibited.map((use, index) => (
                <li key={index}>{use}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* 椤圭洰璇勪及 */}
      <div className="project-assessment">
        <h3>椤圭洰鍚堣鎬ц瘎浼?/h3>

        <div className="project-config">
          <div className="config-group">
            <label>椤圭洰绫诲瀷:</label>
            <select value={projectType} onChange={(e) => setProjectType(e.target.value as any)}>
              <option value="dapp">鍖哄潡閾綝App</option>
              <option value="saas">SaaS搴旂敤</option>
              <option value="enterprise">浼佷笟搴旂敤</option>
              <option value="game">娓告垙搴旂敤</option>
              <option value="mobile">绉诲姩搴旂敤</option>
            </select>
          </div>

          <div className="config-group">
            <label>椤圭洰瑙勬ā:</label>
            <select value={projectScale} onChange={(e) => setProjectScale(e.target.value as any)}>
              <option value="small">灏忓瀷 (鐢ㄦ埛 < 1K)</option>
              <option value="medium">涓瀷 (鐢ㄦ埛 1K-10K)</option>
              <option value="large">澶у瀷 (鐢ㄦ埛 > 10K)</option>
            </select>
          </div>

          <div className="config-group">
            <label>椤圭洰鍛ㄦ湡:</label>
            <select value={projectTimeline} onChange={(e) => setProjectTimeline(e.target.value as any)}>
              <option value="short">鐭湡 (< 1骞?</option>
              <option value="medium">涓湡 (1-3骞?</option>
              <option value="long">闀挎湡 (> 3骞?</option>
            </select>
          </div>

          <div className="config-group">
            <label>棰勭畻鎯呭喌:</label>
            <select value={projectBudget} onChange={(e) => setProjectBudget(e.target.value as any)}>
              <option value="limited">鏈夐檺</option>
              <option value="moderate">閫備腑</option>
              <option value="unlimited">鍏呰冻</option>
            </select>
          </div>
        </div>

        <div className="compatibility-result">
          <div className={`compatibility-status ${compatibility.compatible ? 'compatible' : 'incompatible'}`}>
            <h4>鍚堣鎬ц瘎浼?/h4>
            <div className="status-indicator">
              <span className="status-dot"></span>
              <span className="status-text">
                {compatibility.compatible ? '鉁?绗﹀悎璁稿彲璇佽姹? : '鉂?涓嶇鍚堣鍙瘉瑕佹眰'}
              </span>
            </div>
            <div className="risk-level">
              椋庨櫓绛夌骇: <span className={`risk-${compatibility.riskLevel}`}>{compatibility.riskLevel.toUpperCase()}</span>
            </div>
          </div>

          <div className="recommendations">
            <h4>寤鸿</h4>
            <ul>
              {compatibility.recommendations.map((rec, index) => (
                <li key={index}>{rec}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* 鍟嗕笟椋庨櫓璇勪及 */}
      <div className="business-risk">
        <h3>鍟嗕笟椋庨櫓璇勪及</h3>
        <div className="risk-metrics">
          <div className="risk-metric">
            <span className="label">娉曞緥椋庨櫓</span>
            <div className="risk-bar">
              <div className="risk-fill" style={{ width: `${businessRisk.legalRisk}%` }}></div>
              <span className="risk-value">{businessRisk.legalRisk}%</span>
            </div>
          </div>

          <div className="risk-metric">
            <span className="label">杩愯惀椋庨櫓</span>
            <div className="risk-bar">
              <div className="risk-fill" style={{ width: `${businessRisk.operationalRisk}%` }}></div>
              <span className="risk-value">{businessRisk.operationalRisk}%</span>
            </div>
          </div>

          <div className="risk-metric">
            <span className="label">璐㈠姟椋庨櫓</span>
            <div className="risk-bar">
              <div className="risk-fill" style={{ width: `${businessRisk.financialRisk}%` }}></div>
              <span className="risk-value">{businessRisk.financialRisk}%</span>
            </div>
          </div>
        </div>

        <div className="risk-recommendations">
          <h4>椋庨櫓 mitigation寤鸿</h4>
          <ul>
            {businessRisk.recommendations.map((rec, index) => (
              <li key={index}>{rec}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* 璁稿彲璇佹椂闂寸嚎 */}
      <div className="license-timeline">
        <h3>璁稿彲璇佹椂闂寸嚎</h3>
        <div className="timeline-container">
          <div className="timeline-item current">
            <div className="timeline-marker"></div>
            <div className="timeline-content">
              <h4>褰撳墠闃舵 (2024 - 2031)</h4>
              <p>Business Source License 1.1</p>
              <ul>
                <li>寮€婧愪絾鍟嗕笟浣跨敤鍙楅檺</li>
                <li>鍗曞疄渚嬬敓浜т娇鐢ㄥ厤璐?/li>
                <li>澶氬疄渚嬮渶瑕佸晢涓氳鍙瘉</li>
              </ul>
            </div>
          </div>

          <div className="timeline-item transition">
            <div className="timeline-marker"></div>
            <div className="timeline-content">
              <h4>杩囨浮鏈?(2030 - 2031)</h4>
              <p>鍑嗗AGPL杩佺Щ</p>
              <ul>
                <li>璇勪及浠ｇ爜鍚堣鎬?/li>
                <li>鍒跺畾杩佺Щ璁″垝</li>
                <li>鍩硅鍥㈤槦</li>
              </ul>
            </div>
          </div>

          <div className="timeline-item future">
            <div className="timeline-marker"></div>
            <div className="timeline-content">
              <h4>2031骞?鏈?0鏃ヤ箣鍚?/h4>
              <p>AGPL v3.0 + Linking Exception</p>
              <ul>
                <li>瀹屽叏寮€婧?/li>
                <li>鍟嗕笟浣跨敤鏃犻檺鍒?/li>
                <li>Linking Exception淇濇姢鍟嗕笟浠ｇ爜</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="time-remaining">
          <h4>璺濈寮€婧愭椂闂?/h4>
          <div className="time-display">
            <div className="time-unit">
              <span className="number">{timeLeft.years}</span>
              <span className="label">骞?/span>
            </div>
            <div className="time-unit">
              <span className="number">{timeLeft.months}</span>
              <span className="label">鏈?/span>
            </div>
            <div className="time-unit">
              <span className="number">{timeLeft.days}</span>
              <span className="label">澶?/span>
            </div>
          </div>
        </div>
      </div>

      {/* AGPL Linking Exception璇存槑 */}
      <div className="linking-exception">
        <h3>AGPL Linking Exception 璇﹁В</h3>
        <div className="exception-content">
          <div className="exception-summary">
            <h4>鏍稿績鍚箟</h4>
            <p>{linkingException.whatItMeans}</p>
          </div>

          <div className="exception-details">
            <div className="benefits">
              <h4>鍟嗕笟浼樺娍</h4>
              <ul>
                {linkingException.benefits.map((benefit, index) => (
                  <li key={index}>鉁?{benefit}</li>
                ))}
              </ul>
            </div>

            <div className="requirements">
              <h4>鍚堣瑕佹眰</h4>
              <ul>
                {linkingException.requirements.map((req, index) => (
                  <li key={index}>馃搵 {req}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* 鍟嗕笟鍐崇瓥寤鸿 */}
      <div className="commercial-decision">
        <h3>鍟嗕笟鍐崇瓥寤鸿</h3>

        <div className="decision-recommendation">
          <h4>鎺ㄨ崘鏂规</h4>
          <div className="recommendation-card">
            <div className="recommendation-text">{decision.recommendedApproach}</div>
            <div className="reasoning">
              <h5>鍐崇瓥鐞嗙敱</h5>
              <ul>
                {decision.reasoning.map((reason, index) => (
                  <li key={index}>{reason}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="decision-alternatives">
          <h4>鏇夸唬鏂规瀵规瘮</h4>
          <div className="alternatives-grid">
            {decision.alternatives.map((alt, index) => (
              <div key={index} className="alternative-card">
                <h5>{alt.option}</h5>
                <div className="pros-cons">
                  <div className="pros">
                    <strong>浼樺娍:</strong>
                    <ul>
                      {alt.pros.map((pro, i) => (
                        <li key={i}>{pro}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="cons">
                    <strong>鍔ｅ娍:</strong>
                    <ul>
                      {alt.cons.map((con, i) => (
                        <li key={i}>{con}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="suitability">
                  <span>閫傜敤鎬? </span>
                  <div className="suitability-bar">
                    <div className="suitability-fill" style={{ width: `${alt.suitability}%` }}></div>
                    <span className="suitability-value">{alt.suitability}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="next-steps">
          <h4>涓嬩竴姝ヨ鍔?/h4>
          <ol>
            {decision.nextSteps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </div>
      </div>

      {/* 鎬荤粨 */}
      <div className="license-summary">
        <h3>鎬荤粨</h3>
        <div className="summary-content">
          <div className="summary-highlights">
            <h4>馃搵 鍏抽敭瑕佺偣</h4>
            <ul>
              <li><strong>寮€婧愮姸鎬?</strong> 鏄殑锛屼娇鐢˙SL璁稿彲璇侊紙鍟嗕笟鍙嬪ソ鍨嬪紑婧愶級</li>
              <li><strong>鍟嗕笟浣跨敤:</strong> 鍏佽锛屼絾鏈夊崟瀹炰緥闄愬埗</li>
              <li><strong>鏃堕棿闄愬埗:</strong> 2031骞?鏈?0鏃ュ悗杞负瀹屽叏寮€婧?/li>
              <li><strong>鍖哄潡閾綝App:</strong> 楂樺害閫傚悎锛屾棤闇€鍟嗕笟璁稿彲璇?/li>
              <li><strong>浼佷笟搴旂敤:</strong> 鏍规嵁瑙勬ā鍙兘闇€瑕佸晢涓氳鍙瘉</li>
            </ul>
          </div>

          <div className="summary-recommendations">
            <h4>馃挕 寤鸿</h4>
            <p>
              瀵逛簬鎮ㄧ殑181BSeer鍖哄潡閾綝App椤圭洰锛屽彲浠?strong>鐩存帴浣跨敤BSL璁稿彲璇?/strong>锛?
              鏃犻渶鍟嗕笟璁稿彲璇併€傚缓璁細
            </p>
            <ul>
              <li>鐩戞帶椤圭洰瑙勬ā澧為暱</li>
              <li>鍏虫敞2031骞磋鍙瘉鍙樻洿</li>
              <li>鑰冭檻鍟嗕笟璁稿彲璇佷互鑾峰緱瀹樻柟鏀寔</li>
              <li>璇勪及鏄惁浣跨敤Maincloud鎵樼鏈嶅姟</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}