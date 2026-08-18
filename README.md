# xupt-cs-monitor v2

西安邮电大学计算机学院、软件学院公告代理 — Vue 3 架构 + Docker 部署。

## 本地开发

```bash
# 后端
cd backend
npm install
node server.js    # → http://localhost:3001

# 前端（新终端）
cd frontend
npm install
npm run dev       # → http://localhost:5173（自动代理 /api → 3001）
```

## Docker 部署

```bash
docker compose up -d
# 前端 → http://localhost:3080
# 后端 → http://localhost:3001
```

## 架构

```
frontend (Vue 3 + Vite + Nginx)  →  /api  →  backend (Express + Cheerio)
     :3080                                              :3001
                              ↓
                    实时请求 cs.xupt.edu.cn
```

## 功能

- 原站分类 Tab（通知公告、学院新闻、学术科研、学工动态）
- 服务端聚合分页，每页20条
- 右侧滑入详情面板，支持图片、表格、超链接
- 附件（PDF/DOC/ZIP等）显示等高下载按钮
- 右上角"查看原文"跳转原站页面
- GBK 编码自动检测
- 过滤旧版网站导航/页头/页脚垃圾 HTML
