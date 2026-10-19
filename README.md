# ValorantGun 特戰英豪練槍場

> **給後續開發（包含 AI 助手）：每次開始工作前請先完整閱讀本檔案**，尤其是「開發備註」與「更新紀錄」。
> 每次修改後，請在「更新紀錄」最上方新增一筆，寫清楚日期、版本與改動內容。

一個在瀏覽器裡就能跑的 VALORANT 練槍網站。純 HTML / CSS / JavaScript，不需要安裝或打包，直接開 `index.html` 就能玩。
靈敏度與 FOV 使用和遊戲相同的換算方式，在這裡練出來的手感可以直接帶回遊戲。

## 功能

- **與遊戲一致的手感**
  - 靈敏度換算與遊戲相同：每個滑鼠 count 轉動 `靈敏度 × 0.07°`
  - 水平 FOV 固定為 103°（與 VALORANT 相同），以 3D 透視投影繪製
  - 支援 Pointer Lock，Chrome / Edge 可開啟 Raw Input（`unadjustedMovement`），略過作業系統的滑鼠加速
- **9 種訓練模式**（6 種步槍 + 3 種狙擊）

  | 模式 | 類型 | 練習重點 |
  |---|---|---|
  | Gridshot | 點擊 | 3×3 網格同時 3 個目標，目標切換與點擊節奏 |
  | Spidershot | 點擊 | 中央與遠處交替出現，大幅度甩槍並回到中心 |
  | Microshot | 點擊 | 準星附近的小目標，細微調整 |
  | Headshot Line | 點擊 | 目標只出現在頭線（紅色水平線）上，練準星擺放 |
  | Strafe Track | 跟槍 | 目標模擬 ADAD 急停左右變向，以貼合時間計分 |
  | Reflex | 反應 | 隨機時間與位置閃現，1.2 秒內沒打到即消失 |
  | Operator Flick | 狙擊 | Operator 2.5× / 5× 開鏡，隨機位置甩狙、快狙節奏 |
  | Marshal Peek | 狙擊 | Marshal 3.5× 開鏡架住兩面牆之間的通道，敵人橫越或探頭縮回 |
| Outlaw Double | 狙擊 | Outlaw 3.5× 開鏡，目標成對出現，開鏡不退鏡連開兩槍，打空自動換彈 |

- **狙擊槍**：右鍵開鏡（可選「按住」或「點一下切換」，Operator 會循環 2.5× → 5× → 關）、
  開槍後自動退鏡、上膛時間（Operator 約 1.67 秒、Marshal 約 0.67 秒）、未開鏡射擊有大幅散布；
  Outlaw 為 2 發彈匣、兩發間隔約 0.36 秒且開槍不退鏡，打空後自動換彈 3.8 秒（換彈會退鏡）；
  開鏡靈敏度依遊戲的「開鏡靈敏度倍率」換算（倍率 1 時，每 count 角度 ÷ 放大倍率）
- **成績趨勢**
  - 結算畫面：本次與「上一次」、與「之前所有場次平均」比較分數 / 命中率 / 平均擊殺時間（或反應時間），標示進步或退步
  - 主選單「成績趨勢」：選擇模式與指標，顯示最近 30 場折線圖（含平均線、滑鼠移入顯示每場數值）與最近一次 / 總平均 / 最佳

- **靈敏度工具**：顯示 eDPI、cm/360°；可從 CS2 / Apex / Overwatch 2 / CoD 的靈敏度換算成 VALORANT 靈敏度並一鍵套用
- **準星**：支援**匯入 / 匯出遊戲內的準星代碼**（遊戲設定 → 準星 → 匯入／匯出準星設定檔），
  另有 10 種預設準星；可細調顏色（遊戲 8 色 + 自訂）、外框、中心點、內線、外線、狙擊鏡中心點，實際大小與放大 3× 預覽
