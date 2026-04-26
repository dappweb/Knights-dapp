// SpacetimeDB 鍏稿瀷搴旂敤妗堜緥鍒嗘瀽

export interface UseCase {
  category: 'gaming' | 'blockchain' | 'realtime-apps' | 'social' | 'iot' | 'financial';
  name: string;
  description: string;
  keyFeatures: string[];
  technicalBenefits: string[];
  scalability: string;
  example: string;
}

// SpacetimeDB鍏稿瀷搴旂敤妗堜緥
export const SPACETIME_USE_CASES: UseCase[] = [
  // 鍖哄潡閾句笌DeFi搴旂敤
  {
    category: 'blockchain',
    name: 'DeFi 鍗忚浠〃鏉?,
    description: '瀹炴椂鏄剧ずDeFi鍗忚鐨凾VL銆佹敹鐩婄巼銆佹祦鍔ㄦ€ф睜鐘舵€佺瓑鍏抽敭鎸囨爣',
    keyFeatures: [
      '瀹炴椂浠锋牸鏇存柊',
      '浜ゆ槗鍘嗗彶杩借釜',
      '娴佸姩鎬ф睜鐩戞帶',
      '椋庨櫓鎸囨爣璁＄畻'
    ],
    technicalBenefits: [
      'WebSocket瀹炴椂鍚屾',
      '浣庡欢杩熸暟鎹洿鏂?,
      '鍒嗗竷寮忔暟鎹鐞?,
      '鍖哄潡閾句簨浠堕┍鍔ㄦ洿鏂?
    ],
    scalability: '鏀寔鏁板崈涓祦鍔ㄦ€ф睜鐨勫疄鏃剁洃鎺?,
    example: 'Uniswap V3 瀹炴椂浠〃鏉匡紝鏄剧ず姹犲瓙娣卞害銆佹粦鐐瑰拰浜ゆ槗閲?
  },
  {
    category: 'blockchain',
    name: 'NFT 甯傚満骞冲彴',
    description: 'NFT浜ゆ槗骞冲彴锛屾敮鎸佸疄鏃舵媿鍗栥€佸嚭浠峰拰浜ゆ槗鐘舵€佹洿鏂?,
    keyFeatures: [
      '瀹炴椂鎷嶅崠鐘舵€?,
      '浠锋牸鍙樺姩閫氱煡',
      '鏀惰棌鍝佽拷韪?,
      '浜ゆ槗鍘嗗彶璁板綍'
    ],
    technicalBenefits: [
      '姣绾у疄鏃舵洿鏂?,
      '骞跺彂鎷嶅崠澶勭悊',
      '鍒嗗竷寮忕姸鎬佸悓姝?,
      '浜嬩欢椹卞姩鏋舵瀯'
    ],
    scalability: '鏀寔鏁扮櫨涓嘚FT鐨勫疄鏃朵氦鏄?,
    example: 'OpenSea椋庢牸鐨凬FT甯傚満锛屾敮鎸佸疄鏃剁珵浠峰拰浜ゆ槗纭'
  },
  {
    category: 'blockchain',
    name: '鍖哄潡閾鹃挶鍖呭簲鐢?,
    description: '澶氶摼閽卞寘搴旂敤锛屾敮鎸佸疄鏃朵綑棰濇洿鏂板拰浜ゆ槗閫氱煡',
    keyFeatures: [
      '璺ㄩ摼浣欓鍚屾',
      '瀹炴椂浜ゆ槗閫氱煡',
      '鍦板潃绨跨鐞?,
      '浜ゆ槗鍘嗗彶鍒嗘瀽'
    ],
    technicalBenefits: [
      '澶氶摼鏁版嵁鑱氬悎',
      '瀹炴椂鎺ㄩ€侀€氱煡',
      '绂荤嚎鏁版嵁缂撳瓨',
      '瀹夊叏鏉冮檺鎺у埗'
    ],
    scalability: '鏀寔鏁扮櫨涓囧湴鍧€鐨勫疄鏃剁洃鎺?,
    example: 'MetaMask澧炲己鐗堬紝鏀寔瀹炴椂gas浠锋牸鍜屼氦鏄撶姸鎬佹洿鏂?
  },

  // 娓告垙搴旂敤
  {
    category: 'gaming',
    name: '澶氫汉鍦ㄧ嚎娓告垙',
    description: '瀹炴椂澶氫汉娓告垙锛屾敮鎸佺帺瀹剁姸鎬佸悓姝ュ拰娓告垙涓栫晫鏇存柊',
    keyFeatures: [
      '鐜╁浣嶇疆鍚屾',
      '瀹炴椂鑱婂ぉ绯荤粺',
      '娓告垙鐘舵€佺鐞?,
      '鎺掕姒滄洿鏂?
    ],
    technicalBenefits: [
      '浣庡欢杩熺姸鎬佸悓姝?,
      '鍒嗗竷寮忔父鎴忔湇鍔″櫒',
      '瀹炴椂浜嬩欢澶勭悊',
      '鍙紪绋嬫父鎴忛€昏緫'
    ],
    scalability: '鏀寔鏁板崈鐜╁鍚屾椂鍦ㄧ嚎',
    example: 'MOBA娓告垙锛屾敮鎸佸疄鏃剁帺瀹剁Щ鍔ㄥ拰鎶€鑳介噴鏀惧悓姝?
  },
  {
    category: 'gaming',
    name: '娓告垙鍐呯粡娴庣郴缁?,
    description: '娓告垙鍐呰櫄鎷熻揣甯佸拰鐗╁搧浜ゆ槗绯荤粺',
    keyFeatures: [
      '瀹炴椂浠锋牸鏇存柊',
      '浜ゆ槗鎾悎寮曟搸',
      '搴撳瓨绠＄悊',
      '鎷嶅崠绯荤粺'
    ],
    technicalBenefits: [
      '楂橀浜ゆ槗澶勭悊',
      '瀹炴椂浠锋牸鍙戠幇',
      '鍒嗗竷寮忚处鏈?,
      '闃叉璇堟満鍒?
    ],
    scalability: '鏀寔鏁扮櫨涓囦氦鏄?鍒嗛挓',
    example: '娓告垙鍐呬氦鏄撴墍锛屾敮鎸佸疄鏃朵拱鍗栧鎵樺拰鎴愪氦纭'
  },

  // 瀹炴椂搴旂敤
  {
    category: 'realtime-apps',
    name: '鍗忎綔鏂囨。缂栬緫',
    description: '澶氫汉瀹炴椂鍗忎綔鏂囨。缂栬緫鍣紝鏀寔骞跺彂缂栬緫鍜屽啿绐佽В鍐?,
    keyFeatures: [
      '瀹炴椂鍏夋爣鍚屾',
      '鎿嶄綔鍙樻崲绠楁硶',
      '鐗堟湰鎺у埗',
      '绂荤嚎缂栬緫鏀寔'
    ],
    technicalBenefits: [
      'CRDT鏁版嵁缁撴瀯',
      '瀹炴椂鍗忎綔鍗忚',
      '鍒嗗竷寮忎竴鑷存€?,
      '缃戠粶瀹归敊鎬?
    ],
    scalability: '鏀寔鏁扮櫨鐢ㄦ埛鍚屾椂缂栬緫',
    example: 'Google Docs椋庢牸鐨勫崗浣滅紪杈戝櫒锛屾敮鎸佸疄鏃跺厜鏍囧拰缂栬緫鍘嗗彶'
  },
  {
    category: 'realtime-apps',
    name: '瀹炴椂浠〃鏉?,
    description: '涓氬姟鏅鸿兘浠〃鏉匡紝鏀寔瀹炴椂鏁版嵁鏇存柊鍜屽彲瑙嗗寲',
    keyFeatures: [
      '瀹炴椂鎸囨爣鏇存柊',
      '鑷畾涔夊浘琛?,
      '璀︽姤绯荤粺',
      '鏁版嵁閽诲彇'
    ],
    technicalBenefits: [
      '娴佹暟鎹鐞?,
      '瀹炴椂鑱氬悎璁＄畻',
      '鍒嗗竷寮忔煡璇?,
      '缂撳瓨浼樺寲'
    ],
    scalability: '鏀寔鏁扮櫨涓囨暟鎹偣鐨勫疄鏃跺鐞?,
    example: '鐢靛晢骞冲彴瀹炴椂閿€鍞华琛ㄦ澘锛屾樉绀鸿鍗曘€佸簱瀛樺拰鐢ㄦ埛琛屼负'
  },

  // 绀句氦搴旂敤
  {
    category: 'social',
    name: '瀹炴椂绀句氦骞冲彴',
    description: '绀句氦濯掍綋骞冲彴锛屾敮鎸佸疄鏃舵秷鎭€侀€氱煡鍜屽唴瀹规洿鏂?,
    keyFeatures: [
      '瀹炴椂娑堟伅浼犻€?,
      '娲诲姩娴佹洿鏂?,
      '閫氱煡绯荤粺',
      '鐢ㄦ埛鐘舵€佸悓姝?
    ],
    technicalBenefits: [
      '瀹炴椂浜嬩欢椹卞姩',
      '鍒嗗竷寮忔秷鎭槦鍒?,
      '缂撳瓨浼樺寲',
      '闅愮鎺у埗'
    ],
    scalability: '鏀寔鏁扮櫨涓囨椿璺冪敤鎴?,
    example: 'Twitter椋庢牸鐨勭ぞ浜ゅ钩鍙帮紝鏀寔瀹炴椂鎺ㄦ枃鍜屼簰鍔ㄦ洿鏂?
  },
  {
    category: 'social',
    name: '鍦ㄧ嚎鍗忎綔宸ュ叿',
    description: '鍥㈤槦鍗忎綔宸ュ叿锛屾敮鎸佸疄鏃朵换鍔″垎閰嶅拰杩涘害璺熻釜',
    keyFeatures: [
      '浠诲姟鐘舵€佸悓姝?,
      '瀹炴椂璇勮',
      '杩涘害璺熻釜',
      '鍥㈤槦閫氱煡'
    ],
    technicalBenefits: [
      '瀹炴椂鐘舵€佺鐞?,
      '鍒嗗竷寮忓崗浣?,
      '鏉冮檺鎺у埗',
      '瀹¤鏃ュ織'
    ],
    scalability: '鏀寔澶у瀷鍥㈤槦鍗忎綔',
    example: 'Trello澧炲己鐗堬紝鏀寔瀹炴椂浠诲姟鏇存柊鍜屽洟闃熷崗浣?
  },

  // IoT搴旂敤
  {
    category: 'iot',
    name: '鐗╄仈缃戣澶囩洃鎺?,
    description: '澶ц妯＄墿鑱旂綉璁惧鐘舵€佺洃鎺у拰鏁版嵁鏀堕泦',
    keyFeatures: [
      '璁惧鐘舵€佸悓姝?,
      '浼犳劅鍣ㄦ暟鎹仛鍚?,
      '瀹炴椂璀︽姤',
      '璁惧绠＄悊'
    ],
    technicalBenefits: [
      '楂橀鏁版嵁鎽勫叆',
      '瀹炴椂娴佸鐞?,
      '鍒嗗竷寮忔灦鏋?,
      '瀹归敊鏈哄埗'
    ],
    scalability: '鏀寔鏁扮櫨涓囩墿鑱旂綉璁惧',
    example: '鏅鸿兘鍩庡競鐩戞帶绯荤粺锛屽疄鏃惰窡韪氦閫氥€佺幆澧冨拰璁惧鐘舵€?
  },

  // 閲戣瀺搴旂敤
  {
    category: 'financial',
    name: '楂橀浜ゆ槗绯荤粺',
    description: '閲戣瀺浜ゆ槗绯荤粺锛屾敮鎸佽秴浣庡欢杩熺殑璁㈠崟澶勭悊鍜屾垚浜?,
    keyFeatures: [
      '璁㈠崟绨跨鐞?,
      '瀹炴椂浠锋牸棣堥€?,
      '浜ゆ槗鎾悎',
      '椋庨櫓鎺у埗'
    ],
    technicalBenefits: [
      '寰绾у欢杩?,
      '楂樺彲鐢ㄦ€?,
      '鍒嗗竷寮忎竴鑷存€?,
      '閲戣瀺绾у畨鍏?
    ],
    scalability: '鏀寔鏁扮櫨涓囪鍗?绉?,
    example: '鍔犲瘑璐у竵浜ゆ槗鎵€锛屾敮鎸佸疄鏃惰鍗曞尮閰嶅拰鎴愪氦纭'
  }
];

