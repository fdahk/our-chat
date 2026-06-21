// Toast 的非 React 调用桥。
//
// 解决什么:axios 拦截器 / utils 这类模块不在组件树里,不能 useToast(),又
// 不想拉回 antd 的全局 message。
//
// 怎么做:ToastProvider 挂载后调用 bindToast() 把真实 api 注入到本模块的
// 闭包里;其它模块直接 import { toast } 即可。bind 之前调用会降级到
// console.warn,不会抛错——绝大多数报错时机已经在 React 挂载之后,这条
// 降级路径只为了让模块加载顺序更稳。

import type { ToastApi } from './index';

let _api: ToastApi | null = null;

export function bindToast(api: ToastApi | null) {
  _api = api;
}

function ensure(text: string, tone: 'ok' | 'err' | 'info') {
  if (_api) _api.show(text, tone);
  else console.warn(`[toast:${tone} not bound]`, text);
}

export const toast = {
  ok:   (t: string) => ensure(t, 'ok'),
  err:  (t: string) => ensure(t, 'err'),
  info: (t: string) => ensure(t, 'info'),
};