- **成績紀錄**：每個「模式 + 秒數」的最佳成績、最近 1000 筆歷史紀錄（存在瀏覽器 localStorage）
- **畫面**：訓練場風格的 3D 場景（天空、透視地板網格、地平線光暈）、有光澤的目標、擊中碎片與飄起的得分；
  主選單有模式圖示、步槍 / 狙擊分類、每張卡片的最近 12 場迷你趨勢線、總場數 / 練習分鐘 / 今日場數總覽
- **其他**：30 / 60 / 90 / 120 秒、目標大小、音量（WebAudio 合成音效，無音檔）、遊戲中 FPS 顯示（選用）；
  支援系統的「減少動態效果」設定

## 使用方式

1. 線上版：<https://dstar619.github.io/valorantgun/>（GitHub Pages，`main` 分支更新後約 1 分鐘自動重新部署）。
   也可以直接用瀏覽器開啟本機的 `index.html`（建議 Chrome / Edge）。
2. 在右側「靈敏度」分頁輸入你在遊戲中的靈敏度與滑鼠 DPI（「訓練」、「準星」分頁可調其他設定）。
3. 選擇模式（點卡片，或在主選單按數字鍵 `1`–`8`）→ 點擊畫面鎖定滑鼠 → 倒數 3 秒後開始。
4. 操作：左鍵射擊、右鍵開鏡（狙擊模式）、`Esc` 暫停、`R` 重新開始；結算畫面按 `R` 再來一次、`Esc` 返回選單。
5. 匯入準星：在遊戲內匯出準星代碼，貼到右側「準星」的輸入框後按「匯入代碼」；「複製目前代碼」可以帶回遊戲。

> 若要與遊戲手感完全一致：Windows 滑鼠速度保持預設（6/11），並關閉「增強指標準確度」，或在本站開啟 Raw Input。

## 專案結構

```
index.html        頁面結構：主選單 / 遊戲畫面 / 結算畫面
css/style.css     樣式（VALORANT 配色：#ff4655 / #0f1923 / #ece8e1）
js/storage.js     常數（VAL_YAW、VAL_FOV）、預設設定、舊設定轉換、localStorage 存取（Store）
js/crosshair.js   VALORANT 準星代碼：解析 / 產生 / 預設值 / 預設準星 / 繪製（Crosshair）
js/engine.js      數學工具、Camera（yaw/pitch）、View（透視投影、放大倍率、牆、狙擊鏡）、音效
js/modes.js       狙擊槍參數（WEAPONS）與所有訓練模式的定義（MODES 陣列）
js/game.js        Game 類別：狀態機、滑鼠鎖定、開鏡 / 上膛 / 散布、射擊判定、主迴圈、HUD、結算資料
js/trend.js       成績比較（上一次 / 平均）與 SVG 趨勢折線圖（Trend）
js/main.js        選單 UI：模式卡片、設定與準星表單、靈敏度換算、成績趨勢、歷史紀錄、結算畫面
```

腳本以一般 `<script>` 依序載入（非 ES module），所以可以直接用 `file://` 開啟。載入順序：storage → crosshair → engine → modes → game → trend → main。

## 部署（GitHub Pages）

- 方式：Settings → Pages → Source 選 **Deploy from a branch**，分支 `main`、資料夾 `/ (root)`。
- 網址：<https://dstar619.github.io/valorantgun/>
- 根目錄有 `.nojekyll`，讓 GitHub Pages 直接提供靜態檔案、不經過 Jekyll 建置。
- 所有資源都用相對路徑（`css/…`、`js/…`），所以放在 `/valorantgun/` 子路徑下也能正常載入。

## 開發備註

- **座標系**：所有目標以角度 `(yaw, pitch)` 表示（單位：度），yaw 向右為正、pitch 向上為正；`Vec.dir()` 轉成方向向量。
- **命中判定**：準星方向與目標方向的夾角 ≤ 目標角半徑 `t.r` 即命中（不依賴螢幕像素，所以與解析度無關）。
- **新增模式**：在 `js/modes.js` 的 `MODES` 加一個物件即可，需要 `id / name / tag / desc / kind / setup(g)`，
  點擊類需要 `onHit(g, t)`，可選 `update(g, dt)` 與 `points(ttk)`。可用的 Game API：
  `g.spawn({yaw, pitch, r, ...})`、`g.remove(t)`、`g.findSpot({yaw:[a,b], pitch:[a,b], r, minFromCam})`、
  `g.time`、`g.cam`、`g.scale`、`g.targets`。
