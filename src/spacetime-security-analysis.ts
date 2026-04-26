// SpacetimeDB 鏁版嵁瀹夊叏鍒嗘瀽涓庝繚闅滄満鍒?

export interface SecurityFeature {
  category: 'authentication' | 'authorization' | 'encryption' | 'network' | 'audit' | 'backup';
  feature: string;
  description: string;
  implementation: string;
  blockchainRelevance: string;
  compliance: string[];
}

// SpacetimeDB鏍稿績瀹夊叏鐗规€?
export const SPACETIME_SECURITY_FEATURES: SecurityFeature[] = [
  // 韬唤楠岃瘉
  {
    category: 'authentication',
    feature: 'Identity-based Authentication',
    description: '鍩轰簬韬唤鐨勮璇佺郴缁燂紝姣忎釜鐢ㄦ埛鍜屽鎴风閮芥湁鍞竴鐨勮韩浠芥爣璇?,
    implementation: '浣跨敤鍏挜/绉侀挜瀵硅繘琛岃韩浠介獙璇侊紝鏀寔澶氱璁よ瘉鏂瑰紡',
    blockchainRelevance: '涓庡尯鍧楅摼閽卞寘鍦板潃瀹岀編闆嗘垚锛屾敮鎸乄eb3韬唤楠岃瘉',
    compliance: ['GDPR', 'CCPA', 'SOX']
  },
  {
    category: 'authentication',
    feature: 'Token-based Access',
    description: '鏀寔浠ょ墝璁よ瘉锛屽鎴风閫氳繃浠ょ墝璁块棶鏁版嵁搴?,
    implementation: 'JWT鎴栧叾浠栧畨鍏ㄤ护鐗屾満鍒讹紝鍙缃繃鏈熸椂闂?,
    blockchainRelevance: '鍙笌鍖哄潡閾剧鍚嶆秷鎭粨鍚堜娇鐢?,
    compliance: ['OAuth 2.0', 'OpenID Connect']
  },

  // 鎺堟潈涓庤闂帶鍒?
  {
    category: 'authorization',
    feature: 'Programmable Permissions',
    description: '涓氬姟閫昏緫涓祵鍏ユ潈闄愭帶鍒讹紝鍙紪绋嬬殑璁块棶瑙勫垯',
    implementation: '鍦╮educer鍑芥暟涓疄鐜版潈闄愭鏌ワ紝鏀寔缁嗙矑搴﹁闂帶鍒?,
    blockchainRelevance: '鏀寔鍩轰簬鏅鸿兘鍚堢害鐨勬潈闄愰獙璇?,
    compliance: ['RBAC', 'ABAC', '鑷畾涔夋潈闄愭ā鍨?]
  },
  {
    category: 'authorization',
    feature: 'Row-level Security',
    description: '琛岀骇瀹夊叏鎺у埗锛屼笉鍚岀敤鎴风湅鍒颁笉鍚岀殑鏁版嵁琛?,
    implementation: '閫氳繃SQL WHERE瀛愬彞鍜屾潈闄愬嚱鏁板疄鐜?,
    blockchainRelevance: '鏀寔澶氱敤鎴烽挶鍖呮暟鎹殑闅旂璁块棶',
    compliance: ['鏁版嵁闅旂瑕佹眰']
  },
  {
    category: 'authorization',
    feature: 'Table Access Control',
    description: '琛ㄧ骇璁块棶鎺у埗锛屾帶鍒跺摢浜涚敤鎴峰彲浠ヨ闂摢浜涜〃',
    implementation: '閫氳繃璁块棶淇グ绗?public, private)鍜屾潈闄愭鏌?,
    blockchainRelevance: '淇濇姢鏁忔劅鐨勪氦鏄撳拰鐢ㄦ埛鏁版嵁',
    compliance: ['鏁版嵁鍒嗙被淇濇姢']
  },

  // 鏁版嵁鍔犲瘑
  {
    category: 'encryption',
    feature: 'Transport Layer Security',
    description: '浼犺緭灞傚姞瀵嗭紝淇濇姢瀹㈡埛绔笌鏈嶅姟鍣ㄤ箣闂寸殑閫氫俊',
    implementation: 'WebSocket over TLS/SSL锛屽己鍒跺姞瀵嗚繛鎺?,
    blockchainRelevance: '绗﹀悎鍖哄潡閾惧簲鐢ㄧ殑瀹夊叏閫氫俊鏍囧噯',
    compliance: ['TLS 1.3', 'HTTPS寮哄埗']
  },
  {
    category: 'encryption',
    feature: 'Data at Rest Encryption',
    description: '闈欐€佹暟鎹姞瀵嗭紝瀛樺偍鍦ㄧ鐩樹笂鐨勬暟鎹姞瀵?,
    implementation: '鏀寔AES-256绛夊姞瀵嗙畻娉曞姞瀵嗗瓨鍌ㄧ殑鏁版嵁',
    blockchainRelevance: '淇濇姢鍖哄潡閾剧浉鍏虫暟鎹殑闈欐€佸瓨鍌ㄥ畨鍏?,
    compliance: ['FIPS 140-2', '鏁版嵁鍔犲瘑鏍囧噯']
  },
  {
    category: 'encryption',
    feature: 'Field-level Encryption',
    description: '瀛楁绾у姞瀵嗭紝瀵规晱鎰熷瓧娈佃繘琛屽崟鐙姞瀵?,
    implementation: '鏀寔瀵圭壒瀹氬瓧娈典娇鐢ㄤ笉鍚屽姞瀵嗗瘑閽?,
    blockchainRelevance: '淇濇姢绉侀挜銆佷氦鏄撻噾棰濈瓑鏁忔劅鍖哄潡閾炬暟鎹?,
    compliance: ['PCI DSS', '閲戣瀺鏁版嵁淇濇姢']
  },

  // 缃戠粶瀹夊叏
  {
    category: 'network',
    feature: 'WebSocket Security',
    description: 'WebSocket杩炴帴鐨勫畨鍏ㄥ姞鍥?,
    implementation: '鏀寔WSS (WebSocket Secure)锛岄槻姝腑闂翠汉鏀诲嚮',
    blockchainRelevance: '瀹炴椂鍖哄潡閾炬暟鎹悓姝ョ殑瀹夊叏淇濋殰',
    compliance: ['WebSocket RFC 6455']
  },
  {
    category: 'network',
    feature: 'CORS Protection',
    description: '璺ㄥ煙璧勬簮鍏变韩鎺у埗锛岄槻姝㈣法绔欒姹備吉閫?,
    implementation: '鍙厤缃殑CORS绛栫暐锛屽彧鍏佽鎺堟潈鍩熷悕璁块棶',
    blockchainRelevance: '淇濇姢DApp鍏嶅彈璺ㄧ珯鏀诲嚮',
    compliance: ['CORS鏍囧噯', 'Web瀹夊叏鏈€浣冲疄璺?]
  },
  {
    category: 'network',
    feature: 'Rate Limiting',
    description: '璇锋眰棰戠巼闄愬埗锛岄槻姝DoS鏀诲嚮鍜屾互鐢?,
    implementation: '鍩轰簬IP銆佺敤鎴疯韩浠界殑璇锋眰棰戠巼鎺у埗',
    blockchainRelevance: '闃叉鍖哄潡閾剧綉缁滅殑婊ョ敤鍜屾敾鍑?,
    compliance: ['DDoS闃叉姢鏍囧噯']
  },

  // 瀹¤涓庣洃鎺?
  {
    category: 'audit',
    feature: 'Comprehensive Audit Logging',
    description: '瀹屾暣鐨勫璁℃棩蹇楋紝璁板綍鎵€鏈夋暟鎹簱鎿嶄綔',
    implementation: '鑷姩璁板綍鎵€鏈塁RUD鎿嶄綔銆佺敤鎴锋椿鍔ㄥ拰绯荤粺浜嬩欢',
    blockchainRelevance: '鍖哄潡閾句氦鏄撶殑鍙璁℃€у拰閫忔槑鎬?,
    compliance: ['SOX', 'GDPR瀹¤瑕佹眰', '閲戣瀺鐩戠']
  },
  {
    category: 'audit',
    feature: 'Real-time Monitoring',
    description: '瀹炴椂鐩戞帶鏁版嵁搴撴椿鍔ㄥ拰鎬ц兘鎸囨爣',
    implementation: '鍐呯疆鐩戞帶闈㈡澘锛屽疄鏃跺憡璀﹀拰鎬ц兘鎸囨爣',
    blockchainRelevance: '鐩戞帶鍖哄潡閾炬暟鎹殑瀹炴椂鍚屾鐘舵€?,
    compliance: ['SIEM闆嗘垚', '瀹炴椂鐩戞帶鏍囧噯']
  },
  {
    category: 'audit',
    feature: 'Immutable Audit Trail',
    description: '涓嶅彲鍙樺璁¤拷韪紝纭繚鏃ュ織鏃犳硶琚鏀?,
    implementation: '浣跨敤鍔犲瘑鍜屽搱甯岄摼纭繚瀹¤鏃ュ織鐨勫畬鏁存€?,
    blockchainRelevance: '涓庡尯鍧楅摼鐨勪笉鍙彉鎬х壒鎬у畬缇庡鍚?,
    compliance: ['涓嶅彲鍙樻棩蹇楄姹?]
  },

  // 澶囦唤涓庢仮澶?
  {
    category: 'backup',
    feature: 'Automated Backups',
    description: '鑷姩澶囦唤鏈哄埗锛岀‘淇濇暟鎹彲鎭㈠',
    implementation: '瀹氭椂澶囦唤銆佸閲忓浠姐€佸揩鐓у浠?,
    blockchainRelevance: '鍖哄潡閾炬暟鎹殑瀹氭湡澶囦唤鍜岀伨闅炬仮澶?,
    compliance: ['鏁版嵁澶囦唤鏍囧噯', '涓氬姟杩炵画鎬?]
  },
  {
    category: 'backup',
    feature: 'Point-in-Time Recovery',
    description: '鏃堕棿鐐规仮澶嶏紝鍙仮澶嶅埌浠绘剰鍘嗗彶鏃堕棿鐐?,
    implementation: '鍩轰簬WAL (Write-Ahead Logging)鐨勬椂闂寸偣鎭㈠',
    blockchainRelevance: '绮剧‘鎭㈠鍖哄潡閾句氦鏄撳巻鍙?,
    compliance: ['鏁版嵁鎭㈠鏍囧噯']
  },
  {
    category: 'backup',
    feature: 'Geo-Redundancy',
    description: '鍦扮悊鍐椾綑锛岃法鍖哄煙鏁版嵁澶囦唤',
    implementation: '澶氬尯鍩熸暟鎹鍒跺拰澶囦唤',
    blockchainRelevance: '鍖哄潡閾惧簲鐢ㄧ殑鍏ㄧ悆鍙敤鎬у拰瀹圭伨',
    compliance: ['鍦扮悊鍐椾綑鏍囧噯']
  }
];

// 瀹夊叏鏋舵瀯灞傜骇
export class SecurityArchitectureLayers {
  // 缃戠粶灞傚畨鍏?
  static networkLayer = {
    features: [
      'TLS 1.3鍔犲瘑浼犺緭',
      'WebSocket Secure (WSS)',
      'CORS绛栫暐鎺у埗',
      'IP鐧藉悕鍗?,
      'DDoS闃叉姢'
    ],
    blockchainIntegration: '涓庡尯鍧楅摼鑺傜偣鐨勫姞瀵嗛€氫俊闆嗘垚'
  };

  // 搴旂敤灞傚畨鍏?
  static applicationLayer = {
    features: [
      '韬唤楠岃瘉鍜屾巿鏉?,
      '浼氳瘽绠＄悊',
      '杈撳叆楠岃瘉',
      'SQL娉ㄥ叆闃叉姢',
      'XSS闃叉姢'
    ],
    blockchainIntegration: '鏅鸿兘鍚堢害鏉冮檺楠岃瘉闆嗘垚'
  };

  // 鏁版嵁灞傚畨鍏?
  static dataLayer = {
    features: [
      '鏁版嵁鍔犲瘑瀛樺偍',
      '瀛楁绾у姞瀵?,
      '璁块棶鎺у埗鍒楄〃',
      '鏁版嵁鍒嗙被',
      '瀹¤鏃ュ織'
    ],
    blockchainIntegration: '鍖哄潡閾炬暟鎹殑鍔犲瘑瀛樺偍鍜岃闂帶鍒?
  };

  // 鐗╃悊灞傚畨鍏?
  static physicalLayer = {
    features: [
      '纾佺洏鍔犲瘑',
      '瀹夊叏鎿﹂櫎',
      '纭欢瀹夊叏妯″潡',
      '鐗╃悊璁块棶鎺у埗'
    ],
    blockchainIntegration: '绉侀挜鍜屾晱鎰熸暟鎹殑纭欢绾т繚鎶?
  };
}

// 鍖哄潡閾剧壒瀹氬畨鍏ㄨ€冭檻
export class BlockchainSecurityConsiderations {
  // DeFi搴旂敤瀹夊叏
  static defiSecurity = {
    issues: [
      '闂數璐锋敾鍑婚槻鎶?,
      '閲嶅叆鏀诲嚮闃叉姢',
      '浠锋牸鎿嶇旱闃叉姢',
      '鏅鸿兘鍚堢害婕忔礊'
    ],
    spacetimeSolutions: [
      '瀹炴椂浜ゆ槗鐩戞帶',
      '寮傚父妫€娴嬪憡璀?,
      '浜ゆ槗妯″紡鍒嗘瀽',
      '鏉冮檺闅旂鎵ц'
    ]
  };

  // NFT搴旂敤瀹夊叏
  static nftSecurity = {
    issues: [
      '鍋囧啋NFT璇嗗埆',
      '鎵€鏈夋潈杞Щ楠岃瘉',
      '鍏冩暟鎹鏀归槻鎶?,
      '鐗堟潈淇濇姢'
    ],
    spacetimeSolutions: [
      '鍖哄潡閾鹃獙璇侀泦鎴?,
      '鍏冩暟鎹畬鏁存€ф鏌?,
      '璁块棶鎺у埗绛栫暐',
      '瀹¤杩借釜'
    ]
  };

  // 閽卞寘搴旂敤瀹夊叏
  static walletSecurity = {
    issues: [
      '绉侀挜娉勯湶闃叉姢',
      '浜ゆ槗绛惧悕瀹夊叏',
      '鍦板潃楠岃瘉',
      '浣欓淇濇姢'
    ],
    spacetimeSolutions: [
      '鍔犲瘑瀵嗛挜绠＄悊',
      '浜ゆ槗楠岃瘉鏈哄埗',
      '璁块棶鏃ュ織璁板綍',
      '寮傚父琛屼负妫€娴?
    ]
  };
}

// 鍚堣鎬ф鏋?
export class ComplianceFrameworks {
  // GDPR鍚堣
  static gdpr = {
    requirements: [
      '鏁版嵁鏈€灏忓寲',
      '鐩殑闄愬埗',
      '瀛樺偍闄愬埗',
      '鍑嗙‘鎬?,
      '瀹屾暣鎬?,
      '淇濆瘑鎬?,
      '鍙棶璐ｆ€?
    ],
    spacetimeImplementation: [
      '瀛楁绾ц闂帶鍒?,
      '鏁版嵁淇濈暀绛栫暐',
      '瀹¤鏃ュ織',
      '鍔犲瘑瀛樺偍',
      '鍚屾剰绠＄悊'
    ]
  };

  // SOC 2鍚堣
  static soc2 = {
    trustPrinciples: [
      '瀹夊叏',
      '鍙敤鎬?,
      '澶勭悊瀹屾暣鎬?,
      '淇濆瘑鎬?,
      '闅愮'
    ],
    spacetimeControls: [
      '璁块棶鎺у埗',
      '鍔犲瘑鎺柦',
      '鐩戞帶鍜屾棩蹇?,
      '鍙樻洿绠＄悊',
      '浜嬩欢鍝嶅簲'
    ]
  };

  // ISO 27001鍚堣
  static iso27001 = {
    controls: [
      '淇℃伅瀹夊叏鏀跨瓥',
      '缁勭粐瀹夊叏',
      '浜哄姏璧勬簮瀹夊叏',
      '璧勪骇绠＄悊',
      '璁块棶鎺у埗',
      '瀵嗙爜瀛?,
      '鐗╃悊鍜岀幆澧冨畨鍏?,
      '杩愯惀瀹夊叏',
      '閫氫俊瀹夊叏',
      '绯荤粺鑾峰彇銆佸紑鍙戝拰缁存姢',
      '渚涘簲鍟嗗叧绯?,
      '淇℃伅瀹夊叏浜嬩欢绠＄悊',
      '淇℃伅瀹夊叏鏂归潰鐨勪簨鍔¤繛缁€?,
      '鍚堣鎬?
    ],
    spacetimeMapping: [
      '瀹夊叏绛栫暐瀹炴柦',
      '瑙掕壊鍒嗙',
      '鍩硅瑕佹眰',
      '鏁版嵁鍒嗙被',
      '鏉冮檺绠＄悊',
      '鍔犲瘑鏍囧噯',
      '鍩虹璁炬柦瀹夊叏',
      '鐩戞帶杩愯惀',
      '缃戠粶瀹夊叏',
      '瀹夊叏寮€鍙?,
      '渚涘簲鍟嗗璁?,
      '浜嬩欢鍝嶅簲',
      '澶囦唤鎭㈠',
      '瀹¤鍚堣'
    ]
  };
}

// 瀹夊叏鏈€浣冲疄璺?
export class SecurityBestPractices {
  // 寮€鍙戝畨鍏?
  static development = [
    '瀹夊叏缂栫爜瑙勮寖',
    '浠ｇ爜瀹℃煡瑕佹眰',
    '渚濊禆椤规壂鎻?,
    '婕忔礊璇勪及',
    '娓楅€忔祴璇?
  ];

  // 閮ㄧ讲瀹夊叏
  static deployment = [
    '鐜闅旂',
    '閰嶇疆绠＄悊',
    '瀵嗛挜绠＄悊',
    '鐩戞帶閮ㄧ讲',
    '鍥炴粴璁″垝'
  ];

  // 杩愯惀瀹夊叏
  static operations = [
    '璁块棶绠＄悊',
    '鏃ュ織鐩戞帶',
    '浜嬩欢鍝嶅簲',
    '澶囦唤楠岃瘉',
    '鎬ц兘鐩戞帶'
  ];

  // 鍖哄潡閾剧壒瀹氬疄璺?
  static blockchain = [
    '閽卞寘瀹夊叏闆嗘垚',
    '浜ゆ槗楠岃瘉',
    '鏅鸿兘鍚堢害瀹¤',
    '鍘讳腑蹇冨寲瀹夊叏',
    '澶氶噸绛惧悕'
  ];
}

// 瀹夊叏鐩戞帶鍜屽憡璀?
export class SecurityMonitoring {
  // 瀹炴椂鐩戞帶鎸囨爣
  static realTimeMetrics = [
    '杩炴帴灏濊瘯',
    '璁よ瘉澶辫触',
    '鏉冮檺鎷掔粷',
    '寮傚父鏌ヨ',
    '鎬ц兘寮傚父',
    '瀛樺偍浣跨敤'
  ];

  // 鍛婅瑙勫垯
  static alertRules = [
    '澶氭璁よ瘉澶辫触',
    '寮傚父楂橀鏌ヨ',
    '鏈巿鏉冭闂皾璇?,
    '鏁版嵁娉勯湶杩硅薄',
    '绯荤粺鎬ц兘涓嬮檷',
    '澶囦唤澶辫触'
  ];

  // 鍝嶅簲娴佺▼
  static responseProcedures = [
    '浜嬩欢鍒嗙被',
    '褰卞搷璇勪及',
    '閬忓埗鎺柦',
    '鎭㈠鎵ц',
    '鏍规湰鍘熷洜鍒嗘瀽',
    '棰勯槻鎺柦'
  ];
}