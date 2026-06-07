// authView 的简历数据。
//
// 这里**只放结构化双语数据**(姓名 / 工作 / 项目 / 技能),它们本质就是"双语
// 内容"而非"翻译目标",故保持 `{ zh, en }` 形状,由 useLang() 选语言读取。
//
// 纯 UI 文案(按钮、标题、校验提示等)统一在 src/locales/{zh,en}.ts,由
// react-i18next 的 useTranslation('translation', { keyPrefix: 'auth' }) 读取。
import type { AppLang } from '@/i18n';

export interface I18nText { zh: string; en: string }
export type I18nBullets = { zh: string[]; en: string[] };

export const PROFILE = {
  name:   { zh: '涂将', en: 'Tu Jiang' },
  pinyin: 'TU JIANG',
  age:    { zh: '20 岁', en: '20 y/o' },
  school: { zh: '东华理工大学 · 28 届本科', en: 'East China Univ. of Tech · Class of 2028' },
  intent: { zh: '全栈开发 · 偏前端', en: 'Full-stack · Front-end leaning' },
  slogan: { zh: '我一直在努力。', en: 'Still working on it.' },
  award:  { zh: '蓝桥杯算法竞赛 · 国奖', en: 'Lanqiao Algorithm Contest · National Award' },
  phone:  '+86 185 7919 4952',
  email:  '3235159187@qq.com',
  github: 'fdahk',
  juejin: 'fdahk',
} as const;

export interface WorkItem {
  role:       I18nText;
  company:    I18nText;
  period:     string;
  location:   I18nText;
  highlights: I18nBullets;
  stack:      string[];
}

export const WORKS: WorkItem[] = [
  {
    role:     { zh: '全栈开发', en: 'Full-stack Engineer' },
    company:  { zh: '北京智源人工智能研究院', en: 'Beijing Academy of AI (BAAI)' },
    period:   '2025.09 — 2026.05',
    location: { zh: '北京', en: 'Beijing' },
    highlights: {
      zh: [
        'React / Next / Shopify / Tailwind 营销展示与数据分析页',
        'Flutter 端 CV 模型多场景应用与常规业务',
        'Express / FastAPI 后端,含 RAG agent 系统',
        'Prometheus + 飞书 Hook 搭建服务监测分析平台',
      ],
      en: [
        'Marketing & analytics pages on React / Next / Shopify / Tailwind',
        'Flutter apps integrating CV models across multiple scenarios',
        'Express / FastAPI backends including a RAG agent system',
        'Service observability platform via Prometheus + Feishu hooks',
      ],
    },
    stack: ['React', 'Next', 'Flutter', 'Express', 'FastAPI', 'Prometheus'],
  },
  {
    role:     { zh: '全栈开发', en: 'Full-stack Engineer' },
    company:  { zh: '上海妙妙宠科技', en: 'Shanghai MiaoMiao Pet Tech' },
    period:   '2025.08 — 2025.09',
    location: { zh: '上海', en: 'Shanghai' },
    highlights: {
      zh: [
        'Android / iOS 双端应用 + Node Express 后端 + 内部网页维护',
        '地图寻宠定位、智能录音宠物翻译、软硬件交互模块',
        '部署于腾讯云',
      ],
      en: [
        'Android / iOS dual-platform apps + Node Express backend + internal sites',
        'Map-based pet locator, voice translation, hardware integration',
        'Deployed on Tencent Cloud',
      ],
    },
    stack: ['Flutter', 'Node', 'Express', 'Tencent Cloud'],
  },
  {
    role:     { zh: '微信小程序前端', en: 'WeChat Mini-program Front-end' },
    company:  { zh: '成都小来空间科技', en: 'Chengdu Xiaolai Space Tech' },
    period:   '2025.07 — 2025.08',
    location: { zh: '成都', en: 'Chengdu' },
    highlights: {
      zh: [
        '微信小程序前端开发',
        '展示并桥接影视服务商与终端用户的功能模块',
      ],
      en: [
        'WeChat mini-program front-end development',
        'Modules bridging film/TV service providers with end users',
      ],
    },
    stack: ['Uniapp', 'Vue 3'],
  },
];

