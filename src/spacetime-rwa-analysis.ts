// SpacetimeDB 鍦?RWA 浜戝钩鍙板紑鍙戜腑鐨勪紭鍔垮垎鏋?

export interface RWAAdvantage {
  category: 'data-management' | 'real-time' | 'security' | 'scalability' | 'compliance' | 'integration';
  advantage: string;
  description: string;
  rwaRelevance: string;
  technicalBenefit: string;
  implementation: string;
}

// RWA 浜戝钩鍙扮殑鏍稿績闇€姹?
export const RWA_PLATFORM_REQUIREMENTS = [
  '璧勪骇鏁板瓧鍖栦笌鍏冩暟鎹鐞?,
  '瀹炴椂浜ゆ槗鍜屼环鏍煎彂鐜?,
  '澶氭柟鏉冮檺绠＄悊鍜岃闂帶鍒?,
  '鍚堣鎬у璁″拰鐩戠鎶ュ憡',
  '楂樺苟鍙戜氦鏄撳鐞?,
  '璺ㄩ摼璧勪骇浜掓搷浣滄€?,
  '瀹炴椂椋庨櫓鐩戞帶鍜岄璀?,
  '鎶曡祫鑰呭叧绯荤鐞嗗拰娌熼€?
];

// SpacetimeDB鍦≧WA浜戝钩鍙颁腑鐨勬牳蹇冧紭鍔?
export const SPACETIME_RWA_ADVANTAGES: RWAAdvantage[] = [
  // 鏁版嵁绠＄悊浼樺娍
  {
    category: 'data-management',
    advantage: '缁熶竴璧勪骇鏁版嵁妯″瀷',
    description: '鏀寔澶嶆潅璧勪骇鍏崇郴鐨勫缓妯★紝鍖呮嫭鎵€鏈夋潈銆佹姷鎶笺€佽鐢熷搧绛?,
    rwaRelevance: 'RWA璧勪骇鍏锋湁澶嶆潅鐨勫眰绾у叧绯诲拰琛嶇敓鍝佺粨鏋勶紝SpacetimeDB鍙互楂樻晥寤烘ā',
    technicalBenefit: '鍏崇郴鍨嬫暟鎹缓妯?+ 鍥炬暟鎹簱鐗规€э紝鏀寔澶嶆潅璧勪骇鍏崇郴鏌ヨ',
    implementation: '浣跨敤SpacetimeDB鐨勮〃鍏崇郴鍜岀储寮曟潵寤烘ā璧勪骇灞傜骇缁撴瀯'
  },
  {
    category: 'data-management',
    advantage: '鍏冩暟鎹赴瀵屾€?,
    description: '鏀寔瀛樺偍涓板瘜鐨勮祫浜у厓鏁版嵁锛屽寘鎷硶寰嬫枃浠躲€佽瘎浼版姤鍛娿€佸巻鍙茶褰曠瓑',
    rwaRelevance: 'RWA闇€瑕佸ぇ閲忕殑鏂囨。鍜屽悎瑙勬暟鎹紝浼犵粺鏁版嵁搴撻毦浠ュ鐞?,
    technicalBenefit: '鏀寔JSON瀛楁鍜屽ぇ鍨嬩簩杩涘埗鏁版嵁瀛樺偍',
    implementation: '璧勪骇琛ㄤ腑宓屽叆鍏冩暟鎹璞★紝鏀寔鏂囨。瀛樺偍鍜屾绱?
  },

  // 瀹炴椂鎬т紭鍔?
  {
    category: 'real-time',
    advantage: '瀹炴椂浠锋牸鍙戠幇',
    description: '姣绾т环鏍兼洿鏂板拰浜ゆ槗鎾悎锛屾敮鎸侀珮棰戜氦鏄撳満鏅?,
    rwaRelevance: 'RWA甯傚満闇€瑕佸疄鏃朵环鏍煎彂鐜板拰娴佸姩鎬х鐞?,
    technicalBenefit: 'WebSocket瀹炴椂鎺ㄩ€?+ 鍐呭瓨璁＄畻寮曟搸',
    implementation: '浠锋牸鏇存柊瑙﹀彂瀹炴椂璁㈤槄鎺ㄩ€侊紝璁㈠崟绨垮疄鏃惰绠?
  },
  {
    category: 'real-time',
    advantage: '瀹炴椂椋庨櫓鐩戞帶',
    description: '瀹炴椂鐩戞帶璧勪骇浠峰€兼尝鍔ㄣ€佹姷鎶肩巼銆佹祦鍔ㄦ€ч闄╃瓑',
    rwaRelevance: 'RWA鎶曡祫椋庨櫓楂橈紝闇€瑕佸疄鏃剁洃鎺у拰棰勮',
    technicalBenefit: '娴佹暟鎹鐞?+ 瀹炴椂鑱氬悎璁＄畻',
    implementation: '鎸佺画璁＄畻椋庨櫓鎸囨爣锛岃Е鍙戦槇鍊兼椂瀹炴椂鍛婅'
  },

  // 瀹夊叏浼樺娍
  {
    category: 'security',
    advantage: '缁嗙矑搴︽潈闄愭帶鍒?,
    description: '鏀寔鍩轰簬瑙掕壊鐨勫鏉傛潈闄愭ā鍨嬶紝婊¤冻涓嶅悓鍙備笌鑰呯殑璁块棶闇€姹?,
    rwaRelevance: 'RWA娑夊強鎶曡祫鑰呫€佸彂琛屼汉銆佺洃绠℃満鏋勭瓑澶氭柟锛岄渶瑕佺簿缁嗘潈闄愭帶鍒?,
    technicalBenefit: '鍙紪绋嬫潈闄愮郴缁燂紝鏀寔涓氬姟閫昏緫涓殑鏉冮檺妫€鏌?,
    implementation: '鍦╮educer涓疄鐜板熀浜庤祫浜х被鍨嬪拰鐢ㄦ埛瑙掕壊鐨勬潈闄愰獙璇?
  },
  {
    category: 'security',
    advantage: '瀹¤鏃ュ織瀹屾暣鎬?,
    description: '鎵€鏈夋搷浣滈兘鏈夊畬鏁村璁¤褰曪紝鏀寔鐩戠鍚堣瑕佹眰',
    rwaRelevance: 'RWA鍙楀埌涓ユ牸鐩戠锛岄渶瑕佸畬鏁寸殑鎿嶄綔瀹¤',
    technicalBenefit: '鍐呯疆瀹¤鏃ュ織 + 涓嶅彲绡℃敼鐨勬暟鎹巻鍙?,
    implementation: '鑷姩璁板綍鎵€鏈変氦鏄撳拰鏁版嵁淇敼鎿嶄綔'
  },

  // 鍙墿灞曟€т紭鍔?
  {
    category: 'scalability',
    advantage: '楂樺苟鍙戜氦鏄撳鐞?,
    description: '鏀寔鏁颁竾骞跺彂浜ゆ槗锛屾弧瓒抽珮宄版湡浜ゆ槗闇€姹?,
    rwaRelevance: 'RWA骞冲彴鍙兘闈复绐佸彂澶ч噺浜ゆ槗鐨勬儏鍐?,
    technicalBenefit: '鍒嗗竷寮忔灦鏋?+ 姘村钩鎵╁睍鑳藉姏',
    implementation: '澶氳妭鐐归儴缃诧紝鏀寔浜ゆ槗鍒嗙墖鍜岃礋杞藉潎琛?
  },
  {
    category: 'scalability',
    advantage: '娴烽噺璧勪骇绠＄悊',
    description: '鏀寔鏁扮櫨涓囪祫浜х殑瀛樺偍鍜岀鐞嗭紝婊¤冻澶у瀷RWA骞冲彴闇€姹?,
    rwaRelevance: 'RWA骞冲彴闇€瑕佺鐞嗗ぇ閲忎笉鍚岀被鍨嬬殑璧勪骇',
    technicalBenefit: '楂樻晥绱㈠紩 + 鍒嗗竷寮忓瓨鍌?,
    implementation: '璧勪骇鏁版嵁鍒嗙墖瀛樺偍锛屾敮鎸佸揩閫熸绱㈠拰鍒嗘瀽'
  },

  // 鍚堣鎬т紭鍔?
  {
    category: 'compliance',
    advantage: '鐩戠鎶ュ憡鑷姩鍖?,
    description: '鑷姩鐢熸垚鍚勭鐩戠瑕佹眰鐨勬姤鍛婂拰缁熻鏁版嵁',
    rwaRelevance: 'RWA鍙楀埌澶氶噸鐩戠锛岄渶瑕佸畾鏈熸姤鍛?,
    technicalBenefit: '瀹炴椂鏁版嵁鑱氬悎 + 鑷姩鍖栬绠?,
    implementation: '棰勫畾涔夋煡璇㈢敓鎴愮洃绠℃姤鍛婏紝鏀寔鑷畾涔夋姤鍛婃ā鏉?
  },
  {
    category: 'compliance',
    advantage: '鏁版嵁涓嶅彲绡℃敼',
    description: '鍖哄潡閾剧骇鍒殑涓嶅彲绡℃敼鎬э紝淇濊瘉鏁版嵁鐨勭湡瀹炴€у拰瀹屾暣鎬?,
    rwaRelevance: 'RWA璧勪骇浠峰€奸珮锛岄渶瑕侀槻姝㈡暟鎹鏀?,
    technicalBenefit: '瀵嗙爜瀛︿繚璇佺殑鏁版嵁瀹屾暣鎬?,
    implementation: '鎵€鏈夋暟鎹慨鏀归兘鏈夊瘑鐮佸绛惧悕鍜岄獙璇?
  },

  // 闆嗘垚浼樺娍
  {
    category: 'integration',
    advantage: '澶氶摼璧勪骇鏀寔',
    description: '鍘熺敓鏀寔澶氬尯鍧楅摼缃戠粶鐨勮祫浜х鐞?,
    rwaRelevance: 'RWA鍙兘閮ㄧ讲鍦ㄥ涓尯鍧楅摼涓?,
    technicalBenefit: '璺ㄩ摼鏁版嵁鍚屾 + 缁熶竴鏌ヨ鎺ュ彛',
    implementation: '璧勪骇琛ㄤ腑璁板綍閾句笂浣嶇疆锛屾敮鎸佽法閾炬煡璇㈠拰鎿嶄綔'
  },
  {
    category: 'integration',
    advantage: '浼犵粺绯荤粺闆嗘垚',
    description: '鏄撲簬涓庣幇鏈夐摱琛岀郴缁熴€佷及鍊兼湇鍔＄瓑浼犵粺绯荤粺闆嗘垚',
    rwaRelevance: 'RWA骞冲彴闇€瑕佷笌鐜版湁閲戣瀺鍩虹璁炬柦闆嗘垚',
    technicalBenefit: '鏍囧噯API + 鏁版嵁瀵煎叆瀵煎嚭',
    implementation: 'REST API鍜屾暟鎹簱杩炴帴鍣ㄦ敮鎸佷紶缁熺郴缁熼泦鎴?
  }
];

