# Photo Challenge Node.js

[English](README.md) | 繁體中文

這是一個以 Node.js + TypeScript 建置的 Wikimedia Commons Photo Challenge Web 工具。

本專案將上游 Python 工具改寫為以 Web 介面為主的工作流程，主要技術包含：
- `express`
- `express-handlebars`
- `mwn`
- `luxon`

目前已支援兩條主要流程：
- 從 submission pages 產生 voting page
- 計算投票結果並產生 revised voting、result、winners 頁面

## 目前功能

- 使用 `mwn` 登入 Wikimedia Commons
- 支援跨平台系統 keychain 的本機憑證保存
- 提供 Web UI 啟動工作與查看進度
- 固定輸出目錄：`output/jobs/<job-id>/`
- 可在瀏覽器中預覽與下載產物
- 可快速切換核心輸出：voting、revised、result、winners
- App 重啟後，首頁仍可顯示最近 3 次執行紀錄
- 可解析 Commons 的 submission / voting 頁面並處理 live 資料
- 目前已實作的投票驗證包括：
  - 投票者資格檢查
  - 重複投票
  - 未簽名投票
  - 自投
  - 同一投票者給多個 1st / 2nd / 3rd place
  - 超過投票截止時間的 late vote

## 環境需求

- Node.js `24.14.1`
- npm
- Wikimedia Commons BotPassword 帳號

## 安裝

```bash
npm install
```

## 設定方式

先複製範例設定檔：

```bash
cp .env.example .env
```

重要環境變數：

- `NAME`：完整 BotPassword 登入名稱，例如 `MainAccount@BotAppName`
- `BOT_PASSWORD`：BotPassword 值
- `PORT`：Web 伺服器埠號，預設 `3000`
- `COMMONS_API_URL`：Commons API 位址
- `USER_AGENT`：Wikimedia 請求使用的 user agent
- `CREDENTIAL_SERVICE_NAME`：`keytar` 使用的 keychain service name

範例：

```env
NAME=Example@ExampleBot
BOT_PASSWORD=Generated from Commons
PORT=3000
COMMONS_API_URL=https://commons.wikimedia.org/w/api.php
USER_AGENT=photo-challenge-nodejs/0.1.0 (local development; contact via Wikimedia Commons user page)
CREDENTIAL_SERVICE_NAME=photo-challenge-nodejs/commons
```

## 啟動方式

開發模式：

```bash
npm run dev
```

正式模式：

```bash
npm run build
npm start
```

預設啟動網址：

```text
http://localhost:3000
```

## 主要流程

### 1. Prepare voting page

適用情境：投票開始前。

會做的事情：
- 讀取 challenge submission page
- 支援 inline gallery 與 PrefixIndex 子頁結構
- 查詢 Commons 檔案 metadata
- 檢查基本 submission 條件
- 產生 voting page 草稿

主要輸出：
- `*_voting.txt`
- `*_summary.txt`
- `*_files.json`
- `*_sources.json`

### 2. Count votes and publish results

適用情境：投票結束後。

會做的事情：
- 讀取 live voting page
- 解析圖片與投票內容
- 驗證投票者與投票規則
- 檢查投票截止時間
- 計算 score、support、rank
- 產生 revised voting、result、winners 頁面

主要輸出：
- `*_revised.txt`
- `*_result.txt`
- `*_winners.txt`
- `*_votes.json`
- `*_summary.txt`

## 輸出目錄結構

所有產物都會寫入：

```text
output/jobs/<job-id>/
```

每個 job 目錄包含：

```text
input/
generated/
logs/
```

常見檔案：

```text
output/jobs/<job-id>/input/voting-page.txt
output/jobs/<job-id>/generated/<challenge>_result.txt
output/jobs/<job-id>/generated/<challenge>_winners.txt
output/jobs/<job-id>/logs/job.log
```

## 憑證保存

本機可使用已保存的憑證。

優先順序：
- 系統 keychain（透過 `keytar`）
- 如果 keychain 不可用，退回目前這次程式執行期間的記憶體保存

各平台常見後端：
- Windows：Credential Manager
- macOS：Keychain
- Linux：Secret Service / libsecret

補充說明：
- `.env` 已被 git 忽略，不應提交
- 建議使用 BotPassword，而不是主帳號密碼
- 首頁可清除本機已保存的密碼

## 持久化工作紀錄

工作紀錄會從 `output/jobs/*/logs/job.log` 重建。

這表示：
- App 重啟後，首頁仍能顯示最近執行紀錄
- 已完成與失敗的 job 之後都能重新打開
- 只要磁碟上的 job 輸出還在，result / artifact 頁面就仍可存取

## 專案結構

```text
src/
  core/
  infra/
  parsers/
  renderers/
  services/
  web/
  workflows/
```

各目錄用途：
- `core/`：計分與驗證邏輯
- `infra/`：設定、job store、憑證保存、持久化工作紀錄
- `parsers/`：Commons wikitext 解析
- `renderers/`：輸出頁面產生
- `services/`：Commons API / `mwn` 整合
- `web/`：Express app、routes、controllers、views、靜態資源
- `workflows/`：端到端工作流程整合

## 驗證與建置

型別檢查：

```bash
npm run check
```

建置：

```bash
npm run build
```

## 目前限制

- CLI 入口目前仍是 scaffold，現階段以 Web app 為主要使用方式
- 專案目前以本機單人使用情境為主
- 歷史紀錄依賴 `output/jobs` 內的檔案
- 某些較少見的 Commons 歷史頁面格式，後續可能還需要補 parser 相容性

## 版控說明

以下內容不進 git：
- `.env`
- `node_modules/`
- `dist/`
- `output/jobs/`
- `upstreams/`

以下內容會保留：
- `.env.example`
- `output/.gitkeep`
- 原始碼與設定檔

## 專案背景

本 repository 是根據 Wikimedia Commons Photo Challenge 自動化流程概念與本地 upstream 分析，逐步改寫而成的 Node.js 版本。
