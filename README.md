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
- **6 種訓練模式**

  | 模式 | 類型 | 練習重點 |
  |---|---|---|
  | Gridshot | 點擊 | 3×3 網格同時 3 個目標，目標切換與點擊節奏 |
  | Spidershot | 點擊 | 中央與遠處交替出現，大幅度甩槍並回到中心 |
  | Microshot | 點擊 | 準星附近的小目標，細微調整 |
  | Headshot Line | 點擊 | 目標只出現在頭線（紅色水平線）上，練準星擺放 |
  | Strafe Track | 跟槍 | 目標模擬 ADAD 急停左右變向，以貼合時間計分 |
  | Reflex | 反應 | 隨機時間與位置閃現，1.2 秒內沒打到即消失 |

- **靈敏度工具**：顯示 eDPI、cm/360°；可從 CS2 / Apex / Overwatch 2 / CoD 的靈敏度換算成 VALORANT 靈敏度並一鍵套用
- **準星自訂**：顏色（含常用色票）、線長、粗細、間距、外框、中心點，即時預覽
- **成績紀錄**：每個「模式 + 秒數」的最佳成績、最近 100 筆歷史紀錄（存在瀏覽器 localStorage）
- **其他**：30 / 60 / 90 / 120 秒、目標大小、音量（WebAudio 合成音效，無音檔）

## 使用方式

1. 直接用瀏覽器開啟 `index.html`（建議 Chrome / Edge），或部署到 GitHub Pages（Settings → Pages → 選擇分支根目錄）。
2. 在右側輸入你在遊戲中的靈敏度與滑鼠 DPI。
3. 選擇模式 → 點擊畫面鎖定滑鼠 → 倒數 3 秒後開始。
4. 操作：左鍵射擊、`Esc` 暫停、`R` 重新開始；結算畫面按 `R` 再來一次、`Esc` 返回選單。

> 若要與遊戲手感完全一致：Windows 滑鼠速度保持預設（6/11），並關閉「增強指標準確度」，或在本站開啟 Raw Input。

## 專案結構

```
index.html        頁面結構：主選單 / 遊戲畫面 / 結算畫面
css/style.css     樣式（VALORANT 配色：#ff4655 / #0f1923 / #ece8e1）
js/storage.js     常數（VAL_YAW、VAL_FOV）、預設設定、localStorage 存取（Store）
js/engine.js      數學工具、Camera（yaw/pitch）、View（透視投影與繪圖）、準星繪製、音效
js/modes.js       所有訓練模式的定義（MODES 陣列）
js/game.js        Game 類別：狀態機、滑鼠鎖定、射擊判定、主迴圈、HUD、結算資料
js/main.js        選單 UI：模式卡片、設定表單、靈敏度換算、歷史紀錄、結算畫面
```

腳本以一般 `<script>` 依序載入（非 ES module），所以可以直接用 `file://` 開啟。載入順序：storage → engine → modes → game → main。

## 開發備註

- **座標系**：所有目標以角度 `(yaw, pitch)` 表示（單位：度），yaw 向右為正、pitch 向上為正；`Vec.dir()` 轉成方向向量。
- **命中判定**：準星方向與目標方向的夾角 ≤ 目標角半徑 `t.r` 即命中（不依賴螢幕像素，所以與解析度無關）。
- **新增模式**：在 `js/modes.js` 的 `MODES` 加一個物件即可，需要 `id / name / tag / desc / kind / setup(g)`，
  點擊類需要 `onHit(g, t)`，可選 `update(g, dt)` 與 `points(ttk)`。可用的 Game API：
  `g.spawn({yaw, pitch, r, ...})`、`g.remove(t)`、`g.findSpot({yaw:[a,b], pitch:[a,b], r, minFromCam})`、
  `g.time`、`g.cam`、`g.scale`、`g.targets`。
- **遊戲狀態**：`idle → countdown → running → over`，滑鼠解鎖時進入 `paused`，重新鎖定後倒數 1 秒繼續。
- **最佳紀錄 key**：`模式id@秒數`，不同秒數的成績分開記。
- **localStorage key**：`valorantgun:v1`。若資料格式有不相容的變動，請改版號並在更新紀錄註明。
- **測試**：目前沒有自動化測試；改動後至少用瀏覽器實際跑一輪，並確認 DevTools Console 沒有錯誤。
  雲端環境可用 Playwright + `/opt/pw-browsers/chromium` 做 headless 測試（需要 stub Pointer Lock）。

## 待辦 / 想法

- [ ] 匯入 VALORANT 準星代碼
- [ ] 更多模式：移動中的點擊目標、Sixshot、垂直甩槍
- [ ] 成績趨勢圖
- [ ] 可調整 FOV / 解析度比例（4:3 拉伸）

## 更新紀錄

### v1.0.0 — 2026-10-12
- 建立專案：純前端練槍網站，可直接開啟 `index.html`
- 3D 透視投影引擎，水平 FOV 103°，靈敏度換算 yaw 0.07（與 VALORANT 相同）
- Pointer Lock 滑鼠鎖定，支援 Raw Input（`unadjustedMovement`），不支援時自動退回一般模式
- 6 種訓練模式：Gridshot、Spidershot、Microshot、Headshot Line、Strafe Track、Reflex
- 靈敏度面板：eDPI、cm/360°、其他遊戲靈敏度換算並套用
- 準星自訂與即時預覽；目標大小、每場秒數、音量設定
- HUD（剩餘時間、分數、命中率 / 貼合率 / 平均反應）、倒數、暫停 / 重新開始
- 結算畫面與最佳紀錄、最近紀錄表（localStorage）
