# Photo Challenge Node.js

[English](README.md) | 繁體中文

這是一個用於 Wikimedia Commons Photo Challenge 作業流程的 Node.js + TypeScript 專案。
它同時提供 Web UI 與 CLI，處理三種常見工作：
- 從 submission pages 產生 voting page
- 驗票並產生 revised/result/winners 頁面
- 規劃與發佈 post-results maintenance 項目

## 環境需求

- Node.js `24.14.1`
- npm
- Wikimedia Commons BotPassword 帳號

基本設定：
- 將 `.env.example` 複製為 `.env`
- `NAME` 填入完整 BotPassword 登入名稱，例如 `MainAccount@BotAppName`
- 設定 `BOT_PASSWORD`
- 視需要設定 `USER_AGENT`、`PORT`、`CREDENTIAL_SERVICE_NAME`

## 安裝

```bash
npm install
```

## 快速開始

Web 開發模式：

```bash
npm run dev
```

正式建置與啟動：

```bash
npm run build
npm start
```

CLI 範例：

```bash
npm run cli -- create-voting --challenge "2026 - March - Three-wheelers"
npm run cli -- process-challenge --challenge "2026 - February - Orange"
node dist/cli.js post-results-maintenance --challenge "2026 - February - Orange" --paired-challenge "2026 - February - First aid" --publish-mode dry-run
node dist/cli.js post-results-maintenance --challenge "2026 - February - Orange" --publish-mode live
```

## 使用概覽

### 1. Prepare voting page

適用於投票開始前。
產物會寫到 `output/jobs/<job-id>/generated/`，包含 `*_voting.txt`、`*_files.json`、`*_summary.txt`。

### 2. Count votes and publish results

適用於投票結束後。
此流程會驗證投票者與投票內容、檢查截止時間，並產生 `*_revised.txt`、`*_result.txt`、`*_winners.txt`。

### 3. Post-results maintenance

適用於 winners 已經確定後。
此流程會準備得獎通知、challenge announcement、Previous-page update 與 file assessment plans。現在 `sandbox` 與 `live` 已正式支援得獎通知與檔案頁模板發佈；central announcement 與 Previous-page update 仍維持在 Web UI 中審核後再發佈。

## 發佈與安全說明

- `create-voting` 與 `process-challenge` 支援 `dry-run`、`sandbox`、`live`
- `post-results-maintenance` 已支援 `dry-run`、`sandbox`、`live`，但正式自動發佈範圍目前限於得獎通知與檔案頁模板
- central announcement 與 Previous-page update 仍保留在 maintenance review 中，由操作者明確確認後發佈
- `sandbox` 目標頁會依 `NAME` 中 `@` 前的主帳號名稱自動推導
- 已保存的登入資訊優先走系統 keychain，若不可用則退回本次程式執行期間的記憶體保存
- job history 會從 `output/jobs/*/logs/job.log` 重建

## 驗證與排錯

常用命令：

```bash
npm run check
npm run check:test
npm test
```

補充：
- `.env` 不應進版控
- 如果你要重新開啟舊 job 或查看 publish history，請保留 `output/jobs/`
- 測試新流程時，先走 `sandbox` 再走 `live`

## 專案現況

目前已完成並可使用：
- Web UI：job 建立、進度追蹤、artifact preview、publish review、maintenance review
- CLI：主要 workflow 與 list/archive/voting-index helper commands
- Commons 寫入：voting/result/winners 頁面發佈
- 後續維護：得獎通知與檔案頁模板可正式發佈，announcement / Previous-page update 保留 review-based publish，且 publish history 會持久化保存
- parser、renderer、CLI、job history、offline workflow fixtures 的 regression tests

建議下一步：
- 補 deployment / operations 文件，支援非本機單人使用情境
- 擴充更舊 Commons 頁面格式與特殊簽名 fixtures
- 補 create-voting、process-challenge、maintenance publish 的 Web flow integration tests
- 視需要加入 changed line 內更細的字詞級 diff

## 相關資源

- 範例環境設定檔：[.env.example](.env.example)
- 改寫來源：[Commons Photo Challenge](https://github.com/jarek-tuszynski/Commons_photo_challenge)，Jarek Tuszynski，公有領域授權
- 英文 README：[README.md](README.md)