// RWA骞冲彴鏋舵瀯缁勪欢
export const RWA_PLATFORM_COMPONENTS = [
  {
    component: '璧勪骇娉ㄥ唽绯荤粺',
    spacetimeRole: '璧勪骇鍏冩暟鎹瓨鍌ㄥ拰鍏崇郴绠＄悊',
    advantage: '鏀寔澶嶆潅璧勪骇缁撴瀯鍜屼緷璧栧叧绯诲缓妯?
  },
  {
    component: '浜ゆ槗寮曟搸',
    spacetimeRole: '璁㈠崟鍖归厤鍜屼氦鏄撴墽琛?,
    advantage: '姣绾т氦鏄撳鐞嗗拰瀹炴椂鐘舵€佸悓姝?
  },
  {
    component: '鎶曡祫缁勫悎绠＄悊',
    spacetimeRole: '瀹炴椂鎶曡祫缁勫悎浼板€煎拰椋庨櫓璁＄畻',
    advantage: '娴佸紡璁＄畻鍜屽疄鏃惰仛鍚?
  },
  {
    component: '鍚堣鐩戞帶',
    spacetimeRole: '瀹炴椂鍚堣妫€鏌ュ拰鎶ュ憡鐢熸垚',
    advantage: '鑷姩鍖栧璁″拰鐩戠鎶ュ憡'
  },
  {
    component: '鎶曡祫鑰呭钩鍙?,
    spacetimeRole: '涓€у寲浠〃鏉垮拰瀹炴椂閫氱煡',
    advantage: 'WebSocket瀹炴椂鏁版嵁鎺ㄩ€?
  },
  {
    component: '椋庨櫓绠＄悊绯荤粺',
    spacetimeRole: '瀹炴椂椋庨櫓鎸囨爣璁＄畻鍜岄璀?,
    advantage: '澶嶆潅椋庨櫓妯″瀷鐨勫疄鏃惰绠?
  }
];

