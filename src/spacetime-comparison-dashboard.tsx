import React, { useState, useMemo } from 'react';
import { DATABASE_COMPARISON, SpacetimeAdvantageAnalyzer, PERFORMANCE_METRICS, CostBenefitAnalysis } from './spacetime-vs-traditional-analysis';

export function SpacetimeVsTraditionalComparison() {
  const [selectedAppType, setSelectedAppType] = useState<'realtime' | 'collaborative' | 'gaming' | 'financial' | 'social' | 'iot'>('realtime');
  const [userScale, setUserScale] = useState<number>(10000);

  const analyzer = useMemo(() => new SpacetimeAdvantageAnalyzer(selectedAppType), [selectedAppType]);
  const costAnalysis = useMemo(() => new CostBenefitAnalysis(userScale, 'high'), [userScale]);

  const advantageScore = analyzer.calculateAdvantageScore();
  const keyAdvantages = analyzer.getKeyAdvantages();
  const architectureComparison = analyzer.compareWithTraditional();
  const roi = costAnalysis.calculateROI();
  const suitabilityScore = costAnalysis.getSuitabilityScore();

  return (
    <div className="spacetime-comparison">
      <div className="comparison-header">
        <h2>SpacetimeDB vs 浼犵粺鏁版嵁搴撳姣斿垎鏋?/h2>
        <p className="subtitle">閽堝鎮ㄧ殑鍖哄潡閾綝App鐨勮缁嗗姣?/p>
      </div>

      {/* 搴旂敤绫诲瀷閫夋嫨鍣?*/}
      <div className="app-type-selector">
        <h3>閫夋嫨鎮ㄧ殑搴旂敤绫诲瀷</h3>
        <div className="app-types">
          {[
            { key: 'realtime', label: '瀹炴椂搴旂敤', icon: '鈿? },
            { key: 'collaborative', label: '鍗忎綔搴旂敤', icon: '馃' },
            { key: 'gaming', label: '娓告垙搴旂敤', icon: '馃幃' },
            { key: 'financial', label: '閲戣瀺搴旂敤', icon: '馃挵' },
            { key: 'social', label: '绀句氦搴旂敤', icon: '馃懃' },
            { key: 'iot', label: '鐗╄仈缃?, icon: '馃敆' }
          ].map(({ key, label, icon }) => (
            <button
              key={key}
              className={`app-type-btn ${selectedAppType === key ? 'active' : ''}`}
              onClick={() => setSelectedAppType(key as any)}
            >
              <span className="icon">{icon}</span>
              <span className="label">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 浼樺娍璇勫垎 */}
      <div className="advantage-score">
        <h3>SpacetimeDB浼樺娍璇勫垎</h3>
        <div className="score-display">
          <div className="score-circle">
            <span className="score-number">{advantageScore}</span>
            <span className="score-unit">%</span>
          </div>
          <div className="score-description">
            <p>鐩稿浜庝紶缁熸暟鎹簱鐨勪紭鍔跨▼搴?/p>
            <div className="score-bar">
              <div
                className="score-fill"
                style={{ width: `${advantageScore}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* 鏍稿績浼樺娍 */}
      <div className="key-advantages">
        <h3>鏍稿績浼樺娍</h3>
        <div className="advantages-grid">
          {keyAdvantages.map((advantage, index) => (
            <div key={index} className="advantage-card">
              <div className="advantage-icon">鉁?/div>
              <p>{advantage}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 鏋舵瀯瀵规瘮 */}
      <div className="architecture-comparison">
        <h3>鏋舵瀯瀵规瘮</h3>
        <div className="architecture-cards">
          <div className="architecture-card spacetime">
            <h4>馃殌 SpacetimeDB鏋舵瀯</h4>
            <div className="architecture-flow">
              {architectureComparison.spacetimeArchitecture}
            </div>
            <ul className="benefits-list">
              {architectureComparison.spacetimeBenefits.map((benefit, index) => (
                <li key={index}>鉁?{benefit}</li>
              ))}
            </ul>
          </div>

          <div className="architecture-card traditional">
            <h4>馃搳 浼犵粺鏋舵瀯</h4>
            <div className="architecture-flow">
              {architectureComparison.traditionalArchitecture}
            </div>
            <ul className="complexity-list">
              <li>鉂?澶氬眰鏋舵瀯澶嶆潅</li>
              <li>鉂?缃戠粶寤惰繜绱Н</li>
              <li>鉂?寮€鍙戝懆鏈熼暱</li>
              <li>鉂?杩愮淮鎴愭湰楂?/li>
            </ul>
          </div>
        </div>
      </div>

      {/* 鎬ц兘瀵规瘮 */}
      <div className="performance-comparison">
        <h3>鎬ц兘瀵规瘮</h3>
        <div className="metrics-grid">
          {Object.entries(PERFORMANCE_METRICS).map(([metric, data]) => (
            <div key={metric} className="metric-card">
              <h4>{metric === 'latency' ? '寤惰繜' :
                   metric === 'throughput' ? '鍚炲悙閲? :
                   metric === 'concurrentUsers' ? '骞跺彂鐢ㄦ埛' :
                   metric === 'developmentTime' ? '寮€鍙戞椂闂? : '杩愮淮澶嶆潅搴?}</h4>
              <div className="metric-values">
                <div className="metric-value spacetime">
                  <span className="label">SpacetimeDB:</span>
                  <span className="value">{data.spacetimeDB}</span>
                </div>
                <div className="metric-value traditional">
                  <span className="label">浼犵粺鏁版嵁搴?</span>
                  <span className="value">{data.traditionalDB}</span>
                </div>
                <div className="improvement">
                  <span className="improvement-label">鎻愬崌:</span>
                  <span className="improvement-value">{data.improvement}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 璇︾粏鐗规€у姣?*/}
      <div className="detailed-comparison">
        <h3>璇︾粏鐗规€у姣?/h3>
        <div className="comparison-table">
          <div className="table-header">
            <div className="feature-column">鐗规€?/div>
            <div className="spacetime-column">SpacetimeDB</div>
            <div className="traditional-column">浼犵粺鏁版嵁搴?/div>
            <div className="advantage-column">浼樺娍</div>
          </div>
          {DATABASE_COMPARISON.map((comparison, index) => (
            <div key={index} className="comparison-row">
              <div className="feature-column">
                <span className={`impact-dot ${comparison.impact}`}></span>
                {comparison.feature}
              </div>
              <div className="spacetime-column">
                {comparison.spacetimeDB}
              </div>
              <div className="traditional-column">
                {comparison.traditionalDB}
              </div>
              <div className="advantage-column">
                <span className={`advantage-badge ${comparison.advantage}`}>
                  {comparison.advantage === 'spacetime' ? 'SpacetimeDB棰嗗厛' :
                   comparison.advantage === 'traditional' ? '浼犵粺鏁版嵁搴撻鍏? :
                   '鍚勬湁浼樺娍'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 鎴愭湰鏁堢泭鍒嗘瀽 */}
      <div className="cost-benefit-analysis">
        <h3>鎴愭湰鏁堢泭鍒嗘瀽</h3>

        <div className="user-scale-input">
          <label>棰勬湡鐢ㄦ埛瑙勬ā: {userScale.toLocaleString()}</label>
          <input
            type="range"
            min="1000"
            max="100000"
            step="1000"
            value={userScale}
            onChange={(e) => setUserScale(Number(e.target.value))}
          />
          <div className="scale-labels">
            <span>1K</span>
            <span>100K</span>
          </div>
        </div>

        <div className="roi-display">
          <div className="roi-score">
            <h4>鎶曡祫鍥炴姤鐜?(ROI)</h4>
            <div className="roi-circle">
              <span className="roi-number">{Math.round(roi.totalROI)}</span>
              <span className="roi-unit">%</span>
            </div>
          </div>

          <div className="roi-breakdown">
            <div className="roi-item">
              <span className="label">寮€鍙戞垚鏈妭鐪?/span>
              <span className="value">${roi.developmentSavings.toLocaleString()}</span>
            </div>
            <div className="roi-item">
              <span className="label">杩愮淮鎴愭湰鑺傜渷</span>
              <span className="value">${roi.operationalSavings.toLocaleString()}</span>
            </div>
            <div className="roi-item">
              <span className="label">鎬ц兘鏀剁泭</span>
              <span className="value">${roi.performanceGains.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="suitability-score">
          <h4>閫傜敤鎬ц瘎鍒?/h4>
          <div className="suitability-meter">
            <div className="suitability-fill" style={{ width: `${suitabilityScore}%` }}></div>
            <span className="suitability-text">{suitabilityScore}/100</span>
          </div>
          <p className="suitability-description">
            {suitabilityScore > 80 ? '楂樺害鎺ㄨ崘浣跨敤SpacetimeDB' :
             suitabilityScore > 60 ? '鎺ㄨ崘浣跨敤SpacetimeDB' :
             suitabilityScore > 40 ? '鍙互鑰冭檻浣跨敤SpacetimeDB' :
             '寤鸿璋ㄦ厧璇勪及'}
          </p>
        </div>
      </div>

      {/* 鎬荤粨 */}
      <div className="comparison-summary">
        <h3>鎬荤粨</h3>
        <div className="summary-content">
          <div className="summary-highlight">
            <h4>馃幆 涓轰粈涔堥€夋嫨SpacetimeDB锛?/h4>
            <ul>
              <li><strong>瀹炴椂鎬ц兘鍗撹秺</strong> - 寤惰繜闄嶄綆60-75%锛屾敮鎸佸ぇ瑙勬ā骞跺彂</li>
              <li><strong>鏋舵瀯绠€鍖?/strong> - 鍑忓皯50-70%鐨勫悗绔唬鐮侊紝鍓嶇鐩存帴杩炴帴</li>
              <li><strong>寮€鍙戞晥鐜囨彁鍗?/strong> - 寮€鍙戞椂闂村噺灏?0-50%锛孯OI楂樿揪90%</li>
              <li><strong>瀹岀編閫傞厤鍖哄潡閾惧簲鐢?/strong> - 鍘熺敓鏀寔瀹炴椂鏁版嵁鍚屾鍜屽垎甯冨紡鏋舵瀯</li>
            </ul>
          </div>

          <div className="decision-guide">
            <h4>馃挕 鍐崇瓥寤鸿</h4>
            <p>
              瀵逛簬闇€瑕?strong>瀹炴椂鏁版嵁鍚屾</strong>銆?strong>楂樺苟鍙?/strong>銆?
              <strong>蹇€熷紑鍙?/strong>鐨勫尯鍧楅摼DApp锛?
              SpacetimeDB鏄紶缁熸暟鎹簱鐨勭悊鎯虫浛浠ｆ柟妗堛€?
            </p>
            <p>
              灏ゅ叾鍦ㄧ敤鎴疯妯¤秴杩?0,000鏃讹紝SpacetimeDB鐨勪紭鍔垮皢鏇村姞鏄庢樉锛?
              鑳藉甯︽潵鏄捐憲鐨勬€ц兘鎻愬崌鍜屾垚鏈妭鐪併€?
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};