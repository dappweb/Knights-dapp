import { useState, useRef, useCallback } from 'react';

interface CacheOptions {
  ttl?: number; // 缂撳瓨鏃堕棿 (姣)
  maxSize?: number; // 鏈€澶х紦瀛樻潯鐩暟
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  accessCount: number;
}

export function useSmartCache<T>(options: CacheOptions = {}) {
  const { ttl = 5 * 60 * 1000, maxSize = 100 } = options; // 榛樿5鍒嗛挓TTL
  const cacheRef = useRef(new Map<string, CacheEntry<T>>());
  const [, forceUpdate] = useState({});

  const cleanup = useCallback(() => {
    const cache = cacheRef.current;
    const now = Date.now();
    
    // 娓呯悊杩囨湡缂撳瓨
    for (const [key, entry] of cache.entries()) {
      if (now - entry.timestamp > ttl) {
        cache.delete(key);
      }
    }
    
    // 濡傛灉浠嶇劧瓒呰繃鏈€澶уぇ灏忥紝鍒犻櫎鏈€灏戜娇鐢ㄧ殑鏉＄洰
    if (cache.size > maxSize) {
      const entries = Array.from(cache.entries());
      entries.sort((a, b) => a[1].accessCount - b[1].accessCount);
      
      const toDelete = entries.slice(0, cache.size - maxSize);
      toDelete.forEach(([key]) => cache.delete(key));
    }
  }, [ttl, maxSize]);

  const set = useCallback((key: string, data: T) => {
    const cache = cacheRef.current;
    
    cleanup();
    
    cache.set(key, { 
      data, 
      timestamp: Date.now(),
      accessCount: 0
    });
    
    forceUpdate({});
  }, [cleanup]);

  const get = useCallback((key: string): T | null => {
    const cached = cacheRef.current.get(key);
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.timestamp > ttl) {
      cacheRef.current.delete(key);
      return null;
    }
    
    // 澧炲姞璁块棶璁℃暟
    cached.accessCount++;
    
    return cached.data;
  }, [ttl]);

  const clear = useCallback(() => {
    cacheRef.current.clear();
    forceUpdate({});
  }, []);

  const has = useCallback((key: string): boolean => {
    const cached = cacheRef.current.get(key);
    if (!cached) return false;
    
    const now = Date.now();
    if (now - cached.timestamp > ttl) {
      cacheRef.current.delete(key);
      return false;
    }
    
    return true;
  }, [ttl]);

  const getStats = useCallback(() => {
    const cache = cacheRef.current;
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;
    
    for (const [, entry] of cache.entries()) {
      if (now - entry.timestamp > ttl) {
        expiredEntries++;
      } else {
        validEntries++;
      }
    }
    
    return {
      total: cache.size,
      valid: validEntries,
      expired: expiredEntries,
      hitRate: validEntries / (validEntries + expiredEntries) || 0
    };
  }, [ttl]);

  return { 
    set, 
    get, 
    clear, 
    has, 
    cleanup,
    getStats,
    size: cacheRef.current.size 
  };
}