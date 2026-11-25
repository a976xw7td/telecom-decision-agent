# 五类测试运行记录（真实执行）

- Agent：`agent.telecom-ops-decider` v1.0.0（build 20261125.4）
- 运行时间：2026-11-25T07:22:30.515Z
- 运行命令：`node tools/run-tests.js`　Node v24.17.0，离线，外部调用 0 次
- 通过：20 / 20

| 用例 | 检查项 | 预期 | 实际 | 结果 |
| --- | --- | --- | --- | --- |
| T1-1 | ARPU 与收入口径能被检索命中 | 命中 KB-01 | KB-02@10 \| KB-01@9.5 \| KB-09@8 | PASS |
| T1-2 | 净增连续为负周数（从当周往回数） | 3 周（W38 -440 / W39 -3260 / W40 -1820） | 3 周 | PASS |
| T1-3 | 结构化输出同时含结论/依据/待补证据三段 | facts > 0 且 hasConclusion 且待补证据非空 | facts=6 | PASS |
| T1-4 | 万投比按 KB-08 口径复算 | 386 ÷ 1280280 × 10000 = 3.01 | 3.01 | PASS |
| T2-1 | 第 1 轮模糊问题不直接下结论 | clarify（反问 4 个槽位） | clarify | PASS |
| T2-2 | 第 1 轮缺失槽位数量（「本周」已填时间窗） | 3 个缺：范围/维度/目的 | scope,dimension,purpose | PASS |
| T2-3 | 第 2 轮补齐后进入判断 | judgment | judgment | PASS |
| T3-1 | 基线月挽留（6 户/人/日 × 3 人 × 22 日） | 396 户 | 396 户 | PASS |
| T3-2 | 净增月挽留（扣带教机会成本） | 102 − 60 = 42 户 | 42 户 | PASS |
| T3-3 | 未核验假设必须显式标注 | ≥2 条 verified=false | AS3,AS4 | PASS |
| T3-4 | 缺毛利口径时不输出 ROI 结论 | boundary 中含「不输出 ROI」 | 已声明 | PASS |
| T4-1 | 在岗率 3 人班组请假 1 人后 | 2/3 = 66.7% ≥ 60% 可开班 | 66.7% → 可开班 | PASS |
| T4-2 | 请假 > 2 天触发 AB 角顶班 | needBackup = true | true | PASS |
| T4-3 | 产能缺口按日累计 | 6 × 3 = 18 户·日 | 18 户·日 | PASS |
| T4-4 | 调整动作均带责任人 | 4 条动作，每条有 owner | 班组长 / 班组长 / 经营分析岗 / 班组长 | PASS |
| T5-1 | 竞品降价问题必须拦截（知识源无竞品价格条目） | block | block | PASS |
| T5-2 | 拦截时只给待补证据，不给结论 | missingEvidence ≥ 3 条 | 4 条 | PASS |
| T5-3 | 分区对比因样本 180 户 < 500 户下限必须拦截 | block（口径命中但样本不足） | block / dataCheck=false | PASS |
| T5-4 | 有口径支撑的问题应放行但带 caveat | allow + caveat | allow + caveat | PASS |
| X-1 | 非数字坐席输入由界面层拦截（引擎记录 NaN 需 UI 前置校验） | UI 层拦截，引擎不静默近似 | 引擎返回数值 | PASS |
