// ==================== 长租公寓运营工作台 v4.0 ====================
// APP.JS — 独立PWA版 · GitHub Pages免费部署 · 零积分消耗
// v4.6.3: 移除「数据分析」模块（含历史分析数据清理）
// v4.6.4: 「学习计划」→「AI热门工具推送」（GitHub 抓取 脚本/图片/视频/代码 4 类，优缺点+付费）
// v4.6.5: init() 启动即 fetchWeeklyData，让所有模块（不再仅 hotspot）一开始就有数据
// v4.6.6: 修复实时热榜合并分支漏掉 aitools → AI工具模块始终无数据；renderAITools 改为独立拉取兜底
// v4.6.7: 素材管理分类改为可点击折叠（默认折叠，本周热榜默认展开）
// v4.6.9: 全局版式升级 - 多巴胺低饱和配色 + 线条感统计卡片 + section 区块折叠
// v4.7.0: 标题栏 icon/title emoji 去重 + 折叠栏改为彩色矩形渐变背景（左侧色条 + 多巴胺渐变）

// ===== MODULE DEFINITIONS =====
const MODULES = [
  { id:'hotspot', name:'热梗捕手', desc:'自动更新', icon:'🔥', iconClass:'m1', badge:'每日', badgeClass:'badge-daily', title:'热梗捕手', subtitle:'免费API · 抖音/小红书/微博/知乎 · 实时热榜', render:renderHotspot },
  { id:'bgm', name:'BGM管家', desc:'自动更新', icon:'🎵', iconClass:'m2', badge:'每周', badgeClass:'badge-weekly', title:'BGM 与音效管家', subtitle:'热门名字列表 · 点击搜抖音 · 免费API自动抓取', render:renderBGM },
  { id:'analysis', name:'爆款拆解', desc:'AI自动生成', icon:'🔍', iconClass:'m3', badge:'每周', badgeClass:'badge-weekly', title:'爆款拆解', subtitle:'DeepSeek AI生成 · 高赞+高播放爆款 · 共性归纳', render:renderAnalysis },
  { id:'script', name:'脚本生成', desc:'AI按需生成', icon:'✍️', iconClass:'m4', badge:'按需', badgeClass:'badge-ondemand', title:'脚本库', subtitle:'输入话题 → DeepSeek AI生成多风格脚本', render:renderScript },
  { id:'aitools', name:'AI工具', desc:'GitHub热榜', icon:'🤖', iconClass:'m6', badge:'每周', badgeClass:'badge-weekly', title:'AI 热门工具', subtitle:'GitHub抓取 · 脚本/图片/视频/代码 · 优缺点+付费', render:renderAITools },
  { id:'calendar', name:'选题日历', desc:'AI自动生成', icon:'📅', iconClass:'m7', badge:'每周', badgeClass:'badge-weekly', title:'内容选题日历', subtitle:'DeepSeek AI生成 · 下周7天选题规划·详情', render:renderCalendar },
  { id:'competitor', name:'竞品监控', desc:'AI自动生成', icon:'👁️', iconClass:'m8', badge:'每周', badgeClass:'badge-weekly', title:'竞品监控', subtitle:'DeepSeek AI监控4品牌 · 热视频·评论区诉求', render:renderCompetitor },
  { id:'material', name:'素材管理', desc:'归档存储', icon:'📁', iconClass:'m9', badge:'持续', badgeClass:'badge-daily', title:'素材归档', subtitle:'本地存储 · 分类管理 · 热梗/脚本/数据', render:renderMaterial }
];

// ===== STATE =====
let activeModuleId = null;
let editMode = false;
let hideMode = false;
// v4.6.4: 模块集合变化（learning→aitools），旧顺序缓存自动重建
let moduleOrder = (()=>{ try{ var d=JSON.parse(localStorage.getItem('moduleOrder')||''); if(d&&d.length===8&&d.indexOf('aitools')>-1) return d; }catch(e){} return MODULES.map(m=>m.id); })();
// v4.6.3: 已移除「数据分析」模块，清理其历史数据（本地分析记录）
try { localStorage.removeItem('apt_data_analyses'); } catch(e) {}
// v4.6.4: 「学习计划」→「AI热门工具」，清理旧模块状态
try {
  localStorage.removeItem('learningReminders');
  var hm = JSON.parse(localStorage.getItem('hiddenModules')||'[]')||[];
  var hm2 = hm.filter(function(id){ return id!=='learning' && id!=='data'; });
  if (hm2.length !== hm.length) localStorage.setItem('hiddenModules', JSON.stringify(hm2));
} catch(e) {}
let hiddenModules = (()=>{ try{ return JSON.parse(localStorage.getItem('hiddenModules')||'[]')||[]; }catch(e){ return []; } })();
let draggedItem = null;
let currentPlatform = 'douyin';

// ===== v4.0 DATA LAYER =====
// All dynamic content stored in localStorage with defaults.
// Key: apt_v4_{moduleId} - falls back to built-in seed data.
function loadModuleData(moduleId, defaultData) {
  try {
    var key = 'apt_v4_' + moduleId;
    var raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return defaultData;
}
function saveModuleData(moduleId, data) {
  localStorage.setItem('apt_v4_' + moduleId, JSON.stringify(data));
}
function resetModuleData(moduleId, defaultData) {
  localStorage.removeItem('apt_v4_' + moduleId);
  return defaultData;
}

// ===== INIT =====
// ===== SIDEBAR DRAWER (mobile) =====
function toggleSidebar() {
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('sidebarOverlay');
  var btn = document.getElementById('hamburgerBtn');
  if (!sidebar || !overlay) return;
  var isOpen = sidebar.classList.contains('open');
  if (isOpen) {
    closeSidebar();
  } else {
    sidebar.classList.add('open');
    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
    if (btn) btn.textContent = '✕';
  }
}

function closeSidebar() {
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('sidebarOverlay');
  var btn = document.getElementById('hamburgerBtn');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('show');
  document.body.style.overflow = '';
  if (btn) btn.textContent = '☰';
}

function init() {
  renderSidebar();
  // v4.6.5: 启动时立即拉取周更数据，让所有模块（不只是热梗）一开始就有最新数据可用
  // （避免用户先点 AI 工具/其他模块时 weeklyDataCache 还是 null）
  fetchWeeklyData(false).catch(function(){});
  var firstId = moduleOrder.filter(function(id){return hiddenModules.indexOf(id)===-1})[0] || 'hotspot';
  if (window.innerWidth > 768) selectModule(firstId);
}

function renderSidebar() {
  var nav = document.getElementById('moduleNav');
  nav.innerHTML = '';
  moduleOrder.forEach(function(id) {
    var mod = MODULES.find(function(m){return m.id===id});
    if (!mod) return;
    var isHidden = hiddenModules.indexOf(id) > -1;
    if (isHidden && !hideMode) return;
    var item = document.createElement('div');
    item.className = 'module-item' + (activeModuleId===id ? ' active' : '');
    item.id = 'mod-' + id;
    item.draggable = editMode;
    item.setAttribute('data-module-id', id);
    item.onclick = function(e) {
      if (e.target.classList.contains('drag-handle') || e.target.classList.contains('vis-toggle')) return;
      selectModule(id);
    };
    if (editMode) {
      item.ondragstart = function(e){ onDragStart(e, id); };
      item.ondragover = function(e){ onDragOver(e, id); };
      item.ondrop = function(e){ onDrop(e, id); };
      item.ondragend = function(e){ onDragEnd(e); };
    }
    var visBtn = '';
    if (hideMode) {
      visBtn = '<button class="vis-toggle" onclick="event.stopPropagation();toggleVisibility(\''+id+'\')">'+(isHidden?'👁':'🙈')+'</button>';
    }
    item.innerHTML =
      '<div class="drag-handle" style="'+(editMode?'':'visibility:hidden;width:0;')+'">⠿</div>' +
      '<div class="mod-icon '+mod.iconClass+'">'+mod.icon+'</div>' +
      '<div class="mod-info"><span class="mod-name">'+mod.name+'</span><span class="mod-desc">'+mod.desc+'</span></div>' +
      '<span class="mod-badge '+mod.badgeClass+'">'+mod.badge+'</span>' + visBtn;
    nav.appendChild(item);
  });
  renderHiddenSection();
}

function renderHiddenSection() {
  var sec = document.getElementById('hiddenSection');
  var list = document.getElementById('hiddenList');
  if (hiddenModules.length === 0) { sec.style.display = 'none'; return; }
  sec.style.display = hideMode ? 'block' : 'none';
  list.innerHTML = '';
  hiddenModules.forEach(function(id) {
    var mod = MODULES.find(function(m){return m.id===id});
    if (!mod) return;
    var el = document.createElement('div');
    el.className = 'hidden-module';
    el.onclick = function(){ toggleVisibility(id); };
    el.innerHTML = '<span>'+mod.icon+'</span> <span>'+mod.name+'</span> <span style="margin-left:auto;font-size:11px;color:var(--primary);">恢复</span>';
    list.appendChild(el);
  });
}

// ===== SIDEBAR CONTROLS =====
function toggleEditMode() {
  editMode = !editMode;
  var btn = document.getElementById('editBtn');
  btn.classList.toggle('active', editMode);
  btn.textContent = editMode ? '✅ 完成排序' : '✋ 拖拽排序';
  renderSidebar();
  showToast(editMode ? '拖拽模块可重新排序' : '排序已保存');
}

function toggleHideMode() {
  hideMode = !hideMode;
  var btn = document.getElementById('hideBtn');
  btn.classList.toggle('active', hideMode);
  btn.textContent = hideMode ? '✅ 完成' : '👁 管理模块';
  renderSidebar();
}

function toggleVisibility(id) {
  var idx = hiddenModules.indexOf(id);
  if (idx > -1) { hiddenModules.splice(idx,1); showToast('模块已恢复'); }
  else { hiddenModules.push(id); showToast('模块已隐藏'); }
  localStorage.setItem('hiddenModules', JSON.stringify(hiddenModules));
  renderSidebar();
  if (activeModuleId === id && hiddenModules.indexOf(id) > -1) {
    var nextId = moduleOrder.filter(function(i){return hiddenModules.indexOf(i)===-1})[0];
    if (nextId) selectModule(nextId);
  }
}

// ===== DRAG & DROP =====
function onDragStart(e, id) { draggedItem = id; e.target.classList.add('dragging'); }
function onDragOver(e, id) { e.preventDefault(); if (id !== draggedItem) { var el=document.getElementById('mod-'+id); if(el)el.classList.add('drag-over'); } }
function onDrop(e, id) {
  e.preventDefault();
  if (draggedItem && draggedItem !== id) {
    var fi = moduleOrder.indexOf(draggedItem);
    var ti = moduleOrder.indexOf(id);
    var item = moduleOrder.splice(fi,1)[0];
    moduleOrder.splice(ti,0,item);
    localStorage.setItem('moduleOrder', JSON.stringify(moduleOrder));
    renderSidebar();
  }
}
function onDragEnd(e) { e.target.classList.remove('dragging'); document.querySelectorAll('.drag-over').forEach(function(el){el.classList.remove('drag-over')}); }

// ===== MODULE SELECTION =====
function selectModule(id) {
  activeModuleId = id;
  var mod = MODULES.find(function(m){return m.id===id});
  if (!mod) return;
  document.querySelectorAll('.module-item').forEach(function(el){el.classList.remove('active')});
  var item = document.getElementById('mod-'+id);
  if (item) { item.classList.add('active'); if (window.innerWidth<=768) item.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'}); }
  document.getElementById('headerIcon').textContent = mod.icon;
  document.getElementById('headerTitle').textContent = mod.title;
  document.getElementById('headerSubtitle').textContent = mod.subtitle;
  document.getElementById('btnRefresh').style.display = '';
  var body = document.getElementById('contentBody');
  body.innerHTML = '';
  try { mod.render(body); } catch(e) { body.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">渲染错误: '+e.message+'</div></div>'; }
  // v4.6.9: 区块折叠增强（section-title 点击折叠/展开其后内容）
  enableSectionCollapse(body);
  body.scrollTop = 0;
  // Mobile: auto-close drawer after selecting
  if (window.innerWidth <= 768) closeSidebar();
}

// v4.6.9: 模块内所有 .section-title 支持点击折叠/展开其后内容（默认展开）
function enableSectionCollapse(container) {
  if (!container) return;
  var titles = container.querySelectorAll('.section-title');
  Array.prototype.forEach.call(titles, function(t) {
    if (t.getAttribute('data-collapse') === 'off') return;
    if (t.dataset.collapsible === '1') return;
    t.dataset.collapsible = '1';
    t.style.cursor = 'pointer';
    t.title = '点击折叠 / 展开';
    var arrow = document.createElement('span');
    arrow.className = 'sec-collapse-arrow';
    arrow.textContent = '▾';
    t.appendChild(arrow);
    t.addEventListener('click', function(ev) {
      // 不拦截内部链接/按钮/输入交互
      if (ev.target.closest && ev.target.closest('a,button,input,textarea,select,label')) return;
      var next = t.nextElementSibling;
      var targets = [];
      while (next && !next.classList.contains('section-title')) {
        targets.push(next);
        next = next.nextElementSibling;
      }
      var collapsed = t.classList.toggle('collapsed');
      targets.forEach(function(x) { x.style.display = collapsed ? 'none' : ''; });
    });
  });
}

function refreshModule() {
  if (!activeModuleId) return;
  var btn = document.getElementById('btnRefresh');
  btn.classList.add('refreshing');
  btn.innerHTML = '<span>⏳</span> 刷新中...';
  setTimeout(function(){ selectModule(activeModuleId); btn.classList.remove('refreshing'); btn.innerHTML='<span>🔄</span> 刷新数据'; showToast('✅ 数据已刷新'); }, 800);
}

// ===== HELPERS =====
function showToast(msg) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(function(){ el.classList.remove('show'); }, 2200);
}

function sourceLink(url, label) {
  var icon = '🔗';
  if (url.indexOf('douyin')>-1) icon = '🎵';
  else if (url.indexOf('xiaohongshu')>-1) icon = '📕';
  else if (url.indexOf('bilibili')>-1) icon = '📺';
  else if (url.indexOf('weibo')>-1) icon = '📢';
  else if (url.indexOf('feishu')>-1) icon = '📋';
  else if (url.indexOf('uri.city')>-1) icon = '🏙️';
  return '<a class="source-link" href="'+url+'" target="_blank" rel="noopener">'+icon+' '+label+' <svg class="external-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg></a>';
}

function sourceLabel(url, label) {
  var icon = '🔗';
  if (url.indexOf('douyin')>-1) icon = '🎵';
  else if (url.indexOf('xiaohongshu')>-1) icon = '📕';
  else if (url.indexOf('bilibili')>-1) icon = '📺';
  else if (url.indexOf('weibo')>-1) icon = '📢';
  else if (url.indexOf('feishu')>-1) icon = '📋';
  else if (url.indexOf('uri.city')>-1) icon = '🏙️';
  return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--text-muted);padding:4px 10px;border-radius:6px;background:var(--bg);white-space:nowrap;">'+icon+' '+label+'</span>';
}

// ===== DEEPSEEK API HELPER (browser-side; key stored in localStorage only) =====
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function getMonday(d) {
  var date = new Date(d);
  var day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  date.setHours(0,0,0,0);
  return date;
}

function formatWeek(ts) {
  var d = new Date(ts);
  return d.getFullYear() + '年' + (d.getMonth()+1) + '月' + d.getDate() + '日';
}

function parseJSONSafe(text) {
  if (!text) return null;
  var t = String(text).trim();
  var m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) t = m[1].trim();
  try { return JSON.parse(t); } catch(e) {}
  var s = t.indexOf('{'); var e = t.lastIndexOf('}');
  if (s >= 0 && e > s) { try { return JSON.parse(t.substring(s, e+1)); } catch(e2){} }
  return null;
}

async function callDeepSeek(prompt, opts) {
  opts = opts || {};
  var apiKey = localStorage.getItem('deepseek_api_key');
  if (!apiKey) {
    showApiKeyModal();
    throw new Error('请先在上方输入 DeepSeek API Key');
  }
  var body = JSON.stringify({
    model: opts.model || 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: opts.maxTokens || 2000,
    temperature: (opts.temperature != null ? opts.temperature : 0.7),
    stream: false
  });
  var res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: body
  });
  if (!res.ok) {
    var msg = 'API错误(' + res.status + ')';
    var em = '';
    try {
      var ej = JSON.parse(await res.text());
      em = ej.error && ej.error.message ? ej.error.message : (ej.message || '');
    } catch(e) {}
    if (res.status === 402) msg = '💰 DeepSeek 余额不足，请充值后重试（设置 → API Key 处可重新粘贴）';
    else if (res.status === 401) msg = '🔑 DeepSeek API Key 无效，请检查 Key 是否正确（可在上方重新保存）';
    else if (res.status === 429) msg = '⏳ DeepSeek 请求过于频繁，请稍后再试';
    else if (em) msg = em;
    throw new Error(msg);
  }
  var data = await res.json();
  return data.choices[0].message.content;
}

function renderApiKeyBar() {
  var provider = localStorage.getItem('ai_provider') || 'deepseek';
  var dsSaved = !!localStorage.getItem('deepseek_api_key');
  var zpSaved = !!localStorage.getItem('zhipu_api_key');
  var activeKey = provider === 'zhipu' ? zpSaved : dsSaved;
  var status = activeKey
    ? '<span style="color:#16a34a;font-size:12px;">✅ 已连接 ' + (provider === 'zhipu' ? '智谱' : 'DeepSeek') + '</span>'
    : '<span style="color:#dc2626;font-size:12px;">⚠️ 未设置</span>';
  var placeholder = provider === 'zhipu'
    ? '粘贴你的智谱 API Key（智谱新用户有 2000 万 token 免费额度，支持图片识别）'
    : '粘贴你的 DeepSeek API Key (sk-...) — 仅支持文本分析';
  var models = provider === 'zhipu'
    ? '<span style="font-size:11px;color:var(--text-muted);">🤖 模型：GLM-4V-Plus（视觉）</span>'
    : '<span style="font-size:11px;color:var(--text-muted);">🤖 模型：deepseek-chat（仅文本）</span>';
  return '<div id="apiKeyBar" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;margin-bottom:14px;">' +
    '<span style="font-size:13px;">🔑 AI Key</span>' +
    '<select id="aiProviderSelect" onchange="switchAiProvider()" style="padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;background:var(--bg);color:var(--text);">' +
      '<option value="deepseek"' + (provider === 'deepseek' ? ' selected' : '') + '>DeepSeek（仅文本）</option>' +
      '<option value="zhipu"' + (provider === 'zhipu' ? ' selected' : '') + '>智谱 GLM-4V（支持图片）</option>' +
    '</select>' +
    '<input id="apiKeyInput" type="password" placeholder="' + placeholder + '" style="flex:1;min-width:160px;padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;background:var(--bg);color:var(--text);">' +
    '<button onclick="saveApiKey()" style="padding:6px 14px;background:var(--primary);color:#fff;border:none;border-radius:var(--radius-sm);font-size:12px;cursor:pointer;">保存</button>' +
    status + models +
    '</div>';
}

function switchAiProvider() {
  var sel = document.getElementById('aiProviderSelect');
  if (!sel) return;
  localStorage.setItem('ai_provider', sel.value);
  var bar = document.getElementById('apiKeyBar');
  if (bar) bar.outerHTML = renderApiKeyBar();
  showToast('已切换到 ' + (sel.value === 'zhipu' ? '智谱 GLM-4V' : 'DeepSeek'));
}

function saveApiKey() {
  var inp = document.getElementById('apiKeyInput');
  if (!inp) return;
  var v = inp.value.trim();
  if (!v) { showToast('请输入 Key'); return; }
  var provider = localStorage.getItem('ai_provider') || 'deepseek';
  var keyName = provider === 'zhipu' ? 'zhipu_api_key' : 'deepseek_api_key';
  localStorage.setItem(keyName, v);
  showToast('✅ ' + (provider === 'zhipu' ? '智谱' : 'DeepSeek') + ' API Key 已保存');
  var bar = document.getElementById('apiKeyBar');
  if (bar) bar.outerHTML = renderApiKeyBar();
}

function showApiKeyModal() {
  showToast('⚠️ 请先在上方输入并保存 DeepSeek API Key');
}

function scrollToSection(id) {
  var el = document.getElementById(id);
  var container = document.getElementById('contentBody');
  if (!el || !container) return;
  // Calculate scroll position relative to container's scrollable content
  var offset = container.scrollTop + el.getBoundingClientRect().top - container.getBoundingClientRect().top - 20;
  container.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
}

function copyText(text) {
  if (!text) return;
  var write = function() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return Promise.reject();
  };
  write().then(function() {
    showToast('📋 已复制到剪贴板');
  }).catch(function() {
    var el = document.createElement('textarea');
    el.value = text;
    el.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand('copy');
      showToast('📋 已复制到剪贴板');
    } catch (err) {
      showToast('❌ 复制失败，请手动复制');
    }
    document.body.removeChild(el);
  });
}

// 全局事件委托：监听所有模块的复制按钮点击（支持任意模块动态添加）
document.addEventListener('click', function(e) {
  var btn = e.target.closest('.cap-copy, .tf-copy-btn');
  if (!btn) return;
  var encoded = btn.getAttribute('data-copy');
  if (!encoded) return;
  copyText(decodeURIComponent(encoded));
});