// 鎸夌被鍒垎缁勭殑搴旂敤妗堜緥
export const USE_CASES_BY_CATEGORY = {
  blockchain: SPACETIME_USE_CASES.filter(uc => uc.category === 'blockchain'),
  gaming: SPACETIME_USE_CASES.filter(uc => uc.category === 'gaming'),
  realtime: SPACETIME_USE_CASES.filter(uc => uc.category === 'realtime-apps'),
  social: SPACETIME_USE_CASES.filter(uc => uc.category === 'social'),
  iot: SPACETIME_USE_CASES.filter(uc => uc.category === 'iot'),
  financial: SPACETIME_USE_CASES.filter(uc => uc.category === 'financial')
};

// 鎬ц兘鍩哄噯鏁版嵁
export interface PerformanceBenchmark {
  useCase: string;
  throughput: string;
  latency: string;
  concurrency: string;
  dataVolume: string;
}

export const PERFORMANCE_BENCHMARKS: PerformanceBenchmark[] = [
  {
    useCase: 'DeFi 浠〃鏉?,
    throughput: '10,000 TPS',
    latency: '< 50ms',
    concurrency: '10,000+ 骞跺彂鐢ㄦ埛',
    dataVolume: 'TB绾ф暟鎹?
  },
  {
    useCase: '澶氫汉娓告垙',
    throughput: '100,000 TPS',
    latency: '< 10ms',
    concurrency: '100,000+ 鐜╁',
    dataVolume: '瀹炴椂娓告垙鐘舵€?
  },
  {
    useCase: '瀹炴椂绀句氦',
    throughput: '50,000 TPS',
    latency: '< 20ms',
    concurrency: '1,000,000+ 鐢ㄦ埛',
    dataVolume: 'PB绾у唴瀹?
  },
  {
    useCase: 'IoT 鐩戞帶',
    throughput: '1,000,000 TPS',
    latency: '< 5ms',
    concurrency: '10,000,000+ 璁惧',
    dataVolume: '瀹炴椂浼犳劅鍣ㄦ暟鎹?
  }
];