import { useState } from 'react';
import { BlockchainSecurityConsiderations, ComplianceFrameworks, SPACETIME_SECURITY_FEATURES, SecurityArchitectureLayers, SecurityBestPractices, SecurityMonitoring } from './spacetime-security-analysis';

export function SpacetimeSecurityAnalysisDashboard() {
  const [selectedCategory, setSelectedCategory] = useState<'authentication' | 'authorization' | 'encryption' | 'network' | 'audit' | 'backup'>('authentication');
  const [selectedCompliance, setSelectedCompliance] = useState<'gdpr' | 'soc2' | 'iso27001'>('gdpr');

  const filteredFeatures = SPACETIME_SECURITY_FEATURES.filter(
    feature => feature.category === selectedCategory
  );

  const complianceData = ComplianceFrameworks[selectedCompliance as keyof typeof ComplianceFrameworks];

  return (
    <div className="security-analysis-dashboard">
      <div className="analysis-header">
        <h2>SpacetimeDB 鏁版嵁瀹夊叏鍒嗘瀽</h2>
        <p className="subtitle">鍏ㄩ潰鐨勫畨鍏ㄤ繚闅滄満鍒朵笌鍖哄潡閾惧簲鐢ㄥ畨鍏ㄥ疄璺?/p>
      </div>

      {/* 瀹夊叏姒傝 */}
      <div className="security-overview">
        <h3>瀹夊叏鏋舵瀯姒傝</h3>
        <div className="security-layers">
          <div className="layer-card">
            <h4>馃敀 缃戠粶灞傚畨鍏?/h4>
            <ul>
              {SecurityArchitectureLayers.networkLayer.features.map((feature, index) => (
                <li key={index}>鉁?{feature}</li>
              ))}
            </ul>
            <p className="blockchain-note">
              <strong>鍖哄潡閾鹃泦鎴?</strong> {SecurityArchitectureLayers.networkLayer.blockchainIntegration}
            </p>
          </div>

          <div className="layer-card">
            <h4>馃洝锔?搴旂敤灞傚畨鍏?/h4>
            <ul>
              {SecurityArchitectureLayers.applicationLayer.features.map((feature, index) => (
                <li key={index}>鉁?{feature}</li>
              ))}
            </ul>
            <p className="blockchain-note">
              <strong>鍖哄潡閾鹃泦鎴?</strong> {SecurityArchitectureLayers.applicationLayer.blockchainIntegration}
            </p>
          </div>

          <div className="layer-card">
            <h4>馃捑 鏁版嵁灞傚畨鍏?/h4>
            <ul>
              {SecurityArchitectureLayers.dataLayer.features.map((feature, index) => (
                <li key={index}>鉁?{feature}</li>
              ))}
            </ul>
            <p className="blockchain-note">
              <strong>鍖哄潡閾鹃泦鎴?</strong> {SecurityArchitectureLayers.dataLayer.blockchainIntegration}
            </p>
          </div>

          <div className="layer-card">
            <h4>馃敡 鐗╃悊灞傚畨鍏?/h4>
            <ul>
              {SecurityArchitectureLayers.physicalLayer.features.map((feature, index) => (
                <li key={index}>鉁?{feature}</li>
              ))}
            </ul>
            <p className="blockchain-note">
              <strong>鍖哄潡閾鹃泦鎴?</strong> {SecurityArchitectureLayers.physicalLayer.blockchainIntegration}
            </p>
          </div>
        </div>
      </div>

      {/* 瀹夊叏鐗规€ц鎯?*/}
      <div className="security-features">
        <h3>瀹夊叏鐗规€ц鎯?/h3>

        <div className="category-selector">
          <h4>閫夋嫨瀹夊叏绫诲埆</h4>
          <div className="category-buttons">
            {[
              { key: 'authentication', label: '韬唤楠岃瘉', icon: '馃攼' },
              { key: 'authorization', label: '璁块棶鎺у埗', icon: '馃洝锔? },
              { key: 'encryption', label: '鏁版嵁鍔犲瘑', icon: '馃敀' },
              { key: 'network', label: '缃戠粶瀹夊叏', icon: '馃寪' },
              { key: 'audit', label: '瀹¤鐩戞帶', icon: '馃搳' },
              { key: 'backup', label: '澶囦唤鎭㈠', icon: '馃捑' }
            ].map(({ key, label, icon }) => (
              <button
                key={key}
                className={`category-btn ${selectedCategory === key ? 'active' : ''}`}
                onClick={() => setSelectedCategory(key as any)}
              >
                <span className="icon">{icon}</span>
                <span className="label">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="features-grid">
          {filteredFeatures.map((feature, index) => (
            <div key={index} className="feature-card">
              <h4>{feature.feature}</h4>
              <p className="description">{feature.description}</p>
              <div className="implementation">
                <strong>瀹炵幇鏂瑰紡:</strong> {feature.implementation}
              </div>
              <div className="blockchain-relevance">
                <strong>鍖哄潡閾剧浉鍏虫€?</strong> {feature.blockchainRelevance}
              </div>
              <div className="compliance">
                <strong>鍚堣鏀寔:</strong>
                <div className="compliance-tags">
                  {feature.compliance.map((comp, i) => (
                    <span key={i} className="compliance-tag">{comp}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 鍖哄潡閾剧壒瀹氬畨鍏?*/}
      <div className="blockchain-security">
        <h3>鍖哄潡閾惧簲鐢ㄥ畨鍏ㄨ€冭檻</h3>

        <div className="blockchain-security-grid">
          <div className="security-domain">
            <h4>馃挵 DeFi搴旂敤瀹夊叏</h4>
            <div className="issues-solutions">
              <div className="issues">
                <h5>娼滃湪椋庨櫓</h5>
                <ul>
                  {BlockchainSecurityConsiderations.defiSecurity.issues.map((issue, index) => (
                    <li key={index}>鈿狅笍 {issue}</li>
                  ))}
                </ul>
              </div>
              <div className="solutions">
                <h5>SpacetimeDB瑙ｅ喅鏂规</h5>
                <ul>
                  {BlockchainSecurityConsiderations.defiSecurity.spacetimeSolutions.map((solution, index) => (
                    <li key={index}>鉁?{solution}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="security-domain">
            <h4>馃帹 NFT搴旂敤瀹夊叏</h4>
            <div className="issues-solutions">
              <div className="issues">
                <h5>娼滃湪椋庨櫓</h5>
                <ul>
                  {BlockchainSecurityConsiderations.nftSecurity.issues.map((issue, index) => (
                    <li key={index}>鈿狅笍 {issue}</li>
                  ))}
                </ul>
              </div>
              <div className="solutions">
                <h5>SpacetimeDB瑙ｅ喅鏂规</h5>
                <ul>
                  {BlockchainSecurityConsiderations.nftSecurity.spacetimeSolutions.map((solution, index) => (
                    <li key={index}>鉁?{solution}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="security-domain">
            <h4>馃憶 閽卞寘搴旂敤瀹夊叏</h4>
            <div className="issues-solutions">
              <div className="issues">
                <h5>娼滃湪椋庨櫓</h5>
                <ul>
                  {BlockchainSecurityConsiderations.walletSecurity.issues.map((issue, index) => (
                    <li key={index}>鈿狅笍 {issue}</li>
                  ))}
                </ul>
              </div>
              <div className="solutions">
                <h5>SpacetimeDB瑙ｅ喅鏂规</h5>
                <ul>
                  {BlockchainSecurityConsiderations.walletSecurity.spacetimeSolutions.map((solution, index) => (
                    <li key={index}>鉁?{solution}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 鍚堣鎬ф鏋?*/}
      <div className="compliance-frameworks">
        <h3>鍚堣鎬ф鏋舵敮鎸?/h3>

        <div className="compliance-selector">
          <h4>閫夋嫨鍚堣妗嗘灦</h4>
          <div className="compliance-buttons">
            {[
              { key: 'gdpr', label: 'GDPR', icon: '馃嚜馃嚭' },
              { key: 'soc2', label: 'SOC 2', icon: '馃彚' },
              { key: 'iso27001', label: 'ISO 27001', icon: '馃搵' }
            ].map(({ key, label, icon }) => (
              <button
                key={key}
                className={`compliance-btn ${selectedCompliance === key ? 'active' : ''}`}
                onClick={() => setSelectedCompliance(key as any)}
              >
                <span className="icon">{icon}</span>
                <span className="label">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="compliance-details">
          <div className="requirements">
            <h4>{selectedCompliance.toUpperCase()} 瑕佹眰</h4>
            <ul>
              {complianceData.requirements?.map((req, index) => (
                <li key={index}>馃搵 {req}</li>
              )) || complianceData.trustPrinciples?.map((principle, index) => (
                <li key={index}>馃搵 {principle}</li>
              )) || complianceData.controls?.map((control, index) => (
                <li key={index}>馃搵 {control}</li>
              ))}
            </ul>
          </div>

          <div className="implementation">
            <h4>SpacetimeDB瀹炵幇</h4>
            <ul>
              {complianceData.spacetimeImplementation?.map((impl, index) => (
                <li key={index}>鉁?{impl}</li>
              )) || complianceData.spacetimeControls?.map((control, index) => (
                <li key={index}>鉁?{control}</li>
              )) || complianceData.spacetimeMapping?.map((mapping, index) => (
                <li key={index}>鉁?{mapping}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* 瀹夊叏鏈€浣冲疄璺?*/}
      <div className="security-best-practices">
        <h3>瀹夊叏鏈€浣冲疄璺?/h3>

        <div className="practices-grid">
          <div className="practice-category">
            <h4>馃敡 寮€鍙戝畨鍏?/h4>
            <ul>
              {SecurityBestPractices.development.map((practice, index) => (
                <li key={index}>鉁?{practice}</li>
              ))}
            </ul>
          </div>

          <div className="practice-category">
            <h4>馃殌 閮ㄧ讲瀹夊叏</h4>
            <ul>
              {SecurityBestPractices.deployment.map((practice, index) => (
                <li key={index}>鉁?{practice}</li>
              ))}
            </ul>
          </div>

          <div className="practice-category">
            <h4>鈿欙笍 杩愯惀瀹夊叏</h4>
            <ul>
              {SecurityBestPractices.operations.map((practice, index) => (
                <li key={index}>鉁?{practice}</li>
              ))}
            </ul>
          </div>

          <div className="practice-category">
            <h4>鉀擄笍 鍖哄潡閾剧壒瀹?/h4>
            <ul>
              {SecurityBestPractices.blockchain.map((practice, index) => (
                <li key={index}>鉁?{practice}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* 瀹夊叏鐩戞帶鍜屽憡璀?*/}
      <div className="security-monitoring">
        <h3>瀹夊叏鐩戞帶涓庡憡璀?/h3>

        <div className="monitoring-sections">
          <div className="monitoring-section">
            <h4>馃搳 瀹炴椂鐩戞帶鎸囨爣</h4>
            <ul>
              {SecurityMonitoring.realTimeMetrics.map((metric, index) => (
                <li key={index}>馃搱 {metric}</li>
              ))}
            </ul>
          </div>

          <div className="monitoring-section">
            <h4>馃毃 鍛婅瑙勫垯</h4>
            <ul>
              {SecurityMonitoring.alertRules.map((rule, index) => (
                <li key={index}>鈿狅笍 {rule}</li>
              ))}
            </ul>
          </div>

          <div className="monitoring-section">
            <h4>馃攧 鍝嶅簲娴佺▼</h4>
            <ol>
              {SecurityMonitoring.responseProcedures.map((procedure, index) => (
                <li key={index}>{index + 1}. {procedure}</li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* 瀹夊叏璇勫垎 */}
      <div className="security-score">
        <h3>瀹夊叏鎴愮啛搴﹁瘎鍒?/h3>
        <div className="score-display">
          <div className="score-circle">
            <span className="score-number">95</span>
            <span className="score-unit">/100</span>
          </div>
          <div className="score-description">
            <h4>浼佷笟绾у畨鍏ㄤ繚闅?/h4>
            <p>SpacetimeDB鎻愪緵浜嗗叏闈㈢殑瀹夊叏淇濋殰鏈哄埗锛屾弧瓒充紒涓氱骇鍜屽尯鍧楅摼搴旂敤鐨勫畨鍏ㄨ姹?/p>
            <div className="score-breakdown">
              <div className="score-item">
                <span>韬唤楠岃瘉:</span>
                <span className="score-value">A+</span>
              </div>
              <div className="score-item">
                <span>鏁版嵁鍔犲瘑:</span>
                <span className="score-value">A+</span>
              </div>
              <div className="score-item">
                <span>璁块棶鎺у埗:</span>
                <span className="score-value">A</span>
              </div>
              <div className="score-item">
                <span>瀹¤鐩戞帶:</span>
                <span className="score-value">A+</span>
              </div>
              <div className="score-item">
                <span>鍖哄潡閾鹃泦鎴?</span>
                <span className="score-value">A+</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 鎬荤粨 */}
      <div className="security-summary">
        <h3>鎬荤粨锛氫负浠€涔圫pacetimeDB瀹夊叏鍙潬</h3>
        <div className="summary-content">
          <div className="summary-highlights">
            <h4>馃弳 鏍稿績瀹夊叏浼樺娍</h4>
            <ul>
              <li><strong>澶氬眰娆″畨鍏ㄦ灦鏋?/strong> - 浠庣綉缁滃埌鐗╃悊鐨勫叏闈繚鎶?/li>
              <li><strong>鍖哄潡閾惧師鐢熷畨鍏?/strong> - 涓撻棬涓哄尯鍧楅摼搴旂敤璁捐鐨勫畨鍏ㄦ満鍒?/li>
              <li><strong>浼佷笟绾у悎瑙勬敮鎸?/strong> - 鏀寔GDPR銆丼OC 2銆両SO 27001绛夋爣鍑?/li>
              <li><strong>瀹炴椂鐩戞帶鍛婅</strong> - 涓诲姩瀹夊叏鐩戞帶鍜屽揩閫熷搷搴?/li>
              <li><strong>涓嶅彲鍙樺璁℃棩蹇?/strong> - 纭繚鏁版嵁鎿嶄綔鐨勫彲杩芥函鎬?/li>
              <li><strong>鍔犲瘑鏁版嵁淇濇姢</strong> - 浼犺緭鍜屽瓨鍌ㄧ殑鍏ㄧ▼鍔犲瘑</li>
            </ul>
          </div>

          <div className="summary-recommendations">
            <h4>馃挕 瀹夊叏寤鸿</h4>
            <p>
              瀵逛簬鎮ㄧ殑181BSeer鍖哄潡閾綝App锛孲pacetimeDB鎻愪緵浜嗗畬鍠勭殑瀹夊叏淇濋殰锛?
            </p>
            <ul>
              <li>瀹炴柦缁嗙矑搴︾殑璁块棶鎺у埗绛栫暐</li>
              <li>鍚敤TLS 1.3鍔犲瘑浼犺緭</li>
              <li>閰嶇疆瀹炴椂鐩戞帶鍜屽憡璀?/li>
              <li>瀹氭湡杩涜瀹夊叏瀹¤</li>
              <li>瀹炴柦澶氬眰娆＄殑澶囦唤绛栫暐</li>
              <li>閬靛惊鍖哄潡閾惧畨鍏ㄦ渶浣冲疄璺?/li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}