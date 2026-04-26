// SpacetimeDB 寮€婧愪笌鍟嗕笟浣跨敤璁稿彲璇佸垎鏋?

export interface LicenseAnalysis {
  licenseType: string;
  isOpenSource: boolean;
  commercialUseAllowed: boolean;
  restrictions: string[];
  timeline: {
    current: string;
    changeDate: string;
    futureLicense: string;
  };
  useCases: {
    allowed: string[];
    restricted: string[];
    prohibited: string[];
  };
}

// SpacetimeDB璁稿彲璇佽缁嗗垎鏋?
export const SPACETIME_LICENSE_ANALYSIS: LicenseAnalysis = {
  licenseType: "Business Source License 1.1 (BSL)",
  isOpenSource: true, // BSL琚涓烘槸寮€婧愯鍙瘉鐨勪竴绉嶅舰寮?
  commercialUseAllowed: true, // 浣嗘湁鏉′欢闄愬埗
  restrictions: [
    "鐢熶骇鐜鏈€澶氬彧鑳戒娇鐢ㄤ竴涓猄pacetimeDB瀹炰緥",
    "涓嶈兘鐢ㄤ簬鏋勫缓Database-as-a-Service浜у搧",
    "Database Service鎸囧厑璁哥涓夋柟鍒涘缓鍜屾帶鍒惰〃妯″紡鐨勫晢涓氭湇鍔?,
    "绗笁鏂逛笉鍖呮嫭鍛樺伐鍜屾壙鍖呭晢"
  ],
  timeline: {
    current: "Business Source License 1.1 (BSL) - 鍟嗕笟浣跨敤鍙楅檺",
    changeDate: "2031骞?鏈?0鏃?,
    futureLicense: "GNU Affero General Public License v3.0 with linking exception"
  },
  useCases: {
    allowed: [
      "鏋勫缓鑷繁鐨勫簲鐢ㄧ▼搴忔垨鏈嶅姟",
      "鍟嗕笟浜у搧寮€鍙戝拰閿€鍞?,
      "鍐呴儴浼佷笟搴旂敤",
      "SaaS搴旂敤锛堝崟涓疄渚嬶級",
      "绉诲姩搴旂敤鍚庣",
      "娓告垙鏈嶅姟鍣?,
      "鍖哄潡閾綝App鍚庣"
    ],
    restricted: [
      "澶氬疄渚嬬敓浜ч儴缃查渶瑕佸晢涓氳鍙瘉",
      "Database-as-a-Service骞冲彴",
      "浜戞暟鎹簱鏈嶅姟鎻愪緵鍟?,
      "澶氱鎴锋暟鎹簱骞冲彴"
    ],
    prohibited: [
      "鏋勫缓绔炰簤鎬х殑Database-as-a-Service浜у搧",
      "鍏佽绗笁鏂硅嚜鐢卞垱寤烘暟鎹簱琛ㄧ殑鏈嶅姟",
      "澶ц妯′簯鏁版嵁搴撴湇鍔?
    ]
  }
};

// 璁稿彲璇佸吋瀹规€у垎鏋?
export class LicenseCompatibilityAnalyzer {
  private projectType: 'dapp' | 'saas' | 'enterprise' | 'game' | 'mobile';

  constructor(projectType: 'dapp' | 'saas' | 'enterprise' | 'game' | 'mobile') {
    this.projectType = projectType;
  }

