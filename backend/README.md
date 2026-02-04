# HRT Tracker Backend

轻量 Node.js 后端，使用 Express + SQLite，提供多用户认证和每用户数据存储。

快速开始：

1. 进入目录并安装依赖：

```bash
cd backend
npm install
```

2. 复制环境变量并设置 `JWT_SECRET`：

```bash
cp .env.example .env
# 编辑 .env
```

3. 初始化数据库：

```bash
npm run init-db
```

4. 启动服务：

```bash
npm start
```

接口概览：
- `POST /auth/register` { username, password } -> { token }
- `POST /auth/login` { username, password } -> { token }
- `GET /api/records` Authorization: Bearer <token>
- `POST /api/records` { data }
- `PUT /api/records/:id` { data }
- `DELETE /api/records/:id`
