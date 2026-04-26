import react from '@vitejs/plugin-react';
import autoprefixer from 'autoprefixer';
import cssnano from 'cssnano';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const isProduction = mode === 'production';
    
    return {
      server: {
        port: 5173,
        host: '0.0.0.0',
        allowedHosts: ['t1.test2dapp.xyz', 't2.test2dapp.xyz'],
        headers: {
          'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
        },
      },
      plugins: [
        react({
          // 启用React Fast Refresh
          fastRefresh: !isProduction,
          // 生产环境移除开发工具
          babel: isProduction ? {
            plugins: [
              ['babel-plugin-react-remove-properties', { properties: ['data-testid'] }]
            ]
          } : undefined
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        // 移除生产环境的console
        ...(isProduction && {
          'console.log': '(() => {})',
          'console.warn': '(() => {})',
        })
      },
      
      // 依赖预构建优化
      optimizeDeps: {
        include: [
          'react',
          'react-dom'
        ],
        // 排除 recharts 以避免 "Cannot access 'ot' before initialization" 错误
        // recharts 将通过动态导入在运行时加载
        exclude: ['recharts'],
        esbuildOptions: {
          define: {
            global: 'globalThis'
          },
          target: 'es2020'
        }
      },
      
      // 构建优化 - 使用 esbuild 替代 terser 避免变量提升问题
      build: {
        target: 'es2020',
        minify: 'esbuild', // 使用 esbuild 替代 terser，避免 "Cannot access 'J' before initialization" 错误
        // 禁用代码分割以避免 TDZ (Temporal Dead Zone) 问题
        // 某些库（如 recharts）在代码分割时可能出现 "Cannot access 'ot' before initialization" 错误
        cssCodeSplit: false,
        rollupOptions: {
          output: {
            manualChunks: (id) => {
              if (!id.includes('node_modules')) return;
              // 保持 RainbowKit / wagmi / viem 在同一 chunk，避免跨 chunk 初始化顺序导致的 TDZ 报错
              if (id.includes('@rainbow-me/rainbowkit') || id.includes('wagmi') || id.includes('viem')) {
                return 'vendor-web3';
              }
              if (id.includes('ethers')) return 'vendor-ethers';
              if (id.includes('react') || id.includes('react-dom') || id.includes('@tanstack/react-query')) {
                return 'vendor-react';
              }
            },
            // 手动分离重依赖，降低主入口体积
            // 文件命名优化
            chunkFileNames: 'assets/js/[name]-[hash].js',
            entryFileNames: 'assets/js/[name]-[hash].js',
            assetFileNames: (assetInfo) => {
              const info = assetInfo.name.split('.');
              const ext = info[info.length - 1];
              if (/\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/i.test(assetInfo.name)) {
                return `assets/media/[name]-[hash].${ext}`;
              }
              if (/\.(png|jpe?g|gif|svg|webp|avif)(\?.*)?$/i.test(assetInfo.name)) {
                return `assets/img/[name]-[hash].${ext}`;
              }
              if (/\.(woff2?|eot|ttf|otf)(\?.*)?$/i.test(assetInfo.name)) {
                return `assets/fonts/[name]-[hash].${ext}`;
              }
              return `assets/[ext]/[name]-[hash].${ext}`;
            }
          }
        },
        // 启用源码映射 (hidden = 不在 JS 尾部添加 sourceMappingURL 注释，但仍生成 .map 文件)
        sourcemap: isProduction ? 'hidden' : true,
        // 构建报告
        reportCompressedSize: true,
        // 块大小警告限制
        chunkSizeWarningLimit: 1000
      },
      
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          '@components': path.resolve(__dirname, 'components'),
          '@src': path.resolve(__dirname, 'src'),
          '@utils': path.resolve(__dirname, 'utils'),
          '@hooks': path.resolve(__dirname, 'hooks'),
        }
      },
      
      // CSS优化
      css: {
        devSourcemap: !isProduction,
        postcss: {
          plugins: isProduction ? [
            autoprefixer,
            cssnano({
              preset: ['default', {
                discardComments: { removeAll: true },
                normalizeWhitespace: true
              }]
            })
          ] : []
        }
      }
    };
});