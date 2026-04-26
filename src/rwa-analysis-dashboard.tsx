import React, { useState } from 'react';
import {
  SPACETIME_RWA_ADVANTAGES,
  RWA_PLATFORM_COMPONENTS,
  RWA_PERFORMANCE_BENCHMARKS,
  RWACompetitiveAdvantages,
  RWA_IMPLEMENTATION_ROADMAP
} from './spacetime-rwa-analysis';

const SpacetimeRWAAnalysisDashboard: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedComponent, setSelectedComponent] = useState<any>(null);

  const categories = [
    { id: 'all', name: '鍏ㄩ儴浼樺娍', icon: '馃搳', color: 'bg-blue-500' },
    { id: 'data-management', name: '鏁版嵁绠＄悊', icon: '馃捑', color: 'bg-green-500' },
    { id: 'real-time', name: '瀹炴椂鎬?, icon: '鈿?, color: 'bg-yellow-500' },
    { id: 'security', name: '瀹夊叏鎬?, icon: '馃敀', color: 'bg-red-500' },
    { id: 'scalability', name: '鍙墿灞曟€?, icon: '馃搱', color: 'bg-purple-500' },
    { id: 'compliance', name: '鍚堣鎬?, icon: '鈿栵笍', color: 'bg-indigo-500' },
    { id: 'integration', name: '闆嗘垚鎬?, icon: '馃敆', color: 'bg-pink-500' }
  ];

  const filteredAdvantages = selectedCategory === 'all'
    ? SPACETIME_RWA_ADVANTAGES
    : SPACETIME_RWA_ADVANTAGES.filter(adv => adv.category === selectedCategory);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          SpacetimeDB 鍦?RWA 浜戝钩鍙颁腑鐨勪紭鍔?
        </h1>
        <p className="text-lg text-gray-600 max-w-4xl mx-auto">
          鎺㈢储SpacetimeDB濡備綍璧嬭兘鐜板疄涓栫晫璧勪骇(RWA)浜戝钩鍙扮殑寮€鍙戯紝
          鎻愪緵瀹炴椂銆侀珮鎬ц兘銆佸畨鍏ㄧ殑璧勪骇鏁板瓧鍖栬В鍐虫柟妗?
        </p>
      </div>

      {/* 绫诲埆閫夋嫨鍣?*/}
      <div className="flex flex-wrap justify-center gap-4 mb-8">
        {categories.map(category => (
          <button
            key={category.id}
            onClick={() => setSelectedCategory(category.id)}
            className={`px-6 py-3 rounded-lg font-medium transition-all flex items-center ${
              selectedCategory === category.id
                ? `${category.color} text-white shadow-lg`
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            <span className="mr-2 text-lg">{category.icon}</span>
            {category.name}
          </button>
        ))}
      </div>

      {/* 浼樺娍缃戞牸 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredAdvantages.map((advantage, index) => (
          <div
            key={index}
            className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow border border-gray-100"
          >
            <div className="flex items-center mb-4">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center mr-4 ${
                advantage.category === 'data-management' ? 'bg-green-100 text-green-600' :
                advantage.category === 'real-time' ? 'bg-yellow-100 text-yellow-600' :
                advantage.category === 'security' ? 'bg-red-100 text-red-600' :
                advantage.category === 'scalability' ? 'bg-purple-100 text-purple-600' :
                advantage.category === 'compliance' ? 'bg-indigo-100 text-indigo-600' :
                'bg-blue-100 text-blue-600'
              }`}>
                <span className="text-2xl">
                  {advantage.category === 'data-management' ? '馃捑' :
                   advantage.category === 'real-time' ? '鈿? :
                   advantage.category === 'security' ? '馃敀' :
                   advantage.category === 'scalability' ? '馃搱' :
                   advantage.category === 'compliance' ? '鈿栵笍' : '馃敆'}
                </span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{advantage.advantage}</h3>
                <span className="text-sm text-blue-600 capitalize">{advantage.category.replace('-', ' ')}</span>
              </div>
            </div>

            <p className="text-gray-600 mb-4 text-sm">{advantage.description}</p>

            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-900">RWA鐩稿叧鎬?</div>
              <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded">{advantage.rwaRelevance}</p>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="text-xs font-medium text-green-600">
                鎶€鏈紭鍔? {advantage.technicalBenefit}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 骞冲彴鏋舵瀯缁勪欢 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-8 mt-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          RWA 骞冲彴鏋舵瀯缁勪欢
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {RWA_PLATFORM_COMPONENTS.map((component, index) => (
            <div
              key={index}
              className="bg-white rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => setSelectedComponent(component)}
            >
              <h3 className="font-semibold text-gray-900 mb-3">{component.component}</h3>
              <div className="text-sm text-gray-600 mb-3">
                <strong>SpacetimeDB瑙掕壊:</strong> {component.spacetimeRole}
              </div>
              <div className="text-sm text-green-600 bg-green-50 p-2 rounded">
                {component.advantage}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 鎬ц兘鍩哄噯 */}
      <div className="bg-gradient-to-r from-green-50 to-teal-50 rounded-xl p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          RWA 鍦烘櫙鎬ц兘鍩哄噯
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {RWA_PERFORMANCE_BENCHMARKS.map((benchmark, index) => (
            <div key={index} className="bg-white rounded-lg p-6 shadow-md">
              <h3 className="font-semibold text-gray-900 mb-2">{benchmark.scenario}</h3>
              <p className="text-sm text-gray-600 mb-4">{benchmark.description}</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">鍚炲悙閲?</span>
                  <div className="font-medium text-blue-600">{benchmark.throughput}</div>
                </div>
                <div>
                  <span className="text-gray-500">寤惰繜:</span>
                  <div className="font-medium text-green-600">{benchmark.latency}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 绔炰簤浼樺娍瀵规瘮 */}
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          绔炰簤浼樺娍瀵规瘮
        </h2>
        <div className="space-y-6">
          <div className="bg-white rounded-lg p-6 shadow-md">
            <h3 className="font-semibold text-gray-900 mb-4">vs 浼犵粺鏁版嵁搴?/h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-sm font-medium text-gray-500 mb-2">浼樺娍</div>
                <div className="text-blue-600 font-medium">{RWACompetitiveAdvantages.vsTraditionalDatabases.advantage}</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-medium text-gray-500 mb-2">SpacetimeDB</div>
                <div className="text-green-600 text-sm">{RWACompetitiveAdvantages.vsTraditionalDatabases.spacetime}</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-medium text-gray-500 mb-2">浼犵粺鏁版嵁搴?/div>
                <div className="text-red-600 text-sm">{RWACompetitiveAdvantages.vsTraditionalDatabases.traditional}</div>
              </div>
            </div>
            <div className="mt-4 p-3 bg-blue-50 rounded">
              <strong>RWA褰卞搷:</strong> {RWACompetitiveAdvantages.vsTraditionalDatabases.rwaImpact}
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-md">
            <h3 className="font-semibold text-gray-900 mb-4">vs 绾尯鍧楅摼鏂规</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-sm font-medium text-gray-500 mb-2">浼樺娍</div>
                <div className="text-blue-600 font-medium">{RWACompetitiveAdvantages.vsBlockchainOnly.advantage}</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-medium text-gray-500 mb-2">SpacetimeDB</div>
                <div className="text-green-600 text-sm">{RWACompetitiveAdvantages.vsBlockchainOnly.spacetime}</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-medium text-gray-500 mb-2">绾尯鍧楅摼</div>
                <div className="text-red-600 text-sm">{RWACompetitiveAdvantages.vsBlockchainOnly.blockchain}</div>
              </div>
            </div>
            <div className="mt-4 p-3 bg-blue-50 rounded">
              <strong>RWA褰卞搷:</strong> {RWACompetitiveAdvantages.vsBlockchainOnly.rwaImpact}
            </div>
          </div>
        </div>
      </div>

      {/* 瀹炴柦璺嚎鍥?*/}
      <div className="bg-gradient-to-r from-orange-50 to-red-50 rounded-xl p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          瀹炴柦璺嚎鍥?
        </h2>
        <div className="space-y-4">
          {RWA_IMPLEMENTATION_ROADMAP.map((phase, index) => (
            <div key={index} className="bg-white rounded-lg p-6 shadow-md">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">{phase.phase}</h3>
                <span className="text-sm text-blue-600 font-medium">{phase.duration}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">鏍稿績缁勪欢:</div>
                  <div className="flex flex-wrap gap-1">
                    {phase.components.map((component, idx) => (
                      <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                        {component}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">SpacetimeDB閲嶇偣:</div>
                  <div className="text-sm text-green-600 bg-green-50 p-2 rounded">
                    {phase.spacetimeFocus}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 缁勪欢璇︽儏寮圭獥 */}
      {selectedComponent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-8">
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-2xl font-bold text-gray-900">{selectedComponent.component}</h2>
                <button
                  onClick={() => setSelectedComponent(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  脳
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">SpacetimeDB 瑙掕壊</h3>
                  <p className="text-gray-600">{selectedComponent.spacetimeRole}</p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">鏍稿績浼樺娍</h3>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-green-800">{selectedComponent.advantage}</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">鐩稿叧鎶€鏈壒鎬?/h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <h4 className="font-medium text-blue-900 mb-2">瀹炴椂鎬?/h4>
                      <p className="text-sm text-blue-700">姣绾ф暟鎹悓姝ュ拰鐘舵€佹洿鏂?/p>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <h4 className="font-medium text-purple-900 mb-2">鍙墿灞曟€?/h4>
                      <p className="text-sm text-purple-700">鏀寔楂樺苟鍙戣闂拰姘村钩鎵╁睍</p>
                    </div>
                    <div className="bg-red-50 p-4 rounded-lg">
                      <h4 className="font-medium text-red-900 mb-2">瀹夊叏鎬?/h4>
                      <p className="text-sm text-red-700">缁嗙矑搴︽潈闄愭帶鍒跺拰瀹¤鏃ュ織</p>
                    </div>
                    <div className="bg-yellow-50 p-4 rounded-lg">
                      <h4 className="font-medium text-yellow-900 mb-2">鍚堣鎬?/h4>
                      <p className="text-sm text-yellow-700">鑷姩鍖栨姤鍛婄敓鎴愬拰鐩戠鏀寔</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpacetimeRWAAnalysisDashboard;