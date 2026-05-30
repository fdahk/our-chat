// Lighthouse CI 配置——三层性能防线的第二层（lab 实验室体检 + 断言 + 报告）。
// 用 .cjs 后缀：本项目 package.json 是 "type":"module"，用 .js + module.exports 会被当 ESM 解析而报错。
module.exports = {
  ci: {
    collect: {
      // 纯前端构建产物直接静态托管即可跑，无需起后端。
      // 注：本应用首屏会被 RequireAuth 重定向到 /login，这里量到的就是登录页首屏性能，
      // 依赖后端数据的内页若要测，改用 startServerCommand: 'pnpm preview' + url 指向具体路由。
      staticDistDir: './dist',
      numberOfRuns: 3, // 跑 3 次取中位数，压住 Lighthouse ±5~10 分的单次抖动（关键，否则断言天天误报）
    },
    assert: {
      assertions: {
        // 当前实测值 + 缓冲起步，后续每迭代收紧。warn 不挂流水线、error 挂。
        'categories:performance': ['warn', { minScore: 0.9 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }], // LCP good 线
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }], // CLS good 线
        'total-blocking-time': ['warn', { maxNumericValue: 300 }], // INP 的 lab 近似指标
      },
    },
    upload: {
      target: 'temporary-public-storage', // 免费临时托管，PR 上自动留一个报告 URL
    },
  },
};