export interface ProjectItem {
  name:    I18nText;
  tagline: I18nText;
  detail:  I18nText;
  role:    I18nText;
  stack:   string[];
  year:    string;
}

export const PROJECTS: ProjectItem[] = [
  {
    name:    { zh: '实时聊天平台', en: 'Realtime Chat Platform' },
    tagline: { zh: '仿微信的端对端通讯实验', en: 'A WeChat-style E2E messenger experiment' },
    detail: {
      zh: '局域网下的设备文本及音视频即时通讯。WebRTC P2P 通话、Socket 长连接消息分发、消息持久化与离线补发。',
      en: 'LAN device chat with realtime text & A/V. WebRTC P2P calls, socket-based message fan-out, persistence and offline replay.',
    },
    role:  { zh: '独立开发', en: 'Solo' },
    stack: ['React', 'Redux', 'WebRTC', 'Socket.io', 'Node', 'MySQL', 'MongoDB'],
    year:  '2025',
  },
  {
    name:    { zh: 'Source Agent', en: 'Source Agent' },
    tagline: { zh: '把规则下的 URL 自动喂进个人知识库', en: 'Auto-ingest rule-based URLs into a personal KB' },
    detail: {
      zh: 'React 前端 + Node Nest / Java SpringBoot 混合后端。规则化 URL 抓取 → 结构化整理 → 落入个人知识库,辅助长期阅读检索。',
      en: 'React front-end + hybrid Nest / SpringBoot backend. Rule-based crawl → structured extract → persisted into a personal KB for long-term retrieval.',
    },
    role:  { zh: '独立开发', en: 'Solo' },
    stack: ['React', 'Nest', 'SpringBoot'],
    year:  '2025',
  },
  {
    name:    { zh: '掘金风格博客', en: 'Juejin-style Blog' },
    tagline: { zh: '把博客网站的核心拆出来重写一遍', en: 'Re-implementing the core of a tech-blog site' },
    detail: {
      zh: 'Vue 全家桶,从内容管理、评论、关注到搜索的全链路,练手关系型数据模型与缓存策略。',
      en: 'A full Vue stack: content, comments, follows, search — practice on relational modeling and caching strategy.',
    },
    role:  { zh: '独立开发', en: 'Solo' },
    stack: ['Vue', 'ElementPlus', 'Pinia', 'MySQL', 'Redis'],
    year:  '2024',
  },
  {
    name:    { zh: '电商小程序', en: 'E-commerce Mini-program' },
    tagline: { zh: '把云开发跑通的一次轻量练习', en: 'A lightweight pass on WeChat Cloud Dev' },
    detail: {
      zh: '基于 Uniapp 与微信云开发的简易电商小程序,跑通商品-购物车-下单闭环。',
      en: 'A simple e-commerce mini-program on Uniapp + WeChat Cloud Dev, covering catalog-cart-order flow.',
    },
    role:  { zh: '独立开发', en: 'Solo' },
    stack: ['Uniapp', 'WeChat CloudDev', 'uvui'],
    year:  '2024',
  },
];

export interface SkillGroup { title: I18nText; items: string[] }

export const SKILLS: SkillGroup[] = [
  {
    title: { zh: '前端', en: 'Front-end' },
    items: ['Vue', 'React', 'Flutter', 'Uniapp', 'TypeScript', 'Tailwind', 'SCSS', 'ElementPlus', 'AntD'],
  },
  {
    title: { zh: '后端', en: 'Back-end' },
    items: ['Node (Express / Nest)', 'Python (FastAPI / Flask)'],
  },
  {
    title: { zh: '工程化', en: 'Tooling' },
    items: ['Vite', 'Git', 'Docker', 'Sequelize', 'ESLint', 'GitHub Actions', 'Nginx', 'Linux', 'Shell', 'Figma / SuperDesign MCP'],
  },
  {
    title: { zh: '数据与中间件', en: 'Data & Middleware' },
    items: ['MySQL', 'MongoDB', 'Redis', 'PostgreSQL', 'Neo4j', 'RabbitMQ'],
  },
];

// 给定当前语言,从 `{ zh, en }` 双语数据里挑出对应版本。
export function pick<T>(lang: AppLang, k: { zh: T; en: T }): T {
  return lang === 'zh' ? k.zh : k.en;
}
