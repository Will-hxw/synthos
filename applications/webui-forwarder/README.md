# WebUI Forwarder

WebUI 前后端接口转发服务，用于将本地服务暴露到公网。

## 功能特性

- **端口转发**：将本地服务端口映射到公网URL
- **公网访问**：支持通过公网URL访问本地WebUI
- **隧道管理**：创建和管理ngrok隧道

## 技术栈

- **ngrok**：反向代理隧道服务

## 使用场景

当你需要在外部环境（如移动设备）访问本地运行的WebUI时，可以使用此服务。

公网访问 WebUI 时优先使用仓库根目录的 `pnpm dev:public-preview`。该命令会先构建前端并通过静态预览服务暴露到 ngrok，避免公网访问 Vite 开发服务器时产生大量源码模块请求。

`pnpm dev:forwarder` 仅用于调试 legacy forwarder，默认转发 WebUI 前端开发服务器 `127.0.0.1:3011`。如需和公网静态预览链路对齐目标端口，可复用 `scripts/startPublicTunnel.cjs` 的环境变量约定：`SYNTHOS_PUBLIC_TUNNEL_TARGET_PORT` 覆盖前端隧道端口，`SYNTHOS_PUBLIC_TUNNEL_TARGET_HOST` 覆盖目标主机。

如果本机 ngrok inspector 已存在指向同一目标主机和端口的隧道，public tunnel 脚本会复用该公网地址，避免重复启动同一 endpoint 时触发 `ERR_NGROK_334`。

## 开发命令

```bash
# 构建
pnpm run build

# 启动转发服务
pnpm run dev
```

```powershell
# PowerShell 示例：转发到公网静态预览端口
$env:SYNTHOS_PUBLIC_TUNNEL_TARGET_PORT="3012"; pnpm run dev
```

## 工作原理

1. 启动后端服务（webui-backend）
2. 启动前端服务（webui-frontend）
3. 运行 webui-forwarder 创建公网隧道
4. 通过生成的公网URL访问服务

## 注意事项

- 需要ngrok账户和认证token
- 公网URL是临时的，每次重启都会变化
- 仅用于开发和测试，不推荐用于生产环境
- 面向公网访问体验的本地演示应优先使用根目录 `pnpm dev:public-preview`

## 依赖说明

- 依赖 webui-backend 和 webui-frontend 服务先启动
- 通过 ngrok 创建安全隧道