// 鎬ц兘鍩哄噯 - RWA鍦烘櫙
export const RWA_PERFORMANCE_BENCHMARKS = [
  {
    scenario: '璧勪骇浜ゆ槗鎾悎',
    throughput: '50,000 TPS',
    latency: '< 10ms',
    description: '楂橀RWA浠ｅ竵浜ゆ槗鎾悎'
  },
  {
    scenario: '鎶曡祫缁勫悎浼板€?,
    throughput: '10,000 portfolios/sec',
    latency: '< 50ms',
    description: '瀹炴椂璁＄畻鏁板崈鎶曡祫缁勫悎浠峰€?
  },
  {
    scenario: '椋庨櫓鎸囨爣璁＄畻',
    throughput: '100,000 calculations/sec',
    latency: '< 20ms',
    description: '瀹炴椂椋庨櫓鐩戞帶鍜岄璀?
  },
  {
    scenario: '鐩戠鎶ュ憡鐢熸垚',
    throughput: '1,000 reports/min',
    latency: '< 5 sec',
    description: '鑷姩鍖栧悎瑙勬姤鍛婄敓鎴?
  }
];

// 绔炰簤浼樺娍鍒嗘瀽
export class RWACompetitiveAdvantages {
  static vsTraditionalDatabases = {
    advantage: '瀹炴椂鎬т笌涓€鑷存€?,
    spacetime: '寮轰竴鑷存€у疄鏃跺悓姝ワ紝浜ゆ槗鏁版嵁姣绾ф洿鏂?,
    traditional: '鏈€缁堜竴鑷存€э紝鍒嗛挓绾у欢杩?,
    rwaImpact: '纭繚浜ゆ槗鍏钩鎬у拰浠锋牸鍑嗙‘鎬?
  };

