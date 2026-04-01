# Wikimedia Commons Photo Challenge Node.js 改寫方案

## 1. 上游程式分析

來源僅有兩個檔案：

- `upstreams/Commons_photo_challenge/photo_challenge_library.py`
- `upstreams/Commons_photo_challenge/photo_challenge.ipynb`

其中：

- `photo_challenge_library.py` 是核心業務邏輯。
- `photo_challenge.ipynb` 只是人工操作流程，把 library function 依序呼叫起來。

換句話說，Node.js 版應該把 notebook 視為「操作腳本 / CLI workflow」，把 `photo_challenge_library.py` 視為「domain service」來重寫。

## 2. 功能分組

Python 版本可以拆成 5 個責任區塊：

### A. Wikimedia Commons 頁面讀寫

用途：

- 複製 wiki page
- 讀取指定頁面 wikitext
- 寫回新的 Voting / Winners / Result 頁面
- 修改 Talk page 與 File page

對應函式：

- `copy_commons_page`
- `create_commons_page`
- `talk_to_winners`
- `announce_challenge_winners`
- `add_assesment_to_files`
- `update_previous_page`

### B. Submission 解析與 Voting 生成

用途：

- 從 `Commons:Photo challenge/Submitting` 找出本月 challenge
- 解析各 challenge submission page 中 `<gallery>` 的圖片
- 讀取檔案 metadata
- 檢查每位使用者最多 4 張
- 產生 voting page wikitext

對應函式：

- `get_submitted_challenges`
- `parse_submition_page`
- `get_file_info`
- `create_voting_page`
- `create_voting_page_from_submission_page`
- `get_new_text_of_voting_index`

### C. Voting 頁面解析

用途：

- 解析 voting page 中每張圖片、作者、投票內容
- 收斂成 `file_df` / `vote_df`

對應函式：

- `get_voting_challenges`
- `parse_voting_page`
- `parse_voting_page1`（應為舊版或備援，可在 Node.js 版刪除或保留為 compatibility parser）
- `revise_voting_page`

### D. 投票驗證與計分

用途：

- 驗證 voter 資格
- 驗證重複投票、自投、未簽名、多個同級名次
- 計算 score / support / rank
- 產出錯誤列表

對應函式：

- `validate_voters`
- `validate_votes`
- `count_votes`
- `list_errors`
- `registration`
- `format_array`

### E. 結果頁產生

用途：

- 生成 result page
- 生成 winners page

對應函式：

- `create_result_page`
- `create_winners_page`
- `add_line_breaks`
- `process_challenge`

## 3. Python 依賴與 Node.js 替代

Python 依賴：

- `pywikibot`
- `re`
- `datetime`
- `numpy`
- `pandas`
- `requests`
- `math`
- `os`

Node.js 建議替代：

- `pywikibot` -> `mwn`
  - `mwn` 提供 MediaWiki API 的 Node.js 封裝，最接近本案需要的 page read/write、login、query 與 edit workflow
  - 少數 `mwn` 沒有直接包好的查詢，再以 `bot.request()` 補 MediaWiki API 參數
- `re` -> JavaScript `RegExp`
- `datetime` -> `luxon`
- `pandas` / `numpy` -> 原生 array/object + 小型 utility function
- `requests` -> `mwn` 內建 request 流程，必要時輔以 Node 18+ `fetch`
- `math` -> `Math`
- `os` / file I/O -> `node:fs/promises`, `node:path`

結論：

- 不需要在 Node.js 複製 pandas 思維。
- 資料量很小，直接使用 typed object array 即可。
- 最好把「抓 wiki」、「parse wikitext」、「validate」、「render output」分層，避免之後維護再次耦合。

## 4. 建議的 Node.js 專案結構

建議直接使用 TypeScript，因為資料模型很多、規則明確，型別能有效減少改寫風險。

