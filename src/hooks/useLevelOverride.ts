import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../constants';

interface LevelOverrideResult {
  address: string;
  level: number | null;
  hasOverride: boolean;
}

/**
 * Hook to fetch level override from API
 * Returns the override level if set, otherwise null
 */
export function useLevelOverride(address: string | null | undefined) {
  const [overrideLevel, setOverrideLevel] = useState<number | null>(null);
  const [hasOverride, setHasOverride] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetchOverride = useCallback(async () => {
    if (!address) {
      setOverrideLevel(null);
      setHasOverride(false);
      return;
    }

    if (!API_BASE_URL) {
      setOverrideLevel(null);
      setHasOverride(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/level-override?address=${address}`);
      if (response.ok) {
        const data: LevelOverrideResult = await response.json();
        setOverrideLevel(data.level);
        setHasOverride(data.hasOverride);
      }
    } catch (error) {
      console.warn('Failed to fetch level override:', error);
      setOverrideLevel(null);
      setHasOverride(false);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchOverride();
  }, [fetchOverride]);

  return { overrideLevel, hasOverride, isLoading, refetch: fetchOverride };
}

/**
 * Get level info with optional override
 * If overrideLevel is provided, use it; otherwise calculate from teamCount
 */
export function getLevelInfoWithOverride(teamCount: number, overrideLevel: number | null) {
  const levels = [
    { level: 0, percent: 0, name: "V0", color: "from-gray-500 to-gray-600", minCount: 0 },
    { level: 1, percent: 5, name: "V1", color: "from-red-500 to-orange-500", minCount: 10 },
    { level: 2, percent: 10, name: "V2", color: "from-orange-500 to-yellow-500", minCount: 30 },
    { level: 3, percent: 15, name: "V3", color: "from-yellow-500 to-green-500", minCount: 100 },
    { level: 4, percent: 20, name: "V4", color: "from-green-500 to-teal-500", minCount: 300 },
    { level: 5, percent: 25, name: "V5", color: "from-teal-500 to-cyan-500", minCount: 1000 },
    { level: 6, percent: 30, name: "V6", color: "from-cyan-500 to-blue-500", minCount: 3000 },
    { level: 7, percent: 35, name: "V7", color: "from-blue-500 to-indigo-500", minCount: 10000 },
    { level: 8, percent: 40, name: "V8", color: "from-indigo-500 to-purple-500", minCount: 30000 },
    { level: 9, percent: 45, name: "V9", color: "from-purple-500 to-pink-500", minCount: 100000 },
  ];

  // If override is set, use it directly
  if (overrideLevel !== null && overrideLevel >= 1 && overrideLevel <= 9) {
    const levelInfo = levels[overrideLevel];
    const nextLevel = overrideLevel < 9 ? levels[overrideLevel + 1] : null;
    return {
      ...levelInfo,
      nextReq: nextLevel?.minCount || null,
      isOverride: true
    };
  }

  // Otherwise calculate from teamCount
  let currentLevel = levels[0];
  for (let i = levels.length - 1; i >= 0; i--) {
    if (teamCount >= levels[i].minCount) {
      currentLevel = levels[i];
      break;
    }
  }

  const nextLevel = currentLevel.level < 9 ? levels[currentLevel.level + 1] : null;
  return {
    ...currentLevel,
    nextReq: nextLevel?.minCount || null,
    isOverride: false
  };
}

/**
 * Admin function to set level override
 */
export async function setLevelOverride(
  address: string, 
  level: number | null, 
  adminAddress: string
): Promise<{ success: boolean; error?: string }> {
  if (!API_BASE_URL) {
    return { success: false, error: '鏈厤缃悗绔?API锛岀瓑绾ц鍐欏姛鑳藉凡绂佺敤' };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/level-override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, level, adminAddress })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to set level override' };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Admin function to get all level overrides
 */
export async function getAllLevelOverrides(): Promise<Array<{address: string; level: number; updated_at: number}>> {
  if (!API_BASE_URL) {
    return [];
  }

  try {
    const response = await fetch(`${API_BASE_URL}/level-overrides`);
    if (response.ok) {
      const data = await response.json();
      return data.overrides || [];
    }
  } catch (error) {
    console.warn('Failed to fetch all level overrides:', error);
  }
  return [];
}

