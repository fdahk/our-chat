# server 启动时报 `EADDRINUSE: 3007` 的解决步骤

## 4. 标准解决步骤

### 第一步：确认是不是端口占用

看到下面这类报错时，就可以基本确定是端口冲突：

```text
Error: listen EADDRINUSE: address already in use :::3007
```

重点看两个字段：

- `EADDRINUSE`
- `port: 3007`

---

### 第二步：找出是谁占用了 `3007`

Windows 下可以用：

```powershell
netstat -ano | findstr 3007
```

如果看到类似：

```text
TCP    0.0.0.0:3007    0.0.0.0:0    LISTENING    5180
```

说明：

- 有一个 PID 为 `5180` 的进程正在监听 `3007`

其中：

- `LISTENING` 表示它正在占用这个端口等待连接
- 最后一列就是进程 PID

---

### 第三步：结束占用端口的进程

Windows 下可以执行：

```powershell
taskkill /PID 5180 /F
```

含义：

- `/PID 5180`：结束指定 PID 的进程
- `/F`：强制结束

如果你查到的不是 `5180`，就把命令里的 PID 替换成实际值。

---

### 第四步：再次确认端口是否已经释放

再执行一次：

```powershell
netstat -ano | findstr 3007
```

如果没有 `LISTENING` 结果，说明端口已经释放。

---

### 6.2 端口冲突不一定是本项目自己导致的

也可能是：

- 另一个 Node 进程
- 其他后端服务
- 某些本地代理程序

所以不要默认一定是“代码错了”。

### 6.3 看到 `:::3007` 不要慌

这里不是奇怪的地址，而是 Node/系统在表示监听地址时的一种格式，重点仍然是：

- 端口 `3007` 被占用

---

## 7. 最简处理模板

以后再次遇到同类问题，直接按这个模板处理：

```powershell
netstat -ano | findstr 3007
taskkill /PID <查到的PID> /F
netstat -ano | findstr 3007
```