- **狙擊模式**：模式物件加上 `weapon: 'operator' | 'marshal' | 'outlaw'` 即可（參數在 `WEAPONS`）。
  武器可選 `mag`（彈匣容量）+ `reloadTime`（打空後換彈秒數）與 `keepScope`（開槍不退鏡），目前只有 Outlaw 使用。
  `R` 是重新開始，所以沒有手動換彈（Outlaw 打一發就換彈 2.3 秒的技巧目前無法練）。
  可選 `hittable(g, t)` 判斷目標是否被擋住；`g.walls = [{ yaw:[a,b], pitch:[a,b] }]` 會畫出掩體牆（畫在目標之後）。
  開鏡以焦距縮放（`View.setZoom`），靈敏度換算在 `Game.degPerCount()`。散布、開鏡時間為近似值。
- **準星**：設定中只存代碼字串 `settings.crosshair`，`Crosshair.current()` 會解析並快取。
  主要 key（P 區段）：`c` 顏色索引（0–7 遊戲色，8 = 自訂 `u` RRGGBBAA）、`h/t/o` 外框、`d/z/a` 中心點、
  `0b/0t/0l/0v/0g/0o/0a` 內線（顯示 / 粗細 / 長度 / 垂直長度 / 分開垂直 / 間距 / 不透明度）、`1x` 外線同上。
  沒寫到的 key 用遊戲預設值；未知的 key 會原樣保留並在匯出時輸出。開火 / 移動誤差（`f/m/s/e`）只保留不模擬。
  狙擊鏡區段 S（`d/c/u/s/o`）的預設值為推估。
- **場景繪製**：`View.drawEnvironment(cam, headLine)`。地板網格 `FLOOR_GRID` 在載入時算好（眼睛高度 2m、間距 5m、範圍 ±100m），
  依距離分成 4 組透明度，每組一次 stroke；地平線位置 = `H/2 + tan(pitch)·k`（鏡頭無翻滾）。
  模式加上 `headLine: true` 會把地平線畫成紅色頭線。canvas 使用 `{ alpha: false, desynchronized: true }` 降低延遲。
  擊中特效（`fx`）包含碎片 `parts`、顏色與得分文字，存活 0.7 秒。
- **除錯**：`window.ValorantGun.game` 可在 DevTools 中檢查遊戲狀態（自動化測試也用它瞄準目標）。
- **遊戲狀態**：`idle → countdown → running → over`，滑鼠解鎖時進入 `paused`，重新鎖定後倒數 1 秒繼續。
- **最佳紀錄 key**：`模式id@秒數`，不同秒數的成績分開記。
- **localStorage key**：`valorantgun:v1`。若資料格式有不相容的變動，請改版號並在更新紀錄註明。
  v1.0 的準星設定（`xhColor` 等）會在載入時自動轉成準星代碼（`migrateSettings`）。
- **測試**：目前沒有自動化測試；改動後至少用瀏覽器實際跑一輪，並確認 DevTools Console 沒有錯誤。
  雲端環境可用 Playwright + `/opt/pw-browsers/chromium` 做 headless 測試（需要 stub Pointer Lock）。

## 待辦 / 想法

- [x] 匯入 VALORANT 準星代碼（v1.1.0）
- [x] 成績趨勢圖（v1.1.0）
- [x] 狙擊槍模式（v1.1.0）
- [ ] 更多模式：移動中的點擊目標、Sixshot、垂直甩槍
- [ ] 模擬開火誤差 / 準星擴散（目前只保留代碼中的設定值）
- [x] Outlaw 狙擊槍（v1.3.0）
- [ ] 開鏡準星（A 區段）
- [ ] 手動換彈鍵（Outlaw 打一發就換彈的技巧）
- [ ] 可調整 FOV / 解析度比例（4:3 拉伸）

