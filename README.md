# HRT Recorder Web

This repository is a fork of the original HRT Recorder project — I forked the frontend and added an optional Node.js + SQLite backend for server-side synchronization, backups and multi-user management. The original project's attribution and algorithmic core remain intact and credited below.

HRT Recorder Web（HRT 网页记录工具）

A privacy-focused, web-based tool for simulating and tracking estradiol levels during Hormone Replacement Therapy (HRT).<br>

这是一个注重隐私的网页工具，用于在激素替代疗法（HRT）期间模拟和追踪雌二醇水平。

## Algorithm & Core Logic 算法逻辑

The pharmacokinetic algorithms, mathematical models, and parameters used in this simulation are derived directly from the **[HRT-Recorder-PKcomponent-Test](https://github.com/LaoZhong-Mihari/HRT-Recorder-PKcomponent-Test)** repository.<br>

本模拟中使用的药代动力学算法、数学模型与相关参数，直接来源于 **[HRT-Recorder-PKcomponent-Test](https://github.com/LaoZhong-Mihari/HRT-Recorder-PKcomponent-Test)** 仓库。

We strictly adhere to the `PKcore.swift` and `PKparameter.swift` logic provided by **@LaoZhong-Mihari**, ensuring that the web simulation matches the accuracy of the original native implementation (including 3-compartment models, two-part depot kinetics, and specific sublingual absorption tiers).<br>

我们严格遵循 **@LaoZhong-Mihari** 提供的 `PKcore.swift` 与 `PKparameter.swift` 中的逻辑，确保网页端模拟与原生实现在精度上保持一致（包括三室模型、双相肌注库房动力学以及特定的舌下吸收分层等）。

## Features 功能

* **Multi-Route Simulation**: Supports Injection (Valerate, Benzoate, Cypionate, Enanthate), Oral, Sublingual, Gel, and Patches.<br>

  **多给药途径模拟**：支持注射（戊酸酯 Valerate、苯甲酸酯 Benzoate、环戊丙酸酯 Cypionate、庚酸酯 Enanthate）、口服、舌下、凝胶以及贴片等多种给药方式。

* **Real-time Visualization**: Interactive charts showing estimated estradiol concentration (pg/mL) over time.<br>

  **实时可视化**：通过交互式图表展示随时间变化的雌二醇估算浓度（pg/mL）。

* **Sublingual Guidance**: Detailed "Hold Time" and absorption parameter ($\theta$) guidance based on strict medical modeling.<br>

  **舌下服用指导**：基于严格的医学建模，提供详细的“含服时间（Hold Time）”与吸收参数（$\theta$）参考。

* **Privacy First**: All data is stored entirely in your browser's `localStorage`. No data is ever sent to a server.<br>

  **隐私优先**：所有数据都完全存储在你浏览器的 `localStorage` 中，绝不会发送到任何服务器。

* **Internationalization**: Native support for **Simplified Chinese** and **English**, **Cantonese**, **Russian, Ukrainian** and more.<br>

  **多语言支持**：原生支持多语言界面。

## 🧪 Run Locally 本地运行

This project is built with **React** and **TypeScript**. You can run it easily using a modern frontend tooling setup like [Vite](https://vitejs.dev/).<br>

本项目基于 **React** 与 **TypeScript** 构建，你可以使用诸如 [Vite](https://vitejs.dev/) 这样的现代前端工具链轻松运行它。

## HRT Recorder Web

HRT Recorder Web 是一个用于记录与估算雌二醇（E2）血药浓度的前端应用，包含可选的 Node.js + SQLite 后端用于多设备同步、备份和多用户管理。

### 核心特性（摘要）
- 药代动力学模拟：基于三室模型及分段吸收/代谢参数，支持多给药途径（注射、口服、舌下、凝胶、贴片）。
- 交互式图表：使用前端模拟引擎生成时间序列并在 `ResultChart` 中绘制可交互的浓度曲线。
- 数据同步与备份（可选后端）：支持将本地数据上传为完整备份、跨设备下载与合并。
- 多用户与管理员控制：后端提供用户管理、SMTP 配置、邮箱验证开关、以及导出/删除/恢复用户等管理操作。

### 重要说明与归属
本项目的药代动力学实现参考并对齐于 `HRT-Recorder-PKcomponent-Test` 中的模型。

### 快速开始
前端：
```bash
npm install
npm run dev
```

后端（可选）:
```powershell
cd backend
npm install
node index.js
```

后端默认运行在 `http://localhost:4000`，前端默认连接此地址。

### 部署与托管

你可以将此应用部署到任何静态站点或前端托管服务（如 Vercel、Netlify），并将可选后端部署到支持 Node.js 的主机（如 Heroku、Render、DigitalOcean 等）。

- 我们非常欢迎你将该应用公开部署以便更多需要的人使用。
- 部署时请务必：
  - 保持对原始算法与作者的鸣谢链接（见下文）。
  - 在公开环境中使用安全的 `JWT_SECRET`、设置 HTTPS，并移除或旋转引导凭据文件 `backend/backend_admin_bootstrap.txt`。

**归属与致谢（Attribution Requirement）**

本仓库中的药代动力学实现参考自并对齐于 `HRT-Recorder-PKcomponent-Test`（作者：@LaoZhong-Mihari）。如果你将本项目公开部署，请在页面或 README 中显著保留对该仓库的链接与鸣谢，以尊重原作者的工作与许可证要求。

祝你使用顺利！🏳️‍⚧️

### TODO / 后续计划

- 添加更多语言本地化（例如日语）。
- 支持睾酮（testosterone）数据与模拟。
- 增强校准流程：允许根据多次实验室结果自动调整动力学参数。

### 后端功能（管理面板摘要）
- 列出活动用户、导出用户数据、软删除/恢复用户、永久删除用户。
- 配置 SMTP 并开启/关闭邮箱验证；前端会读取该配置并在登录/注册中显示邮箱字段。
- 查看用户备份并在前端以图表方式可视化（若备份包含 `events` 可生成模拟）。

### 新增功能（本次提交）
- 管理：支持管理员将普通用户提权为管理员（`POST /admin/promote-user`）及将非 root 管理员降权为普通用户（`POST /admin/demote-user`）；服务器端保护 root 用户，禁止对 root 进行提权/降权/删除/重置。
- 安全：禁止管理员通过接口将自己降权（需要其他管理员或 root 操作）。
- 后端工具：新增控制台脚本 `get_user_token.js`（生成任意用户的 JWT）以及 `change_admin_password.js`（在控制台修改用户密码）。
- API：新增按用户删除所有云端记录的接口 `DELETE /api/records/all`（仅删除调用者自己的记录）。

### 已知问题（本次提交说明）
- 覆盖上传与删除云端数据的流程在当前分支中存在缺陷（上传覆盖时可能会创建新记录而非正确覆盖；`DELETE /api/records/all` 在某些环境或路由顺序下可能无法生效）。
- 因时间与环境限制，本次提交未能完全修复该问题；建议在生产环境或重要数据操作前先备份数据库文件 `backend/data.db`，并通过服务器控制台脚本或数据库工具验证操作的结果。
- 我们已在代码中加入更多日志与保护（例如：对 `DELETE /api/records/all` 增加校验并在删除时打印日志），以便后续排查。若需我继续修复，请提供后端启动日志与复现步骤，我将继续定位与修复。

#### 从控制台修改管理员密码

仓库在 `backend` 目录下新增了一个便捷脚本 `change_admin_password.js`，可以在服务器控制台直接修改任意用户（包括 `admin`）的密码：

```powershell
cd backend
# 直接在命令行指定明文密码（注意安全风险）
npm run change-admin-password -- --username admin --password YourNewPassword

# 或交互式提示输入（会在控制台可见）
npm run change-admin-password -- --username admin

# 也可以直接用 node 运行脚本：
node change_admin_password.js --username admin --password YourNewPassword
```

脚本会对新密码进行 bcrypt 哈希并更新 `users` 表中的 `password_hash` 字段。请在安全环境下运行，并在修改后立即删除或安全保存凭据。

### 用户端功能（当前）
- 上传/下载与合并本地备份（完整备份）。
- 删除账户（用户主动删除，管理员账户无法通过此接口删除）。
- 删除所有云端记录（`Account` 页面新增按钮）。
- 修改密码（需要当前密码）。

### 管理员操作注意事项
- 管理员可在 `Admin` 页面导出指定用户的所有云端记录为 JSON、对用户进行软删除（可恢复）或永久删除。
- 若首次运行创建了引导管理员，会在 `backend/backend_admin_bootstrap.txt` 写入初始信息；请在记录凭据后立即删除或更改密码以降低泄露风险。

### TUDO(大概率咕咕)
- 2FA（TOTP）支持：已留存数据库列，但前端/后端的完整流程尚未实现
- 审计日志与更严格的数据合规流程（例如导出/删除操作的审计记录）
- 修复admin页面的记录显示

### 说明
- 该项目的初衷是跨设备同步数据
- 本项目99%由AI生成，1%来自人工校对
- 前有屎山，到此止步
- 🍥

许可：MIT