```text
src/
  cli/
    index.ts
    commands/
      archive-pages.ts
      create-voting.ts
      process-challenge.ts
      publish-pages.ts
      announce-winners.ts
  web/
    app.ts
    routes/
      index.ts
      auth.ts
      jobs.ts
    controllers/
      home-controller.ts
      job-controller.ts
    views/
      layouts/
        main.handlebars
      home.handlebars
      progress.handlebars
      result.handlebars
  core/
    models.ts
    challenge-date.ts
    scoring.ts
    validation.ts
    formatting.ts
  parsers/
    submitting-parser.ts
    voting-parser.ts
    challenge-index-parser.ts
  renderers/
    voting-page.ts
    result-page.ts
    winners-page.ts
  services/
    commons-bot.ts
    commons-pages.ts
    commons-users.ts
    commons-files.ts
  workflows/
    create-voting-from-submission.ts
    process-voting-challenge.ts
    run-job.ts
  infra/
    csv.ts
    job-store.ts
    logger.ts
    config.ts
    output-paths.ts
  types/
    mediawiki.ts
```

如果先求快，也可以先用純 JavaScript，但我不建議。這支程式的價值在規則正確性，不在快速 prototype。

## 5. 建議資料模型

```ts
type Challenge = {
  year: number;
  monthName: string;
  theme: string;
  raw: string;
};

type SubmissionEntry = {
  fileName: string;
  title: string;
};

type FileInfo = {
  fileName: string;
  title: string;
  user: string | null;
  uploaded: Date | null;
  width: number | null;
  height: number | null;
  comment: string | null;
  ownWork: boolean;
  active: boolean;
};

type VotingFile = {
  num: number;
  fileName: string;
  title: string;
  creator: string;
};

type Vote = {
  num: number;
  award: 0 | 1 | 2 | 3;
  voter: string;
  creator: string;
  line: string;
  error: number;
};

type VoterValidation = {
  voter: string;
  editCount: number;
  regDate: Date | null;
  error: number;
  note: number;
};

type BotCredentials = {
  username: string;
  botName: string;
  botPassword: string;
};

type JobProgress = {
  id: string;
  status: "queued" | "running" | "failed" | "completed";
  currentStep: string;
  percent: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  messages: string[];
  outputDir: string;
};
```

## 6. 模組對應表

| Python function | Node.js 模組建議 |
|---|---|
| `copy_commons_page` | `services/commons-pages.ts` |
| `get_submitted_challenges` | `parsers/challenge-index-parser.ts` |
| `parse_submition_page` | `parsers/submitting-parser.ts` |
| `get_file_info` | `services/commons-files.ts` |
| `create_voting_page` | `renderers/voting-page.ts` |
| `create_voting_page_from_submission_page` | `workflows/create-voting-from-submission.ts` |
| `get_new_text_of_voting_index` | `renderers/voting-index.ts` 或 `workflows/create-voting-index.ts` |
| `get_voting_challenges` | `parsers/challenge-index-parser.ts` |
| `parse_voting_page` | `parsers/voting-parser.ts` |
| `revise_voting_page` | `renderers/revised-voting-page.ts` |
| `validate_voters` | `core/validation.ts` + `services/commons-users.ts` |
| `validate_votes` | `core/validation.ts` |
| `count_votes` | `core/scoring.ts` |
| `list_errors` | `core/validation.ts` 或 `renderers/error-report.ts` |
| `create_result_page` | `renderers/result-page.ts` |
| `create_winners_page` | `renderers/winners-page.ts` |
| `process_challenge` | `workflows/process-voting-challenge.ts` |
| `create_commons_page` | `services/commons-pages.ts` |

## 7. API 實作策略

本案建議以 `mwn` 作為 `pywikibot` 的主要替代方案，並集中在一個 bot adapter 中管理登入、token、request、重試與節流。其餘 service 不直接碰底層 API，而是依賴這個 adapter。

### 7.1 讀 page content

透過 `mwn`：

- `bot.read(title)` 取得 page wikitext
- 或以 `bot.request()` 呼叫：
  - `action=query`
  - `prop=revisions`
  - `rvslots=main`
  - `rvprop=content`

### 7.2 寫 page content

透過 `mwn`：

- `bot.save(title, text, summary)` 或等價 edit flow
- 使用 BotPassword 或 OAuth 登入
- edit token 由 `mwn` 管理，避免自行處理登入狀態

### 7.3 讀檔案 metadata

需要查：

- 最早上傳者
- 上傳時間
- width / height
- comment
- file page text

做法：

