import React, { useState } from 'react';
import { SPACETIME_USE_CASES, USE_CASES_BY_CATEGORY, PERFORMANCE_BENCHMARKS } from './spacetime-use-cases';

const UseCasesDashboard: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedUseCase, setSelectedUseCase] = useState<any>(null);

  const categories = [
    { id: 'all', name: '鍏ㄩ儴妗堜緥', icon: '馃搳' },
    { id: 'blockchain', name: '鍖哄潡閾惧簲鐢?, icon: '鉀擄笍' },
    { id: 'gaming', name: '娓告垙搴旂敤', icon: '馃幃' },
    { id: 'realtime-apps', name: '瀹炴椂搴旂敤', icon: '鈿? },
    { id: 'social', name: '绀句氦搴旂敤', icon: '馃懃' },
    { id: 'iot', name: '鐗╄仈缃?, icon: '馃敆' },
    { id: 'financial', name: '閲戣瀺搴旂敤', icon: '馃挵' }
  ];

  const filteredUseCases = selectedCategory === 'all'
    ? SPACETIME_USE_CASES
    : USE_CASES_BY_CATEGORY[selectedCategory as keyof typeof USE_CASES_BY_CATEGORY] || [];

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          SpacetimeDB 鍏稿瀷搴旂敤妗堜緥
        </h1>
        <p className="text-lg text-gray-600 max-w-3xl mx-auto">
          鎺㈢储SpacetimeDB鍦ㄥ悇涓鍩熺殑瀹為檯搴旂敤鍦烘櫙鍜屾妧鏈紭鍔?
        </p>
      </div>

      {/* 绫诲埆閫夋嫨鍣?*/}
      <div className="flex flex-wrap justify-center gap-4 mb-8">
        {categories.map(category => (
          <button
            key={category.id}
            onClick={() => setSelectedCategory(category.id)}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              selectedCategory === category.id
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            <span className="mr-2">{category.icon}</span>
            {category.name}
          </button>
        ))}
      </div>

      {/* 搴旂敤妗堜緥缃戞牸 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredUseCases.map((useCase, index) => (
          <div
            key={index}
            className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer border border-gray-100"
            onClick={() => setSelectedUseCase(useCase)}
          >
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                <span className="text-2xl">
                  {useCase.category === 'blockchain' && '鉀擄笍'}
                  {useCase.category === 'gaming' && '馃幃'}
                  {useCase.category === 'realtime-apps' && '鈿?}
                  {useCase.category === 'social' && '馃懃'}
                  {useCase.category === 'iot' && '馃敆'}
                  {useCase.category === 'financial' && '馃挵'}
                </span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{useCase.name}</h3>
                <span className="text-sm text-blue-600 capitalize">{useCase.category.replace('-', ' ')}</span>
              </div>
            </div>

            <p className="text-gray-600 mb-4 line-clamp-3">{useCase.description}</p>

            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-900">鍏抽敭鐗规€?</div>
              <div className="flex flex-wrap gap-1">
                {useCase.keyFeatures.slice(0, 2).map((feature: string, idx: number) => (
                  <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                    {feature}
                  </span>
                ))}
                {useCase.keyFeatures.length > 2 && (
                  <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                    +{useCase.keyFeatures.length - 2} 鏇村
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="text-sm text-green-600 font-medium">
                鍙墿灞曟€? {useCase.scalability}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 鎬ц兘鍩哄噯 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-8 mt-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          鎬ц兘鍩哄噯鏁版嵁
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PERFORMANCE_BENCHMARKS.map((benchmark, index) => (
            <div key={index} className="bg-white rounded-lg p-6 shadow-md">
              <h3 className="font-semibold text-gray-900 mb-4">{benchmark.useCase}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">鍚炲悙閲?</span>
                  <span className="font-medium text-blue-600">{benchmark.throughput}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">寤惰繜:</span>
                  <span className="font-medium text-green-600">{benchmark.latency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">骞跺彂:</span>
                  <span className="font-medium text-purple-600">{benchmark.concurrency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">鏁版嵁閲?</span>
                  <span className="font-medium text-orange-600">{benchmark.dataVolume}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 璇︾粏妗堜緥寮圭獥 */}
      {selectedUseCase && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-8">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{selectedUseCase.name}</h2>
                  <p className="text-blue-600 capitalize mt-1">{selectedUseCase.category.replace('-', ' ')}</p>
                </div>
                <button
                  onClick={() => setSelectedUseCase(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  脳
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">搴旂敤鎻忚堪</h3>
                  <p className="text-gray-600 mb-6">{selectedUseCase.description}</p>

                  <h3 className="text-lg font-semibold text-gray-900 mb-3">鍏抽敭鐗规€?/h3>
                  <ul className="space-y-2 mb-6">
                    {selectedUseCase.keyFeatures.map((feature: string, idx: number) => (
                      <li key={idx} className="flex items-center text-gray-700">
                        <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <h3 className="text-lg font-semibold text-gray-900 mb-3">鍙墿灞曟€?/h3>
                  <p className="text-green-600 font-medium">{selectedUseCase.scalability}</p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">鎶€鏈紭鍔?/h3>
                  <ul className="space-y-2 mb-6">
                    {selectedUseCase.technicalBenefits.map((benefit: string, idx: number) => (
                      <li key={idx} className="flex items-center text-gray-700">
                        <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                        {benefit}
                      </li>
                    ))}
                  </ul>

                  <h3 className="text-lg font-semibold text-gray-900 mb-3">搴旂敤绀轰緥</h3>
                  <p className="text-gray-600 bg-gray-50 p-4 rounded-lg">{selectedUseCase.example}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UseCasesDashboard;