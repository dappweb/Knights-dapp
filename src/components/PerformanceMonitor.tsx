import React, { useEffect } from 'react';

interface PerformanceMetrics {
  fcp: number; // First Contentful Paint
  lcp: number; // Largest Contentful Paint
  fid: number; // First Input Delay
  cls: number; // Cumulative Layout Shift
  ttfb: number; // Time to First Byte
}

export const PerformanceMonitor: React.FC = () => {
  useEffect(() => {
    // 鍙湪鐢熶骇鐜鏀堕泦鎬ц兘鎸囨爣
    if (process.env.NODE_ENV !== 'production') return;
    
    const collectMetrics = () => {
      try {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        const paint = performance.getEntriesByType('paint');
        
        const metrics: Partial<PerformanceMetrics> = {
          ttfb: navigation.responseStart - navigation.requestStart,
        };
        
        // FCP
        const fcp = paint.find(entry => entry.name === 'first-contentful-paint');
        if (fcp) metrics.fcp = fcp.startTime;
        
        // LCP
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          metrics.lcp = lastEntry.startTime;
          
          // 鍙戦€佹寚鏍?
          sendMetrics(metrics as PerformanceMetrics);
        }).observe({ entryTypes: ['largest-contentful-paint'] });
        
        // FID
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach(entry => {
            metrics.fid = (entry as any).processingStart - entry.startTime;
          });
        }).observe({ entryTypes: ['first-input'] });
        
        // CLS
        let clsValue = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              clsValue += (entry as any).value;
            }
          }
          metrics.cls = clsValue;
        }).observe({ entryTypes: ['layout-shift'] });
        
      } catch (error) {
        console.warn('Performance monitoring error:', error);
      }
    };
    
    // 椤甸潰鍔犺浇瀹屾垚鍚庢敹闆嗘寚鏍?
    if (document.readyState === 'complete') {
      collectMetrics();
    } else {
      window.addEventListener('load', collectMetrics);
    }
    
    return () => {
      window.removeEventListener('load', collectMetrics);
    };
  }, []);
  
  return null;
};

async function sendMetrics(metrics: PerformanceMetrics) {
  try {
    // 浣跨敤 navigator.sendBeacon 纭繚鏁版嵁鍙戦€?
    const data = JSON.stringify({
      ...metrics,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      connection: (navigator as any).connection?.effectiveType || 'unknown'
    });
    
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/performance', data);
    } else {
      // 闄嶇骇鍒?fetch
      fetch('/api/analytics/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: data,
        keepalive: true
      }).catch(() => {
        // 闈欓粯澶辫触锛屼笉褰卞搷鐢ㄦ埛浣撻獙
      });
    }
  } catch (error) {
    // 闈欓粯澶辫触锛屼笉褰卞搷鐢ㄦ埛浣撻獙
  }
}