- 透過 `mwn` 取得 file page 與 imageinfo
- 需要細部欄位時以 `bot.request()` 查：
  - `prop=imageinfo|revisions`
  - `iiprop=user|timestamp|size|comment`
- 再讀 file page text 判斷 `{{own}}` / `{{self-photographed}}`

### 7.4 讀 user 資訊

需要查：

- registration
- editcount
- blocked 狀態
- contribution 是否包含該 challenge submission

做法：

- 以 `mwn` + `bot.request()` 查：
  - `list=users`
  - `usprop=registration|editcount|blockinfo`
  - `list=usercontribs` 補查是否參與 challenge

### 7.5 建議的 bot adapter 介面

建議把 `mwn` 封裝成單一 adapter，例如：

```ts
type CommonsBot = {
  readPage(title: string): Promise<string>;
  savePage(title: string, text: string, summary: string): Promise<void>;
  getFileInfo(fileName: string): Promise<FileInfoLookup | null>;
  getUserInfo(userName: string): Promise<UserInfoLookup | null>;
  getUserContributions(userName: string): Promise<UserContribution[]>;
};
```

這樣做的好處是：

- domain logic 不會綁死在 `mwn` API 細節
- 測試時可直接 mock adapter
- 未來若要替換 transport 或加快取，影響面會很小

## 8. notebook 對應成 CLI

原始 notebook 其實就是一串手動步驟，很適合改成 CLI：

```bash
photo-challenge archive-pages
photo-challenge create-voting --source submitting_old
photo-challenge process-challenge --challenge "2025 - January - Theme"
photo-challenge publish --challenge "2025 - January - Theme"
photo-challenge announce --month 2025-01
```

建議命令：

- `archive-pages`
- `list-submitted-challenges`
- `build-voting-index`
- `create-voting`
- `list-voting-challenges`
- `process-challenge`
- `publish-page`
- `talk-to-winners`
- `announce-winners`
- `update-previous`
- `add-assessment`

這會比 notebook 更穩定，也更容易自動化與測試。

## 8.1 新增 Web 互動介面

除了 CLI，本案還應新增一個 Web UI，讓人工操作流程不必依賴 notebook 或手動輸入指令。

指定技術如下：

- Web server: `express`
- Template engine: `express-handlebars`

### 8.1.1 Web UI 目標

Web UI 主要負責：

- 輸入 Wikimedia 登入資訊
- 啟動特定 workflow
- 顯示目前處理進度
- 顯示完成結果與輸出檔案位置

核心業務邏輯仍然應留在 `workflows/`、`services/`、`core/`，不要把規則寫進 route handler。

### 8.1.2 Web UI 頁面規劃

至少需要 3 個頁面：

- 首頁 `GET /`
  - 顯示登入/執行表單
  - 欄位包含 `Username`、`Bot Name`、`Bot Password`
  - 可選擇要執行的工作，例如 `create voting`、`process challenge`
- 進度頁 `GET /jobs/:id`
  - 顯示目前步驟、百分比、訊息列表
  - 可用短輪詢或 Server-Sent Events 更新
- 結果頁 `GET /jobs/:id/result`
  - 顯示輸出成功與否
  - 列出固定輸出目錄中的檔案名稱

### 8.1.3 表單需求

表單至少要有以下欄位：

- `Username`
- `Bot Name`
- `Bot Password`

建議補充：

- `Challenge`
- `Action`
- `Publish mode`

安全性要求：

- `Bot Password` 欄位使用 `<input type="password">`
- 預設不把密碼寫入 log
- 不把完整密碼持久化到 job result

### 8.1.4 處理進度機制

因為流程可能包含多個步驟，Web UI 必須有進度追蹤。

建議做法：

- 每次送出表單都建立一個 `job`
- job 進入 queue 或直接背景執行
- workflow 在每個主要步驟回報進度，例如：
  - `10%` 初始化 bot
  - `25%` 讀取 challenge page
  - `45%` 解析 submission / voting page
  - `65%` 驗證票數
  - `80%` 產生輸出檔
  - `100%` 完成

建議實作：

- 初版可先用 in-memory `job-store`
- 前端以 2 到 3 秒 polling `GET /jobs/:id/status`
- 若後續要更流暢，再升級成 SSE