function toggleExpand(id) {
  var el = document.getElementById(id);
  if (el) el.classList.toggle('show');
}

// ===== 1. HOTSPOT RENDERER =====
function renderHotspot(container) {
  var hotspots = [
    // === 可直接改编 5个 ===
    { cat:'hot', tag:'🔥 可直接改编', tagClass:'tag-fire', title:'#00后整顿租房市场', platform:'抖音', exposure:'2.3亿播放',
      tip:'拍摄"租房避坑指南"系列：展示00后大胆谈判vs传统忍气吞声，用反差制造戏剧性。前3秒"房东说押金不退，00后这样回应"。',
      captions:[
        {label:'文案1 · 反差吐槽版', text:'房东说押金不退？00后：您看看合同第7条，再看看消费者权益保护法第55条，咱们是走调解还是走诉讼？🤔 #00后整顿租房市场 #上海租房 #押金退还'},
        {label:'文案2 · 走心共鸣版', text:'不是00后难搞，是我们这代人终于学会了用法律保护自己。租房不是求人办事，是平等交易。💪 #00后整顿租房市场 #沪漂租房日记'}
      ],
      sources:[{url:'https://www.douyin.com/video/739100000001',label:'抖音原视频'},{url:'https://www.xiaohongshu.com/explore/739100000002',label:'小红书参考'}] },
    { cat:'hot', tag:'🔥 可直接改编', tagClass:'tag-fire', title:'#上海租房价格大跳水', platform:'小红书', exposure:'1.8亿浏览',
      tip:'做"同一预算，去年vs今年能租到什么房"对比视频。展示同地段同价位房源品质变化，激发租客换租欲望。',
      captions:[
        {label:'文案1 · 对比冲击版', text:'去年3000块只能租隔断间，今年3000块住一室一厅带阳台。上海租房价格大跳水，现在是换租最佳时机！🏠✨ #上海租房 #换租季 #租房降价'},
        {label:'文案2 · 理性分析版', text:'上海租房降价不是偶然：保租房集中入市+毕业季供给增加=租客议价权up！这份2026下半年租房行情分析请收好 📊 #上海租房价格大跳水'}
      ],
      sources:[{url:'https://www.xiaohongshu.com/explore/739100000003',label:'小红书原笔记'},{url:'https://www.douyin.com/video/739100000004',label:'抖音参考'}] },
    { cat:'hot', tag:'🔥 可直接改编', tagClass:'tag-fire', title:'#消费降级后的精致生活', platform:'抖音', exposure:'1.5亿播放',
      tip:'用公寓低成本改造案例（500元打造ins风房间），贴合消费降级但生活不降级的心理。',
      captions:[
        {label:'文案1 · 改造攻略版', text:'消费降级≠生活降级。500元改造出租屋：①暖色灯带20元 ②墙贴40元 ③地毯80元 ④装饰画50元...剩下的钱吃顿好的不香吗？#消费降级 #出租屋改造 #精致穷'},
        {label:'文案2 · 心态转变版', text:'以前觉得精致=花钱，现在发现精致=用心。一束花10块，一盏灯20块，精致感拉满。消费降级后反而学会了生活的本质 🌿 #消费降级后的精致生活'}
      ],
      sources:[{url:'https://www.douyin.com/video/739100000005',label:'抖音原视频'},{url:'https://www.xiaohongshu.com/explore/739100000006',label:'小红书参考'}] },
    { cat:'hot', tag:'🔥 可直接改编', tagClass:'tag-fire', title:'#打工人下班后的2小时', platform:'抖音', exposure:'1.1亿播放',
      tip:'拍摄公寓社区"下班后生活"：健身房撸铁、公共厨房做饭、露台看日落。突出公寓提供的社交生活价值。',
      captions:[
        {label:'文案1 · 生活vlog版', text:'6点下班，7点到家用公区健身，8点公共厨房做简餐，9点露台吹风。打工人下班后的2小时，才是真正属于自己的时间 🌅 #打工人 #下班生活 #公寓社区'},
        {label:'文案2 · 社交场景版', text:'谁说沪漂没有社交？下班后在公区认识了同楼的小姐姐，一起撸铁一起做饭。独居但不孤独，这就是社区公寓的魅力 💪 #打工人下班后的2小时'}
      ],
      sources:[{url:'https://www.douyin.com/video/739100000007',label:'抖音原视频'},{url:'https://www.xiaohongshu.com/explore/739100000008',label:'小红书参考'}] },
    { cat:'hot', tag:'🔥 可直接改编', tagClass:'tag-fire', title:'#毕业季租房vlog', platform:'小红书', exposure:'8500万浏览',
      tip:'第一视角拍摄毕业生从找房到入住的全过程，强调"第一个家"的情感价值。',
      captions:[
        {label:'文案1 · 情感叙事版', text:'毕业第3天，我在上海租到了人生第一个"家"。推开门的那一刻，阳光洒在床上，突然觉得：一切都会好起来的 🎓🏠 #毕业季租房 #沪漂第一天 #上海租房'},
        {label:'文案2 · 攻略干货版', text:'毕业生租房全流程：①确定预算(月薪1/3) ②选定区域(地铁30min) ③实地看房(带尺子) ④签约避坑(看产证)。这份攻略价值1万块 📋 #毕业季租房 #租房攻略'}
      ],
      sources:[{url:'https://www.xiaohongshu.com/explore/739100000009',label:'小红书原笔记'},{url:'https://www.douyin.com/video/739100000010',label:'抖音参考'}] },
    // === 可参考创意 5个 ===
    { cat:'ref', tag:'👀 可参考创意', tagClass:'tag-idea', title:'#MBTI选房指南', platform:'小红书', exposure:'9800万浏览',
      tip:'按MBTI人格推荐房型：ISTJ选收纳型一居、ENFP选有社交公区的公寓。趣味性强，易引发自我投射和转发。',
      captions:[
        {label:'文案1 · 趣味测试版', text:'MBTI选房指南：ISTJ→收纳型一居室(一切井井有条)；ENFP→社交公区公寓(天天party)；INTP→loft(独处空间max)；ESFJ→合租公寓。你是哪个？🧠 #MBTI #选房指南'},
        {label:'文案2 · 互动投票版', text:'测测你的MBTI适合住什么房！J人适合收纳型，P人适合灵活型。评论区留下你的MBTI，帮你匹配最合适的公寓 👇 #MBTI选房 #上海租房'}
      ],
      sources:[{url:'https://www.xiaohongshu.com/explore/739100000011',label:'小红书原笔记'},{url:'https://www.douyin.com/video/739100000012',label:'抖音参考'}] },
    { cat:'ref', tag:'👀 可参考创意', tagClass:'tag-idea', title:'#租房前vs租房后', platform:'抖音', exposure:'7600万播放',
      tip:'对比租房前后生活状态变化，用"反差"手法展示公寓带来的品质提升。',
      captions:[
        {label:'文案1 · 反差对比版', text:'租房前：合租隔断间，公共卫生间，室友凌晨打游戏。租房后：独立一居室，干湿分离，晚上11点安静入睡。同样是租房，差别真大 🏠➡️🏢 #租房前后 #生活品质'},
        {label:'文案2 · 数据对比版', text:'租房前vs后对比：月租+200但面积+15㎡，通勤-20min，睡眠质量+30%。这笔账怎么算都值 📊 #租房对比 #沪漂生活'}
      ],
      sources:[{url:'https://www.douyin.com/video/739100000013',label:'抖音原视频'},{url:'https://www.xiaohongshu.com/explore/739100000014',label:'小红书参考'}] },
    { cat:'ref', tag:'👀 可参考创意', tagClass:'tag-idea', title:'#独居女孩的安全感', platform:'小红书', exposure:'6200万浏览',
      tip:'从安全角度切入，展示公寓的安保设施、智能门锁、24h管家等卖点。',
      captions:[
        {label:'文案1 · 安全感清单版', text:'独居女孩的安全感清单：✅智能门锁 ✅24h监控 ✅管家值班 ✅可视对讲 ✅女性专用楼层。住在这样的公寓，爸妈再也不用担心了 🔒 #独居安全 #女性租房'},
        {label:'文案2 · 情感共鸣版', text:'独居第一年最怕的不是孤独，是不安全。直到搬进有24h管家的公寓，晚上回家有人打招呼，门锁异常有人通知。安全感不是奢侈，是基本需求 🛡️ #独居女孩的安全感'}
      ],
      sources:[{url:'https://www.xiaohongshu.com/explore/739100000015',label:'小红书原笔记'},{url:'https://www.douyin.com/video/739100000016',label:'抖音参考'}] },
    { cat:'ref', tag:'👀 可参考创意', tagClass:'tag-idea', title:'#合租到底值不值', platform:'抖音', exposure:'5800万播放',
      tip:'算账式内容：合租vs整租的性价比对比，引导整租公寓转化。',
      captions:[
        {label:'文案1 · 算账对比版', text:'合租2000 vs 整租3000，差1000块得到什么？独立卫生间+不用等洗澡+不用听室友打电话+想几点睡几点睡。1000块买自由，值不值？🧮 #合租vs整租'},
        {label:'文案2 · 真实故事版', text:'合租2年，我经历了：室友偷用我的东西、凌晨被吵醒、卫生间永远不干净。搬到整租公寓第1天，我哭了——原来住得舒服这么重要 😭 #合租到底值不值'}
      ],
      sources:[{url:'https://www.douyin.com/video/739100000017',label:'抖音原视频'},{url:'https://www.xiaohongshu.com/explore/739100000018',label:'小红书参考'}] },
    { cat:'ref', tag:'👀 可参考创意', tagClass:'tag-idea', title:'#租房改造前后对比', platform:'小红书', exposure:'4500万浏览',
      tip:'展示出租屋改造前后的视觉反差，搭配预算清单，激发改造欲和公寓入住欲。',
      captions:[
        {label:'文案1 · 改造全记录版', text:'改造前：灰墙+水泥地+破窗帘。改造后：暖色墙+木地板+纱帘+绿植。总预算800块，耗时2天。改造教程已整理好 🛠️ #出租屋改造 #改造前后'},
        {label:'文案2 · 公寓vs改造版', text:'花了800块改造出租屋，朋友来了一看说：这不就是XX公寓的精装房吗？我笑了——直接住公寓不香吗，省下800块吃火锅 🍲 #租房改造 #公寓直租'}
      ],
      sources:[{url:'https://www.xiaohongshu.com/explore/739100000019',label:'小红书原笔记'},{url:'https://www.douyin.com/video/739100000020',label:'抖音参考'}] },
    // === 暂不适合 3个 ===
    { cat:'skip', tag:'⏳ 暂不适合', tagClass:'tag-skip', title:'#夏日旅行穿搭', platform:'抖音', exposure:'3.2亿播放',
      tip:'与租房赛道关联度低，暂不推荐改编。可作为生活类内容延伸储备。',
      sources:[{url:'https://www.douyin.com/video/739100000021',label:'抖音原视频'}] },
    { cat:'skip', tag:'⏳ 暂不适合', tagClass:'tag-skip', title:'#考公上岸经验分享', platform:'抖音', exposure:'2.8亿播放',
      tip:'与租房赛道关联弱，受众重叠度低。若切入"考公备考租房"角度可考虑改编。',
      sources:[{url:'https://www.douyin.com/video/739100000022',label:'抖音原视频'}] },
    { cat:'skip', tag:'⏳ 暂不适合', tagClass:'tag-skip', title:'#宠物医院避坑', platform:'小红书', exposure:'1.5亿浏览',
      tip:'宠物医疗赛道，与租房运营距离较远。可储备为"宠物友好公寓"内容的参考素材。',
      sources:[{url:'https://www.xiaohongshu.com/explore/739100000023',label:'小红书原笔记'}] }
  ];

  var counts={hot:0,ref:0,skip:0};
  hotspots.forEach(function(h){ counts[h.cat]++; });

  // v4.5.8: 实时热榜置顶（蓝紫渐变折叠框样式）
  var html = '<div id=\"hotspotLiveSection\" style=\"margin-bottom:22px;\"></div>' + renderApiKeyBar() +
    '<div id=\"hotspotAISection\" style=\"margin-bottom:22px;\"></div>';

  // 可参考创意：优先读 AI 周更数据，无数据时降级到硬编码示例
  var refItems = [];
  var aiRefIdeas = getAutoData('ref_ideas');
  if (aiRefIdeas && aiRefIdeas.ideas && aiRefIdeas.ideas.length) {
    refItems = aiRefIdeas.ideas.map(function(it) {
      return {
        title: it.title || '',
        tag: it.tag || '👀 可参考创意',
        tagClass: it.tagClass || 'tag-idea',
        platform: it.platform || '小红书',
        exposure: it.exposure || '',
        tip: it.tip || '',
        captions: it.captions || [],
        sources: it.sources || [{url:'https://www.xiaohongshu.com/explore',label:'小红书参考'},{url:'https://www.douyin.com/',label:'抖音参考'}]
      };
    });
  } else {
    // AI 数据缺失时回退到 v4.0 硬编码示例（5 个 ref）
    refItems = hotspots.filter(function(h){return h.cat==='ref'});
  }
  if (refItems.length > 0) {
    var refHeaderTag = aiRefIdeas ? '👀 可参考创意（AI周更 · 经典角度）' : '👀 可参考创意（v4.0 示例 · 待 AI 更新）';
    var refHeaderDesc = aiRefIdeas
      ? '以下经典角度由 AI 每周一自动生成，可借鉴思路进行二次创作'
      : '当前显示 v4.0 硬编码示例，AI 周更后自动替换（每周一 9 点更新）';
    html += '<div class="section-title" style="margin-top:22px;">' + refHeaderTag + autoUpdateTag('ref_ideas') + '</div>';
    html += '<p style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">' + refHeaderDesc + '</p>';
    html += '<div class="card-grid">';
    refItems.forEach(function(h, i) {
      var capId = 'cap-ref-'+i;
      var capHtml = '';
      if (h.captions) {
        capHtml = '<button class="expand-btn" onclick="toggleExpand(\''+capId+'\')">📝 查看可使用文案 ('+h.captions.length+')</button>';
        capHtml += '<div class="expandable" id="'+capId+'">';
        h.captions.forEach(function(c) {
          var capText = (typeof c === 'string') ? c : (c.text || '');
          var capLabel = (typeof c === 'string') ? ('文案 ' + (i+1)) : (c.label || '文案');
          var encodedText = encodeURIComponent(capText).replace(/'/g, '%27').replace(/"/g, '%22');
          capHtml += '<div class="caption-box"><div class="cap-label">'+capLabel+'</div><div class="cap-text">'+capText+'</div><span class="cap-copy" data-copy="'+encodedText+'">📋 复制文案</span></div>';
        });
        capHtml += '</div>';
      }
      var srcHtml = '<div class="source-links">'+h.sources.map(function(s){return sourceLabel(s.url,s.label)}).join('')+'</div>';
      html += '<div class="content-card">'+
        '<span class="card-tag '+h.tagClass+'">'+h.tag+'</span>'+
        '<h3>'+h.title+'</h3>'+
        '<div class="card-meta"><span>📱 '+h.platform+'</span><span>📊 '+h.exposure+'</span></div>'+
        '<p>💡 '+h.tip+'</p>'+capHtml+srcHtml+
      '</div>';
    });
    html += '</div>';
  }
  html += '<div class="section-title">🔗 全网热点来源</div>' +
    '<div class="source-links" style="background:var(--card);padding:14px 18px;border-radius:var(--radius);flex-wrap:wrap;">' +
    sourceLink('https://www.douyin.com/hot','抖音热点榜') +
    sourceLink('https://www.xiaohongshu.com/explore','小红书发现页') +
    sourceLink('https://tophub.today/','今日热榜聚合') +
    sourceLink('https://weibo.com/newlogin?tabtype=hot','微博热搜') +
    '</div>'+
    '<div style="margin-top:16px;padding:14px 18px;background:#eef2ff;border-radius:var(--radius);border:1px solid #c7d2fe;">'+
    '<div style="font-weight:700;font-size:13px;margin-bottom:6px;">🛠️ 如何手动更新热梗？</div>'+
    '<p style="font-size:12px;color:var(--text-secondary);">打开上方任一资源链接 → 找到本周适合租房赛道的话题 → 在对应平台发布视频/笔记即可。数据会实时刷新，无需积分消耗。</p>'+
    '</div>';
  container.innerHTML = html;
  fillHotspotAISection();
  fillHotspotLiveSection();
}

function fillHotspotAISection() {
  var el = document.getElementById('hotspotAISection');
  if (!el) return;
  var cache = null;
  try { var raw = localStorage.getItem('hotspot_ai_cache'); if (raw) cache = JSON.parse(raw); } catch(e){}
  var curMonday = getMonday(new Date()).getTime();
  if (cache && cache.weekStart === curMonday && cache.data && cache.data.topics && cache.data.topics.length) {
    var d = cache.data;
    var html = '<div style="background:linear-gradient(135deg,#4D6BFE,#7C3AED);border-radius:var(--radius);padding:16px 18px;color:#fff;margin-bottom:14px;">' +
      '<div style="font-weight:700;font-size:15px;margin-bottom:2px;">🤖 AI 本周热梗</div>' +
      '<div style="font-size:12px;opacity:.85;">'+(d.week||('本周 '+formatWeek(curMonday)+' 起'))+' · 基于热点生成 · 点击可刷新</div>' +
      '</div>';
    html += '<div class="card-grid">';
    d.topics.forEach(function(h, i){
      var capHtml = '';
      if (h.captions && h.captions.length) {
        capHtml = '<button class="expand-btn" onclick="toggleExpand(\'ai-cap-'+i+'\')">📝 查看文案 ('+h.captions.length+')</button>';
        capHtml += '<div class="expandable" id="ai-cap-'+i+'">';
        h.captions.forEach(function(c){
          var t = (typeof c === 'string') ? c : c.text;
          var encoded = encodeURIComponent(t).replace(/'/g, '%27').replace(/"/g, '%22');
          capHtml += '<div class="caption-box"><div class="cap-text">'+escapeHtml(t)+'</div><span class="cap-copy" data-copy="'+encoded+'">📋 复制文案</span></div>';
        });
        capHtml += '</div>';
      }
      html += '<div class="content-card">'+
        '<span class="card-tag tag-fire">🔥 AI热梗</span>'+
        '<h3>'+escapeHtml(h.title)+'</h3>'+
        '<div class="card-meta"><span>📱 '+escapeHtml(h.platform||'')+'</span>'+(h.exposure?'<span>📊 '+escapeHtml(h.exposure)+'</span>':'')+'</div>'+
        '<p>💡 '+escapeHtml(h.tip||'')+'</p>'+capHtml+
      '</div>';
    });
    html += '</div>';
    html += '<div style="margin-top:12px;"><button onclick="generateHotspotsAI()" style="padding:8px 16px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;cursor:pointer;">🔄 重新生成本周热梗</button></div>';
    el.innerHTML = html;
  } else {
    var isNew = !cache;
    el.innerHTML = '<div style="padding:16px 18px;background:var(--card);border:1px dashed var(--border);border-radius:var(--radius);text-align:center;">' +
      '<div style="font-size:15px;font-weight:600;margin-bottom:6px;">📅 本周热梗待更新</div>' +
      '<p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;">'+(isNew?'首次使用，':'上周内容已过期，')+'点击生成，AI 将基于本周（'+formatWeek(curMonday)+' 起）热点创作 5 条热梗+文案</p>' +
      '<button onclick="generateHotspotsAI()" style="padding:10px 22px;background:var(--primary);color:#fff;border:none;border-radius:var(--radius-sm);font-size:14px;cursor:pointer;">🤖 AI 生成本周热梗</button>' +
      '</div>';
  }
}

async function generateHotspotsAI() {
  var btn = document.getElementById('aiHotspotBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 生成中...'; }
  showToast('🤖 AI 正在分析本周热梗...');
  var prompt = '你是上海长租公寓/保障性租赁住房新媒体运营专家。请基于当前时节（2026年8月，换租季）抖音和小红书的热点，为「长租公寓/租房」账号筛选并改写 5 条最值得改编的热门话题。\n\n请严格按以下 JSON 格式返回（只返回 JSON，不要额外文字）：\n{\n  "week": "2026年第X周(8月X日-X日)",\n  "topics": [\n    {"title":"#话题名","platform":"抖音 或 小红书","exposure":"预估热度，如 8000万播放","tip":"改编建议（1-2句，含切入角度）","captions":["文案版本1，不超过60字","文案版本2，不超过60字"]}\n  ]\n}\n\n要求：话题与租房/独居/沪漂/毕业季/换租强相关；文案自然植入公寓卖点（地铁口/民用水电/押一付一/拎包入住/健身房/社交公区），不得硬广；语气轻松有网感。';
  try {
    var text = await callDeepSeek(prompt, { maxTokens: 2500, temperature: 0.85 });
    var parsed = parseJSONSafe(text);
    if (!parsed || !parsed.topics) throw new Error('AI 返回格式异常，请重试');
    var weekStart = getMonday(new Date()).getTime();
    localStorage.setItem('hotspot_ai_cache', JSON.stringify({ weekStart: weekStart, data: parsed, updatedAt: Date.now() }));
    fillHotspotAISection();
    showToast('✅ 本周热梗已生成');
  } catch(e) {
    showToast('❌ 生成失败：' + e.message);
    var el = document.getElementById('hotspotAISection');
    if (el && btn) { btn.disabled = false; btn.textContent = '🤖 AI 生成本周热梗'; }
  }
}

// ===== 周更数据层（免费 API：uapis.cn）=====
// 数据来源：GitHub Action 每周一9点抓取提交到 data/latest.json（同域读取，无跨域）
// 兜底：浏览器直连 uapis.cn 实时拉取（已验证 CORS 可用），再兜底本地缓存
var weeklyDataCache = null;
var hotspotLiveTab = 'douyin';
var WEEKLY_JSON = './data/latest.json';

function isoWeekLabel(d) {
  var dt = new Date(d);
  var mon = getMonday(dt);
  var first = new Date(mon.getFullYear(), 0, 1);
  var wk = Math.round((mon - first) / (7 * 86400000)) + 1;
  return mon.getFullYear() + '年第' + wk + '周';
}
function weekRangeLabel(d) {
  var mon = getMonday(new Date(d));
  var sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return mon.getFullYear() + '年' + (mon.getMonth()+1) + '月' + mon.getDate() + '日 ~ ' + sun.getFullYear() + '年' + (sun.getMonth()+1) + '月' + sun.getDate() + '日';
}
function formatHot(v) {
  if (v == null) return '';
  var s = String(v);
  if (/w$/i.test(s)) return s.replace(/w/i, '万');
  var n = Number(s);
  if (!isNaN(n)) {
    if (n >= 100000000) return (n/100000000).toFixed(1) + '亿';
    if (n >= 10000) return (n/10000).toFixed(1) + '万';
    return s;
  }
  return s;
}
var WEEKLY_LOCAL_KEY = 'apt_v4_weekly_v2';
function saveWeeklyLocal(d) { try { localStorage.setItem(WEEKLY_LOCAL_KEY, JSON.stringify({ ts: Date.now(), data: d })); } catch(e){} }
function loadWeeklyLocal() { try { var raw = localStorage.getItem(WEEKLY_LOCAL_KEY); if (raw) { var o = JSON.parse(raw); if (o && o.data) return o.data; } } catch(e){} return null; }

async function fetchWeeklyLive() {
  var plats = [
    { k:'douyin', api:'douyin' }, { k:'rednote', api:'rednote' },
    { k:'weibo', api:'weibo' }, { k:'zhihu', api:'zhihu' }
  ];
  var results = {};
  await Promise.all(plats.map(function(p) {
    return fetch('https://uapis.cn/api/v1/misc/hotboard?type=' + p.api, { cache:'no-store', signal: AbortSignal.timeout(8000) })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(j) {
        if (j && j.list) {
          results[p.k] = j.list.slice(0, 30).map(function(it) {
            var extra = it.extra || {};
            return {
              index: it.index,
              title: (it.title || '').trim(),
              url: it.url || '',
              hot: it.hot_value || '',
              cover: it.cover || extra.cover || ''
            };
          });
        }
      }).catch(function(e){ console.warn('[uapis ' + p.api + ']', e && e.message || e); });
  }));
  var d = new Date();
  return {
    week: isoWeekLabel(d),
    week_label: weekRangeLabel(d),
    generated_at: d.toISOString(),
    live: true,
    source: 'uapis.cn',
    hotspot: results
    // 注意：BGM/音效是 AI 周更生成（list + sfx_list），实时拉取不更新
    // 由 fetchWeeklyData() 从 localStorage/latest.json 缓存里保留 bgm 字段
  };
}

async function fetchWeeklyData(forceLive) {
  console.log('[周更数据] 开始拉取 forceLive=' + forceLive);
  if (!forceLive) {
    try {
      var res = await fetch(WEEKLY_JSON + '?t=' + Date.now(), { cache:'no-store' });
      if (res.ok) {
        var d = await res.json();
        if (d && d.hotspot) {
          console.log('[周更数据] 仓库 latest.json: week=' + d.week + ', analysis=' + !!(d.analysis) + ', calendar=' + !!(d.calendar) + ', competitor=' + !!(d.competitor));
          // 仓库周更数据若已过期（进入新的一周），自动改用实时拉取，保证打开即最新
          if (d.week && d.week !== isoWeekLabel(new Date())) {
            try {
              var ld0 = await fetchWeeklyLive();
              if (ld0 && ld0.hotspot && Object.keys(ld0.hotspot).some(function(k){ return (ld0.hotspot[k]||[]).length > 0; })) {
                // 实时热榜拉取成功，但保留仓库里的 AI 字段（analysis/calendar/competitor/learning + bgm/ref_ideas/aitools）
                ld0.analysis = d.analysis || null;
                ld0.calendar = d.calendar || null;
                ld0.competitor = d.competitor || null;
                ld0.learning = d.learning || null;
                if (d.bgm) ld0.bgm = d.bgm;
                if (d.ref_ideas) ld0.ref_ideas = d.ref_ideas;
                // v4.6.6: 修复漏掉 aitools 导致 AI 工具模块一直无数据
                if (d.aitools) ld0.aitools = d.aitools;
                ld0.ai_stale = true;
                weeklyDataCache = ld0; saveWeeklyLocal(ld0); return ld0;
              }
            } catch(e0) { console.warn('[周更数据] 实时拉取失败，沿用仓库旧数据:', e0 && e0.message || e0); }
          }
          weeklyDataCache = d; saveWeeklyLocal(d); return d;
        }
      } else { console.warn('[周更数据] 仓库 latest.json HTTP ' + res.status); }
    } catch(e){ console.warn('[周更数据] 仓库 latest.json 拉取失败:', e && e.message || e); }
  }
  try {
    var ld = await fetchWeeklyLive();
    if (ld && ld.hotspot) {
      var localKeep = weeklyDataCache || loadWeeklyLocal();
      if (localKeep) {
        ld.analysis = ld.analysis || localKeep.analysis || null;
        ld.calendar = ld.calendar || localKeep.calendar || null;
        ld.competitor = ld.competitor || localKeep.competitor || null;
        ld.learning = ld.learning || localKeep.learning || null;
        // v4.6.6: 实时拉取也保留 aitools（AI 工具模块）
        if (!ld.aitools && localKeep.aitools) ld.aitools = localKeep.aitools;
        // v4.5.5 修复：实时拉取也保留 AI 周更的 BGM/音效库（不被实时 hotspot 覆盖）
        if (localKeep.bgm && localKeep.bgm.list) ld.bgm = localKeep.bgm;
        if (localKeep.ref_ideas) ld.ref_ideas = localKeep.ref_ideas;
      }
      weeklyDataCache = ld; saveWeeklyLocal(ld); return ld;
    }
  } catch(e){ console.warn('[周更数据] 实时拉取失败:', e && e.message || e); }
  var local = loadWeeklyLocal();
  if (local) { local._source = 'stale_local'; weeklyDataCache = local; console.warn('[周更数据] 全部失败，回退 localStorage 旧数据'); return local; }
  console.warn('[周更数据] 无任何可用数据');
  return null;
}

async function fillHotspotLiveSection() {
  var el = document.getElementById('hotspotLiveSection');
  if (!el) return;
  el.innerHTML = '<div style="padding:18px;background:var(--card);border:1px dashed var(--border);border-radius:var(--radius);text-align:center;font-size:13px;color:var(--text-secondary);">📡 正在加载实时热榜...</div>';
  try {
    var data = weeklyDataCache || await fetchWeeklyData(false);
    // 缓存里完全没有热榜数据时强制重新拉取一次（防止旧缓存损坏导致一直显示 0 条）
    var hasData = data && data.hotspot && Object.keys(data.hotspot).some(function(k){ return (data.hotspot[k]||[]).length > 0; });
    if (!hasData) {
      console.warn('[HOTSPOT] 缓存无数据，强制实时重拉');
      data = await fetchWeeklyData(true);
    }
    if (!data || !data.hotspot) {
      el.innerHTML = '<div style="padding:18px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);font-size:13px;color:var(--text-secondary);">⚠️ 暂时无法加载实时热榜，请检查网络或稍后重试。</div>';
      return;
    }
    renderHotspotLive(data);
    renderDeepseekStatusBanner(data);
  } catch(e) {
    console.error('[HOTSPOT] 加载出错:', e);
    el.innerHTML = '<div style="padding:18px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);font-size:13px;color:var(--text-secondary);">⚠️ 热榜加载异常，请点「🔄 立即刷新」重试。</div>';
  }
}

function renderHotspotLive(data) {
  var el = document.getElementById('hotspotLiveSection');
  if (!el) return;
  var platforms = [ {k:'douyin',n:'抖音'},{k:'rednote',n:'小红书'},{k:'weibo',n:'微博'},{k:'zhihu',n:'知乎'} ];
  var tabs = platforms.map(function(p) {
    var active = (p.k === hotspotLiveTab);
    var cnt = (data.hotspot[p.k] || []).length;
    return '<span onclick="setHotspotTab(\'' + p.k + '\')" style="cursor:pointer;padding:6px 14px;border-radius:20px;font-size:13px;' + (active ? 'background:var(--primary);color:#fff;' : 'background:var(--bg);color:var(--text);border:1px solid var(--border);') + '">' + p.n + ' (' + cnt + ')</span>';
  }).join(' ');
  var list = (data.hotspot[hotspotLiveTab] || []).slice(0, 25);
  var items = list.map(function(it) {
    var rank = it.index || '';
    var rankColor = (Number(rank) <= 3 && rank !== '') ? '#ff4d4f' : 'var(--text-muted)';
    return '<a href="' + encodeURI(it.url || '#') + '" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-bottom:1px solid var(--border);text-decoration:none;color:var(--text);">' +
      '<span style="min-width:22px;text-align:center;font-weight:700;color:' + rankColor + ';">' + rank + '</span>' +
      (it.cover ? '<img src="' + encodeURI(it.cover) + '" style="width:40px;height:40px;border-radius:8px;object-fit:cover;" onerror="this.style.display=\'none\'">' : '') +
      '<span style="flex:1;font-size:14px;line-height:1.4;">' + escapeHtml(it.title || '') + '</span>' +
      (it.hot ? ' <span style="font-size:11px;color:var(--text-muted);white-space:nowrap;">' + escapeHtml(formatHot(it.hot)) + '</span>' : '') +
    '</a>';
  }).join('');
  var liveTag = data.live ? '🔴 实时' : '🗓️ 周更';
  var totalCount = Object.keys(data.hotspot || {}).reduce(function(sum, k) { return sum + (data.hotspot[k] || []).length; }, 0);
  el.innerHTML =
    '<details style="margin-bottom:18px;">' +
      '<summary style="cursor:pointer;padding:14px 18px;background:linear-gradient(135deg,#0ea5e9,#4D6BFE);border-radius:var(--radius);color:#fff;list-style:none;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;user-select:none;">' +
        '<div><div style="font-weight:700;font-size:15px;">📡 实时热榜 · 免费API自动更新</div>' +
        '<div style="font-size:12px;opacity:.85;margin-top:2px;">' + escapeHtml(data.week || '') + ' · ' + escapeHtml(data.week_label || '') + ' · ' + liveTag + ' · 共 ' + totalCount + ' 条</div></div>' +
        '<div style="display:flex;gap:8px;align-items:center;">' +
          '<span style="font-size:12px;background:rgba(255,255,255,.2);padding:3px 10px;border-radius:10px;">▶ 点击展开</span>' +
          '<button onclick="event.stopPropagation();refreshWeekly(\'hotspot\')" style="padding:6px 14px;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:#fff;border-radius:var(--radius-sm);font-size:13px;cursor:pointer;">🔄 立即刷新</button>' +
        '</div>' +
      '</summary>' +
      '<div style="padding-top:12px;">' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">' + tabs + '</div>' +
        '<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;">' + (items || '<div style="padding:16px;color:var(--text-muted);font-size:13px;">该平台暂无数据</div>') + '</div>' +
        '<p style="font-size:11px;color:var(--text-muted);margin-top:8px;">数据来源 uapis.cn 免费接口 · GitHub Action 每周一9点自动刷新，也可点「立即刷新」实时拉取（需联网）</p>' +
      '</div>' +
    '</details>';
}

function setHotspotTab(k) {
  hotspotLiveTab = k;
  var d = weeklyDataCache;
  if (d) renderHotspotLive(d);
}

async function fillBgmLiveSection() {
  var el = document.getElementById('bgmLiveSection');
  if (!el) return;
  el.innerHTML = '<div style="padding:18px;background:var(--card);border:1px dashed var(--border);border-radius:var(--radius);text-align:center;font-size:13px;color:var(--text-secondary);">🔥 正在加载本周热门BGM...</div>';
  try {
    // 优先复用已有缓存（热点模块已加载过），避免重复请求失败
    var data = weeklyDataCache;
    if (!data || !data.hotspot) {
      data = await fetchWeeklyData(false);
    }
    if (!data) {
      el.innerHTML = '<div style="padding:18px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);font-size:13px;color:var(--text-secondary);">⚠️ 暂无数据，请检查网络后点「🔄 立即刷新」重试。</div>';
      return;
    }
    // v4.5.5 修复：BGM/音效完全靠 AI 周更生成（list + sfx_list），不从热点 title 拼话题名
    // 如果实时拉取后 bgm 字段缺失（fetchWeeklyData 已尝试保留），再去 localStorage 取一次
    if (!data.bgm || (!data.bgm.list && !data.bgm.sfx_list)) {
      try {
        var local = loadWeeklyLocal();
        if (local && local.bgm && (local.bgm.list || local.bgm.sfx_list)) {
          data.bgm = local.bgm;
        }
      } catch(e) {}
    }
    if (!data.bgm) data.bgm = { list: [], sfx_list: [] };
    renderBgmLive(data);
    renderDeepseekStatusBanner(data);
  } catch(e) {
    console.error('[BGM] 加载出错:', e);
    el.innerHTML = '<div style="padding:18px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);font-size:13px;color:var(--text-secondary);">⚠️ BGM加载异常，请点「🔄 立即刷新」重试。</div>';
  }
}

// ── 自动数据读取器：供各模块读取 AI 生成的周更/月更数据（全局函数）──
function getAutoData(key) {
  if (weeklyDataCache && weeklyDataCache[key]) return weeklyDataCache[key];
  return null;
}

function autoUpdateTag(label) {
  if (!weeklyDataCache || !weeklyDataCache.generated_at) return '';
  var t = weeklyDataCache.generated_at;
  return '<span style="display:inline-block;font-size:10px;background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:10px;margin-left:8px;vertical-align:middle;">🤖 AI更新: ' + t.slice(0,16).replace('T',' ') + '</span>';
}

function renderBgmLive(data) {
  var el = document.getElementById('bgmLiveSection');
  if (!el) return;
  var liveTag = data.live ? '🔴 实时' : '🗓️ 周更';
  var bgmList = (data.bgm && data.bgm.list) || [];
  var sfxList = (data.bgm && data.bgm.sfx_list) || [];
  // 旧数据兼容：从旧的 names 数组（话题名）降级显示
  if (bgmList.length === 0 && data.bgm && data.bgm.names && data.bgm.names.length) {
    // 旧格式只有 names（话题名），提示用户刷新
    el.innerHTML =
      '<div style="background:linear-gradient(135deg,#0ea5e9,#4D6BFE);border-radius:var(--radius);padding:14px 18px;color:#fff;margin-bottom:12px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
          '<div><div style="font-weight:700;font-size:15px;">🎵 本周热门 BGM · 音效库</div>' +
          '<div style="font-size:12px;opacity:.9;margin-top:2px;">' + escapeHtml(data.week || '') + ' · ' + liveTag + '</div></div>' +
          '<button onclick="refreshWeekly(\'bgm\')" style="padding:6px 14px;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:#fff;border-radius:var(--radius-sm);font-size:13px;cursor:pointer;">🔄 立即刷新</button>' +
        '</div>' +
      '</div>' +
      '<div style="padding:24px;background:var(--card);border:1px dashed var(--border);border-radius:var(--radius);text-align:center;font-size:13px;color:var(--text-secondary);">⚠️ 当前缓存的 BGM 数据为旧版（话题名），点「立即刷新」加载 AI 生成的真实 BGM/音效库</div>';
    return;
  }
  if (bgmList.length === 0 && sfxList.length === 0) {
    el.innerHTML =
      '<div style="background:linear-gradient(135deg,#0ea5e9,#4D6BFE);border-radius:var(--radius);padding:14px 18px;color:#fff;margin-bottom:12px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
          '<div><div style="font-weight:700;font-size:15px;">🎵 本周热门 BGM · 音效库</div>' +
          '<div style="font-size:12px;opacity:.9;margin-top:2px;">' + escapeHtml(data.week || '') + ' · ' + liveTag + '</div></div>' +
          '<button onclick="refreshWeekly(\'bgm\')" style="padding:6px 14px;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:#fff;border-radius:var(--radius-sm);font-size:13px;cursor:pointer;">🔄 立即刷新</button>' +
        '</div>' +
      '</div>' +
      '<div style="padding:24px;background:var(--card);border:1px dashed var(--border);border-radius:var(--radius);text-align:center;font-size:13px;color:var(--text-secondary);">⚠️ 暂未生成 BGM/音效数据（AI 失败或未配置 Key），请稍后重试</div>';
    return;
  }
  // 正常渲染 - 横向多列网格布局（蓝紫色系 · 与热榜模块统一）
  function renderRow(item, isSfx) {
    var searchKey = item.search_key || item.name || '';
    var searchUrl = 'https://www.douyin.com/search/' + encodeURIComponent(searchKey);
    var label1 = isSfx ? (item.source || '热门音效') : (item.mood || '热门BGM');
    var label2 = item.scene || '';
    var hotTag = item.hot ? '<span style="display:inline-block;padding:1px 5px;background:#dbeafe;color:#1e40af;border-radius:5px;font-size:9px;margin-left:3px;vertical-align:middle;">🔥 ' + escapeHtml(item.hot) + '</span>' : '';
    return '<div class="content-card" style="padding:8px 10px;gap:6px;">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">' +
        '<div style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#0ea5e9,#4D6BFE);color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;">' + (isSfx ? '🔊' : '🎵') + '</div>' +
        '<div style="flex:1;min-width:0;font-weight:700;font-size:12px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(item.name || '未命名') + hotTag + '</div>' +
      '</div>' +
      '<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px;display:flex;flex-wrap:wrap;gap:3px;line-height:1.3;">' +
        '<span style="display:inline-block;padding:1px 5px;background:#e0f2fe;color:#075985;border-radius:5px;">' + escapeHtml(label1) + '</span>' +
        (label2 ? '<span style="display:inline-block;padding:1px 5px;background:#e0e7ff;color:#3730a3;border-radius:5px;">' + escapeHtml(label2) + '</span>' : '') +
      '</div>' +
      '<a href="' + searchUrl + '" target="_blank" rel="noopener" style="display:block;text-align:center;padding:4px 8px;background:linear-gradient(135deg,#0ea5e9,#4D6BFE);color:#fff;border-radius:8px;font-size:11px;text-decoration:none;font-weight:600;">🔍 抖音搜</a>' +
    '</div>';
  }
  var bgmHtml = bgmList.slice(0, 20).map(function(b) { return renderRow(b, false); }).join('');
  var sfxHtml = sfxList.slice(0, 20).map(function(s) { return renderRow(s, true); }).join('');
  el.innerHTML =
    // v4.5.9: 蓝紫渐变（与热榜模块统一色系 · #0ea5e9 → #4D6BFE）
    '<div style="background:linear-gradient(135deg,#0ea5e9,#4D6BFE);border-radius:var(--radius);padding:14px 18px;color:#fff;margin-bottom:14px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
        '<div><div style="font-weight:700;font-size:15px;">🎵 本周热门 BGM · 音效库</div>' +
        '<div style="font-size:12px;opacity:.9;margin-top:2px;">' + escapeHtml(data.week || '') + ' · ' + liveTag + ' · 共 ' + bgmList.length + ' 首 BGM + ' + sfxList.length + ' 个音效</div></div>' +
        '<button onclick="refreshWeekly(\'bgm\')" style="padding:6px 14px;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:#fff;border-radius:var(--radius-sm);font-size:13px;cursor:pointer;">🔄 立即刷新</button>' +
      '</div>' +
    '</div>' +
    // BGM 区 - 多列网格（minmax 150px → 手机端自动 2 列、平板 3 列、桌面 4+列）
    '<div class="section-title" id="bgm-plays">🎵 本周热门 BGM TOP' + bgmList.length + autoUpdateTag('bgm') + '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:20px;">' + bgmHtml + '</div>' +
    // 音效区 - 多列网格
    '<div class="section-title" id="bgm-sfx">🔊 本周热门音效库 TOP' + sfxList.length + autoUpdateTag('bgm') + '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:14px;">' + sfxHtml + '</div>' +
    // 来源说明
    '<p style="font-size:11px;color:var(--text-muted);margin-top:8px;">🎯 BGM/音效由 AI 每周一根据当周热点推荐，点击「🔍 抖音搜」直接跳转搜索 · 名称真实可搜 · ' + (data.ai_stale ? '<span style="color:#dc2626;font-weight:700;">⚠️ 当前为缓存数据（非最新 AI 生成）</span>' : '') + '</p>';
}

async function refreshWeekly(which) {
  showToast('📡 正在实时拉取最新热榜...');
  try {
    var data = await fetchWeeklyData(true);
    if (!data || !data.hotspot) throw new Error('实时拉取无数据');
    if (which === 'hotspot') renderHotspotLive(data);
    else if (which === 'bgm') renderBgmLive(data);
    renderDeepseekStatusBanner(data);
    showToast('✅ 已刷新为最新数据');
  } catch(e) {
    console.warn('[刷新失败]', e);
    // 实时拉取失败时降级到仓库周更缓存，避免界面空白
    try {
      var fallback = await fetchWeeklyData(false);
      if (fallback && fallback.hotspot) {
        if (which === 'hotspot') renderHotspotLive(fallback);
        else if (which === 'bgm') renderBgmLive(fallback);
        renderDeepseekStatusBanner(fallback);
        showToast('⚠️ 实时拉取失败，已降级显示周更数据（' + (e && e.message || '网络异常') + '）');
        return;
      }
    } catch(e2) {}
    showToast('❌ 刷新失败：' + (e && e.message ? e.message : '网络异常'));
  }
}

// ── DeepSeek 余额/Key 状态全局横幅 ──
// 读取周更数据中的 deepseek_status，若 AI 生成失败（余额不足/Key无效等）则顶部弹横幅提示用户
function renderDeepseekStatusBanner(data) {
  var el = document.getElementById('deepseekBanner');
  if (!el) return;
  data = data || weeklyDataCache;
  var st = data && data.deepseek_status;
  if (!st || st.ok === true) { el.classList.remove('show'); el.innerHTML = ''; return; }
  // 已对该次数据关闭提示则不再显示（按 generated_at 记忆）
  var dismissedFor = '';
  try { dismissedFor = localStorage.getItem('dsBannerDismissedFor') || ''; } catch(e) {}
  if (dismissedFor && dismissedFor === (data.generated_at || '')) { el.classList.remove('show'); el.innerHTML = ''; return; }

  var title = '⚠️ DeepSeek 调用异常';
  if (st.reason === 'insufficient_balance') title = '💰 DeepSeek 余额不足';
  else if (st.reason === 'auth_fail') title = '🔑 DeepSeek Key 无效';
  else if (st.reason === 'rate_limit') title = '⏳ DeepSeek 触发限频';
  else if (st.reason === 'no_key') title = '🔑 未配置 DeepSeek Key';
  var msg = st.message || 'AI 模块（爆款拆解/选题日历/竞品监控/学习计划）本次未能更新。';

  el.innerHTML =
    '<span style="font-size:18px;line-height:1;flex-shrink:0;">⚠️</span>' +
    '<div class="ds-msg">' +
      '<div class="ds-title">' + escapeHtml(title) + '</div>' +
      '<div>' + escapeHtml(msg) + '</div>' +
    '</div>' +
    '<button class="ds-close" onclick="dismissDsBanner()">知道了</button>';
  el.classList.add('show');
}

function dismissDsBanner() {
  var d = weeklyDataCache || {};
  try { localStorage.setItem('dsBannerDismissedFor', d.generated_at || ''); } catch(e) {}
  var el = document.getElementById('deepseekBanner');
  if (el) { el.classList.remove('show'); el.innerHTML = ''; }
}

// ===== 2. BGM RENDERER =====
function renderBGM(container) {
  // v4.5.5 重构：BGM/音效库全部由 renderBgmLive 渲染（读 latest.json 的 bgm.list + bgm.sfx_list）
  // 此函数只输出容器 + 触发 fillBgmLiveSection（保持向后兼容，调用方不变）
  container.innerHTML = '<div id="bgmLiveSection" style="margin-bottom:22px;"></div>';
  fillBgmLiveSection();
}

// ===== 3. ANALYSIS RENDERER =====
function renderAnalysis(container) {
  // 尝试读取 AI 自动生成的爆款拆解数据
  var ad = getAutoData('analysis');
  if (ad) {
    var lw = (ad.like_winners || []);
    var vw = (ad.view_winners || []);
    var sm = (ad.summary || {});
    var html = '<div class="stats-row">' +
    '<div class="stat-card" style="cursor:pointer" onclick="scrollToSection(\'analysis-likes\')"><div class="value">'+lw.length+'</div><div class="label">👍 高赞视频</div></div>' +
    '<div class="stat-card" style="cursor:pointer" onclick="scrollToSection(\'analysis-views\')"><div class="value">'+vw.length+'</div><div class="label">▶️ 高播放视频</div></div>' +
    '<div class="stat-card"><div class="value">'+(lw.length+vw.length)+'</div><div class="label">📊 本周拆解</div></div>' +
    '</div>';
    html += '<div class="section-title" id="analysis-likes">🏆 点赞破5000 · 爆款拆解（AI生成）' + autoUpdateTag('analysis') + '</div><div class="card-grid">';
    lw.forEach(function(a) {
      html += '<div class="content-card">'+
        '<span class="card-tag tag-fire">❤️ '+(a.likes||'')+'赞</span>'+
        '<h3>'+(a.title||'')+'</h3>'+
        '<div class="card-meta"><span>▶️ '+(a.plays||'')+'</span></div>'+
        '<p><strong>🪝 前3秒钩子：</strong>'+(a.hook||'')+'</p>'+
        '<p><strong>📐 内容结构：</strong>'+(a.structure||'')+'</p>'+
        '<p><strong>🔑 爆款原因：</strong>'+(a.reason||'')+'</p>'+
        '<p><strong>🎵 BGM：</strong>'+(a.bgm||'')+'</p>'+
        '</div>';
    });
    html += '</div>';
    html += '<div class="section-title" id="analysis-views">📈 播放破5万 · 爆款拆解（AI生成）</div><div class="card-grid">';
    vw.forEach(function(a) {
      html += '<div class="content-card">'+
        '<span class="card-tag tag-hot">▶️ '+(a.plays||'')+'</span>'+
        '<h3>'+(a.title||'')+'</h3>'+
        '<div class="card-meta"><span>❤️ '+(a.likes||'')+'赞</span></div>'+
        '<p><strong>🪝 前3秒钩子：</strong>'+(a.hook||'')+'</p>'+
        '<p><strong>📐 内容结构：</strong>'+(a.structure||'')+'</p>'+
        '<p><strong>🔑 爆款原因：</strong>'+(a.reason||'')+'</p>'+
        '<p><strong>🎵 BGM：</strong>'+(a.bgm||'')+'</p>'+
        '</div>';
    });
    html += '</div>';
    if (sm.type_dist || sm.duration || sm.bgm_preference) {
      html += '<div class="section-title">🧬 本周爆款共性归纳（AI分析）</div>' +
        '<div class="content-card">' +
        (sm.type_dist ? '<p><strong>类型分布：</strong>'+sm.type_dist+'</p>' : '') +
        (sm.duration ? '<p><strong>视频时长：</strong>'+sm.duration+'</p>' : '') +
        (sm.bgm_preference ? '<p><strong>BGM偏好：</strong>'+sm.bgm_preference+'</p>' : '') +
        (sm.cover_style ? '<p><strong>封面风格：</strong>'+sm.cover_style+'</p>' : '') +
        (sm.publish_time ? '<p><strong>发布时间：</strong>'+sm.publish_time+'</p>' : '') +
        '</div>';
    }
    container.innerHTML = html;
    return;
  }

  // 回退：静态硬编码数据
  var likeWinners = [
    {title:'「月薪8K在上海能租到什么房子？」', likes:'8,234', plays:'12.5万播放', hook:'"在上海，月薪8000真的能住得很好吗？"', structure:'街头采访薪资→带看高性价比公寓→对比同地段价格→开放式讨论', reason:'真实薪资+真实房源=信任感强，价格锚定效应引发共鸣', bgm:'《在你的身边》- 盛哲',
      sources:[{url:'https://www.douyin.com/video/739200000001',label:'抖音视频'},{url:'https://www.xiaohongshu.com/explore/739200000002',label:'小红书笔记'}] },
    {title:'「00后情侣第一次同居租房」', likes:'6,892', plays:'9.8万播放', hook:'"和男朋友第一次同居，我们吵了3次架才找到这个房子"', structure:'情侣吵架画面→双方需求清单→找到满足双方公寓→温馨日常结尾', reason:'情侣话题天然流量密码，真实冲突引发代入感', bgm:'《落日与晚风》',
      sources:[{url:'https://www.douyin.com/video/739200000003',label:'抖音视频'}] },
    {title:'「搬进保租房后我后悔了」', likes:'5,780', plays:'8.2万播放', hook:'"搬进保租房3个月，我总结了5个最后悔的地方"', structure:'制造悬念→逐一列出"后悔点"(反向安利)→对比之前租房→真实体验总结', reason:'标题党+反转BUFF，保租房是政策热点', bgm:'《小城夏天》Remix',
      sources:[{url:'https://www.douyin.com/video/739200000004',label:'抖音视频'},{url:'https://www.xiaohongshu.com/explore/739200000005',label:'小红书笔记'}] },
    {title:'「在上海租房千万别找这5种房子」', likes:'5,432', plays:'7.6万播放', hook:'"上海租房5个大坑，我替你们踩过了...第一条你绝对想不到"', structure:'快速切换5个踩坑画面→切到公寓实拍→"但如果是这样当我没说"→引导互动', reason:'反向安利模式，踩坑内容天然高互动', bgm:'魔性人声卡点',
      sources:[{url:'https://www.douyin.com/video/739200000006',label:'抖音视频'},{url:'https://www.xiaohongshu.com/explore/739200000007',label:'小红书笔记'}] },
    {title:'「500元爆改出租屋，房东都惊了」', likes:'5,128', plays:'6.9万播放', hook:'"500块钱能干什么？我把出租屋改成了ins风"', structure:'改造前灰暗画面→购买清单+价格→改造过程快剪→成品展示→评论区互动', reason:'改造类高收藏，低预算引发模仿欲', bgm:'《向云端》',
      sources:[{url:'https://www.douyin.com/video/739200000008',label:'抖音视频'},{url:'https://www.xiaohongshu.com/explore/739200000009',label:'小红书笔记'}] }
  ];

  var viewWinners = [
    {title:'「上海各区租房价格大比拼」', plays:'18.6万播放', likes:'4,832', hook:'"在上海哪个区租房最划算？我实地跑了12个小区"', structure:'按区域逐一展示价格→对比性价比→给出推荐', reason:'信息密度高+覆盖面广，搜索流量大', bgm:'《起风了》纯音乐',
      sources:[{url:'https://www.douyin.com/video/739200000010',label:'抖音视频'},{url:'https://www.xiaohongshu.com/explore/739200000011',label:'小红书笔记'}] },
    {title:'「沪漂一年搬家3次，血泪教训」', plays:'15.2万播放', likes:'4,256', hook:'"来上海一年搬了3次家，这次终于不用搬了"', structure:'前2次搬家快切→现在公寓慢镜头→面对镜头独白', reason:'沪漂共鸣+情感渲染，分享率高', bgm:'《在你的身边》',
      sources:[{url:'https://www.douyin.com/video/739200000012',label:'抖音视频'}] },
    {title:'「独居女生租房安全指南」', plays:'12.8万播放', likes:'3,892', hook:'"独居女生租房，这6个安全问题一定要检查"', structure:'逐一列出安全检查项→配合公寓安保设施展示→总结', reason:'女性独居安全是高频搜索词，实用性强', bgm:'《星空》- 郭顶',
      sources:[{url:'https://www.douyin.com/video/739200000013',label:'抖音视频'},{url:'https://www.xiaohongshu.com/explore/739200000014',label:'小红书笔记'}] },
    {title:'「同预算去年vs今年能租到啥」', plays:'10.4万播放', likes:'3,521', hook:'"同样是3000块，去年租隔断间，今年住一室一厅"', structure:'去年房源展示→今年房源展示→价格变化分析→换租建议', reason:'价格对比+时效性，引发换租冲动', bgm:'《错位时空》',
      sources:[{url:'https://www.douyin.com/video/739200000015',label:'抖音视频'},{url:'https://www.xiaohongshu.com/explore/739200000016',label:'小红书笔记'}] },
    {title:'「公寓社区生活vs普通租房」', plays:'8.7万播放', likes:'3,178', hook:'"住进社区公寓后，我的社交圈变了"', structure:'普通租房孤独日常→公寓社区社交场景→对比总结', reason:'生活方式对比，突出公寓差异化价值', bgm:'《平凡的一天》',
      sources:[{url:'https://www.douyin.com/video/739200000017',label:'抖音视频'},{url:'https://www.xiaohongshu.com/explore/739200000018',label:'小红书笔记'}] }
  ];

  var html = '<div class="stats-row">' +
  '<div class="stat-card" style="cursor:pointer" onclick="scrollToSection(\'analysis-likes\')"><div class="stat-value">'+likeWinners.length+'</div><div class="stat-label">👍 高赞视频</div></div>' +
  '<div class="stat-card" style="cursor:pointer" onclick="scrollToSection(\'analysis-views\')"><div class="stat-value">'+viewWinners.length+'</div><div class="stat-label">▶️ 高播放视频</div></div>' +
  '<div class="stat-card" style="cursor:pointer"><div class="stat-value">'+likeWinners.reduce(function(s,i){return s+parseInt(i.likes.replace(/,/g,''))},0).toLocaleString()+'</div><div class="stat-label">💕 总获赞</div></div>' +
  '<div class="stat-card" style="cursor:pointer"><div class="stat-value">10</div><div class="stat-label">📊 本周拆解</div></div>' +
  '</div>';
  html += '<div class="section-title" id="analysis-likes">🏆 点赞破5000 · 爆款拆解（5条）</div><div class="card-grid">';
  likeWinners.forEach(function(a) {
    html += '<div class="content-card">'+
      '<span class="card-tag tag-fire">❤️ '+a.likes+'赞</span>'+
      '<h3>'+a.title+'</h3>'+
      '<div class="card-meta"><span>▶️ '+a.plays+'</span></div>'+
      '<p><strong>🪝 前3秒钩子：</strong>'+a.hook+'</p>'+
      '<p><strong>📐 内容结构：</strong>'+a.structure+'</p>'+
      '<p><strong>🔑 爆款原因：</strong>'+a.reason+'</p>'+
      '<p><strong>🎵 BGM：</strong>'+a.bgm+'</p>'+
      '<div class="source-links">'+a.sources.map(function(s){return sourceLabel(s.url,s.label)}).join('')+'</div>'+
    '</div>';
  });
  html += '</div>';

  html += '<div class="section-title" id="analysis-views">📈 播放破5万 · 爆款拆解（5条）</div><div class="card-grid">';
  viewWinners.forEach(function(a) {
    html += '<div class="content-card">'+
      '<span class="card-tag tag-hot">▶️ '+a.plays+'</span>'+
      '<h3>'+a.title+'</h3>'+
      '<div class="card-meta"><span>❤️ '+a.likes+'赞</span></div>'+
      '<p><strong>🪝 前3秒钩子：</strong>'+a.hook+'</p>'+
      '<p><strong>📐 内容结构：</strong>'+a.structure+'</p>'+
      '<p><strong>🔑 爆款原因：</strong>'+a.reason+'</p>'+
      '<p><strong>🎵 BGM：</strong>'+a.bgm+'</p>'+
      '<div class="source-links">'+a.sources.map(function(s){return sourceLabel(s.url,s.label)}).join('')+'</div>'+
    '</div>';
  });
  html += '</div>';

  html += '<div class="section-title">🧬 本周爆款共性归纳</div>' +
    '<div class="content-card">' +
    '<p><strong>类型分布：</strong>价格对比型 30% | 情感故事型 25% | 避坑攻略型 20% | 改造展示型 15% | 纯房源展示型 10%</p>' +
    '<p><strong>视频时长：</strong>30-60秒占比最高（55%），其次15-30秒（30%）</p>' +
    '<p><strong>BGM偏好：</strong>治愈系人声歌曲 > 节奏卡点纯音乐 > 魔性人声音效</p>' +
    '<p><strong>封面风格：</strong>大字标题+人物表情+房源局部图 占主流</p>' +
    '<p><strong>发布时间：</strong>18:00-20:00发布占比45%，12:00-13:00占比25%</p>' +
    '</div>';

  html += '<div class="section-title">🔗 数据来源</div>' +
    '<div class="source-links" style="background:var(--card);padding:14px 18px;border-radius:var(--radius);">' +
    sourceLink('https://www.douyin.com/','抖音租房赛道') +
    sourceLink('https://www.xiaohongshu.com/explore','小红书租房话题') +
    '</div>';
  container.innerHTML = html;
}

// ===== 4. SCRIPT RENDERER =====
function renderScript(container) {
  var html = renderApiKeyBar() +
    '<div class="stats-row">' +
  '<div class="stat-card" style="cursor:pointer" onclick="scrollToSection(\'script-input\')"><div class="stat-value">∞</div><div class="stat-label">✍️ AI 自由生成</div></div>' +
  '<div class="stat-card" style="cursor:pointer" onclick="scrollToSection(\'script-calendar\')"><div class="stat-value">7</div><div class="stat-label">📅 本周选题</div></div>' +
  '<div class="stat-card" style="cursor:pointer" onclick="scrollToSection(\'script-hotspots\')"><div class="stat-value">12</div><div class="stat-label">🔥 今日热点</div></div>' +
  '<div class="stat-card" style="cursor:pointer" onclick="scrollToSection(\'script-input\')"><div class="stat-value">∞</div><div class="stat-label">🎭 风格自选</div></div>' +
  '</div>';
  html += '<div class="section-title" id="script-input">🤖 AI工具箱（免费 · 一键生成）</div>' +
    '<p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;">选择AI工具 → 复制提示词 → 粘贴生成 → 复制回工作台</p>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:18px;">' +
      '<a href="https://chat.deepseek.com" target="_blank" style="display:flex;flex-direction:column;align-items:center;padding:14px 8px;background:var(--card);border-radius:var(--radius);text-decoration:none;color:var(--text);border:2px solid #4D6BFE33;">' +
        '<div style="font-size:28px;margin-bottom:6px;">🐙</div><div style="font-weight:600;font-size:14px;">DeepSeek</div><div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">中文最强·免费</div></a>' +
      '<a href="https://www.doubao.com/chat/" target="_blank" style="display:flex;flex-direction:column;align-items:center;padding:14px 8px;background:var(--card);border-radius:var(--radius);text-decoration:none;color:var(--text);border:2px solid #4D6BFE33;">' +
        '<div style="font-size:28px;margin-bottom:6px;">🫘</div><div style="font-weight:600;font-size:14px;">豆包</div><div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">字节出品·免费</div></a>' +
      '<a href="https://kimi.moonshot.cn" target="_blank" style="display:flex;flex-direction:column;align-items:center;padding:14px 8px;background:var(--card);border-radius:var(--radius);text-decoration:none;color:var(--text);border:2px solid #4D6BFE33;">' +
        '<div style="font-size:28px;margin-bottom:6px;">🌙</div><div style="font-weight:600;font-size:14px;">Kimi</div><div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">长文分析·免费</div></a>' +
    '</div>' +
    '<div class="section-title" style="font-size:15px;">📋 一键复制提示词</div>' +
    '<div id="promptList" style="margin-bottom:16px;"></div>' +
    '<div class="input-form">' +
      '<input type="text" id="scriptTopic" placeholder="或输入自定义话题，如：毕业生租房、地铁口公寓..." />' +
      '<button class="btn-primary" id="scriptTopicBtn" onclick="generateScripts()">✍️ AI 生成</button>' +
    '</div>' +
    '<div id="generatedScripts"></div>';

  // v4.5: 一键基于今日热点生成（chips 由 renderHotspotChips 动态填充）
  html += '<div class="section-title" id="script-hotspots">⚡ 一键基于今日热点生成</div>' +
    '<p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">点击任意热点，AI 立即结合该热点 + 公寓卖点生成完整脚本（风格由 AI 根据话题自由选择）</p>' +
    '<div id="hotspotChips" style="margin-bottom:8px;"></div>';

  // v4.5: 本周推荐脚本（AI 生成·基于日历选题，卡片由 renderCalendarScripts 动态填充）
  html += '<div class="section-title" id="script-calendar">📅 本周推荐脚本（AI 生成 · 基于日历选题）</div>' +
    '<div id="calendarScripts"></div>';

  container.innerHTML = html;
  renderHotspotChips();
  renderCalendarScripts();
}

async function generateScripts() {
  var topic = document.getElementById('scriptTopic').value.trim();
  if (!topic) { showToast('请输入话题关键词'); return; }
  var btn = document.getElementById('scriptTopicBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 生成中...'; }
  try {
    await _generateScriptForTopic(topic);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✍️ AI 生成'; }
  }
}

// v4.5: 统一生成入口（热点 chips / 日历卡片 / 自定义话题共用）
async function quickGenerate(topic) {
  if (!topic) return;
  var target = document.getElementById('script-input');
  if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  await _generateScriptForTopic(topic);
}

// v4.5: 核心生成逻辑 —— 风格由 AI 根据话题自由选择，注入本周爆款/日历上下文
async function _generateScriptForTopic(topic) {
  var container = document.getElementById('generatedScripts');
  if (!container) return;

  // 注入本周上下文：爆款拆解 + 选题日历（若有）
  var weeklyContext = '';
  var analysis = getAutoData('analysis');
  if (analysis) {
    var winners = (analysis.like_winners || []).slice(0, 3);
    if (winners.length) {
      weeklyContext += '\n【本周同类爆款参考】\n' + winners.map(function(w, i) {
        return (i + 1) + '. ' + (w.title || '') + '（钩子：' + (w.hook || '无') + '）';
      }).join('\n');
    }
  }
  var calendar = getAutoData('calendar');
  if (calendar && calendar.plans && calendar.plans.length) {
    weeklyContext += '\n【本周账号选题日历（保持内容连贯）】\n' + calendar.plans.slice(0, 7).map(function(p) {
      return '- ' + (p.day || '') + '：' + (p.title || '') + '（' + (p.type || '') + '）';
    }).join('\n');
  }

  var prompt = '你是上海长租公寓/保障性租赁住房的新媒体运营专家，账号主打抖音+小红书。目标人群：上海应届毕业生、青年白领、情侣租客、沪漂打工人。当前季节背景：8月底换租季。\n\n' +
    '请为话题「' + topic + '」生成 3 条短视频脚本。\n\n' +
    '【风格要求】不要套固定模板！请你自己判断该话题最适合的 3 种不同风格（可从反差吐槽、场景生活、故事走心、干货攻略、沉浸探房、情侣剧情、热梗玩梗、数据盘点等方向自由选择或组合创新），并在每条脚本标注风格名。\n' +
    '【公寓卖点池（自然植入 2-3 个，别全堆）】A 价格灵活：租金低于同地段、押一付一、民水民电、可短租；B 体验生活：拎包入住、精装修、健身房、社交公区、阳台；C 保障服务：地铁口步行可达、品牌公寓管家、24h安保、维修响应快。\n' +
    '【硬性要求】真实有网感不打硬广；前3秒钩子必须强；分镜具体可执行（含画面、台词、字幕、运镜提示）；BGM 给出具体风格或参考曲；结合当前热梗更佳。' + weeklyContext + '\n\n' +
    '每条脚本严格用以下格式（用 ===== 分隔不同的脚本）：\n\n===== 风格名 =====\n标题：XXX\n前3秒钩子：XXX\n分镜：\n1. 镜头1（0-3s）：画面+台词\n2. 镜头2（3-15s）：画面+台词\n3. 镜头3（15-30s）：画面+台词\nBGM及卡点：XXX\n时长预估：XXX秒\n封面建议：XXX';

  container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-secondary);">🤖 AI 正在为「' + escapeHtml(topic) + '」生成脚本（风格自由发挥中）...</div>';
  try {
    var text = await callDeepSeek(prompt, { maxTokens: 2500, temperature: 0.9 });
    container.innerHTML = renderScriptsFromText(topic, text);
    showToast('✅ 脚本已生成');
  } catch(e) {
    container.innerHTML = '<div style="padding:20px;color:#dc2626;">❌ 生成失败：' + escapeHtml(e.message) + '</div><p style="font-size:12px;color:var(--text-secondary);">提示：需在「脚本生成」模块顶部配置 DeepSeek API Key（免费注册）。也可复制下方提示词到豆包/Kimi 网页版手动生成。</p>';
  }
}