  static vsBlockchainOnly = {
    advantage: '鏌ヨ鎬ц兘涓庡鏉傝绠?,
    spacetime: '鏀寔澶嶆潅SQL鏌ヨ鍜屽疄鏃惰仛鍚堣绠?,
    blockchain: '鏌ヨ鎬ц兘鏈夐檺锛岄毦浠ヨ繘琛屽鏉傚垎鏋?,
    rwaImpact: '鏀寔楂樼骇鎶曡祫鍒嗘瀽鍜岄闄╁缓妯?
  };

  static vsLegacySystems = {
    advantage: '鐜颁唬鍖栨灦鏋?,
    spacetime: '浜戝師鐢熴€佹按骞虫墿灞曘€佸疄鏃禔PI',
    legacy: '鍗曚綋鏋舵瀯銆佹墿灞曞洶闅俱€佸欢杩熼珮',
    rwaImpact: '鏀寔鐜颁唬Web搴旂敤鍜岀Щ鍔ㄧ璁块棶'
  };
}

// 瀹炴柦璺嚎鍥?
export const RWA_IMPLEMENTATION_ROADMAP = [
  {
    phase: 'Phase 1: 鏍稿績鍩虹璁炬柦',
    duration: '2-3涓湀',
    components: ['璧勪骇娉ㄥ唽绯荤粺', '鍩虹鏉冮檺绠＄悊', '鏁版嵁鍚屾'],
    spacetimeFocus: '鏁版嵁寤烘ā鍜屽疄鏃跺悓姝?
  },
  {
    phase: 'Phase 2: 浜ゆ槗鍔熻兘',
    duration: '3-4涓湀',
    components: ['浜ゆ槗寮曟搸', '璁㈠崟绨?, '娓呯畻绯荤粺'],
    spacetimeFocus: '楂樻€ц兘浜ゆ槗澶勭悊鍜屽疄鏃剁姸鎬?
  },
  {
    phase: 'Phase 3: 楂樼骇鍔熻兘',
    duration: '4-6涓湀',
    components: ['椋庨櫓绠＄悊', '鍚堣鎶ュ憡', '鍒嗘瀽宸ュ叿'],
    spacetimeFocus: '澶嶆潅璁＄畻鍜屽疄鏃剁洃鎺?
  },
  {
    phase: 'Phase 4: 鎵╁睍浼樺寲',
    duration: '鎸佺画',
    components: ['澶氶摼鏀寔', '鎬ц兘浼樺寲', '楂樼骇鍒嗘瀽'],
    spacetimeFocus: '鍙墿灞曟€у拰楂樼骇鍔熻兘'
  }
];