// 调试工具登记表：仅用于「调试中心」首页列表渲染（纯元数据，不引用组件，避免无谓打包）。
// 新增一个调试工具 = 在此登记一条 + 在 router 的 devOnlyRoutes 里加一条 lazy 子路由 + 建对应页面文件。
export interface DebugToolMeta {
  path: string; // 相对 /debug 的子路径
  title: string;
  description: string;
}

export const debugTools: DebugToolMeta[] = [
  {
    path: 'upload',
    title: '文件上传',
    description: '图片压缩 / 大文件分片 / 通用上传 三种配置的 FileUploader 手测',
  },
];