// v4.5: 热点 chips 渲染（数据来自本周热榜缓存）
function renderHotspotChips() {
  var el = document.getElementById('hotspotChips');
  if (!el) return;
  var titles = [];
  var hs = weeklyDataCache && weeklyDataCache.hotspot;
  if (hs) {
    ['douyin', 'rednote', 'weibo', 'zhihu'].forEach(function(k) {
      (hs[k] || []).forEach(function(it) { if (it && it.title) titles.push(it.title); });
    });
  }
  var seen = {}; var list = [];
  titles.forEach(function(t) { if (!seen[t]) { seen[t] = 1; list.push(t); } });
  list = list.slice(0, 12);
  if (!list.length) {
    el.innerHTML = '<div style="padding:14px;background:var(--card);border:1px dashed var(--border);border-radius:var(--radius);font-size:13px;color:var(--text-secondary);">📡 热点数据尚未加载，请稍候或到「热梗捕手」模块点「🔄 立即刷新」。</div>';
    return;
  }
  el.innerHTML = list.map(function(t) {
    var safe = escapeHtml(t).replace(/"/g, '&quot;');
    return '<button onclick="quickGenerate(this.dataset.t)" data-t="' + safe + '" style="display:inline-block;padding:8px 14px;margin:5px 6px 0 0;background:linear-gradient(135deg,#ff6a3d,#ff3d81);color:#fff;border:none;border-radius:20px;font-size:13px;cursor:pointer;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom;">🔥 ' + escapeHtml(t) + '</button>';
  }).join('') + '<p style="font-size:11px;color:var(--text-muted);margin-top:10px;">数据来源：uapis.cn 实时热榜（抖音/小红书/微博/知乎去重前12）</p>';
}

// v4.5: 本周推荐脚本卡片（读 AI 选题日历）
function renderCalendarScripts() {
  var el = document.getElementById('calendarScripts');
  if (!el) return;
  var cd = getAutoData('calendar');
  if (cd && cd.plans && cd.plans.length) {
    var html = '<p style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">选题来自「选题日历」模块的 AI 周更数据，点击卡片按钮即可展开为完整脚本' + autoUpdateTag('calendar') + '</p>';
    cd.plans.forEach(function(p) {
      var topic = (p.title || '').replace(/^[「『]|[」』]$/g, '');
      var safe = escapeHtml(topic).replace(/"/g, '&quot;');
      html += '<div class="content-card" style="margin-bottom:12px;">' +
        '<h3>' + escapeHtml(p.day || '') + '：' + escapeHtml(p.title || '') + '</h3>' +
        '<div class="card-meta"><span>📹 ' + escapeHtml(p.type || '') + '</span><span>👥 ' + escapeHtml(p.audience || '') + '</span><span>🎵 ' + escapeHtml(p.bgm || '') + '</span><span>⏰ ' + escapeHtml(p.time || '') + '</span></div>' +
        '<p>📝 ' + escapeHtml(p.summary || '') + '</p>' +
        '<button onclick="quickGenerate(this.dataset.t)" data-t="' + safe + '" style="margin-top:10px;padding:8px 16px;background:var(--primary);color:#fff;border:none;border-radius:var(--radius-sm);font-size:13px;cursor:pointer;">🤖 AI 展开为完整脚本</button>' +
        '</div>';
    });
    el.innerHTML = html;
  } else {
    el.innerHTML = '<div style="padding:18px;background:var(--card);border:1px dashed var(--border);border-radius:var(--radius);font-size:13px;color:var(--text-secondary);">📅 本周 AI 选题日历数据尚未就绪（每周一 9 点自动更新）。可先在上方输入自定义话题，或点击「⚡ 今日热点」直接生成。</div>';
  }
}

function renderScriptsFromText(topic, text) {
  if (!text) return '';
  // 去除所有 '=====' 分隔符（AI 可能写成 ===== 风格名 ===== 带闭合），再按"风格"行切分脚本块
  var clean = text.replace(/=+/g, '').trim();
  var lines = clean.split('\n');
  var rawBlocks = [];
  var cur = [];
  lines.forEach(function(l) {
    var t = l.trim();
    if (/^风格/.test(t) && cur.length) {
      rawBlocks.push(cur.join('\n'));
      cur = [l];
    } else {
      cur.push(l);
    }
  });
  if (cur.length) rawBlocks.push(cur.join('\n'));
  // 仅保留包含"风格/标题"的块，过滤开头序言
  var blocks = rawBlocks.filter(function(b){ return /风格|标题/.test(b); });
  if (blocks.length === 0) {
    return '<div class="script-card"><div class="script-body"><p style="white-space:pre-wrap;">'+escapeHtml(text)+'</p></div></div>';
  }
  var html = '<div class="section-title" style="color:var(--primary);">✨ AI 生成脚本（话题：'+escapeHtml(topic)+'）</div>';
  blocks.forEach(function(block){
    var style = 'AI 脚本', title = '', hook = '', scenes = [], bgm = '', duration = '', cover = '';
    var blines = block.split('\n');
    var inScenes = false;
    blines.forEach(function(raw){
      var line = raw.trim();
      if (/^风格/.test(line)) { style = line.replace(/^风格[：:]/,'').trim(); inScenes = false; }
      else if (/^标题/.test(line)) { title = line.replace(/^标题[：:]/,'').trim(); inScenes = true; }
      else if (/^前3秒钩子/.test(line)) { hook = line.replace(/^前3秒钩子[：:]/,'').trim(); inScenes = false; }
      else if (/^BGM/.test(line)) { bgm = line.replace(/^BGM及卡点[：:]/,'').trim(); inScenes = false; }
      else if (/^时长预估/.test(line)) { duration = line.replace(/^时长预估[：:]/,'').trim(); inScenes = false; }
      else if (/^封面建议/.test(line)) { cover = line.replace(/^封面建议[：:]/,'').trim(); inScenes = false; }
      else if (/^分镜/.test(line)) { inScenes = true; }
      else if (/^\d+[.、]/.test(line)) { if (inScenes) scenes.push(line.trim()); }
      else if (line && inScenes) { scenes.push(line); }
    });
    html += '<div class="script-card"><div class="script-header"><h3>'+escapeHtml(style)+'：'+escapeHtml(title)+'</h3></div><div class="script-body">';
    if (hook) html += '<p><strong>🪝 前3秒钩子：</strong>'+escapeHtml(hook)+'</p>';
    if (scenes.length) { html += '<div class="scene-label">📸 分镜描述</div><p>'+escapeHtml(scenes.join('\n')).replace(/\n/g,'<br>')+'</p>'; }
    if (bgm) html += '<p style="margin-top:10px;"><strong>🎵 BGM及卡点：</strong>'+escapeHtml(bgm)+'</p>';
    if (duration) html += '<p><strong>⏱️ 时长预估：</strong>'+escapeHtml(duration)+'</p>';
    if (cover) html += '<p style="margin-top:8px;"><strong>🖼️ 封面建议：</strong>'+escapeHtml(cover)+'</p>';
    html += '</div></div>';
  });
  return html;
}

function renderPromptList() {
  var prompts = [
    { icon:'🎬', title:'抖音短视频脚本', text:'你是上海长租公寓新媒体运营专家。请为抖音平台写一条15-30秒短视频脚本，主题是「[在此输入你的话题，如：应届毕业生租房避坑]」。要求：1.前3秒有强钩子 2.分镜描述清晰（镜头/画面/台词/BGM卡点）3.结尾引导互动 4.风格轻松幽默 5.自然植入公寓卖点（地铁口/民用水电/押一付一等）' },
    { icon:'📕', title:'小红书种草笔记', text:'你是小红书爆款笔记写手。请写一篇关于「[在此输入话题，如：上海租房好物推荐]」的小红书笔记。要求：1.标题含emoji和数字 2.正文分段清晰 3.口语化有温度 4.植入租房相关卖点 5.结尾引导评论收藏 6.带5个相关话题标签' },
    { icon:'🔥', title:'热梗文案改写', text:'你是抖音热梗文案专家。请把以下热梗改写成适合长租公寓推广的文案，保持梗的趣味性但自然植入租房卖点。热梗：「[在此输入当前热梗]」。要求：3条不同风格版本，每条不超过50字，适合做视频文案或评论区互动。' },
    { icon:'🔍', title:'爆款视频拆解', text:'你是短视频运营分析师。请拆解以下视频的爆款逻辑：[在此粘贴视频链接或描述]。从以下维度分析：1.选题角度 2.前3秒钩子 3.内容结构 4.BGM选择 5.互动设计 6.可复用的3个要点 7.适合我们公寓账号借鉴的点' },
    { icon:'📅', title:'一周选题策划', text:'你是长租公寓新媒体运营策划。请为下周策划7天短视频选题，平台是抖音+小红书。目标人群：上海应届毕业生/青年白领/情侣租客。要求：1.每天1个选题+1句话概括 2.结合当下热点/季节（8月换租季）3.混搭不同内容类型（干货/搞笑/走心/探房/互动）4.每个选题标注预期爆款概率' },
    { icon:'💬', title:'评论区互动话术', text:'你是抖音评论区运营专家。请为长租公寓账号写15条评论区互动话术，包括：1.回复咨询租房的(5条) 2.回复说贵的(3条) 3.回复问位置的(3条) 4.主动引导私信的(2条) 5.幽默互动的(2条)。要求：自然不生硬，有人情味。' }
  ];
  var html = '';
  prompts.forEach(function(p, i) {
    html += '<div style="background:var(--card);border-radius:var(--radius);padding:12px 14px;margin-bottom:10px;display:flex;align-items:flex-start;gap:10px;">' +
      '<div style="font-size:22px;flex-shrink:0;">'+p.icon+'</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:600;font-size:14px;margin-bottom:4px;">'+p.title+'</div>' +
        '<div style="font-size:12px;color:var(--text-secondary);line-height:1.5;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">'+p.text.substring(0,80)+'...</div>' +
      '</div>' +
      '<button onclick="copyPrompt(\''+i+'\')" style="flex-shrink:0;padding:6px 12px;background:var(--primary);color:#fff;border:none;border-radius:var(--radius-sm);font-size:12px;cursor:pointer;">复制</button>' +
    '</div>';
  });
  html += '<input type="hidden" id="promptData" value=\''+JSON.stringify(prompts).replace(/'/g,"&#39;")+'\'>';
  document.getElementById('promptList').innerHTML = html;
}

function copyPrompt(idx) {
  var data = JSON.parse(document.getElementById('promptData').value);
  var text = data[idx].text;
  var textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    showToast('✅ 提示词已复制，去AI工具粘贴即可');
  } catch(e) {
    showToast('复制失败，请手动复制');
  }
  document.body.removeChild(textarea);
}

function formatDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// ===== 6. AI 热门工具推送（GitHub 实时抓取）=====
var AITOOLS_META = { refreshing: false };

function renderAITools(container) {
  var ad = getAutoData('aitools');
  var local = null;
  try { local = JSON.parse(localStorage.getItem('apt_aitools') || '') || null; } catch(e) { local = null; }
  // 实时抓取过的本地数据优先（stars 更新），但若 local 为空/异常则用 getAutoData 兜底
  if (local && local.categories && local.categories.length) ad = local;
  if (!ad || !ad.categories || !ad.categories.length) {
    // v4.6.6: weeklyDataCache 可能被"实时热榜合并"分支丢掉了 aitools 字段（旧 bug）
    // 此处直接独立拉取 latest.json 的 aitools，不再依赖 weeklyDataCache 的合并结果
    try { localStorage.removeItem('apt_aitools'); } catch(e) {}
    renderAIToolsLoading(container);
    fetch(WEEKLY_JSON + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){
        var at = d && d.aitools;
        if (at && at.categories && at.categories.length) {
          try { localStorage.setItem('apt_aitools', JSON.stringify(at)); } catch(e) {}
          if (weeklyDataCache) weeklyDataCache.aitools = at;
          renderAIToolsWith(container, at);
        } else {
          renderAIToolsError(container);
        }
      })
      .catch(function(){ renderAIToolsError(container); });
    return;
  }
  renderAIToolsWith(container, ad);
}

function renderAIToolsLoading(container) {
  container.innerHTML = '<div class="empty-state"><div class="empty-icon">📡</div><div class="empty-text">正在加载工具数据...</div></div>';
}
function renderAIToolsError(container) {
  container.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">工具数据加载失败，请检查网络后刷新页面重试</div></div>';
}

function renderAIToolsWith(container, ad) {
  var categories = (ad && ad.categories) || [];
  var totalTools = 0, totalStars = 0;
  categories.forEach(function(c){ totalTools += (c.tools||[]).length; (c.tools||[]).forEach(function(t){ totalStars += t.stars || 0; }); });
  var ts = ((ad && ad.generated_at) || '').slice(0,16).replace('T',' ');

  var html = '<div class="stats-row">' +
    '<div class="stat-card"><div class="value">'+categories.length+'</div><div class="label">🗂️ 工具分类</div></div>' +
    '<div class="stat-card"><div class="value">'+totalTools+'</div><div class="label">🤖 热门工具</div></div>' +
    '<div class="stat-card"><div class="value">'+fmtBigNum(totalStars)+'</div><div class="label">⭐ 总 Stars</div></div>' +
  '</div>';

  html += '<div class="content-card" style="margin-bottom:14px;padding:14px 18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
    '<div style="flex:1;min-width:220px;">' +
      '<div style="font-weight:700;font-size:14px;">🔥 近期热门 AI 工具 &amp; Skill</div>' +
      '<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">数据源：GitHub 实时抓取' + (ts ? ' · 周更 ' + ts : '') + ' · 脚本/图片/视频/代码四大类</div>' +
    '</div>' +
    '<button class="btn-primary" style="padding:8px 16px;font-size:13px;" onclick="refreshAITools()" id="aitoolsRefreshBtn">🔄 实时抓取 GitHub</button>' +
  '</div>';

  if (!categories.length) {
    html += '<div class="empty-state"><div class="empty-icon">🔧</div><div class="empty-text">暂无工具数据，点击上方「实时抓取 GitHub」拉取最新热门 AI 工具</div></div>';
    container.innerHTML = html;
    return;
  }

  categories.forEach(function(cat) {
    html += '<div class="section-title" id="cat-'+cat.id+'">'+cat.name+' <span style="font-size:12px;color:var(--text-muted);font-weight:400;">'+cat.desc+'</span></div>';
    html += '<div class="aitool-grid">';
    (cat.tools||[]).forEach(function(t){ html += renderAIToolCard(t); });
    html += '</div>';
  });

  html += '<p style="font-size:11px;color:var(--text-muted);margin-top:16px;">⚠️ 仓库信息（stars/简介/许可）来自 GitHub 公开数据实时抓取；优缺点与付费情况为整理分析，仅供参考，请以官网为准。</p>';
  container.innerHTML = html;
  enableSectionCollapse(container);
}

function renderAIToolCard(t) {
  var priceMap = { free:['🆓 免费','price-free'], freemium:['🎁 免费+付费','price-freemium'], paid:['💳 付费','price-paid'] };
  var pt = priceMap[t.price_tag] || ['💳 '+(t.pricing||'付费'), 'price-paid'];
  var stars = t.stars >= 10000 ? (t.stars/10000).toFixed(1)+'万' : (t.stars||0).toLocaleString();
  return '<div class="aitool-card">' +
    '<div class="aitool-head">' +
      '<a class="aitool-name" href="'+(t.url||'#')+'" target="_blank" rel="noopener">'+(t.name||t.repo||'')+' ↗</a>' +
      '<span class="aitool-price '+pt[1]+'">'+pt[0]+'</span>' +
    '</div>' +
    '<div class="aitool-repo">'+escapeHtml(t.repo||'')+' · ⭐ '+stars+(t.license?' · '+t.license:'')+(t.language?' · '+t.language:'')+'</div>' +
    (t.desc ? '<div class="aitool-desc">'+escapeHtml(t.desc)+'</div>' : '') +
    '<div class="aitool-row"><span class="aitool-tag tag-pro">✅ 优点</span><span>'+t.pros+'</span></div>' +
    '<div class="aitool-row"><span class="aitool-tag tag-con">⚠️ 缺点</span><span>'+t.cons+'</span></div>' +
    '<div class="aitool-row"><span class="aitool-tag tag-pay">💰 付费</span><span>'+t.pricing+'</span></div>' +
  '</div>';
}

function fmtBigNum(n) {
  n = n || 0;
  return n >= 100000000 ? (n/100000000).toFixed(1)+'亿' : n >= 10000 ? (n/10000).toFixed(1)+'万' : n.toLocaleString();
}

// 前端实时抓取 GitHub 热门 AI 工具（更新 stars/简介，优缺点与付费知识库字段保留）
function refreshAITools() {
  if (AITOOLS_META.refreshing) return;
  var btn = document.getElementById('aitoolsRefreshBtn');
  AITOOLS_META.refreshing = true;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 抓取中...'; }
  var queries = {
    script: 'AI writing assistant LLM',
    image: 'text-to-image',
    video: 'text-to-video',
    code: 'AI coding assistant agent'
  };
  var current = getAutoData('aitools') || { categories: [] };
  try { var loc = JSON.parse(localStorage.getItem('apt_aitools')||''); if (loc && loc.categories) current = loc; } catch(e) {}
  // 防止 weeklyDataCache 还没加载完时写入空数据
  if (!current || !current.categories || !current.categories.length) {
    AITOOLS_META.refreshing = false;
    if (btn) { btn.disabled = false; btn.textContent = '🔄 实时抓取 GitHub'; }
    showToast('⚠️ 工具数据还在加载，请稍后再试');
    return;
  }
  var byRepo = {};
  (current.categories||[]).forEach(function(c){ (c.tools||[]).forEach(function(t){ if(t.repo) byRepo[t.repo.toLowerCase()] = t; }); });
  var done = 0, failed = 0, updated = 0;
  var keys = Object.keys(queries);
  keys.forEach(function(cid) {
    fetch('https://api.github.com/search/repositories?q='+encodeURIComponent(queries[cid])+'&sort=stars&order=desc&per_page=10')
      .then(function(r){ return r.json(); })
      .then(function(d) {
        (d.items||[]).slice(0,8).forEach(function(it) {
          var key = (it.full_name||'').toLowerCase();
          var exist = byRepo[key];
          if (exist) { exist.stars = it.stargazers_count || exist.stars; exist.desc = (it.description||exist.desc||'').slice(0,160); updated++; }
        });
        done++;
      })
      .catch(function(){ done++; failed++; })
      .then(function(){ if (done === keys.length) finish(); });
  });
  function finish() {
    AITOOLS_META.refreshing = false;
    if (btn) { btn.disabled = false; btn.textContent = '🔄 实时抓取 GitHub'; }
    if (failed === keys.length) { showToast('❌ 抓取失败，请检查网络后重试'); return; }
    try { localStorage.setItem('apt_aitools', JSON.stringify(current)); } catch(e) {}
    showToast('✅ 已实时更新 ' + updated + ' 个工具数据');
    renderAITools(document.getElementById('contentBody'));
  }
}


// ===== 7. CALENDAR MODULE =====
function renderCalendar(container) {
  // 尝试读取 AI 自动生成的选题日历数据
  var cd = getAutoData('calendar');
  if (cd && cd.plans && cd.plans.length) {
    var plans = cd.plans;
    var wt = cd.week_title || '🗓️ 本周选题规划（AI生成）';
    var html = '<div class="stats-row">' +
    '<div class="stat-card"><div class="value">'+plans.length+'</div><div class="label">📅 本周选题</div></div>' +
    '<div class="stat-card"><div class="value">'+plans.length+'</div><div class="label">📋 选题详情</div></div>' +
    '</div>';
    html += '<div class="section-title" id="cal-plans">' + wt + autoUpdateTag('calendar') + '</div>';
    html += '<div class="data-table"><table><thead><tr><th>日期</th><th>选题方向</th><th>脚本类型</th><th>目标人群</th><th>BGM</th><th>发布时间</th></tr></thead><tbody>';
    plans.forEach(function(p) {
      html += '<tr><td style="font-weight:700;">'+(p.day||'')+'</td><td>'+(p.title||'')+'</td><td><span class="card-tag tag-trend" style="font-size:10px;">'+(p.type||'')+'</span></td><td>'+(p.audience||'')+'</td><td>'+(p.bgm||'')+'</td><td>'+(p.time||'')+'</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<div class="section-title" id="cal-detail" style="margin-top:24px;">📋 每日详情与视频链接</div>';
    plans.forEach(function(p) {
      html += '<div class="content-card" style="margin-bottom:12px;">'+
        '<h3>'+(p.day||'')+'：'+(p.title||'')+'</h3>'+
        '<div class="card-meta"><span>📹 '+(p.type||'')+'</span><span>👥 '+(p.audience||'')+'</span><span>🎵 '+(p.bgm||'')+'</span><span>⏰ 发布时间 '+(p.time||'')+'</span></div>'+
        '<p>📝 <strong>内容概括：</strong>'+(p.summary||'')+'</p>'+
        '</div>';
    });
    container.innerHTML = html;
    return;
  }

  // 回退：静态硬编码数据
  var days = ['周一 8/3','周二 8/4','周三 8/5','周四 8/6','周五 8/7','周六 8/8','周日 8/9'];
  var plans = [
    { day:'周一 8/3', title:'「毕业第30天，妈来上海看我的出租屋」', type:'反差吐槽型', audience:'应届毕业生', bgm:'节奏卡点+门铃音效', time:'18:30',
      summary:'直接套用08-01抖音飙升第2"家人来到我的出租屋belike"(792.3万)。前3秒妈妈敲门强钩子，中段用分屏对比"乱→快速收拾"过程，结尾"我们替应届生把硬装做了+阿姨免费打扫"。卖点：拎包入住+民水民电。评论区互动"你妈来你家第一反应是啥"承接毕业季返校探访流量。',
      sources:[{url:'https://www.douyin.com/video/739410000001',label:'抖音视频'},{url:'https://www.xiaohongshu.com/explore/739410000002',label:'小红书笔记'}] },
    { day:'周二 8/4', title:'「3000块，去年vs今年能租到啥」', type:'干货攻略型', audience:'青年白领', bgm:'节奏卡点', time:'18:00',
      summary:'换租季预热内容。借势"上海租房价格大跳水"+"换租季"双话题。视频分屏对比"去年3000元只能租隔断间 vs 今年3000元住一室一厅带阳台"，用价格标签+地图轨迹可视化。分析降价原因（保租房集中入市+毕业季供给增加），结尾"现在是换租最佳窗口期"驱动私信咨询。卖点：地铁口+民水民电+押一付一。',
      sources:[{url:'https://www.douyin.com/video/739410000003',label:'抖音视频'},{url:'https://www.xiaohongshu.com/explore/739410000004',label:'小红书笔记'}] },
    { day:'周三 8/5', title:'「26岁沪漂37㎡独居，阳台造一片星河」', type:'场景生活型', audience:'独居女性/白领', bgm:'治愈系钢琴', time:'21:00',
      summary:'融合08-01简报"微生活革命·阳台造星河"(搜索+217%)+"26岁沪漂37㎡独居小屋"(30万赞)双热梗。15秒慢镜头+暖光+绿植特写，拍摄"凌晨2点回到公寓打开阳台灯"的疗愈瞬间，阳台/公区植入苔藓微景观+星空投影灯。不与反差类同档竞争，独占21点夜场治愈系流量。卖点：精装小户型+阳台/公区+独居仪式感。',
      sources:[{url:'https://www.douyin.com/video/739410000005',label:'抖音视频'},{url:'https://www.xiaohongshu.com/explore/739410000006',label:'小红书笔记'}] },
    { day:'周四 8/6', title:'「毕业第一次搬家，从宿舍到独居全过程」', type:'故事走心型', audience:'应届毕业生', bgm:'励志温暖', time:'19:00',
      summary:'借势毕业季返校潮+08-01简报"塑料袋创意复用"(累计8亿播放)做搬家打包小技巧。快剪+慢镜头交替呈现"宿舍→搬家车→推开门"，戳"沪漂第一个家"情感点。结尾露"签约即送搬家大礼包(湿巾/收纳/磁吸扣10件套)"，转化路径短且自然。卖点：拎包入住+健身房+社交公区+搬家大礼包。',
      sources:[{url:'https://www.douyin.com/video/739410000007',label:'抖音视频'},{url:'https://www.xiaohongshu.com/explore/739410000008',label:'小红书笔记'}] },
    { day:'周五 8/7', title:'「和对象合租第一夜，甜蜜变崩溃」', type:'反差吐槽型', audience:'情侣租客', bgm:'魔性反差', time:'20:00',
      summary:'借势"旅行第一天vs最后一天"反差结构(实时热点第9，923.2万)。前段用浪漫慢镜头呈现"想象中"的合租，中段快剪"现实崩溃"(马桶盖/外卖盒/袜子乱飞)，最后反差反转"直到搬进XX公寓"。周五晚间情侣活跃时段，承接520后+七夕前情感话题期。卖点：拎包入住+独立卧室+社交公区+干湿分离。',
      sources:[{url:'https://www.douyin.com/video/739410000009',label:'抖音视频'},{url:'https://www.xiaohongshu.com/explore/739410000010',label:'小红书笔记'}] },
    { day:'周六 8/8', title:'「住在XX公寓通勤陆家嘴/张江的OOTD」', type:'场景生活型', audience:'青年白领', bgm:'轻快节奏', time:'12:00',
      summary:'直接改编08-01简报"夏日复古风通勤穿搭"(1058.9万)+"夏日实穿主义美鞋"(770.4万)。午间穿搭内容黄金时段，拍摄"住XX公寓→地铁→公司"的真实通勤链路，3套通勤穿搭。把公寓"步行15分钟到地铁"作为穿搭之外的"通勤不累"卖点，结合毕业季新职人精准触达。卖点：地铁口+步行15分钟通勤+民水民电。',
      sources:[{url:'https://www.douyin.com/video/739410000011',label:'抖音视频'},{url:'https://www.xiaohongshu.com/explore/739410000012',label:'小红书笔记'}] },
    { day:'周日 8/9', title:'「沪漂一年，我换了3次家终于找到归宿」', type:'故事走心型', audience:'全人群', bgm:'走心治愈', time:'19:00',
      summary:'38秒长视频情感叙事。借势"我人生的奥比岛时期"(815.7万)怀旧情感做"曾经我也有家"。3段递进叙事：第1次住隔断间(吵/小)→第2次合租(室友冲突)→第3次搬到现在公寓(管家好/邻居友善)。快切+慢镜头交替营造情感节奏，结尾"找到一个好房子，是沪漂人最大的安全感"沉淀收藏。卖点：拎包入住+采光好+可短租+安全感。',
      sources:[{url:'https://www.douyin.com/video/739410000013',label:'抖音视频'},{url:'https://www.xiaohongshu.com/explore/739410000014',label:'小红书笔记'}] }
  ];

  var html = '<div class="stats-row">' +
  '<div class="stat-card" style="cursor:pointer" onclick="scrollToSection(\'cal-plans\')"><div class="stat-value">'+plans.length+'</div><div class="stat-label">📅 本周选题</div></div>' +
  '<div class="stat-card" style="cursor:pointer" onclick="scrollToSection(\'cal-detail\')"><div class="stat-value">'+plans.length+'</div><div class="stat-label">📋 选题详情</div></div>' +
  '</div>';
  html += '<div class="section-title" id="cal-plans">🗓️ 8月第1周选题规划（运营选题规划）</div>';
  html += '<div class="data-table"><table><thead><tr><th>日期</th><th>选题方向</th><th>脚本类型</th><th>目标人群</th><th>BGM</th><th>发布时间</th></tr></thead><tbody>';
  plans.forEach(function(p) {
    html += '<tr><td style="font-weight:700;">'+p.day+'</td><td>'+p.title+'</td><td><span class="card-tag tag-trend" style="font-size:10px;">'+p.type+'</span></td><td>'+p.audience+'</td><td>'+p.bgm+'</td><td>'+p.time+'</td></tr>';
  });
  html += '</tbody></table></div>';

  html += '<div class="section-title" id="cal-detail" style="margin-top:24px;">📋 每日详情与视频链接</div>';
  plans.forEach(function(p) {
    html += '<div class="content-card" style="margin-bottom:12px;">'+
      '<h3>'+p.day+'：'+p.title+'</h3>'+
      '<div class="card-meta"><span>📹 '+p.type+'</span><span>👥 '+p.audience+'</span><span>🎵 '+p.bgm+'</span><span>⏰ 发布时间 '+p.time+'</span></div>'+
      '<p>📝 <strong>内容概括：</strong>'+p.summary+'</p>'+
      '<div class="source-links">'+p.sources.map(function(s){return sourceLabel(s.url,s.label)}).join('')+'</div>'+
    '</div>';
  });

  html += '<div class="section-title">🔗 选题参考来源</div>'+
    '<div class="source-links" style="background:var(--card);padding:14px 18px;border-radius:var(--radius);">'+
    sourceLink('https://www.douyin.com/hot','抖音热点榜')+
    sourceLink('https://www.xiaohongshu.com/explore','小红书发现页')+
    '</div>';
  container.innerHTML = html;
}

// ===== 8. COMPETITOR RENDERER =====
function renderCompetitor(container) {
  // 尝试读取 AI 自动生成的竞品监控数据
  var compD = getAutoData('competitor');
  if (compD && compD.competitors && compD.competitors.length) {
    var competitors = compD.competitors;
    var insights = (compD.insights || []);
    var cInsights = (compD.comment_insights || []);
    var intel = (compD.industry_intel || {});
    var totalPosts = competitors.reduce(function(s,c){return s+parseInt(c.posts||'0')},0);
    var html = '<div class="stats-row">' +
    '<div class="stat-card"><div class="value">'+competitors.length+'</div><div class="label">👁️ 监控品牌</div></div>' +
    '<div class="stat-card"><div class="value">'+competitors.length+'</div><div class="label">🔥 热门视频</div></div>' +
    '<div class="stat-card"><div class="value">'+(cInsights.length||5)+'</div><div class="label">📝 诉求分析</div></div>' +
    '<div class="stat-card"><div class="value">'+(insights.length||3)+'</div><div class="label">💡 账号启示</div></div>' +
    '</div>';
    html += '<div class="section-title" id="comp-list">🏢 上海本地竞品本周表现（AI生成）' + autoUpdateTag('competitor') + '</div>'+
      '<div class="data-table"><table><thead><tr><th>竞品账号</th><th>本周发布</th><th>最高点赞</th><th>热门主题</th></tr></thead><tbody>';
    competitors.forEach(function(c) {
      html += '<tr><td style="font-weight:600;">'+(c.name||'')+'</td><td>'+(c.posts||'')+'</td><td>'+(c.max_likes||'')+'</td><td>'+(c.hot_topic||'')+'</td></tr>';
    });
    html += '</tbody></table></div>';

    html += '<div class="section-title" id="comp-hot">🔥 各竞品近期最热视频</div>';
    competitors.forEach(function(c) {
      var hv = c.hot_video || {};
      if (hv.title) {
        html += '<div class="content-card">'+
          '<span class="card-tag tag-hot">🏆 '+(c.name||'')+' 最热视频</span>'+
          '<h3>'+(hv.title||'')+'</h3>'+
          '<p>📝 <strong>主题与内容概括：</strong>'+(hv.summary||'')+'</p>'+
          '<p>📊 <strong>数据简析：</strong>'+(hv.data||'')+'</p>'+
          '</div>';
      }
    });

    if (cInsights.length) {
      html += '<div class="section-title">💬 竞品评论区高频诉求 TOP'+cInsights.length+'</div><div class="content-card">';
      cInsights.forEach(function(ci){ html += '<p>'+ci+'</p>'; });
      html += '</div>';
    }

    if (intel.title) {
      html += '<div class="section-title">🏙️ 行业情报</div><div class="content-card">'+
        '<span class="card-tag tag-new">📡 '+(intel.tag||'行业情报')+'</span>'+
        '<h3>'+(intel.title||'')+'</h3>'+
        '<p>'+(intel.content||'')+'</p>'+
        '</div>';
    }

    if (insights.length) {
      html += '<div class="section-title">💡 对我方账号的'+insights.length+'条启示</div>';
      insights.forEach(function(ins){
        html += '<div class="content-card"><p>'+ins+'</p></div>';
      });
    }
    container.innerHTML = html;
    return;
  }

  // 回退：静态硬编码数据
  var competitors = [
    { name:'🏠 自如租房', posts:'5条', maxLikes:'2.3万', hotTopic:'毕业��专属优惠',
      hotVideo:{ title:'「自如毕业季大促：首月0元住」', summary:'视频以毕业季大促为主题，展示多个房源实拍，配合"首月0元"优惠政策。开头用毕业生离校画面切入，展示自如提供的灵活租期和免押金服务。评论区主要讨论房源位置和价格。', data:'播放 8.5万 · 点赞 2.3万 · 完播率 38% · 评论 1200+',
        sources:[{url:'https://www.douyin.com/video/739500000001',label:'抖音视频'},{url:'https://www.xiaohongshu.com/explore/739500000002',label:'小红书笔记'}] }
    },
    { name:'🏢 魔方公寓', posts:'3条', maxLikes:'1.8万', hotTopic:'社区社交活动vlog',
      hotVideo:{ title:'「魔方社区周末派对：100个年轻人的狂欢」', summary:'记录魔方公寓社区组织的周末派对活动。展示公区烧烤、桌游、K歌等社交场景，突出社区氛围和年轻人社交价值。结尾引导"想加入吗？私信预约看房"。', data:'播放 6.2万 · 点赞 1.8万 · 完播率 42% · 评论 890+',
        sources:[{url:'https://www.douyin.com/video/739500000003',label:'抖音视频'},{url:'https://www.xiaohongshu.com/explore/739500000004',label:'小红书笔记'}] }
    },
    { name:'🏘️ V领地', posts:'4条', maxLikes:'1.2万', hotTopic:'改造出租屋系列',
      hotVideo:{ title:'「200元爆改V领地出租屋，空间大一倍」', summary:'极低成本改造教程，展示如何用200元预算(收纳盒+挂墙架+灯串)让20平米小户型空间翻倍。重点突出储物空间利用和视觉扩容技巧。评论高收藏率。', data:'播放 5.1万 · 点赞 1.2万 · 完播率 35% · 收藏 3200+',
        sources:[{url:'https://www.douyin.com/video/739500000005',label:'抖音视频'},{url:'https://www.xiaohongshu.com/explore/739500000006',label:'小红书笔记'}] }
    },
    { name:'🏡 城家公寓', posts:'6条', maxLikes:'3.1万', hotTopic:'情侣同居租房日记',
      hotVideo:{ title:'「在城家同居100天，他变了...」', summary:'情侣记录片风格，展示从搬入城家公寓第一天到100天的变化。用前后对比突出公寓带来的品质提升：独立厨房(可以一起做饭)、干湿分离卫浴(不再排队)、24h管家(安全感)。结尾温情"好的关系需要好的空间"。', data:'播放 12.4万 · 点赞 3.1万 · 完播率 45% · 评论 1800+',
        sources:[{url:'https://www.douyin.com/video/739500000007',label:'抖音视频'},{url:'https://www.xiaohongshu.com/explore/739500000008',label:'小红书笔记'}] }
    }
  ];

  var totalPosts = competitors.reduce(function(s,c){return s+parseInt(c.posts)},0);
  var html = '<div class="stats-row">' +
  '<div class="stat-card" style="cursor:pointer" onclick="scrollToSection(\'comp-list\')"><div class="stat-value">'+competitors.length+'</div><div class="stat-label">👁️ 监控品牌</div></div>' +
  '<div class="stat-card" style="cursor:pointer" onclick="scrollToSection(\'comp-hot\')"><div class="stat-value">'+competitors.length+'</div><div class="stat-label">🔥 热门视频</div></div>' +
  '<div class="stat-card" style="cursor:pointer" onclick="scrollToSection(\'comp-report\')"><div class="stat-value">5</div><div class="stat-label">📝 分析报告</div></div>' +
  '<div class="stat-card" style="cursor:pointer" onclick="scrollToSection(\'comp-insight\')"><div class="stat-value">3</div><div class="stat-label">💡 账号启示</div></div>' +
  '</div>';
  html += '<div class="section-title" id="comp-list">🏢 上海本地竞品本周表现</div>'+
    '<div class="data-table"><table><thead><tr><th>竞品账号</th><th>本周发布</th><th>最高点赞</th><th>热门主题</th></tr></thead><tbody>';
  competitors.forEach(function(c) {
    html += '<tr><td style="font-weight:600;">'+c.name+'</td><td>'+c.posts+'</td><td>'+c.maxLikes+'</td><td>'+c.hotTopic+'</td></tr>';
  });
  html += '</tbody></table></div>';

  html += '<div class="section-title" id="comp-hot">🔥 各竞品近期最热视频</div>';
  competitors.forEach(function(c) {
    html += '<div class="content-card">'+
      '<span class="card-tag tag-hot">🏆 '+c.name+' 最热视频</span>'+
      '<h3>'+c.hotVideo.title+'</h3>'+
      '<p>📝 <strong>主题与内容概括：</strong>'+c.hotVideo.summary+'</p>'+
      '<p>📊 <strong>数据简析：</strong>'+c.hotVideo.data+'</p>'+
      '<div class="source-links">'+c.hotVideo.sources.map(function(s){return sourceLabel(s.url,s.label)}).join('')+'</div>'+
    '</div>';
  });

  html += '<div class="section-title" id="comp-report">💬 竞品评论区高频诉求 TOP5</div>'+
    '<div class="content-card">'+
    '<p>1️⃣ <strong>位置/地铁距离</strong> — 出现频率最高，"离XX地铁站多远"占评论25%</p>'+
    '<p>2️⃣ <strong>价格/补贴</strong> — "多少钱一个月""有没有毕业生优惠"</p>'+
    '<p>3️⃣ <strong>短租/押金</strong> — "能短租吗""押一付一还是付三"</p>'+
    '<p>4️⃣ <strong>宠物政策</strong> — "可以养猫吗"（养宠需求持续上升）</p>'+
    '<p>5️⃣ <strong>真实评价</strong> — "住过的说说怎么样""隔音好吗"</p>'+
    '</div>';

  html += '<div class="section-title">🏙️ 行业情报</div>'+
    '<div class="content-card">'+
    '<span class="card-tag tag-new">📡 URI城市租住</span>'+
    '<h3>2026下半年上海保租房供应量预计增加30%</h3>'+
    '<p>URI城市租住最新报告显示，上海保障性租赁住房下半年将迎来集中交付期，竞争加剧。建议加强"社区生活""软性服务"��容差异化，避免陷入纯价格竞争。</p>'+
    '<div class="source-links">'+sourceLabel('https://www.uri.city/','URI城市租住官网')+'</div>'+
    '</div>';

  html += '<div class="section-title" id="comp-insight">💡 对我方账号的3条启示</div>'+
    '<div class="content-card"><p>1️⃣ 竞品普遍在打"价格战"，我方应差异化突出<strong>"生活场景提案"</strong>——不是卖房子，是卖生活方式</p></div>'+
    '<div class="content-card"><p>2️⃣ 评论区对<strong>"宠物政策"</strong>诉求持续走高，建议拍摄"带猫看房/宠物友好公寓"专题</p></div>'+
    '<div class="content-card"><p>3️⃣ <strong>"真实住客评价"</strong>类内容评论区互动率远高于纯展示——启动"租客说"系列UGC内容</p></div>';

  html += '<div class="section-title">🔗 免费竞品数据来源</div>'+
    '<div class="source-links" style="background:var(--card);padding:14px 18px;border-radius:var(--radius);flex-wrap:wrap;">'+
    sourceLink('https://www.douyin.com/','抖音竞品账号')+
    sourceLink('https://www.xiaohongshu.com/explore','小红书竞品账号')+
    sourceLink('https://www.uri.city/','URI城市租住')+
    '</div>'+
    '<div style="margin-top:16px;padding:14px 18px;background:#fef3c7;border-radius:var(--radius);border:1px solid #fcd34d;">'+
    '<div style="font-weight:700;font-size:13px;margin-bottom:6px;">🛠️ 如何手动更新竞品数据？</div>'+
    '<p style="font-size:12px;color:#92400e;">1. 打开上方链接搜索竞品账号 → 2. 记录本周最热视频和数据 → 3. 分析竞品策略 → 4. 调整自己的内容方向。本模块展示的是示例数据。</p>'+
    '</div>';
  container.innerHTML = html;
}

// ===== 9. MATERIAL RENDERER (Weekly Archive) =====
function renderMaterial(container) {
  var weekArchives = [
    {
      week: 31, dateRange: '7/28 - 8/3', label: '📌示例',
      _sample: true,
      categories: [
        {
          id: 'captions', name: '🔥 热梗文案存档', type: 'text',
          files: [
            {name: '#00后整顿租房市场_文案1_反差吐槽版.txt', date: '2026-08-01', content: '房东说押金不退？00后：您看看合同第7条，再看看消费者权益保护法第55条，咱们是走调解还是走诉讼？\ud83e\udd14 #00后整顿租房市场 #上海租房 #押金退还'},
            {name: '#00后整顿租房市场_文案2_走心共鸣版.txt', date: '2026-08-01', content: '不是00后难搞，是我们这代人终于学会了用法律保护自己。租房不是求人办事，是平等交易。\ud83d\udcaa #00后整顿租房市场 #沪漂租房日记'},
            {name: '#上海租房价格大跳水_文案1_对比冲击版.txt', date: '2026-08-01', content: '去年3000块只能租隔断间，今年3000块住一室一厅带阳台。上海租房价格大跳水，现在是换租最佳时机！\ud83c\udfe0\u2728 #上海租房 #换租季 #租房降价'},
            {name: '#上海租房价格大跳水_文案2_理性分析版.txt', date: '2026-08-01', content: '上海租房降价不是偶然：保租房集中入市+毕业季供给增加=租客议价权up！这份2026下半年租房行情分析请收好 \ud83d\udcca #上海租房价格大跳水'},
            {name: '#消费降级后的精致生活_文案1_改造攻略版.txt', date: '2026-07-31', content: '消费降级\u2260生活降级。500元改造出租屋：\u2460暖色灯带20元 \u2461墙贴40元 \u2462地毯80元 \u2463装饰画50元...剩下的钱吃顿好的不香吗？#消费降级 #出租屋改造 #精致穷'},
            {name: '#打工人下班后的2小时_文案1_生活vlog版.txt', date: '2026-07-31', content: '6点下班，7点到家用公区健身，8点公共厨房做简餐，9点露台吹风。打工人下班后的2小时，才是真正属于自己的时间 \ud83c\udf05 #打工人 #下班生活 #公寓社区'},
            {name: '#毕业季租房vlog_文案1_情感叙事版.txt', date: '2026-07-30', content: '毕业第3天，我在上海租到了人生第一个"家"。推开门的那一刻，阳光洒在床上，突然觉得：一切都会好起来的 \ud83c\udf93\ud83c\udfe0 #毕业季租房 #沪漂第一天 #上海租房'},
            {name: '#毕业季租房vlog_文案2_攻略干货版.txt', date: '2026-07-30', content: '毕业生租房全流程：\u2460确定预算(月薪1/3) \u2461选定区域(地铁30min) \u2462实地看房(带尺子) \u2463签约避坑(看产证)。这份攻略价值1万块 \ud83d\udccb #毕业季租房 #租房攻略'},
          ]
        },
        {
          id: 'scripts', name: '✍️ 脚本存档', type: 'text',
          files: [
            {name: '反差吐槽型_毕业生租房避坑_脚本.txt', date: '2026-07-30', content: '【反差吐槽型】毕业生租房避坑指南\n\n\u{1FA9}\u200d【前3秒钩子】"毕业生租房第一个月，我亏了3000块...你别跟我一样"\n\n【分镜描述】\n镜头1(0-3s): 怼脸特写，夸张皱眉 "毕业生租房这5个坑，我替你们踩完了！"\n镜头2(3-12s): 快速切换3个"踩坑"画面，配合翻白眼表情特效\n镜头3(12-22s): 切到公寓实拍，阳光洒进房间 \u2192 "但如果你选对了，租房也可以很香"\n镜头4(22-30s): 结尾大字卡："你的租房踩过什么坑？评论区见"\n\n【BGM及卡点】"不是你听我说"魔性人声 \u2192 切轻快卡点音乐\n【时长预估】30秒\n【封面图描述】大字标题+博主半身照+房源亮点局部'},
            {name: '场景生活型_第一个家_脚本.txt', date: '2026-07-30', content: '【场景生活型】毕业生在上海的第一个家，30平米够吗？\n\n\u{1FA9}\u200d【前3秒钩子】"毕业第7天，我在上海租到了月薪1/3以内的房子..."\n\n【分镜描述】\n镜头1(0-3s): 推开公寓门的背影，阳光从窗户洒进来 \u2192 温柔BGM渐入\n镜头2(3-12s): 一镜到底展示房间：厨房\u2192客厅\u2192卧室\u2192窗外景色\n镜头3(12-22s): 插入生活画面：做早餐、泡咖啡、在公区认识新邻居\n镜头4(22-30s): 坐在窗边独白："原来一个人住，没那么可怕" \u2192 画面渐变黑\n\n【BGM及卡点】《落日与晚风》- 傅梦彤（治愈系人声）\n【时长预估】30秒\n【封面图描述】大字标题+博主半身照+房源亮点局部'},
            {name: '故事走心型_沪漂365天_脚本.txt', date: '2026-07-30', content: '【故事走心型】沪漂第365天，我换了第3次家\n\n\u{1FA9}\u200d【前3秒钩子】"来上海一年，搬了3次家，这次终于不搬了..."\n\n【分镜描述】\n镜头1(0-3s): 空荡荡旧房间，拖行李箱离开的背影 \u2192 "这是我来上海的第365天"\n镜头2(3-15s): 穿插之前2次搬家快切画面（狭小隔断间\u2192合租冲突\u2192搬家）\n镜头3(15-25s): 切到现在公寓：宽敞房间、友好管家、楼下咖啡馆 \u2192 放慢节奏\n镜头4(25-35s): 面对镜头微笑："找到一个好房子，是沪漂人最大的安全感"\n镜头5(35-38s): 结尾文字："你也在找家吗？私信我，帮你找到它"\n\n【BGM及卡点】《在你的身边》- 盛哲（走心人声，00:05开始人声卡点）\n【时长预估】38秒\n【封面图描述】大字标题+博主半身照+房源亮点局部'},
          ]
        },
        {
          id: 'plans', name: '📅 选题规划存档', type: 'text',
          files: [
            {name: '8月第1周选题规划_毕业季冲刺.txt', date: '2026-08-01', content: '【8月第1周选题规划 - 毕业季冲刺 \ud83c\udf93】\n\n周一: 毕业生租房避坑指南 | 反差吐槽型 | 应届毕业生 | 18:00发布\n周二: 3000元在上海能租什么 | 价格对比型 | 青年白领 | 12:00发布\n周三: 情侣同居租房攻略 | 干货攻略型 | 情侣租客 | 19:00发布\n周四: 公寓改造前后对比 | 改造展示型 | 青年白领 | 18:00发布\n周五: 沪漂365天租房日记 | 故事走心型 | 上海打工人 | 20:00发布\n\n【卖点组合】\nA组: 地铁口+民用水电+押一付一\nB组: 拎包入住+健身房+社交公区\nC组: 租金便宜+采光好+可短租'},
          ]
        },
        {
          id: 'data', name: '📊 数据周报', type: 'text',
          files: [
            {name: '本周数据汇总_0728-0803.txt', date: '2026-08-03', content: '【本周数据汇总 7/28-8/3】\n\n\ud83d\udcca 总播放量: 2.4万 (+12%)\n\ud83d\udcca 完播率: 42%\n\ud83d\udcac 互动率: 3.8%\n\u2764\ufe0f 新增点赞: 1,256\n\u{1F465} 新增粉丝: 89\n\n\ud83d\udccc 最佳发布时间: 周五 20:00\n\ud83d\udccc 最热话题: #00后整顿租房市场\n\ud83d\udccc 最高播放: 毕业生租房避坑指南 (8,200次)\n\ud83d\udccc 优化建议: 补充小红书分发，复制TOP3视频到小红书'},
            {name: '每日数据日报_0801.txt', date: '2026-08-01', content: '【8月1日 数据日报】\n\n\ud83c\udfa7 抖音\n  播放: 3,200 | 点赞: 186 | 评论: 24 | 分享: 12\n  最佳视频: 毕业生租房避坑指南\n\n\ud83d\udcd5 小红书\n  浏览: 1,800 | 点赞: 95 | 收藏: 42 | 评论: 18\n  最佳笔记: 上海租房价格大跳水\n\n\ud83d\udcc8 环比昨日: +15%'},
            {name: '每日数据日报_0731.txt', date: '2026-07-31', content: '【7月31日 数据日报】\n\n\ud83c\udfa7 抖音\n  播放: 2,800 | 点赞: 156 | 评论: 18 | 分享: 8\n  最佳视频: 消费降级后的精致生活\n\n\ud83d\udcd5 小红书\n  浏览: 1,500 | 点赞: 78 | 收藏: 35 | 评论: 12\n  最佳笔记: 打工人下班后的2小时\n\n\ud83d\udcc8 环比昨日: +8%'},
          ]
        },
        {
          id: 'bgm', name: '🎵 BGM音乐存档', type: 'media',
          files: [
            {name: '落日与晚风_傅梦彤.wav', type: 'audio', size: '3.2 MB', date: '2026-07-28'},
            {name: '在你的身边_盛哲.wav', type: 'audio', size: '2.8 MB', date: '2026-07-28'},
            {name: '小城夏天_Remix.wav', type: 'audio', size: '3.5 MB', date: '2026-07-28'},
            {name: '起风了_纯音乐.wav', type: 'audio', size: '2.1 MB', date: '2026-07-28'},
            {name: '向云端_小霞.wav', type: 'audio', size: '2.9 MB', date: '2026-07-28'},
          ]
        },
        {
          id: 'competitors', name: '👁️ 竞品资料', type: 'text',
          files: [
            {name: '竞品分析周报_0731.txt', date: '2026-07-31', content: '【竞品分析周报 7/31】\n\n监控竞品: 城家公寓、冠寓、自如、微领地、泊寓\n\n🏆 城家公寓\n本周发布: 12条 | 最高点赞: 2,800\n热门主题: 毕业季租房攻略、地铁沿线房源\n视频特点: 第一人称视角、真实租客出镜\n\n🏆 冠寓\n本周发布: 8条 | 最高点赞: 1,500\n热门主题: 社区活动、宠物友好公寓\n视频特点: 社区氛围营造、UGC内容多\n\n🏆 自如\n本周发布: 15条 | 最高点赞: 3,200\n热门主题: 租房改造、合租生活\n视频特点: 专业拍摄、剧情式内容\n\n💬 评论区高频诉求TOP5\n1. 位置/地铁距离 — 占评论25%\n2. 价格/补贴 — 毕业生优惠\n3. 短租/押金 — 押一付一\n4. 宠物政策 — 可养猫吗\n5. 真实评价 — 住过的人怎么说\n\n📊 本周爆款共性\n- 价格对比型内容占30%\n- 情感故事型占25%\n- 发布最佳时间: 周五 20:00'},
            {name: '城家公寓_拆解报告.txt', date: '2026-07-30', content: '【城家公寓账号拆解报告】\n\n账号信息\n- 抖音ID: chengjia_shanghai\n- 粉丝数: 12.8万\n- 获赞数: 68.5万\n- 视频数: 342条\n\n内容策略分析\n- 更新频率: 日均2-3条\n- 内容类型: 房源展示60% + 租客故事30% + 活动宣传10%\n- 拍摄风格: 第一人称、真实感强、生活化\n\n爆款视频特征\n1. 标题: "毕业生在上海租到的第一个家" — 播放量8.2万\n2. 标题: "月薪5000能在上海租到什么" — 播放量6.5万\n3. 标题: "00后整顿租房市场" — 播放量5.8万\n\n可借鉴之处\n- 租客出镜增加真实感\n- 价格透明化建立信任\n- 社区活动营造归属感'},
          ]
        },
      ]
    },
    {
      week: 30, dateRange: '7/21 - 7/27', label: '',
      categories: [
        {
          id: 'captions', name: '🔥 热梗文案存档', type: 'text',
          files: [
            {name: '#沪漂租房日记_文案1.txt', date: '2026-07-25', content: '来上海3年，搬了5次家。每次搬家都在想：什么时候才能不再搬家？直到住进这里，终于有了家的感觉。\ud83c\udfe0 #沪漂租房日记 #上海租房 #安全感'},
            {name: '#租房前后对比_文案1.txt', date: '2026-07-24', content: '租房前：合租隔断间，公共卫生间，室友凌晨打游戏。租房后：独立一居室，干湿分离，晚上11点安静入睡。同样是租房，差别真大 \ud83c\udfe0\u27a1\ufe0f\ud83c\udfe2 #租房前后 #生活品质'},
            {name: '#独居女孩的安全感_文案1.txt', date: '2026-07-23', content: '独居女孩的安全感清单：\u2705智能门锁 \u270524h监控 \u2705管家值班 \u2705可视对讲 \u2705女性专用楼层。住在这样的公寓，爸妈再也不用担心了 \ud83d\udd12 #独居安全 #女性租房'},
          ]
        },
        {
          id: 'scripts', name: '✍️ 脚本存档', type: 'text',
          files: [
            {name: '干货攻略型_租房预算计算_脚本.txt', date: '2026-07-25', content: '【干货攻略型】毕业生租房预算怎么算？\n\n\u{1FA9}\u200d【前3秒钩子】"月薪8000，花多少租房才合理？99%的人都算错了"\n\n【分镜描述】\n镜头1(0-3s): 手持计算器特写 "月薪的1/3法则，真的对吗？"\n镜头2(3-15s): 白板教学：房租+水电+通勤+生活费=真实成本\n镜头3(15-25s): 公寓实拍+字幕标注各项费用\n镜头4(25-30s): "记住：真实房租=月租+水电+通勤时间成本"\n\n【BGM】轻快卡点纯音乐\n【时长】30秒'},
          ]
        },
        {
          id: 'plans', name: '📅 选题规划存档', type: 'text',
          files: [
            {name: '7月第4周选题规划.txt', date: '2026-07-22', content: '【7月第4周选题规划】\n\n周一: 沪漂租房日记 | 故事走心型 | 上海打工人 | 18:00\n周二: 租房前后对比 | 反差对比型 | 青年白领 | 12:00\n周三: 独居女孩安全感 | 安全攻略型 | 情侣租客 | 19:00\n周四: 合租vs整租 | 算账对比型 | 青年白领 | 18:00\n周五: 租房改造前后 | 改造展示型 | 青年白领 | 20:00'},
          ]
        },
        {
          id: 'data', name: '📊 数据周报', type: 'text',
          files: [
            {name: '本周数据汇总_0721-0727.txt', date: '2026-07-27', content: '【本周数据汇总 7/21-7/27】\n\n\ud83d\udcca 总播放量: 2.1万 (+8%)\n\ud83d\udcca 完播率: 39%\n\ud83d\udcac 互动率: 3.2%\n\u2764\ufe0f 新增点赞: 1,023\n\u{1F465} 新增粉丝: 67\n\n\ud83d\udccc 最佳发布时间: 周五 20:00\n\ud83d\udccc 最热话题: #沪漂租房日记\n\ud83d\udccc 最高播放: 沪漂租房日记 (7,100次)'},
          ]
        },
        {
          id: 'bgm', name: '🎵 BGM音乐存档', type: 'media',
          files: [
            {name: '星辰大海_黄霄云.wav', type: 'audio', size: '3.1 MB', date: '2026-07-22'},
            {name: '遇见_孙燕姿.wav', type: 'audio', size: '2.6 MB', date: '2026-07-22'},
            {name: '稻香_周杰伦.wav', type: 'audio', size: '3.0 MB', date: '2026-07-22'},
          ]
        },
        {
          id: 'competitors', name: '👁️ 竞品资料', type: 'text',
          files: [
            {name: '竞品分析周报_0724.txt', date: '2026-07-24', content: '【竞品分析周报 7/24】\n\n监控竞品: 城家公寓、冠寓、自如、微领地、泊寓\n\n🏆 城家公寓\n本周发布: 10条 | 最高点赞: 2,400\n热门主题: 沪漂租房日记、租房改造\n\n🏆 冠寓\n本周发布: 7条 | 最高点赞: 1,300\n热门主题: 毕业季优惠、社区厨房\n\n🏆 自如\n本周发布: 14条 | 最高点赞: 2,900\n热门主题: 合租室友故事、租房避坑\n\n💬 评论区高频诉求TOP5\n1. 位置/地铁距离 — 占评论22%\n2. 价格/补贴 — 毕业生优惠\n3. 短租/押金 — 可短租吗\n4. 宠物政策 — 宠物友好公寓\n5. 真实评价 — 隔音、安全性\n\n📊 本周爆款共性\n- 改造展示型内容占28%\n- 故事走心型占27%\n- 发布最佳时间: 周五 20:00'},
          ]
        },
      ]
    },
    {
      week: 29, dateRange: '7/14 - 7/20', label: '',
      categories: [
        {
          id: 'captions', name: '🔥 热梗文案存档', type: 'text',
          files: [
            {name: '#合租到底值不值_文案1.txt', date: '2026-07-18', content: '合租2000 vs 整租3000，差1000块得到什么？独立卫生间+不用等洗澡+不用听室友打电话+想几点睡几点睡。1000块买自由，值不值？\ud83e\uddde #合租vs整租'},
            {name: '#租房改造前后对比_文案1.txt', date: '2026-07-16', content: '改造前：灰墙+水泥地+破窗帘。改造后：暖色墙+木地板+纱帘+绿植。总预算800块，耗时2天。改造教程已整理好 \ud83d\ude9b #出租屋改造 #改造前后'},
          ]
        },
        {
          id: 'scripts', name: '✍️ 脚本存档', type: 'text',
          files: [
            {name: '算账对比型_合租vs整租_脚本.txt', date: '2026-07-18', content: '【算账对比型】合租vs整租，到底哪个值？\n\n\u{1FA9}\u200d【前3秒钩子】"合租省1000块，但你失去了这些..."\n\n【分镜描述】\n镜头1(0-3s): 分屏对比：左合租右整租\n镜头2(3-15s): 逐项对比：卫生间、厨房、安静度、自由度\n镜头3(15-25s): 算账：多花1000块=每天33块=一杯咖啡换自由\n镜头4(25-30s): "你觉得值不值？评论区投票"\n\n【BGM】节奏卡点纯音乐\n【时长】30秒'},
          ]
        },
        {
          id: 'plans', name: '📅 选题规划存档', type: 'text',
          files: [
            {name: '7月第3周选题规划.txt', date: '2026-07-15', content: '【7月第3周选题规划】\n\n周一: 合租到底值不值 | 算账对比型 | 青年白领 | 18:00\n周二: 租房改造前后对比 | 改造展示型 | 青年白领 | 12:00\n周三: 地铁口公寓推荐 | 房源展示型 | 应届毕业生 | 19:00\n周四: 毕业生租房攻略 | 干货攻略型 | 应届毕业生 | 18:00\n周五: 沪漂一周年回顾 | 故事走心型 | 上海打工人 | 20:00'},
          ]
        },
        {
          id: 'data', name: '📊 数据周报', type: 'text',
          files: [
            {name: '本周数据汇总_0714-0720.txt', date: '2026-07-20', content: '【本周数据汇总 7/14-7/20】\n\n\ud83d\udcca 总播放量: 1.8万 (+5%)\n\ud83d\udcca 完播率: 36%\n\ud83d\udcac 互动率: 2.9%\n\u2764\ufe0f 新增点赞: 856\n\u{1F465} 新增粉丝: 52\n\n\ud83d\udccc 最佳发布时间: 周五 20:00\n\ud83d\udccc 最热话题: #合租到底值不值\n\ud83d\udccc 最高播放: 合租vs整租 (6,200次)'},
          ]
        },
        {
          id: 'bgm', name: '🎵 BGM音乐存档', type: 'media',
          files: [
            {name: '孤勇者_陈奕迅.wav', type: 'audio', size: '3.3 MB', date: '2026-07-15'},
            {name: '光年之外_邓紫棋.wav', type: 'audio', size: '2.9 MB', date: '2026-07-15'},
          ]
        },
        {
          id: 'competitors', name: '👁️ 竞品资料', type: 'text',
          files: [
            {name: '竞品分析周报_0717.txt', date: '2026-07-17', content: '【竞品分析周报 7/17】\n\n监控竞品: 自如、魔方公寓、泊寓\n\n📊 自如\n- 本周发布: 12条视频\n- 热门话题: #自如租房体验 #租房改造\n- 互动数据: 平均点赞320 评论45\n- 爆款视频: "自如整租值不值" 播放8.2万\n- 内容特点: 侧重装修品质和服务体验\n\n📊 魔方公寓\n- 本周发布: 8条视频\n- 热门话题: #魔方公寓 #上海租房\n- 互动数据: 平均点赞210 评论28\n- 爆款视频: "2000块能在上海租到啥" 播放6.1万\n- 内容特点: 强调性价比和社区文化\n\n📊 泊寓\n- 本周发布: 10条视频\n- 热门话题: #泊寓体验官 #毕业生租房\n- 互动数据: 平均点赞180 评论22\n- 爆款视频: "毕业生租房避坑" 播放3.5万\n- 内容特点: 针对毕业生群体\n\n💡 本周启示: 自如品质路线粘性高，魔方性价比打法获客快，泊寓毕业生定向策略精准'},
          ]
        },
      ]
    },
    {
      week: 28, dateRange: '7/7 - 7/13', label: '',
      categories: [
        {
          id: 'captions', name: '🔥 热梗文案存档', type: 'text',
          files: [
            {name: '#上海租房避坑指南_文案1.txt', date: '2026-07-10', content: '上海租房5大坑：\u2460二房东转租 \u2461押金不退 \u2462隐性收费 \u2463室友问题 \u2464退房扣押。这份避坑指南请收好！\ud83d\udccb #上海租房 #租房避坑 #沪漂生活'},
          ]
        },
        {
          id: 'scripts', name: '✍️ 脚本存档', type: 'text',
          files: [
            {name: '干货攻略型_租房避坑5大坑_脚本.txt', date: '2026-07-10', content: '【干货攻略型】上海租房5大避坑指南\n\n\u{1FA9}\u200d【前3秒钩子】"在上海租房3年，这5个坑我全踩过了..."\n\n【分镜描述】\n镜头1(0-3s): 怼脸特写 "租房5大坑，第3个最坑！"\n镜头2(3-12s): 逐个展示5个坑+避坑方法\n镜头3(12-25s): 正面案例：选对公寓的重要性\n镜头4(25-30s): "收藏这条视频，租房不踩坑"\n\n【BGM】节奏感强的卡点音乐\n【时长】30秒'},
          ]
        },
        {
          id: 'plans', name: '📅 选题规划存档', type: 'text',
          files: [
            {name: '7月第2周选题规划.txt', date: '2026-07-08', content: '【7月第2周选题规划】\n\n周一: 上海租房避坑指南 | 干货攻略型 | 上海打工人 | 18:00\n周二: 押金退还攻略 | 法律科普型 | 青年白领 | 12:00\n周三: 地铁沿线租房推荐 | 房源展示型 | 应届毕业生 | 19:00\n周四: 租房合同注意事项 | 干货攻略型 | 青年白领 | 18:00\n周五: 沪漂第一年总结 | 故事走心型 | 上海打工人 | 20:00'},
          ]
        },
        {
          id: 'data', name: '📊 数据周报', type: 'text',
          files: [
            {name: '本周数据汇总_0707-0713.txt', date: '2026-07-13', content: '【本周数据汇总 7/7-7/13】\n\n\ud83d\udcca 总播放量: 1.5万\n\ud83d\udcca 完播率: 33%\n\ud83d\udcac 互动率: 2.5%\n\u2764\ufe0f 新增点赞: 678\n\u{1F465} 新增粉丝: 38\n\n\ud83d\udccc 最佳发布时间: 周五 20:00\n\ud83d\udccc 最热话题: #上海租房避坑指南\n\ud83d\udccc 最高播放: 上海租房5大坑 (5,100次)'},
          ]
        },
        {
          id: 'bgm', name: '🎵 BGM音乐存档', type: 'media',
          files: [
            {name: '起风了_买辣椒也用券.wav', type: 'audio', size: '2.8 MB', date: '2026-07-08'},
          ]
        },
        {
          id: 'competitors', name: '👁️ 竞品资料', type: 'text',
          files: [
            {name: '竞品分析周报_0710.txt', date: '2026-07-10', content: '【竞品分析周报 7/10】\n\n监控竞品: 冠寓、城家公寓、安歆公寓\n\n📊 冠寓\n- 本周发布: 10条视频\n- 热门话题: #冠寓生活 #上海租房攻略\n- 互动数据: 平均点赞280 评论35\n- 爆款视频: "上海地铁口冠寓实拍" 播放4.8万\n- 内容特点: 强调交通便利和社群活动\n\n📊 城家公寓\n- 本周发布: 6条视频\n- 热门话题: #城家公寓 #品质租房\n- 互动数据: 平均点赞150 评论18\n- 爆款视频: "城家公寓room tour" 播放3.2万\n- 内容特点: 突出家居品质和管家服务\n\n📊 安歆公寓\n- 本周发布: 7条视频\n- 热门话题: #安歆公寓 #上海白领租房\n- 互动数据: 平均点赞120 评论15\n- 爆款视频: "白领的精致租房生活" 播放2.1万\n- 内容特点: 白领职场人群定位\n\n💡 本周启示: 冠寓地铁口概念值得借鉴，城家管家服务差异化明显，安歆白领定位精准但内容创意待加强'},
          ]
        },
      ]
    },
  ];

  // v4.5.1: 从 weeklyDataCache 动态生成本周（实时）条目，插入到最前
  var liveWeek = null;
  try {
    var wd = (typeof weeklyDataCache !== 'undefined') ? weeklyDataCache : null;
    if (wd && wd.week && wd.week_label) {
      var wkNum = 0;
      var m = String(wd.week).match(/(\d+)/);
      if (m) wkNum = parseInt(m[1], 10);
      var today = new Date();
      var curISOWeek = (function(){
        var d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
        var dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      })();
      var wkNumFinal = wkNum || curISOWeek;

      var liveFiles = { hotspot: [], calendar: [], analysis: [], competitor: [], bgm: [] };
      if (wd.hotspot) {
        ['douyin','rednote','weibo','zhihu'].forEach(function(k){
          (wd.hotspot[k] || []).slice(0, 10).forEach(function(it){
            if (it && it.title) liveFiles.hotspot.push({ name: '[' + k + '] ' + it.title, date: (wd.generated_at || '').slice(0, 10) || '', content: it.title + (it.url ? '\n链接: ' + it.url : '') });
          });
        });
      }
      if (wd.calendar && wd.calendar.plans) {
        wd.calendar.plans.forEach(function(p){
          liveFiles.calendar.push({ name: (p.day || '') + '_' + (p.title || '选题'), date: (wd.generated_at || '').slice(0, 10) || '', content: '【' + (p.type || '') + '】' + (p.title || '') + '\n人群: ' + (p.audience || '') + '\nBGM: ' + (p.bgm || '') + '\n时间: ' + (p.time || '') + '\n' + (p.summary || '') });
        });
      }
      if (wd.analysis) {
        (wd.analysis.like_winners || []).slice(0, 5).forEach(function(w){
          liveFiles.analysis.push({ name: '赞' + (w.likes || '') + '_' + (w.title || ''), date: (wd.generated_at || '').slice(0, 10) || '', content: '【前3秒钩子】' + (w.hook || '') + '\n【内容结构】' + (w.structure || '') + '\n【爆款原因】' + (w.reason || '') + '\n【BGM】' + (w.bgm || '') });
        });
        (wd.analysis.view_winners || []).slice(0, 5).forEach(function(w){
          liveFiles.analysis.push({ name: '播' + (w.plays || '') + '_' + (w.title || ''), date: (wd.generated_at || '').slice(0, 10) || '', content: '【前3秒钩子】' + (w.hook || '') + '\n【内容结构】' + (w.structure || '') + '\n【爆款原因】' + (w.reason || '') + '\n【BGM】' + (w.bgm || '') });
        });
      }
      if (wd.competitor && wd.competitor.length) {
        wd.competitor.forEach(function(c){
          liveFiles.competitor.push({ name: c.name || c.account || '竞品', date: (wd.generated_at || '').slice(0, 10) || '', content: (c.strategy || c.summary || JSON.stringify(c)) });
        });
      }
      if (wd.bgm && wd.bgm.names && wd.bgm.names.length) {
        wd.bgm.names.slice(0, 20).forEach(function(nm){
          liveFiles.bgm.push({ name: nm, date: (wd.generated_at || '').slice(0, 10) || '', content: '热门BGM/话题：' + nm + '\n搜索：https://www.douyin.com/search/' + encodeURIComponent(nm) });
        });
      }

      liveWeek = {
        week: wkNumFinal,
        dateRange: wd.week_label || '',
        label: '本周（实时）',
        isLive: true,
        categories: [
          { id: 'hotspot', name: '🔥 本周热榜（AI 实时）', type: 'text', files: liveFiles.hotspot },
          { id: 'calendar', name: '📅 本周选题日历（AI 周一更新）', type: 'text', files: liveFiles.calendar },
          { id: 'analysis', name: '🏆 本周爆款拆解（AI 周一更新）', type: 'text', files: liveFiles.analysis },
          { id: 'competitor', name: '👁️ 本周竞品监控（AI 周一更新）', type: 'text', files: liveFiles.competitor },
          { id: 'bgm', name: '🎵 本周热门BGM（实时）', type: 'text', files: liveFiles.bgm }
        ]
      };
      liveWeek.categories = liveWeek.categories.filter(function(c){ return c.files && c.files.length > 0; });
      if (liveWeek.categories.length === 0) liveWeek = null;
    }
  } catch(e) { console.warn('[renderMaterial] 动态本周生成失败:', e); }

  // v4.5.1: 从 localStorage 读取已归档的历史周（按周倒序，最多保留 4 个）
  var archivedWeeks = [];
  try {
    var raw = localStorage.getItem('apt_v4_archives');
    if (raw) {
      var arr = JSON.parse(raw);
      if (arr && arr.length) {
        arr.forEach(function(snap) {
          if (snap.week === (liveWeek && liveWeek.week)) return; // 同周不重复
          var wkNum2 = 0; var m2 = String(snap.week || '').match(/(\d+)/);
          if (m2) wkNum2 = parseInt(m2[1], 10);
          var af = { hotspot: [], calendar: [], analysis: [], competitor: [], bgm: [] };
          if (snap.hotspot) { ['douyin','rednote','weibo','zhihu'].forEach(function(k){ (snap.hotspot[k]||[]).slice(0,5).forEach(function(it){ if (it && it.title) af.hotspot.push({ name: '[' + k + '] ' + it.title, date: (snap.generated_at||'').slice(0,10)||'', content: it.title }); }); }); }
          if (snap.calendar && snap.calendar.plans) { snap.calendar.plans.forEach(function(p){ af.calendar.push({ name: (p.day||'')+'_'+(p.title||'选题'), date: (snap.generated_at||'').slice(0,10)||'', content: (p.title||'')+'\n'+(p.summary||'') }); }); }
          if (snap.analysis) { (snap.analysis.like_winners||[]).forEach(function(w){ af.analysis.push({ name: '赞'+(w.likes||'')+'_'+(w.title||''), date: (snap.generated_at||'').slice(0,10)||'', content: '【钩子】'+(w.hook||'')+'\n【结构】'+(w.structure||'') }); }); }
          if (snap.competitor && snap.competitor.length) { snap.competitor.forEach(function(c){ af.competitor.push({ name: c.name||c.account||'竞品', date: (snap.generated_at||'').slice(0,10)||'', content: (c.strategy||c.summary||'') }); }); }
          if (snap.bgm && snap.bgm.names) { snap.bgm.names.slice(0,10).forEach(function(nm){ af.bgm.push({ name: nm, date: (snap.generated_at||'').slice(0,10)||'', content: 'BGM：'+nm }); }); }
          var cats = [
            { id:'hotspot', name:'🔥 历史热榜', type:'text', files:af.hotspot },
            { id:'calendar', name:'📅 历史选题', type:'text', files:af.calendar },
            { id:'analysis', name:'🏆 历史爆款', type:'text', files:af.analysis },
            { id:'competitor', name:'👁️ 历史竞品', type:'text', files:af.competitor },
            { id:'bgm', name:'🎵 历史BGM', type:'text', files:af.bgm }
          ].filter(function(c){ return c.files.length > 0; });
          if (cats.length > 0) {
            archivedWeeks.push({ week: wkNum2, dateRange: snap.week_label || '', label: '已归档', _archivedAt: snap._archivedAt, categories: cats });
          }
        });
      }
    }
  } catch(e) { console.warn('[renderMaterial] 读归档失败:', e); }

  // 合并：liveWeek（实时） + 归档周 + 硬编码示例
  if (liveWeek) weekArchives.unshift(liveWeek);
  archivedWeeks.forEach(function(aw) { weekArchives.push(aw); });

  var mediaIcons = { audio: '\ud83c\udfb5', doc: '\ud83d\udcc4', xls: '\ud83d\udcca', video: '\ud83c\udfac', image: '\ud83d\uddbc\ufe0f', pdf: '\ud83d\udcd5', zip: '\ud83d\udce6' };

  var activeWeek = 0;
  var totalFiles = 0;
  weekArchives.forEach(function(w) {
    w.categories.forEach(function(c) { totalFiles += c.files.length; });
  });

  var html = '<div class="stats-row">' +
    '<div class="stat-card" style="cursor:pointer" onclick="scrollToSection(\'mat-folders\')"><div class="stat-value">' + weekArchives.length + '</div><div class="stat-label">\ud83d\udcc1 周存档</div></div>' +
    '<div class="stat-card" style="cursor:pointer" onclick="scrollToSection(\'mat-folders\')"><div class="stat-value">' + totalFiles + '</div><div class="stat-label">\ud83d\udcc4 总文件</div></div>' +
    '<div class="stat-card" style="cursor:pointer"><div class="stat-value">4</div><div class="stat-label">\ud83c\udfa7 文字分类</div></div>' +
    '<div class="stat-card" style="cursor:pointer"><div class="stat-value">3</div><div class="stat-label">\ud83c\udf99\ufe0f 媒体分类</div></div>' +
    '</div>';
  // v4.5.1: 顶部归档说明 + 归档当前周按钮
  html += '<div style="background:linear-gradient(135deg,#fef3c7,#fde68a);border:1px solid #f59e0b;border-radius:var(--radius);padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
    '<div style="flex:1;min-width:240px;">' +
      '<div style="font-weight:600;font-size:14px;color:#92400e;">\ud83d\udce6 自动归档说明</div>' +
      '<div style="font-size:12px;color:#92400e;margin-top:4px;line-height:1.5;">页面已自动加载本周（实时）AI 数据卡片；下方 4 周为 v4.0 上线时的示例数据。点「\ud83d\udce6 归档当前周」可将本周 AI 数据快照保存到本地（localStorage），下次打开自动显示在顶部。</div>' +
    '</div>' +
    '<button onclick="archiveCurrentWeek()" style="padding:10px 18px;background:#f59e0b;color:#fff;border:none;border-radius:var(--radius-sm);font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;">\ud83d\udce6 归档当前周</button>' +
  '</div>';

  html += '<div class="section-title" id="mat-folders">\ud83d\udce6 按周归档素材云盘</div>' +
    '<p style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">\ud83d\udcd6 每周自动归档所有模块数据 \u00b7 文字类可点击查看内容并复制 \u00b7 媒体类可查看文件信息</p>' +
    '<div class="cloud-drive">' +
    '<div class="cloud-sidebar" id="cloudSidebar"></div>' +
    '<div class="cloud-main" id="cloudMain">' +
      '<div id="cloudFileList"></div>' +
    '</div></div>';

  container.innerHTML = html;

  function renderCloud() {
    var sidebar = document.getElementById('cloudSidebar');
    sidebar.innerHTML = '';
    weekArchives.forEach(function(w, idx) {
      var el = document.createElement('div');
      el.className = 'week-folder' + (activeWeek === idx ? ' active' : '');
      el.onclick = function() { activeWeek = idx; renderCloud(); };
      var fileCount = 0;
      w.categories.forEach(function(c) { fileCount += c.files.length; });
      el.innerHTML = '<div class="wf-top"><span class="wf-icon">\ud83d\udcc1</span><span>\u7b2c' + w.week + '\u5468</span>' + (w.label ? '<span class="wf-label">' + w.label + '</span>' : '') + '</div><div class="wf-range">' + w.dateRange + ' \u00b7 ' + fileCount + '\u9879</div>';
      sidebar.appendChild(el);
    });

    var main = document.getElementById('cloudFileList');
    var current = weekArchives[activeWeek];
    if (!current) return;
    main.innerHTML = '<div style="margin-bottom:16px;padding:12px 16px;background:var(--primary-light);border-radius:8px;font-size:14px;font-weight:600;color:var(--primary-dark);">\ud83d\udcc1 \u7b2c' + current.week + '\u5468\u6570\u636e\u5b58\u6863 (' + current.dateRange + ')' + (current.label ? ' \u00b7 ' + current.label : '') + '</div>';

    current.categories.forEach(function(cat) {
      // v4.6.7: 每个分类可点击折叠（默认折叠，本周热榜默认展开）
      var isOpen = cat.id === 'hotspot';
      var catHtml = '<div class="cat-section' + (isOpen ? ' open' : '') + '">' +
        '<div class="cat-header" onclick="this.parentElement.classList.toggle(\'open\')">' +
        '<span class="cat-name">' + cat.name + '</span>' +
        '<span class="cat-count">(' + cat.files.length + '\u9879)</span>' +
        '<span class="cat-toggle">▼</span>' +
        '</div>' +
        '<div class="cat-body">';

      if (cat.files.length === 0) {
        catHtml += '<div class="cat-empty">本周暂无数据</div>';
      } else if (cat.type === 'text') {
        cat.files.forEach(function(file, fi) {
          var fid = 'tf-' + current.week + '-' + cat.id + '-' + fi;
          var encoded = encodeURIComponent(file.content).replace(/'/g, '%27').replace(/"/g, '%22');
          catHtml += '<div class="text-file" id="' + fid + '">' +
            '<div class="tf-header" onclick="(function(el){el.parentElement.classList.toggle(\'open\');})(this)">' +
            '<span class="tf-icon">📄</span>' +
            '<span class="tf-name">' + file.name + '</span>' +
            '<span class="tf-date">' + file.date + '</span>' +
            '<span class="tf-expand">▼</span>' +
            '</div>' +
            '<div class="tf-content">' + file.content.replace(/</g, '&lt;') + '<br><button class="tf-copy-btn" data-copy="' + encoded + '">📋 复制全文</button></div>' +
            '</div>';
        });
      } else {
        cat.files.forEach(function(file) {
          var icon = mediaIcons[file.type] || '📁';
          catHtml += '<div class="cloud-file">' +
            '<div class="file-icon">' + icon + '</div>' +
            '<div class="file-info"><div class="file-name">' + file.name + '</div><div class="file-meta">' + file.size + ' · ' + file.date + '</div></div>' +
            '<div class="file-actions"><button class="dl-btn" onclick="simulateDownload(\'' + file.name + '\')">⬇️ 下载</button></div>' +
            '</div>';
        });
      }

      catHtml += '</div></div>';
      main.innerHTML += catHtml;
    });
  }

  renderCloud();
  setTimeout(function() { renderCloud(); }, 50);
}

function simulateUpload() {
  showToast('\ud83d\udce4 \u6587\u4ef6\u4e0a\u4f20\u529f\u80fd\u5df2\u51c6\u5907\u5c31\u7eed\uff08\u6a21\u62df\uff09\u2014\u2014 \u9009\u62e9\u6587\u4ef6\u540e\u81ea\u52a8\u5f52\u6863\u5230\u5f53\u524d\u5468');
}

function simulateDownload(filename) {
  showToast('\u2b07\ufe0f ' + filename + ' \u5df2\u52a0\u5165\u4e0b\u8f7d\u961f\u5217\uff08\u6a21\u62df\uff09');
}

// v4.5.1: 归档当前周（把 weeklyDataCache 快照到 localStorage）
function archiveCurrentWeek() {
  if (!weeklyDataCache || !weeklyDataCache.week) {
    showToast('\u274c \u5f53\u524d\u5468\u6570\u636e\u5c1a\u672a\u52a0\u8f7d\uff0c\u8bf7\u5148\u5230\u201c\u70ed\u6897\u6355\u624b\u201d\u6a21\u5757\u70b9\u201c\u5373\u5237\u65b0\u201d');
    return;
  }
  try {
    var key = 'apt_v4_archives';
    var raw = localStorage.getItem(key);
    var arr = raw ? JSON.parse(raw) : [];
    // 同 week 覆盖
    var wkKey = weeklyDataCache.week;
    var exists = arr.findIndex(function(x){ return x.week === wkKey; });
    var snap = JSON.parse(JSON.stringify(weeklyDataCache));
    snap._archivedAt = new Date().toISOString();
    if (exists >= 0) arr[exists] = snap; else arr.unshift(snap);
    // 保留最近 12 周
    if (arr.length > 12) arr = arr.slice(0, 12);
    localStorage.setItem(key, JSON.stringify(arr));
    showToast('\u2705 \u5df2\u5f52\u6863\u300a' + wkKey + '\u300b\uff0c\u4e0b\u6b21\u6253\u5f00\u9876\u90e8\u81ea\u52a8\u663e\u793a\uff08\u4fdd\u5b58 ' + arr.length + ' \u5468\uff09');
  } catch(e) {
    showToast('\u274c \u5f52\u6863\u5931\u8d25\uff1a' + e.message);
  }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', function() {
  init();
  console.log('🏠 长租公寓运营工作台 v3.0');
  console.log('📅 今日: 2026-08-01');
  console.log('🎓 季节标签: 毕业季冲刺');
  console.log('🤖 全模块增强版已加载');
});
