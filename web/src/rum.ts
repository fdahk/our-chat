// 前端真实用户监控（RUM / field 数据）——三层性能防线的第三层。
// lab（size-limit + Lighthouse CI）只反映干净 CI 机器的表现；唯有这里采集的
// 是真实用户在真实设备/网络下的体验，是 INP 这类 field-only 指标的唯一来源。
import { onCLS, onINP, onLCP, onFCP, onTTFB, type Metric } from 'web-vitals';

const ENDPOINT = '/api/rum';

function report(metric: Metric) {
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating, // good / needs-improvement / poor，按 Core Web Vitals 阈值判定
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType,
    path: location.pathname, // 带上路由，线上才能按页面切分 P75 分位
    ts: Date.now(),
  });

  // 开发期只打印，便于本地观察指标，不向后端打点
  if (import.meta.env.DEV) {
    console.log(`[web-vitals] ${metric.name} ${metric.rating} ${Math.round(metric.value)}`, metric);
    return;
  }

  // 生产：优先 sendBeacon——它在页面卸载（unload/visibilitychange）时也能可靠送出且不阻塞页面；
  // 不支持时退回 keepalive fetch，同样能在卸载阶段发送。
  if (navigator.sendBeacon) {
    navigator.sendBeacon(ENDPOINT, body);
  } else {
    fetch(ENDPOINT, { method: 'POST', body, keepalive: true }).catch(() => {});
  }
}

// 在应用入口调用一次。各指标库内部已处理"页面隐藏时上报最终值"的时机，无需手动监听。
export function initWebVitals() {
  onLCP(report);
  onINP(report); // 交互到下次绘制——field-only，lab 用 TBT 近似，这里才是真值
  onCLS(report);
  onFCP(report);
  onTTFB(report);
}
