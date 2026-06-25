// 每标签页一个稳定 deviceId,握手时上报给服务端,用于通话的「多标签页/多设备并发裁决」。
//
// 选 sessionStorage 的理由:
// - 同一标签页刷新后保持不变 → 重连方能被服务端识别为「同一设备回来了」,接续原通话;
// - 不同标签页/窗口各自独立 → 服务端能区分并裁决(忙线/他处接听/属主路由);
// - 不同浏览器/机器天然不同 → 多设备裁决自然成立。

const KEY = 'oc.deviceId';

export function getDeviceId(): string {
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(KEY, id);
  }
  return id;
}