  // 鍒嗘瀽椤圭洰鏄惁绗﹀悎璁稿彲璇佽姹?
  analyzeCompatibility(): {
    compatible: boolean;
    riskLevel: 'low' | 'medium' | 'high';
    recommendations: string[];
    alternatives?: string[];
  } {
    const analyses = {
      dapp: {
        compatible: true,
        riskLevel: 'low' as const,
        recommendations: [
          '鍙互鐩存帴浣跨敤锛屾棤闇€鍟嗕笟璁稿彲璇?,
          '閫傚悎鍖哄潡閾綝App鐨勫疄鏃舵暟鎹悓姝ラ渶姹?,
          '2031骞村悗鍙户缁娇鐢ˋGPL璁稿彲璇?
        ]
      },
      saas: {
        compatible: true,
        riskLevel: 'medium' as const,
        recommendations: [
          '鍗曞疄渚嬮儴缃插彲浠ョ洿鎺ヤ娇鐢?,
          '澶氬疄渚嬮渶瑕佸晢涓氳鍙瘉',
          '鑰冭檻浣跨敤Maincloud鎵樼鏈嶅姟',
          '璇勪及鐢ㄦ埛瑙勬ā鍜屽疄渚嬮渶姹?
        ]
      },
      enterprise: {
        compatible: true,
        riskLevel: 'medium' as const,
        recommendations: [
          '鍐呴儴搴旂敤鍙互鐩存帴浣跨敤',
          '鐢熶骇绯荤粺璇勪及瀹炰緥鏁伴噺',
          '鑰冭檻鍟嗕笟璁稿彲璇佷互鑾峰緱鏀寔',
          '閫傚悎澶у瀷浼佷笟鍐呴儴绯荤粺'
        ]
      },
      game: {
        compatible: true,
        riskLevel: 'low' as const,
        recommendations: [
          '娓告垙鏈嶅姟鍣ㄥ彲浠ョ洿鎺ヤ娇鐢?,
          'MMORPG绛夊ぇ鍨嬫父鎴忓彲鑳介渶瑕佽瘎浼?,
          '閫傚悎瀹炴椂澶氫汉娓告垙',
          'BitCraft Online浣跨敤妗堜緥璇佹槑鍙'
        ]
      },
      mobile: {
        compatible: true,
        riskLevel: 'low' as const,
        recommendations: [
          '绉诲姩搴旂敤鍚庣鍙互鐩存帴浣跨敤',
          '鍗曞疄渚嬮€氬父瓒冲',
          '閫傚悎涓皬鍨嬬Щ鍔ㄥ簲鐢?
        ]
      }
    };

    return analyses[this.projectType];
  }

  // 璁＄畻鍟嗕笟椋庨櫓
  calculateBusinessRisk(): {
    legalRisk: number; // 0-100
    operationalRisk: number;
    financialRisk: number;
    recommendations: string[];
  } {
    const baseRisks = {
      dapp: { legal: 10, operational: 15, financial: 5 },
      saas: { legal: 40, operational: 30, financial: 60 },
      enterprise: { legal: 30, operational: 20, financial: 40 },
      game: { legal: 15, operational: 25, financial: 20 },
      mobile: { legal: 10, operational: 15, financial: 10 }
    };

    const risks = baseRisks[this.projectType];

    return {
      legalRisk: risks.legal,
      operationalRisk: risks.operational,
      financialRisk: risks.financial,
      recommendations: this.generateRiskRecommendations(risks)
    };
  }

