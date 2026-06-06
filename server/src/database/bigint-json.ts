// Prisma 把 BIGINT 列映射成 BigInt,JSON.stringify 默认不支持 BigInt。
// 统一加 toJSON polyfill:转 number(用户 id 不会超 2^53)。
// 必须在应用入口最早 import,确保任意 res.json 之前已生效。

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  interface BigInt {
    toJSON(): number;
  }
}

if (!('toJSON' in BigInt.prototype)) {
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value(this: bigint): number {
      return Number(this);
    },
    writable: true,
    configurable: true,
  });
}

export {};
