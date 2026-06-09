// 给 TS 编译期看到 @testing-library/jest-dom/vitest 的 expect 扩展。
// vitest.setup.ts 已经做了运行期 import,这里是类型层的等价声明。
// 没有它,TS 不知道 `toBeInTheDocument()` 等匹配器存在,但运行时正常。

import '@testing-library/jest-dom/vitest';