  private generateRiskRecommendations(risks: { legal: number; operational: number; financial: number }): string[] {
    const recommendations: string[] = [];

    if (risks.legal > 30) {
      recommendations.push('寤鸿鍜ㄨ娉曞緥椤鹃棶纭璁稿彲璇佸悎瑙勬€?);
    }

    if (risks.operational > 25) {
      recommendations.push('璇勪及瀹炰緥鏁伴噺鍜屾墿灞曡鍒?);
    }

    if (risks.financial > 30) {
      recommendations.push('鑰冭檻鍟嗕笟璁稿彲璇佷互闄嶄綆娉曞緥椋庨櫓');
      recommendations.push('璇勪及2031骞村悗璁稿彲璇佸彉鏇寸殑褰卞搷');
    }

    if (this.projectType === 'saas') {
      recommendations.push('鐩戞帶鐢ㄦ埛澧為暱锛屽強鏃跺崌绾у埌鍟嗕笟璁稿彲璇?);
      recommendations.push('鑰冭檻浣跨敤Maincloud鎵樼鏈嶅姟');
    }

    return recommendations;
  }
}

// 璁稿彲璇佽縼绉荤瓥鐣?
export class LicenseMigrationStrategy {
  private currentDate: Date;
  private targetDate: Date;

  constructor() {
    this.currentDate = new Date();
    this.targetDate = new Date('2031-03-20');
  }

  // 璁＄畻璺濈寮€婧愯繕鏈夊灏戞椂闂?
  timeUntilOpenSource(): {
    years: number;
    months: number;
    days: number;
    totalDays: number;
  } {
    const diffTime = this.targetDate.getTime() - this.currentDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return {
      years: Math.floor(diffDays / 365),
      months: Math.floor((diffDays % 365) / 30),
      days: diffDays % 30,
      totalDays: diffDays
    };
  }

  // 鐢熸垚杩佺Щ璁″垝
  generateMigrationPlan(): Array<{
    phase: string;
    timeline: string;
    actions: string[];
    risk: 'low' | 'medium' | 'high';
  }> {
    const timeLeft = this.timeUntilOpenSource();

    return [
      {
        phase: '褰撳墠闃舵 (BSL璁稿彲璇?',
        timeline: `鍓╀綑 ${timeLeft.years} 骞?${timeLeft.months} 涓湀`,
        actions: [
          '璇勪及褰撳墠浣跨敤鏄惁绗﹀悎璁稿彲璇佽姹?,
          '鐩戞帶瀹炰緥鏁伴噺鍜岀敤鎴疯妯?,
          '鍑嗗鍟嗕笟璁稿彲璇侀绠?,
          '寤虹珛璁稿彲璇佸彉鏇寸洃鎺ф満鍒?
        ],
        risk: 'medium'
      },
      {
        phase: '杩囨浮鍑嗗闃舵',
        timeline: '2030骞?鏈?- 2031骞?鏈?,
        actions: [
          '鍒跺畾AGPL鍚堣鎬ц鍒?,
          '瀹¤浠ｇ爜渚濊禆鍏崇郴',
          '鍑嗗寮€婧愯础鐚祦绋?,
          '鍩硅鍥㈤槦AGPL瑕佹眰'
        ],
        risk: 'medium'
      },
      {
        phase: '璁稿彲璇佸彉鏇村悗',
        timeline: '2031骞?鏈?0鏃ヤ箣鍚?,
        actions: [
          '閲囩敤AGPL v3.0 with linking exception',
          '鏇存柊璁稿彲璇佸０鏄?,
          '缁х画鍟嗕笟浣跨敤锛坙inking exception鍏佽锛?,
          '鍙€夛細璐＄尞浠ｇ爜鏀硅繘'
        ],
        risk: 'low'
      }
    ];
  }

  // AGPL linking exception璇存槑
  explainLinkingException(): {
    whatItMeans: string;
    benefits: string[];
    requirements: string[];
  } {
    return {
      whatItMeans: '鍏佽鍟嗕笟浣跨敤鑰屼笉寮哄埗寮€婧愯嚜宸辩殑浠ｇ爜',
      benefits: [
        '淇濇姢鍟嗕笟鏈哄瘑',
        '鍏佽闂簮鍟嗕笟浜у搧',
        '鍙渶寮€婧怱pacetimeDB鏈韩鐨勪慨鏀?,
        '闄嶄綆鍟嗕笟閲囩敤闂ㄦ'
      ],
      requirements: [
        'SpacetimeDB鐨勪慨鏀瑰繀椤诲紑婧?,
        '淇濇寔AGPL鐨勫叾浠栬姹?,
        '缃戠粶浣跨敤瑙嗕负鍒嗗彂',
        '淇濇寔璁稿彲璇佸畬鏁存€?
      ]
    };
  }
}

// 鍟嗕笟浣跨敤鍐崇瓥妗嗘灦
export class CommercialUseDecisionFramework {
  private project: {
    type: string;
    scale: 'small' | 'medium' | 'large';
    timeline: 'short' | 'medium' | 'long';
    budget: 'limited' | 'moderate' | 'unlimited';
  };

  constructor(project: typeof this.project) {
    this.project = project;
  }

  // 鐢熸垚鍐崇瓥寤鸿
  generateDecision(): {
    recommendedApproach: string;
    reasoning: string[];
    alternatives: Array<{
      option: string;
      pros: string[];
      cons: string[];
      suitability: number; // 0-100
    }>;
    nextSteps: string[];
  } {
    const decisions = {
      'dapp-small-short-limited': {
        recommendedApproach: '鐩存帴浣跨敤BSL璁稿彲璇?,
        reasoning: [
          'DApp閫氬父瀹炰緥鏁伴噺灏戯紝绗﹀悎鍗曞疄渚嬮檺鍒?,
          '鐭湡椤圭洰鍙互鍦?031骞村墠瀹屾垚',
          '棰勭畻鏈夐檺锛屾棤闇€鍟嗕笟璁稿彲璇?
        ]
      },
      'saas-medium-medium-moderate': {
        recommendedApproach: '璇勪及瑙勬ā鍚庡喅瀹?,
        reasoning: [
          'SaaS鍙兘闇€瑕佸涓疄渚?,
          '涓湡椤圭洰闇€瑕佽€冭檻璁稿彲璇佸彉鏇?,
          '寤鸿鍑嗗鍟嗕笟璁稿彲璇侀绠?
        ]
      },
      'enterprise-large-long-unlimited': {
        recommendedApproach: '鑰冭檻鍟嗕笟璁稿彲璇?,
        reasoning: [
          '澶у瀷浼佷笟椤圭洰瀹炰緥闇€姹傚ぇ',
          '闀挎湡缁存姢闇€瑕佺ǔ瀹氭敮鎸?,
          '棰勭畻鍏呰冻鍙互閫夋嫨鍟嗕笟璁稿彲璇?
        ]
      }
    };

    const key = `${this.project.type}-${this.project.scale}-${this.project.timeline}-${this.project.budget}` as keyof typeof decisions;
    const decision = decisions[key] || decisions['dapp-small-short-limited'];

    return {
      recommendedApproach: decision.recommendedApproach,
      reasoning: decision.reasoning,
      alternatives: this.generateAlternatives(),
      nextSteps: this.generateNextSteps()
    };
  }

  private generateAlternatives(): Array<{
    option: string;
    pros: string[];
    cons: string[];
    suitability: number;
  }> {
    return [
      {
        option: '鐩存帴浣跨敤BSL璁稿彲璇?,
        pros: ['鏃犻渶浠樿垂', '瀹屽叏寮€婧?, '绀惧尯鏀寔'],
        cons: ['瀹炰緥鏁伴噺闄愬埗', '鍟嗕笟椋庨櫓', '2031骞村悗鍙樻洿'],
        suitability: this.calculateSuitability('bsl')
      },
      {
        option: '璐拱鍟嗕笟璁稿彲璇?,
        pros: ['鏃犲疄渚嬮檺鍒?, '瀹樻柟鏀寔', '娉曞緥淇濋殰', '浼佷笟绾ф湇鍔?],
        cons: ['闇€瑕佷粯璐?, '鍙兘璐圭敤杈冮珮'],
        suitability: this.calculateSuitability('commercial')
      },
      {
        option: '浣跨敤Maincloud鎵樼',
        pros: ['鏃犻渶绠＄悊', '鑷姩鎵╁睍', '瀹樻柟鏈嶅姟', '鍚堣淇濊瘉'],
        cons: ['浜戞湇鍔′緷璧?, '鍙兘璐圭敤杈冮珮'],
        suitability: this.calculateSuitability('maincloud')
      },
      {
        option: '绛夊緟AGPL寮€婧?,
        pros: ['瀹屽叏鍏嶈垂', '鏃犲晢涓氶檺鍒?],
        cons: ['闇€瑕佺瓑鍒?031骞?, '褰撳墠鏃犳硶浣跨敤'],
        suitability: this.calculateSuitability('wait')
      }
    ];
  }

  private calculateSuitability(option: string): number {
    const baseScores = {
      bsl: { 'dapp-small-short-limited': 95, 'saas-medium-medium-moderate': 60, 'enterprise-large-long-unlimited': 30 },
      commercial: { 'dapp-small-short-limited': 80, 'saas-medium-medium-moderate': 90, 'enterprise-large-long-unlimited': 95 },
      maincloud: { 'dapp-small-short-limited': 85, 'saas-medium-medium-moderate': 85, 'enterprise-large-long-unlimited': 90 },
      wait: { 'dapp-small-short-limited': 20, 'saas-medium-medium-moderate': 10, 'enterprise-large-long-unlimited': 5 }
    };

    const key = `${this.project.type}-${this.project.scale}-${this.project.timeline}-${this.project.budget}` as keyof typeof baseScores['bsl'];
    return baseScores[option as keyof typeof baseScores][key] || 50;
  }

  private generateNextSteps(): string[] {
    const steps = [
      '鏌ョ湅SpacetimeDB瀹氫环椤甸潰浜嗚В鍟嗕笟璁稿彲璇佽垂鐢?,
      '璇勪及椤圭洰瀹炰緥鏁伴噺闇€姹?,
      '鍜ㄨ娉曞緥椤鹃棶纭鍚堣鎬?,
      '鍒跺畾璁稿彲璇佺洃鎺у拰杩佺Щ璁″垝'
    ];

    if (this.project.type === 'saas') {
      steps.push('璁捐瀹炰緥鎵╁睍璁″垝');
      steps.push('鍑嗗鍟嗕笟璁稿彲璇侀绠?);
    }

    if (this.project.timeline === 'long') {
      steps.push('鍒跺畾2031骞磋鍙瘉鍙樻洿搴斿绛栫暐');
    }

    return steps;
  }
}