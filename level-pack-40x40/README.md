# 40×40 四色九关包

本目录包含 `level-01.json` 至 `level-09.json` 九个**独立单关文件**。每个文件都是 Demo 的 `{ "version": 5, "level": ... }` 格式，不会自动替换内置关卡。设计比较见 `DESIGN.md`；逐关派车表与验证记录见 `SOLUTIONS.md`、`verification-report.json` 和 `human-route-report.json`。

## 导入与试玩

1. 在 `color-transit-demo` 目录运行 `node scripts/dev-server.mjs`，浏览器打开 `http://127.0.0.1:4173/`。
2. 顶部进入“关卡编辑器”，选一个当前关卡槽位。在“保存与试玩”展开“导入 JSON”，选择本目录的一个 `level-XX.json`，再点“导入到当前关卡”。导入会把文件 ID 映射为当前槽位 ID；其他八个文件需逐个导入试玩。
3. 检查编辑器统计区四色球数与容量相等，再点“即时试玩”。需要保留该槽位配置时点“保存到本机”；它只存在于当前浏览器的本地存储中。导入会替换当前编辑草稿，未保存改动请先自行导出。
4. 试玩时按 `SOLUTIONS.md` 对应关卡的车辆 ID、列头和派出顺序操作。顶部“模拟步数”可参照派车时点；道路占位见表中“派车前道路占位”。推荐 1× 速度。手动错过精确步数时可重开重试，后续操作结果可能变化。

## 可复现验证

在 `color-transit-demo` 目录执行：

```powershell
node level-pack-40x40/replay-pack.mjs
```

脚本直接读取这九个最终 JSON 文件，用 Demo 的 `src/validation.js` 导入并检查结构、40×40 满铺、四色、六车位与逐色运力，再用 `src/engine.js` 完整回放每关两条无道具路线和三种列优先替代分支。成功时每关输出 `won`、1600 次接球、最高占位和分支失败数。`verification-report.json` 是精确机器路线；`human-route-report.json` 是派车间隔至少 30 步的路线，供人工试玩参照。关卡构造来源可见 `draft.mjs`；`spacing-check.mjs` 记录了不同派车间隔的探索，不是正式过关判定。

## 范围

本关卡包不修改 Demo 玩法、内置关卡或导入界面。关卡难度仍需人工试玩校准；三种替代策略只是代表性分支检查，不是穷尽搜索或真实玩家测试。
