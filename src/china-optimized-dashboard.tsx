import { useEffect, useState } from 'react';
import { createChinaOptimizedSpacetimeClient } from './china-compliance-solution';

export function ChinaOptimizedDashboard() {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'fallback' | 'offline'>('connecting');
  const [networkInfo, setNetworkInfo] = useState<any>(null);
  const [client] = useState(() => createChinaOptimizedSpacetimeClient());

  useEffect(() => {
    initializeConnection();
  }, []);

  const initializeConnection = async () => {
    try {
      // 鑾峰彇鏈€浣宠繛鎺?
      const optimalUrl = await client.connect();

      setNetworkInfo({
        url: optimalUrl,
        region: optimalUrl.includes('aliyun') ? '闃块噷浜戝唴鍦? :
                optimalUrl.includes('tencent') ? '鑵捐浜戝唴鍦? :
                optimalUrl.includes('cloudflare') ? 'Cloudflare CDN' : '娴峰鐩磋繛',
        strategy: '鏅鸿兘璺敱'
      });

      setConnectionStatus('connected');
    } catch (error) {
      console.warn('SpacetimeDB杩炴帴澶辫触锛屼娇鐢ㄧ绾挎ā寮?', error);
      setConnectionStatus('offline');
    }
  };

  return (
    <div className="china-dashboard">
      <div className="connection-status">
        <h3>缃戠粶杩炴帴鐘舵€?/h3>
        <div className={`status-indicator ${connectionStatus}`}>
          <span className="status-dot"></span>
          <span className="status-text">
            {connectionStatus === 'connecting' && '杩炴帴涓?..'}
            {connectionStatus === 'connected' && '宸茶繛鎺?(鍥藉唴浼樺寲)'}
            {connectionStatus === 'fallback' && '闄嶇骇妯″紡 (鏈湴缂撳瓨)'}
            {connectionStatus === 'offline' && '绂荤嚎妯″紡 (鍖哄潡閾剧洿杩?'}
          </span>
        </div>

        {networkInfo && (
          <div className="network-info">
            <p><strong>褰撳墠鑺傜偣:</strong> {networkInfo.region}</p>
            <p><strong>杩炴帴绛栫暐:</strong> {networkInfo.strategy}</p>
            <p><strong>鏁版嵁鍚堣:</strong> 绗﹀悎涓浗鐩戠瑕佹眰</p>
          </div>
        )}
      </div>

      <div className="features-grid">
        <div className="feature-card">
          <h4>馃殌 鏅鸿兘璺敱</h4>
          <p>鑷姩閫夋嫨鏈€蹇殑鍥藉唴鑺傜偣锛岀‘淇濈ǔ瀹氳繛鎺?/p>
        </div>

        <div className="feature-card">
          <h4>馃敀 鏁版嵁鍚堣</h4>
          <p>鏁忔劅鏁版嵁鑷姩鑴辨晱锛岀鍚堢綉缁滃畨鍏ㄦ硶瑕佹眰</p>
        </div>

        <div className="feature-card">
          <h4>馃捑 鏈湴缂撳瓨</h4>
          <p>缃戠粶涓嶇ǔ瀹氭椂鑷姩鍒囨崲鍒版湰鍦扮紦瀛樻ā寮?/p>
        </div>

        <div className="feature-card">
          <h4>馃攧 鏁呴殰杞Щ</h4>
          <p>澶氶噸澶囦唤纭繚鏈嶅姟杩炵画鎬?/p>
        </div>
      </div>

      <div className="performance-metrics">
        <h3>鎬ц兘鎸囨爣</h3>
        <div className="metrics-grid">
          <div className="metric">
            <span className="label">杩炴帴寤惰繜</span>
            <span className="value">50-200ms</span>
          </div>
          <div className="metric">
            <span className="label">鍙敤鎬?/span>
            <span className="value">99.9%</span>
          </div>
          <div className="metric">
            <span className="label">鍚堣绛夌骇</span>
            <span className="value">鏍囧噯绾?/span>
          </div>
        </div>
      </div>
    </div>
  );
}

// 鍚堣鎬ф鏌ョ粍浠?
export function ComplianceChecker({ data }: { data: any }) {
  const [client] = useState(() => createChinaOptimizedSpacetimeClient());
  const [compliance, setCompliance] = useState<any>(null);

  useEffect(() => {
    checkDataCompliance();
  }, [data]);

  const checkDataCompliance = async () => {
    if (!data) return;

    const result = await client.complianceManager.checkCompliance(data);
    setCompliance(result);
  };

  if (!compliance) return null;

  return (
    <div className={`compliance-checker ${compliance.compliant ? 'compliant' : 'non-compliant'}`}>
      <h4>鍚堣鎬ф鏌?/h4>
      <div className="compliance-details">
        <p><strong>鏁版嵁鍒嗙被:</strong> {compliance.dataClass}</p>
        <p><strong>鍚堣鐘舵€?</strong> {compliance.compliant ? '鉁?鍚堣' : '鉂?涓嶅悎瑙?}</p>

        {compliance.restrictions.length > 0 && (
          <div className="restrictions">
            <strong>闄愬埗鏉′欢:</strong>
            <ul>
              {compliance.restrictions.map((restriction: string, index: number) => (
                <li key={index}>{restriction}</li>
              ))}
            </ul>
          </div>
        )}

        {compliance.recommendations.length > 0 && (
          <div className="recommendations">
            <strong>寤鸿鎺柦:</strong>
            <ul>
              {compliance.recommendations.map((rec: string, index: number) => (
                <li key={index}>{rec}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}