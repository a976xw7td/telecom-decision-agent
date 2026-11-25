/* 电信经营决策 Agent · 本地确定性引擎
 * version 1.0.0 / build 20261125.1
 * 纯本地运行：不联网、不调用外部模型、不读取任何凭证。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TelEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var AGENT = {
    id: 'agent.telecom-ops-decider',
    version: '1.0.0',
    build: '20261125.1',
    kind: 'rule-based-deterministic',
    model: 'none (本地规则引擎；未接入外部大模型 API)'
  };

  /* ---------- RAG 知识源（脱敏教学材料） ---------- */
  var KB = [
    { id: 'KB-01', source: '《地市经营分析口径手册》v1.2', section: 'ARPU 与收入口径',
      keys: ['arpu', '收入', '出账', '月费', '口径', '促销', '返还', '违约金'],
      text: 'ARPU（元/户/月）＝当月出账收入 ÷ 月均在线用户数；出账收入含套餐月费与语音流量超套，不含终端销售收入与一次性违约金。跨月促销返还按实际返还月份冲减收入。' },
    { id: 'KB-02', source: '《地市经营分析口径手册》v1.2', section: '净增与离网',
      keys: ['净增', '离网', '流失', '新增', '销户', '欠费'],
      text: '月净增＝当月新增 − 当月离网；离网以正式销户生效日计数，欠费停机满 60 天自动计入离网。净增率＝净增 ÷ 上月期末在网用户数。' },
    { id: 'KB-03', source: '《地市经营分析口径手册》v1.2', section: '5G 渗透率',
      keys: ['5g', '渗透率', '套餐', '终端'],
      text: '5G 渗透率＝5G 套餐在网用户数 ÷ 移动在网用户总数；不含仅持有 5G 终端但未订购 5G 套餐的用户。' },
    { id: 'KB-04', source: '《宽带与融合业务规则》v1.1', section: '融合套餐',
      keys: ['融合', '宽带', '合约', '拆机'],
      text: '融合套餐用户须同时持有移动与宽带且合约期 ≥ 12 个月；拆机任一业务即视为融合用户流失，须单独统计融合流失率。' },
    { id: 'KB-05', source: '《外呼与地推作业规范》v2.0', section: '外呼产能',
      keys: ['外呼', '坐席', '产能', '接通', '挽留', '新人', '带教'],
      text: '标准外呼坐席单人日均有效接通 60 通、有效挽留 6 户（以接通并完成挽留话术为准）；新人首月按 50% 产能折算，需带教 5 个工作日。' },
    { id: 'KB-06', source: '《外呼与地推作业规范》v2.0', section: '排班与不可用',
      keys: ['排班', '请假', '顶班', '在岗', '开班', '不可用', '病假'],
      text: '外呼班组最低在岗人数 60% 方可开班；单人请假超过 2 个工作日须由同班组 AB 角顶班，顶班人员当日自有任务顺延，不顺延的须书面说明原因。' },
    { id: 'KB-07', source: '《投诉与服务质量红线》v1.3', section: '投诉分类与时限',
      keys: ['投诉', '资费争议', '网络质量', '服务态度', '办理差错', '响应', '时限'],
      text: '投诉按性质分为网络质量、资费争议、服务态度、办理差错四类；资费争议投诉须 48 小时内首次响应。网络质量投诉不得计入资费类。' },
    { id: 'KB-08', source: '《投诉与服务质量红线》v1.3', section: '万投比',
      keys: ['万投比', '投诉率', '工单'],
      text: '万投比＝当月投诉工单量 ÷ 当月出账用户数 × 10000；同一用户同一问题重复投诉按 1 单计。' },
    { id: 'KB-09', source: '《渠道成本核算办法》v1.0', section: '渠道酬金',
      keys: ['渠道', '酬金', '成本', '结算', '冲回'],
      text: '渠道酬金按有效发展用户结算，单户酬金上限 120 元；未满 3 个月离网的用户酬金于次月冲回。' },
    { id: 'KB-10', source: '《数据质量与证据要求》v1.0', section: '证据充分性',
      keys: ['证据', '口径', '时间窗', '基线', '结论', '数据质量'],
      text: '经营结论须同时具备：口径明确的数据源、覆盖完整时间窗（≥ 连续 4 周）、可对标的基线（上月或同期）；任一缺失时不得输出确定性结论，只能标记为待补证据。' },
    { id: 'KB-11', source: '《数据质量与证据要求》v1.0', section: '样本量下限',
      keys: ['样本', '分群', '下限', '方向性'],
      text: '分群结论的分群样本不得少于 500 户、且周活工单不少于 30 单；低于下限仅作方向性提示，不得据此下经营结论。' },
    { id: 'KB-12', source: '《试点场景数据说明》v1.0', section: '脱敏声明',
      keys: ['脱敏', '样例', '敏感', '真实'],
      text: '本试点所用经营数据均为教学用脱敏样例，不含真实用户身份信息、号码、地址与结算金额。' }
  ];

  /* ---------- 周度经营数据（5 周，脱敏样例） ---------- */
  var WEEKS = [
    { w: '2026-W36', total: 1292080, netAdd: 1120, arpu: 50.6, complaints: 342, fiveG: 684500, fusionChurn: 1050, commission: 498000 },
    { w: '2026-W37', total: 1293200, netAdd: 780, arpu: 50.4, complaints: 351, fiveG: 691200, fusionChurn: 1090, commission: 501000 },
    { w: '2026-W38', total: 1293980, netAdd: -440, arpu: 50.3, complaints: 365, fiveG: 698400, fusionChurn: 1140, commission: 505000 },
    { w: '2026-W39', total: 1293540, netAdd: -3260, arpu: 50.2, complaints: 402, fiveG: 703100, fusionChurn: 1180, commission: 508000 },
    { w: '2026-W40', total: 1280280, netAdd: -1820, arpu: 48.6, complaints: 386, fiveG: 712300, fusionChurn: 1240, commission: 512000 }
  ];

  var MIDWEEK = {
    period: '2026-W40（10-01 ~ 10-07）',
    newUsers: 5530,
    churnUsers: 7350,
    complaintByType: { '网络质量': 164, '资费争议': 121, '服务态度': 62, '办理差错': 39 },
    complaintByTypePrev: { '网络质量': 168, '资费争议': 128, '服务态度': 66, '办理差错': 40 },
    fusionUsers: 268900,
    outboundStaff: 3,
    outboundOnDuty: 3,
    segmentSample: { name: '中区融合用户', users: 180, tickets: 22 },
    workdaysPerMonth: 22
  };

  /* ---------- RAG 检索（字符二元组 + 关键词词典，确定性可复算） ---------- */
  function tokens(q) {
    var s = String(q || '').toLowerCase();
    var out = [];
    var latin = s.match(/[a-z0-9]+/g) || [];
    out = out.concat(latin);
    var cjk = s.replace(/[^\u4e00-\u9fa5]/g, '');
    for (var i = 0; i < cjk.length - 1; i++) out.push(cjk.substr(i, 2));
    return out;
  }

  function retrieve(query, k) {
    k = k || 3;
    var q = String(query || '').toLowerCase();
    var qt = tokens(query);
    var hits = KB.map(function (e) {
      var keyHit = 0, matchedKeys = [];
      e.keys.forEach(function (key) {
        if (q.indexOf(key) >= 0) { keyHit += 1; matchedKeys.push(key); }
      });
      var overlap = 0;
      qt.forEach(function (t) { if (e.text.indexOf(t) >= 0) overlap += 1; });
      var score = keyHit * 3 + Math.min(overlap, 6) * 0.5;
      return { id: e.id, source: e.source, section: e.section, score: Number(score.toFixed(2)),
               matchedKeys: matchedKeys, text: e.text };
    }).filter(function (h) { return h.score > 0; })
      .sort(function (a, b) { return b.score - a.score; });
    var top = hits.slice(0, k);
    return { query: String(query || ''), hits: top, topScore: top.length ? top[0].score : 0, totalCandidates: hits.length };
  }

  /* ---------- 指标计算（全部可手算复核） ---------- */
  function pct(a, b) { return b ? a / b : null; }
  function round(v, d) { var m = Math.pow(10, d == null ? 2 : d); return Math.round(v * m) / m; }
  function chg(cur, prev) { if (prev == null || prev === 0) return null; return round((cur - prev) / prev * 100, 2); }

  function metrics() {
    var cur = WEEKS[WEEKS.length - 1], prev = WEEKS[WEEKS.length - 2];
    var prevEnd = cur.total - cur.netAdd;
    var m = {
      week: cur.w,
      total: cur.total,
      netAdd: cur.netAdd,
      netAddRate: round(pct(cur.netAdd, prevEnd) * 100, 4),
      arpu: cur.arpu,
      arpuPrev: prev.arpu,
      arpuChgAbs: round(cur.arpu - prev.arpu, 2),
      arpuChgPct: chg(cur.arpu, prev.arpu),
      fiveGPenetration: round(pct(cur.fiveG, cur.total) * 100, 2),
      fiveGPenetrationPrev: round(pct(prev.fiveG, prev.total) * 100, 2),
      wanTouBi: round(pct(cur.complaints, cur.total) * 10000, 2),
      wanTouBiPrev: round(pct(prev.complaints, prev.total) * 10000, 2),
      fusionChurnRate: round(pct(cur.fusionChurn, MIDWEEK.fusionUsers) * 100, 3),
      commissionPerUser: round(pct(cur.commission, MIDWEEK.newUsers), 2),
      netNegativeWeeks: (function () {
        var n = 0;
        for (var i = WEEKS.length - 1; i >= 0; i--) { if (WEEKS[i].netAdd < 0) n++; else break; }
        return n;
      })(),
      complaintTotal: cur.complaints,
      complaintMix: (function () {
        var t = MIDWEEK.complaintByType, sum = 0, out = {};
        Object.keys(t).forEach(function (k) { sum += t[k]; });
        Object.keys(t).forEach(function (k) { out[k] = { count: t[k], share: round(t[k] / sum * 100, 1), delta: t[k] - MIDWEEK.complaintByTypePrev[k] }; });
        return out;
      })(),
      arpuSeries: WEEKS.map(function (w) { return { w: w.w, arpu: w.arpu }; }),
      netAddSeries: WEEKS.map(function (w) { return { w: w.w, netAdd: w.netAdd }; })
    };
    return m;
  }

  /* ---------- 技能①：首轮结构化经营判断 ---------- */
  function analyzeWeek() {
    var m = metrics();
    var r = retrieve('ARPU 出账口径 净增 离网 投诉 万投比 融合 流失 渠道酬金');
    var facts = [
      { id: 'F1', text: '第 ' + m.week + ' 移动在网 ' + m.total.toLocaleString() + ' 户，净增 ' + m.netAdd + ' 户，净增率 ' + m.netAddRate + '%，已连续 ' + m.netNegativeWeeks + ' 周为负。', refs: ['KB-02'], data: ['WEEKS[-1].netAdd', 'WEEKS[-1].total'] },
      { id: 'F2', text: 'ARPU ' + m.arpu + ' 元，环比 ' + m.arpuPrev + ' 元下降 ' + Math.abs(m.arpuChgAbs) + ' 元（' + m.arpuChgPct + '%）。', refs: ['KB-01'], data: ['WEEKS[-1].arpu', 'WEEKS[-2].arpu'] },
      { id: 'F3', text: '万投比 ' + m.wanTouBi + '，环比 ' + m.wanTouBiPrev + ' 下降 ' + round(m.wanTouBiPrev - m.wanTouBi, 2) + '，投诉总量 ' + m.complaintTotal + ' 单。', refs: ['KB-08'], data: ['WEEKS[-1].complaints'] },
      { id: 'F4', text: '投诉结构：网络质量 ' + m.complaintMix['网络质量'].count + ' 单（' + m.complaintMix['网络质量'].share + '%）、资费争议 ' + m.complaintMix['资费争议'].count + ' 单（' + m.complaintMix['资费争议'].share + '%）、服务态度 ' + m.complaintMix['服务态度'].count + ' 单、办理差错 ' + m.complaintMix['办理差错'].count + ' 单。', refs: ['KB-07'], data: ['MIDWEEK.complaintByType'] },
      { id: 'F5', text: '5G 渗透率 ' + m.fiveGPenetration + '%，环比 ' + m.fiveGPenetrationPrev + '%（+' + round(m.fiveGPenetration - m.fiveGPenetrationPrev, 2) + 'pp）；融合用户流失率 ' + m.fusionChurnRate + '%。', refs: ['KB-03', 'KB-04'], data: ['WEEKS[-1].fiveG', 'MIDWEEK.fusionUsers'] },
      { id: 'F6', text: '渠道单户酬金 ' + m.commissionPerUser + ' 元，低于 120 元上限，未触发冲回规则。', refs: ['KB-09'], data: ['WEEKS[-1].commission', 'MIDWEEK.newUsers'] }
    ];
    var feedback = [
      { text: '一线反馈集中在资费争议与网络质量两类（合计 ' + round(m.complaintMix['网络质量'].share + m.complaintMix['资费争议'].share, 1) + '% 的工单）。', refs: ['KB-07'] }
    ];
    var hypotheses = [
      { id: 'H1', text: 'ARPU 单周下降 1.6 元，幅度超过前四周波动区间，主因可能是促销返还集中入账或超套收入下滑。', why: 'ARPU 口径包含促销返还冲减，单周 -3.19% 属于异常幅度。', verify: '拉取第 ' + m.week + ' 出账明细，拆出套餐月费 / 超套 / 促销返还三项', refs: ['KB-01'] },
      { id: 'H2', text: '净增连续三周为负，主要由融合用户拆机与欠费满 60 天自动离网共同推动。', why: '融合流失率 ' + m.fusionChurnRate + '% 且离网 ' + MIDWEEK.churnUsers + ' 户高于新增 ' + MIDWEEK.newUsers + ' 户。', verify: '拉取 W38–W40 离网原因码分布，按融合拆机 / 欠费销户 / 主动销户分类', refs: ['KB-02', 'KB-04'] },
      { id: 'H3', text: '网络质量投诉可能存在区域性集中，掩盖了平均值改善。', why: '总量环比下降 4 单，但占比仍达 ' + m.complaintMix['网络质量'].share + '%。', verify: '按行政区 / 小区拆分 ' + m.complaintMix['网络质量'].count + ' 单网络质量投诉', refs: ['KB-07'] }
    ];
    var gaps = [
      { text: '离网原因码分布（W38–W40 逐周）：缺失，无法把净增转负归因到具体流失类型。', blocks: 'H2', refs: ['KB-02', 'KB-10'] },
      { text: '出账明细（套餐月费 / 超套 / 促销返还拆分）：缺失，无法验证 ARPU 下滑来源。', blocks: 'H1', refs: ['KB-01', 'KB-10'] },
      { text: '投诉区域维度：缺失，无法验证投诉是否区域集中。', blocks: 'H3', refs: ['KB-07'] },
      { text: '中区分群样本仅 ' + MIDWEEK.segmentSample.users + ' 户、工单 ' + MIDWEEK.segmentSample.tickets + ' 单，低于 500 户 / 30 单下限，任何分群结论只能标注为方向性提示。', blocks: '分群结论', refs: ['KB-11'] }
    ];
    var actions = [
      { id: 'A1', owner: '投诉处理岗', due: '48 小时内', action: '对 ' + m.complaintMix['资费争议'].count + ' 单资费争议投诉完成首次响应与二次归类复核，剔除误分类。', basis: ['KB-07'] },
      { id: 'A2', owner: '经营分析岗', due: '本周五前', action: '补齐 W38–W40 离网原因码分布，产出「融合拆机 / 欠费销户 / 主动销户」三分类台账。', basis: ['KB-02', 'KB-10'] },
      { id: 'A3', owner: '网络优化岗', due: '本周内', action: '按小区拆分 ' + m.complaintMix['网络质量'].count + ' 单网络质量投诉，输出 Top5 集中点。', basis: ['KB-07'] },
      { id: 'A4', owner: '经营分析岗', due: '下周一前', action: '核对 ARPU 出账明细三项拆分，确认 ARPU 下滑是否由一次性返还导致。', basis: ['KB-01'] },
      { id: 'A5', owner: '渠道管理岗', due: '本周内', action: '比对 ' + MIDWEEK.churnUsers + ' 户离网名单与渠道发展清单，识别 3 个月内离网需冲回酬金的名单。', basis: ['KB-09'] }
    ];
    var boundary = [
      '以上「事实」均来自 5 周脱敏样例数据 + 口径知识源，可逐条复算。',
      '「原因假设」未经离网原因码与出账明细验证，不得当作结论对外使用。',
      '分群结论样本不足，仅作方向性提示。',
      '试点数据为教学样例，不含真实用户身份与金额（KB-12）。'
    ];
    return {
      pipeline: ['输入校验', 'RAG 检索(口径知识源)', '指标计算', '证据充分性校验', '结构化结论输出'],
      input: { week: m.week, window: '2026-W36 ~ 2026-W40', dataSource: '脱敏样例周报（5 周）' },
      retrieval: r,
      output: { facts: facts, feedback: feedback, hypotheses: hypotheses, gaps: gaps, actions: actions, boundary: boundary, metrics: m },
      evidenceStatus: { windowWeeks: WEEKS.length, windowOK: WEEKS.length >= 4, sourceOK: true, baselineOK: true, deterministicConclusionsAllowed: true }
    };
  }

  /* ---------- 技能②：多轮追问（槽位不足先反问） ---------- */
  var SLOTS = {
    window: { label: '时间窗', ask: '你要看哪一周？目前样例覆盖 2026-W36 ~ 2026-W40。', keys: ['周', 'w3', 'w4', '本周', '上周', '月'] },
    scope: { label: '对象范围', ask: '范围是全市移动用户，还是某个区/某个套餐群？', keys: ['全市', '区', '县', '套餐', '融合', '移动', '宽带', '群'] },
    dimension: { label: '关注维度', ask: '你更关心净增、ARPU、投诉还是 5G 渗透？', keys: ['净增', 'arpu', '投诉', '渗透', '流失', '酬金', '成本'] },
    purpose: { label: '决策目的', ask: '这份判断要支持什么决策？（例：是否增员、是否调整促销）', keys: ['增员', '促销', '调整', '决定', '汇报', '考核', '是否'] }
  };

  function detectSlots(text) {
    var t = String(text || '').toLowerCase();
    var filled = {};
    Object.keys(SLOTS).forEach(function (k) {
      filled[k] = SLOTS[k].keys.some(function (kw) { return t.indexOf(kw) >= 0; });
    });
    return filled;
  }

  function multiTurn() {
    var turns = [];
    var t1Input = '本周经营怎么样？';
    var f1 = detectSlots(t1Input);
    var missing = Object.keys(f1).filter(function (k) { return !f1[k]; });
    turns.push({
      turn: 1, role: 'user', input: t1Input,
      agent: { type: 'clarify', output: '信息不足，先确认 ' + missing.length + ' 个要素再给判断：\n' + missing.map(function (k, i) { return (i + 1) + '. ' + SLOTS[k].ask; }).join('\n') },
      filled: f1
    });
    var t2Input = '看 W40 全市移动用户，关心净增为什么连续为负，要决定下周是否加外呼人力。';
    var f2 = detectSlots(t2Input);
    var missing2 = Object.keys(f2).filter(function (k) { return !f2[k]; });
    var m = metrics();
    var answer2 = missing2.length
      ? { type: 'clarify', output: '还缺：' + missing2.join('、') }
      : { type: 'judgment', output: '要素齐全，进入判断。结论：净增已连续 ' + m.netNegativeWeeks + ' 周转负（W40 ' + m.netAdd + ' 户），但单周值较 W39 的 -3260 收窄，属「仍在流失、边际改善」。离网 ' + MIDWEEK.churnUsers + ' 户高于新增 ' + MIDWEEK.newUsers + ' 户是直接原因；根因需离网原因码验证（缺项见待补证据）。是否加外呼人力：在 3 人在岗、日有效挽留 18 户的现状下，加人可提升覆盖，但缺少单户毛利口径，本引擎不做 ROI 结论。' };
    turns.push({ turn: 2, role: 'user', input: t2Input, agent: answer2, filled: f2 });
    var t3Input = '那先算一下加 2 个人能多挽回多少户。';
    var w = whatIfAddStaff(2);
    turns.push({ turn: 3, role: 'user', input: t3Input, agent: { type: 'whatif-handoff', output: '转到增员假设计算，结果见 skill2。关键数：月增有效挽留 ' + w.result.netAdditionalSavedPerMonth + ' 户，覆盖提升 ' + w.result.coverageLiftPct + '%。' } });
    return { scenario: '多轮追问', turns: turns, slots: SLOTS, finalFilled: f2 };
  }

  /* ---------- 技能③：增员假设（What-if） ---------- */
  function whatIfAddStaff(n) {
    n = n == null ? 2 : n;
    var base = { perSeatDay: 6, workdays: MIDWEEK.workdaysPerMonth, staff: MIDWEEK.outboundOnDuty };
    var baseSaved = base.perSeatDay * base.staff * base.workdays;
    var newbieRatio = 0.5, rampDays = 5;
    var newbieWorkdays = Math.max(base.workdays - rampDays, 0);
    var newbieSavedPerHead = base.perSeatDay * newbieRatio * newbieWorkdays;
    var newbieSaved = newbieSavedPerHead * n;
    var coachingCost = base.perSeatDay * rampDays * n; // 带教占用老坐席产能（假设：1 名老坐席带 n 名新人，按老坐席产能折算）
    var net = round(newbieSaved - coachingCost, 1);
    var coverageLift = round((baseSaved + net) / baseSaved * 100 - 100, 2);
    var sensitivity = [20, 30, 40].map(function (margin) {
      return { marginPerUser: margin, monthlyGrossProfit: round(net * margin, 0), paybackMonthsAtCost: round(16000 / (net * margin), 1) };
    });
    return {
      scenario: '增员假设（What-if）',
      input: { addStaff: n, currentOnDuty: base.staff, perSeatDaySaved: base.perSeatDay, workdays: base.workdays },
      assumptions: [
        { id: 'AS1', text: '单坐席日均有效挽留 6 户，取自外呼作业规范。', refs: ['KB-05'], verified: true },
        { id: 'AS2', text: '新人首月按 50% 产能折算，前 5 个工作日为带教期不计产能。', refs: ['KB-05'], verified: true },
        { id: 'AS3', text: '带教期按被占用老坐席产能折算机会成本（1 名老坐席同时带 ' + n + ' 名新人）。', refs: [], verified: false },
        { id: 'AS4', text: '人均月综合成本按 8,000 元估算（样例口径，未经人力确认）。', refs: [], verified: false }
      ],
      result: {
        baselineSavedPerMonth: baseSaved,
        newbieSavedPerMonth: round(newbieSaved, 1),
        coachingOpportunityCost: round(coachingCost, 1),
        netAdditionalSavedPerMonth: net,
        coverageLiftPct: coverageLift,
        sensitivity: sensitivity
      },
      boundary: [
        '本计算只覆盖「外呼可触达的挽留户数」，未计入转化率衰减与名单质量。',
        '缺少单户毛利口径，因此不输出 ROI 结论，只给敏感性区间（KB-10）。',
        'AS3 / AS4 未经确认，成本侧结论不可对外使用。'
      ]
    };
  }

  /* ---------- 技能④：人员不可用调整 ---------- */
  function staffingAdjust(unavailableDays) {
    var days = unavailableDays == null ? 3 : unavailableDays;
    var staff = MIDWEEK.outboundStaff, onDuty = MIDWEEK.outboundOnDuty;
    var afterLeave = onDuty - 1;
    var ratioBefore = round(onDuty / staff * 100, 1);
    var ratioAfter = round(afterLeave / staff * 100, 1);
    var perSeatDaySaved = 6;
    var capacityBefore = perSeatDaySaved * onDuty;
    var capacityAfter = perSeatDaySaved * afterLeave;
    var gapPerDay = capacityBefore - capacityAfter;
    var gapTotal = gapPerDay * days;
    return {
      scenario: '人员不可用调整',
      input: { workdaysUnavailable: days, staffTotal: staff, onDutyBefore: onDuty },
      rules: [
        { id: 'R1', text: '班组最低在岗 60% 方可开班。', refs: ['KB-06'] },
        { id: 'R2', text: '单人请假超过 2 个工作日须由同班组 AB 角顶班，顶班人当日自有任务顺延，不顺延须书面说明。', refs: ['KB-06'] }
      ],
      check: {
        statusBefore: ratioBefore, statusAfter: ratioAfter,
        canOpen: ratioAfter >= 60,
        leaveExceedsThreshold: days > 2,
        needBackup: days > 2
      },
      impact: {
        savedCapacityBefore: capacityBefore, savedCapacityAfter: capacityAfter,
        dailyGap: gapPerDay, totalGapInDays: gapTotal
      },
      actions: [
        { id: 'S1', owner: '班组长', action: '启动 AB 角顶班：1 人顶班，其当日自有外呼任务顺延并在班组日志登记。', basis: ['KB-06'] },
        { id: 'S2', owner: '班组长', action: '在岗 2 人（' + ratioAfter + '%，≥60% 可开班）优先承接 ' + MIDWEEK.complaintByType['资费争议'] + ' 单资费争议投诉的 48 小时首响，守住红线。', basis: ['KB-06', 'KB-07'] },
        { id: 'S3', owner: '经营分析岗', action: '缺口的 ' + gapTotal + ' 户有效挽留顺延到下周，并在周报中单列「产能受损」说明，避免被当作业绩下滑。', basis: ['KB-05'] },
        { id: 'S4', owner: '班组长', action: '若请假延长至 5 个工作日以上，在岗率仍为 ' + ratioAfter + '%，但单人负荷上升，需评估是否申请临时支援。', basis: ['KB-06'] }
      ],
      boundary: [
        '顶班不增加总产能，只是任务重排，缺口仍然存在。',
        '名单质量与转化率未纳入计算（沿用 KB-05 的日均有效挽留口径）。'
      ]
    };
  }

  /* ---------- 技能⑤：证据不足拦截 ---------- */
  var GUARD_CASES = [
    { q: '竞品在本市降价 30%，我们下周是否也要跟进降价？', expect: 'block' },
    { q: '中区融合用户流失是不是比东区严重？', expect: 'block' },
    { q: '本周净增为什么转负？', expect: 'allow' }
  ];

  function evidenceCheck(query) {
    var r = retrieve(query, 3);
    var threshold = 3;
    var scoreEnough = r.topScore >= threshold;

    /* 数据充分性单独校验：命中口径不等于数据够用（KB-10 要求样本下限） */
    var t = String(query || '');
    var wantsComparison = /对比|比较|哪个区|哪个县|分群|vs|VS|严重|差异|中区|东区|西区|南区|北区|各区/.test(t);
    var MIN_USERS = 500, MIN_TICKETS = 30;
    var sample = MIDWEEK.segmentSample;
    var sampleEnough = !wantsComparison ||
      (sample.users >= MIN_USERS && sample.tickets >= MIN_TICKETS);

    var out = {
      scenario: '证据充分性校验',
      input: { query: query },
      retrieval: r,
      threshold: threshold,
      dataCheck: wantsComparison ? {
        need: '分群对比需 ≥ ' + MIN_USERS + ' 户且 ≥ ' + MIN_TICKETS + ' 单工单',
        actual: sample.name + '：' + sample.users + ' 户 / ' + sample.tickets + ' 单',
        enough: sampleEnough
      } : null,
      decision: (scoreEnough && sampleEnough) ? 'allow' : 'block'
    };

    if (!scoreEnough) {
      out.block = {
        reason: '知识源未命中可用口径（最高分 ' + r.topScore + ' < 阈值 ' + threshold + '），且缺少必要数据字段，按证据要求不得输出确定性结论。',
        basis: ['KB-10'],
        missingEvidence: [
          '竞品价格：需有效来源（公开报价/合同）+ 生效时间，当前知识源无竞品价格条目',
          '我方价格弹性：需 ≥ 连续 4 周的价格调整历史数据与对应净增/ARPU 记录',
          '目标群体价格敏感度：需 ≥ 500 户分群样本',
          '分群对比：' + sample.name + ' 样本 ' + sample.users + ' 户 / ' + sample.tickets + ' 单，低于 ' + MIN_USERS + ' 户 / ' + MIN_TICKETS + ' 单下限'
        ],
        allowedOutput: '只能输出「待补证据」清单与取证路径，不给出业务结论。'
      };
    } else if (!sampleEnough) {
      out.block = {
        reason: '口径可检索（最高分 ' + r.topScore + '），但分群样本不足：' + sample.name + ' 仅 ' + sample.users + ' 户 / ' + sample.tickets + ' 单，低于 ' + MIN_USERS + ' 户 / ' + MIN_TICKETS + ' 单下限，无法支撑「哪个区更严重」这类比较判断。',
        basis: ['KB-10', 'KB-12'],
        missingEvidence: [
          '分群样本量：需 ≥ ' + MIN_USERS + ' 户（当前 ' + sample.users + ' 户）',
          '分群工单量：需 ≥ ' + MIN_TICKETS + ' 单（当前 ' + sample.tickets + ' 单）',
          '对比口径：需明确对比周期（同周/累计）与分母（在网户数/融合户数）',
          '离网原因码：需分区分类型的离网原因分布，当前数据仅全市汇总'
        ],
        allowedOutput: '只能输出全市级结论与「待补证据」清单，不给出分区排名或「更严重」的判断。'
      };
    } else {
      out.allow = {
        reason: '命中 ' + r.hits.length + ' 条相关口径（最高分 ' + r.topScore + '），数据时间窗覆盖 5 周 ≥ 4 周，可输出条件性判断。',
        basis: ['KB-10'],
        caveat: '仍须标注原因假设与待补证据，不得把假设写成结论。'
      };
    }
    return out;
  }

  /* ---------- 五类测试统一运行记录（真实调用上述函数） ---------- */
  function runAll() {
    var started = new Date().toISOString();
    var runs = [];
    var a = analyzeWeek();
    runs.push({ caseId: 'T1', name: '首轮结构化经营判断', input: a.input, pipeline: a.pipeline, retrievalHits: a.retrieval.hits.map(function (h) { return h.id + '@' + h.score; }), output: a.output, evidenceStatus: a.evidenceStatus });
    var mt = multiTurn();
    runs.push({ caseId: 'T2', name: '多轮追问（槽位不足先反问）', input: { turns: mt.turns.length }, turns: mt.turns });
    var w = whatIfAddStaff(2);
    runs.push({ caseId: 'T3', name: '增员假设（What-if）', input: w.input, assumptions: w.assumptions, output: w.result, boundary: w.boundary });
    var s = staffingAdjust(3);
    runs.push({ caseId: 'T4', name: '人员不可用调整', input: s.input, check: s.check, impact: s.impact, actions: s.actions });
    var g = GUARD_CASES.map(function (c) { return evidenceCheck(c.q); });
    runs.push({ caseId: 'T5', name: '证据不足拦截', cases: g });
    return {
      agent: AGENT,
      generatedAt: started,
      runtime: { offline: true, externalCalls: 0, deterministic: true },
      kbCount: KB.length,
      weeks: WEEKS.map(function (w) { return w.w; }),
      runs: runs
    };
  }

  return {
    AGENT: AGENT, KB: KB, WEEKS: WEEKS, MIDWEEK: MIDWEEK,
    tokens: tokens, retrieve: retrieve, metrics: metrics,
    analyzeWeek: analyzeWeek, multiTurn: multiTurn, whatIfAddStaff: whatIfAddStaff,
    staffingAdjust: staffingAdjust, evidenceCheck: evidenceCheck, runAll: runAll, GUARD_CASES: GUARD_CASES
  };
});