### 8.1.5 固定輸出資料夾

輸出成果必須放在固定資料夾，不應由使用者自由輸入路徑。

建議固定目錄：

```text
output/
  jobs/
    <job-id>/
      input/
      generated/
      logs/
```

建議內容：

- `input/`
  - 執行時抓下來的原始 wikitext 或 request snapshot
- `generated/`
  - `*_voting.txt`
  - `*_revised.txt`
  - `*_result.txt`
  - `*_winners.txt`
  - `*.csv`
- `logs/`
  - 該次執行的步驟紀錄與錯誤資訊

這樣做的好處：

- 每次執行都有獨立資料夾
- 易於除錯與回溯
- 不會讓使用者輸入任意檔案系統路徑

### 8.1.6 Web 與 CLI 的關係

Web UI 不應自行實作一套流程，而是共用同一組 workflow。

也就是：

- CLI 呼叫 `workflows/*`
- Express route 也呼叫同一批 `workflows/*`

這樣可避免：

- CLI 與 Web 行為不一致
- 規則重複實作
- 後續修 bug 需要改兩份

### 8.1.7 Web 相關模組建議

建議新增：

- `web/app.ts`
  - Express app 初始化
- `web/routes/*.ts`
  - route 定義
- `web/controllers/*.ts`
  - 接 request / 回 view model
- `infra/job-store.ts`
  - job 狀態管理
- `infra/output-paths.ts`
  - 固定輸出目錄與檔名規則
- `workflows/run-job.ts`
  - 將既有 workflow 包成可回報進度的背景工作

### 8.1.8 Session 與憑證處理

如果使用者從 Web UI 輸入：

- `Username`
- `Bot Name`
- `Bot Password`

建議處理方式：

- 只在該次 job 執行期間保留在 server memory
- 建立 `mwn` bot instance 後即不再將明文傳到 view
- 不寫入固定輸出資料夾
- `.env` 僅保留預設站台設定，不存放每次使用者輸入的憑證

## 8.2 建議的 Web 路由

- `GET /`
- `POST /jobs`
- `GET /jobs/:id`
- `GET /jobs/:id/status`
- `GET /jobs/:id/result`

## 9. 需要重構、不要直譯的地方

### 9.1 pandas DataFrame 流程

Python 版大量依賴 DataFrame 進行：

- groupby
- merge
- sort_values
- duplicated

Node.js 版不要照搬，而是改成明確的 pure functions：

- `groupVotesByUser`
- `markDuplicateVotes`
- `limitActiveEntriesPerUser`
- `mergeVoteStatsIntoFiles`

這樣可讀性會比硬做 JS DataFrame 更高。

### 9.2 parsing 與 rendering 混在一起

例如 `create_voting_page_from_submission_page` 同時做：

- 抓 wiki page
- 解析 gallery
- 查 file metadata
- 套規則
- 寫 CSV
- render voting page

Node.js 版應拆開，避免單一 function 過胖。

### 9.3 I/O 與 domain logic 混在一起

例如：

- 直接在 function 裡 `open(...).write(...)`
- 直接在 function 裡呼叫 wiki API

Node.js 版應改為：

- renderer 回傳 string
- workflow 決定是否寫檔、是否 publish

### 9.4 錯誤碼應明文化

Python 版用整數錯誤碼 `1..8`。建議 Node.js 改成 enum：

```ts
enum VoteErrorCode {
  AnonymousIp = 1,
  UnregisteredUser = 2,
  TooNewAccount = 3,
  TooFewEdits = 4,
  DuplicateVoteSameImage = 5,
  UnsignedVote = 6,
  SelfVote = 7,
  DuplicateAwardTier = 8,
}
```

這能大幅改善維護性。

## 10. 分階段改寫順序

### Phase 1: 純離線核心

先完成不碰 Wikimedia API 的純函式：

- challenge parser
- submission parser
- voting parser
- validation
- scoring
- page renderers

輸入先用本地 fixture，確保規則跑得對。

### Phase 2: Commons API service

補上：

- `mwn` bot adapter
- 讀 page
- 寫 page
- 讀 file metadata
- 讀 user metadata / contributions