## 更新紀錄

### v1.3.0 — 2026-10-19
- **Outlaw**：新增第三把狙擊槍（3.5× 開鏡、2 發彈匣、射速 2.75 發/秒、開槍不退鏡、打空自動換彈 3.8 秒，未開鏡散布為近似值）
- **新模式**：Outlaw Double（狙擊 · 連射），目標成對出現，練習開鏡後連開兩槍
- 武器參數新增 `mag` / `reloadTime` / `keepScope`；武器 HUD 顯示剩餘子彈與「換彈中」，進度條同時顯示上膛與換彈進度
- Outlaw Double 模式卡片圖示；主選單數字鍵 9 可直接開始 Outlaw Double（提示改為 1–9）

### v1.2.0 — 2026-10-12
- **場景美化**：訓練場風格背景（天空 / 地面漸層、透視地板網格隨距離淡出、地平線光暈），取代舊的經緯線；
  只有 Headshot Line 模式顯示紅色頭線
- **目標與回饋**：目標加上光暈、球體明暗與高光、出生彈出動畫；擊中時有碎片噴散與飄起的「+分數」
- **主選單**：標題區加上總場數 / 練習分鐘 / 今日場數；模式卡片加上圖示、快捷鍵標示、最近 12 場迷你趨勢線與入場動畫；
  模式分類分頁（全部 / 步槍 / 狙擊）；右側設定改成「靈敏度 / 訓練 / 準星」分頁；背景與分頁按鈕樣式更新
- **結算**：分數以數字滾動動畫呈現
- **效能**：地板網格預先計算並分組繪製（每幀約 0.3 ms）；canvas 改用低延遲模式
- **操作**：主選單數字鍵 1–8 直接開始模式；新增「遊戲中顯示 FPS」設定；支援「減少動態效果」；鍵盤焦點外框

### v1.1.0 — 2026-10-12
- **狙擊槍**：新增 Operator（2.5× / 5×）與 Marshal（3.5×）；右鍵開鏡（按住或切換）、開槍自動退鏡、上膛時間、
  未開鏡散布、開鏡靈敏度倍率設定；狙擊鏡畫面與武器 HUD（倍率、上膛進度）
- **新模式**：Operator Flick（甩狙）、Marshal Peek（架槍，含掩體牆與探頭縮回的敵人）
- **成績趨勢**：結算畫面顯示與上一次、與之前平均的差距（進步 / 退步）及分數折線圖；主選單新增「成績趨勢」面板
- **準星**：改用 VALORANT 準星代碼保存，支援匯入 / 複製匯出；10 種預設準星；外框、中心點、內線、外線、狙擊鏡中心點完整設定
- 歷史紀錄上限 100 → 1000 筆；v1.0 的準星設定自動轉換為代碼
- 新增 `js/crosshair.js`、`js/trend.js`；`window.ValorantGun.game` 除錯入口

### v1.0.1 — 2026-10-12
- 準備 GitHub Pages 部署：新增 `.nojekyll`，README 補上部署方式與線上網址

### v1.0.0 — 2026-10-12
- 建立專案：純前端練槍網站，可直接開啟 `index.html`
- 3D 透視投影引擎，水平 FOV 103°，靈敏度換算 yaw 0.07（與 VALORANT 相同）
- Pointer Lock 滑鼠鎖定，支援 Raw Input（`unadjustedMovement`），不支援時自動退回一般模式
- 6 種訓練模式：Gridshot、Spidershot、Microshot、Headshot Line、Strafe Track、Reflex
- 靈敏度面板：eDPI、cm/360°、其他遊戲靈敏度換算並套用
- 準星自訂與即時預覽；目標大小、每場秒數、音量設定
- HUD（剩餘時間、分數、命中率 / 貼合率 / 平均反應）、倒數、暫停 / 重新開始
- 結算畫面與最佳紀錄、最近紀錄表（localStorage）