### Phase 3: workflow 與 CLI

把 notebook 的步驟整合為 CLI command。

### Phase 4: Web UI 與進度追蹤

加入：

- `express` + `express-handlebars`
- credentials form
- background job 執行
- progress polling 或 SSE
- 固定輸出目錄管理

### Phase 5: 發布與操作安全

加入：

- `--dry-run`
- `--write-local`
- `--publish`
- 變更摘要 preview
- page diff preview

這一層非常重要，因為這個工具會直接改 Wikimedia Commons 頁面。

## 11. 測試策略

至少要有 4 類測試：

### A. Parser fixtures

- submission page fixture
- voting page fixture
- voting index fixture

### B. Validation rules

覆蓋：

- IP voter
- 未註冊
- 註冊未滿 10 天
- edits 少於 50
- 自投
- 重複投同圖
- 同一名次投多張
- 未簽名

### C. Rendering snapshots

- voting page snapshot
- result page snapshot
- winners page snapshot

### D. API integration tests

只測 `mwn` service adapter，不直接打 production page。

### E. Web flow tests

- 表單送出
- job 建立
- 進度查詢
- 結果頁顯示固定輸出目錄內容

## 12. 建議技術選型

建議如下：

- Runtime: Node.js 20+
- Language: TypeScript
- CLI: `commander`
- Web server: `express`
- View engine: `express-handlebars`
- Wikimedia client: `mwn`
- Date: `luxon`
- CSV: `papaparse` 或 `fast-csv`
- Test: `vitest`
- Lint/format: `eslint` + `prettier`

## 13. 風險與注意事項

### 13.1 Wikitext 不是完整語法樹

目前上游是用 regex 與逐行解析。Node.js 版也可以先沿用這個策略，但要承認它對格式變動敏感。

建議：

- parser 對目標頁面格式做「有限假設」
- 所有 parser 都配 fixture 測試

### 13.2 API 認證

若未來要真的 publish 到 Commons，必須先確認：

- `mwn` 的登入流程與 session 管理方式
- BotPassword
- OAuth
- edit token handling
- rate limit / retry policy

### 13.3 上游程式本身有技術債

上游存在一些明顯可改善處：

- function 太肥
- notebook 驅動流程不利於自動化
- DataFrame 過度使用
- parser 與 publish 耦合

Node.js 版不應一比一照抄結構，而是只保留規則與輸出格式。

## 14. 最小可行版本 MVP

第一版建議只做下面能力：

1. 讀本地 fixture 或已下載的 wikitext
2. 建立 voting page
3. 解析 voting page
4. 驗證投票
5. 計分
6. 輸出 revised / result / winners 三份文字檔
7. 提供可輸入 `Username`、`Bot Name`、`Bot Password` 的基本 Web UI
8. 在 Web UI 顯示 job progress 與固定輸出目錄結果

先不要做：

- 自動回寫 Commons
- talk page 通知
- assessment template 寫入

原因是這三項都屬於高風險 side effect，應該在核心規則穩定後再加。

## 15. 建議實作順序

1. 建立 TypeScript 專案骨架
2. 定義 domain types
3. 完成 `parseSubmittingPage`
4. 完成 `parseVotingPage`
5. 完成 `validateVoters` / `validateVotes`
6. 完成 `countVotes`
7. 完成 `renderVotingPage` / `renderResultPage` / `renderWinnersPage`
8. 加入 fixture tests
9. 建立固定 `output/jobs/<job-id>/` 輸出規則
10. 加入 Express + Handlebars 首頁表單與 job progress 頁
11. 補 Commons API adapter
12. 加入 CLI 與 dry-run publish

## 16. 結論

這個改寫案不難，但不適合直接逐行翻譯。最合理的做法是：

- 保留 Python 版的規則與輸出格式
- 拆成 Node.js 的 parser / validator / renderer / workflow / API service
- 用 TypeScript 型別取代 pandas DataFrame 的隱性結構
- 先做離線可驗證版本，再補線上 publish 能力

如果要開始動工，最好的第一步是先把 `Phase 1` 做完，也就是把 parser、validation、scoring、renderer 全部以 fixture 驅動的方式落地。
