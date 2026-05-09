/* ============================== DB ============================== */
const DB = {
  _prefix: 'tc_',
  _get(key, def) { try { const d = localStorage.getItem(this._prefix + key); return d ? JSON.parse(d) : def; } catch { return def; } },
  _set(k, v) { localStorage.setItem(this._prefix + k, JSON.stringify(v)); },

  getRecords() { return this._get('records', []); },
  saveRecords(r) { this._set('records', r); },
  addRecord(rec) { const r = this.getRecords(); r.unshift(rec); this.saveRecords(r); return rec; },

  getTodos(date) { const a = this._get('todos', {}); return a[date] || []; },
  saveTodos(date, todos) { const a = this._get('todos', {}); a[date] = todos; this._set('todos', a); },

  getJournal(date) { const a = this._get('journals', {}); return a[date] || ''; },
  saveJournal(date, text) { const a = this._get('journals', {}); a[date] = text; this._set('journals', a); },

  deleteRecord(id) { this.saveRecords(this.getRecords().filter(r=>r.id!==id)); },
  getRecordsByDate(date) { return this.getRecords().filter(r => r.date === date); },
  getStats(date) { const r = this.getRecordsByDate(date); return { count: r.length, totalMinutes: Math.round(r.reduce((s, x) => s + x.duration, 0) / 60), records: r }; }
};

/* ============================== Utils ============================== */
function dateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function today() { return dateStr(new Date()); }
function tomorrow() { const d = new Date(); d.setDate(d.getDate()+1); return dateStr(d); }
function fmtDuration(s) { const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), s2=Math.floor(s%60); return (h?h+'时':'')+(h||m?m+'分':'')+s2+'秒'; }
function fmtTimeDisplay(s) { const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), s2=Math.floor(s%60); return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s2).padStart(2,'0'); }
function fmtCountdown(s) { const m=Math.floor(Math.max(0,s)/60), s2=Math.floor(Math.max(0,s)%60); return String(m).padStart(2,'0')+':'+String(s2).padStart(2,'0'); }
function fmtClockTime(ts) { const d=new Date(ts*1000); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
function esc(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
function vibrate() { if (navigator.vibrate) navigator.vibrate([200,100,200,100,400]); }

let _toastTimer;
function showToast(msg) {
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  clearTimeout(_toastTimer); _toastTimer=setTimeout(()=>el.classList.remove('show'),2000);
}

/* ============================== System Log ============================== */
const Log = {
  getAll() { return DB._get('logs', []); },
  _save(logs) { DB._set('logs', logs); },
  add(msg) {
    const logs = this.getAll();
    logs.unshift({ time: Date.now(), msg });
    if (logs.length > 200) logs.length = 200;
    this._save(logs);
  },
  dataSnapshot() {
    const lastSnap = DB._get('_last_snap', '');
    const d = today();
    if (lastSnap === d) return;
    DB._set('_last_snap', d);
    const records = DB.getRecords();
    const raw = DB._get('todos', {});
    const todoCount = Object.values(raw).reduce((s, arr) => s + arr.length, 0);
    this.add('数据快照：' + records.length + ' 条记录，' + todoCount + ' 项待办');
  }
};

// 自动记录数据变更到系统日志
{
  const _addRecord = DB.addRecord;
  DB.addRecord = function (rec) {
    const r = _addRecord.call(this, rec);
    Log.add('记录已保存：' + (r.activity || '未记录') + '（' + fmtDuration(r.duration) + '）');
    return r;
  };
  const _deleteRecord = DB.deleteRecord;
  DB.deleteRecord = function (id) {
    const records = this.getRecords();
    const rec = records.find(r => r.id === id);
    _deleteRecord.call(this, id);
    if (rec) Log.add('记录已删除：' + (rec.activity || '未记录'));
  };
}

/* ============================== Timer UP ============================== */
const TimerUP = {
  state:'idle', startTime:null, accumulated:0, activity:'', tickId:null, saveTimer:null,

  init() {
    const s=this._loadState();
    if (s&&s.state==='running') { this.state='running'; this.startTime=Date.now(); this.accumulated=s.accumulated||0; this.activity=s.activity||''; this._startTick(); this._syncUI(); }
    else if (s&&s.state==='paused') { this.state='paused'; this.startTime=null; this.accumulated=s.accumulated||0; this.activity=s.activity||''; this._syncUI(); }
    this.saveTimer=setInterval(()=>this._save(),1000);
  },

  start() { if(this.state!=='idle')return; this.state='running'; this.startTime=Date.now(); this.accumulated=0; this.activity=''; this._startTick(); this._syncUI(); const el=document.getElementById('up-activity-input'); el.value=''; el.focus(); this._save(); },
  pause() { if(this.state!=='running')return; this.accumulated+=(Date.now()-this.startTime)/1000; this.state='paused'; this.startTime=null; this._stopTick(); this.activity=document.getElementById('up-activity-input').value.trim(); this._syncUI(); this._save(); },
  resume() { if(this.state!=='paused')return; this.state='running'; this.startTime=Date.now(); this._startTick(); this._syncUI(); this.activity=document.getElementById('up-activity-input').value.trim(); this._save(); },
  stop() {
    if(this.state==='idle')return;
    if(this.state==='running'){this.accumulated+=(Date.now()-this.startTime)/1000;this._stopTick();}
    this.activity=document.getElementById('up-activity-input').value.trim()||'未记录';
    const e=Math.floor(this.accumulated);
    if(e>0){DB.addRecord({id:Date.now(),date:today(),startTime:Math.floor((this.startTime||Date.now()-e*1000)/1000),endTime:Math.floor(Date.now()/1000),duration:e,activity:this.activity});showToast('已保存：'+fmtDuration(e));renderStats();}
    this._reset(); this._syncUI(); this._save();
  },
  reset() { if(this.state==='running'){this.accumulated+=(Date.now()-this.startTime)/1000;this._stopTick();}const e=Math.floor(this.accumulated);if(e>0&&this.state!=='idle'){const act=document.getElementById('up-activity-input').value.trim()||'未记录';DB.addRecord({id:Date.now(),date:today(),startTime:Math.floor((this.startTime||Date.now()-e*1000)/1000),endTime:Math.floor(Date.now()/1000),duration:e,activity:act});showToast('已保存：'+fmtDuration(e));renderStats();} this._reset(); this._syncUI(); this._save(); },
  _reset() { this.state='idle';this.startTime=null;this.accumulated=0;this.activity='';document.getElementById('up-activity-input').value=''; },
  _startTick() { this._stopTick(); this.tickId=setInterval(()=>this._updDisplay(),200); this._updDisplay(); },
  _stopTick() { if(this.tickId){clearInterval(this.tickId);this.tickId=null;} },
  _elapsed() { if(this.state==='running')return this.accumulated+(Date.now()-this.startTime)/1000; if(this.state==='paused')return this.accumulated; return 0; },
  _updDisplay() { document.getElementById('up-time').textContent=fmtTimeDisplay(this._elapsed()); },
  _save() {
    const st=this.state==='idle'?null:{state:this.state,startTime:this.startTime,accumulated:this.state==='running'?this.accumulated+(Date.now()-this.startTime)/1000:this.accumulated,activity:document.getElementById('up-activity-input').value.trim()||this.activity};
    if(st)localStorage.setItem('tc_up_timer',JSON.stringify(st)); else localStorage.removeItem('tc_up_timer');
  },
  _loadState() { try{const d=localStorage.getItem('tc_up_timer');return d?JSON.parse(d):null}catch{return null} },
  _syncUI() {
    const r=this.state==='running', p=this.state==='paused', i=this.state==='idle';
    document.querySelector('#up-controls [data-action="start"]').style.display=i?'':'none';
    document.querySelector('#up-controls [data-action="pause"]').style.display=r?'':'none';
    document.querySelector('#up-controls [data-action="resume"]').style.display=p?'':'none';
    document.querySelector('#up-controls [data-action="stop"]').style.display=(r||p)?'':'none';
    document.querySelector('#up-controls [data-action="reset"]').style.display=(r||p)?'':'none';
    document.getElementById('up-status').textContent=i?'空闲':(r?'计时中':'已暂停');
    document.getElementById('up-activity').classList.toggle('visible',!i);
    if(i)document.getElementById('up-time').textContent='00:00:00';
    this._updDisplay();
  }
};

/* ============================== Timer DOWN ============================== */
const TimerDOWN = {
  state:'idle', total:1500, remaining:1500, tickId:null,

  init() {
    const s=this._loadState();
    if(s&&s.state==='running'){this.total=s.total;this.remaining=s.remaining;this.state='running';this._startTick();this._syncUI();}
    else if(s&&s.state==='paused'){this.total=s.total;this.remaining=s.remaining;this.state='paused';this._syncUI();}
    else{this.total=1500;this.remaining=1500;}
    Knob.setArc(this.remaining);
    this._updDisplay();
    Knob._highlightPreset(this.remaining);
  },

  start() { if(this.state!=='idle')return; this.remaining=this.total; this.state='running'; this._startTick(); this._syncUI(); const el=document.getElementById('cd-activity-input'); el.value=''; },
  pause() { if(this.state!=='running')return; this.state='paused'; this._stopTick(); this._syncUI(); this._save(); },
  resume() { if(this.state!=='paused')return; this.state='running'; this._startTick(); this._syncUI(); },
  stop() {
    if(this.state!=='running'&&this.state!=='paused')return;
    this._stopTick();
    const elapsed=this.total-this.remaining;
    if(elapsed>0){
      const act=document.getElementById('cd-activity-input').value.trim()||('倒计时 '+Math.round(elapsed/60)+'分钟');
      const now=Math.floor(Date.now()/1000);
      DB.addRecord({id:Date.now(),date:today(),startTime:now-elapsed,endTime:now,duration:elapsed,activity:act});
      showToast('已保存：'+fmtDuration(elapsed));
      renderStats();
    }
    this.state='idle'; this.remaining=this.total; Knob.setArc(this.remaining); this._updDisplay(); this._syncUI(); this._save();
  },
  reset() { const saveable=(this.state==='running'||this.state==='paused');if(this.state==='running')this._stopTick();const e=Math.floor(this.total-this.remaining);if(e>0&&saveable){const act=document.getElementById('cd-activity-input').value.trim()||('倒计时 '+Math.round(e/60)+'分钟');const now=Math.floor(Date.now()/1000);DB.addRecord({id:Date.now(),date:today(),startTime:now-e,endTime:now,duration:e,activity:act});showToast('已保存：'+fmtDuration(e));renderStats();} this.state='idle'; this.remaining=this.total; Knob.setArc(this.remaining); this._updDisplay(); this._syncUI(); this._save(); },

  setTime(s) {
    if(this.state!=='idle')return;
    this.total=Math.max(60,Math.min(2700,Math.round(s)));
    this.remaining=this.total;
    Knob.setArc(this.remaining);
    this._updDisplay();
    Knob._highlightPreset(this.remaining);
  },

  _tick() {
    this.remaining=Math.max(0,this.remaining-1);
    Knob.setArc(this.remaining);
    this._updDisplay();
    this._save();
    if(this.remaining<=0){
      this._stopTick();
      const act=document.getElementById('cd-activity-input').value.trim()||('倒计时 '+Math.round(this.total/60)+'分钟');
      const now=Math.floor(Date.now()/1000);
      DB.addRecord({id:Date.now(),date:today(),startTime:now-this.total,endTime:now,duration:this.total,activity:act});
      this.state='finished';vibrate();this._syncUI();showToast('⏰ 倒计时完成！');renderStats();
    }
  },
  _startTick() { this._stopTick(); this.tickId=setInterval(()=>this._tick(),1000); this._tick(); },
  _stopTick() { if(this.tickId){clearInterval(this.tickId);this.tickId=null;} },
  _save() {
    if(this.state==='running'||this.state==='paused'){localStorage.setItem('tc_down_timer',JSON.stringify({state:this.state,total:this.total,remaining:this.remaining}));}
    else{localStorage.removeItem('tc_down_timer');}
  },
  _loadState() { try{const d=localStorage.getItem('tc_down_timer');return d?JSON.parse(d):null}catch{return null} },
  _updDisplay() { document.getElementById('knob-time').textContent=fmtCountdown(this.remaining); },
  _syncUI() {
    const r=this.state==='running', p=this.state==='paused', i=this.state==='idle', f=this.state==='finished';
    const s=(id)=>document.getElementById(id);
    s('cd-start').style.display=i?'':'none';
    s('cd-pause').style.display=r?'':'none';
    s('cd-resume').style.display=p?'':'none';
    s('cd-stop').style.display=(r||p)?'':'none';
    s('cd-reset').style.display=(r||p||f)?'':'none';
    const status=s('cd-status');
    status.textContent=i?'就绪':(r?'倒计时中':(p?'已暂停':'时间到！'));
    status.className='knob-status'+(f?' finished':'');
    Knob._setEditable(i);
    document.querySelectorAll('.preset-btn').forEach(b=>b.style.pointerEvents=i?'':'none');
    const act=s('cd-activity');
    if(!i&&!f)act.style.display='';else act.style.display='none';
  }
};

/* ============================== Knob ============================== */
const Knob = {
  _isDragging:false,

  init() {
    const el=document.getElementById('knob');
    el.addEventListener('pointerdown',e=>{if(TimerDOWN.state!=='idle')return;this._isDragging=true;el.setPointerCapture(e.pointerId);this._updateFromEvent(e);});
    el.addEventListener('pointermove',e=>{if(!this._isDragging)return;e.preventDefault();this._updateFromEvent(e);});
    el.addEventListener('pointerup',()=>{this._isDragging=false;});
    el.addEventListener('pointercancel',()=>{this._isDragging=false;});

    // Manual input
    document.getElementById('knob-time').addEventListener('click',()=>{
      if(TimerDOWN.state!=='idle')return;
      document.getElementById('knob-time').style.display='none';
      const edit=document.getElementById('knob-edit'); edit.style.display='flex';
      const inp=document.getElementById('knob-input'); inp.value=Math.round(TimerDOWN.total/60); inp.focus(); inp.select();
    });
    document.getElementById('knob-input').addEventListener('blur',()=>Knob._confirmInput());
    document.getElementById('knob-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();Knob._confirmInput();}});

    // Presets
    document.querySelectorAll('.preset-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        if(TimerDOWN.state!=='idle')return;
        TimerDOWN.setTime(parseInt(btn.dataset.minutes)*60);
      });
    });

    // Initial arc
    this.setArc(1500);
    this._highlightPreset(1500);
  },

  _updateFromEvent(e) {
    const rect=document.getElementById('knob').getBoundingClientRect();
    const cx=rect.left+rect.width/2, cy=rect.top+rect.height/2;
    const dx=e.clientX-cx, dy=e.clientY-cy;
    let angle=Math.atan2(dy,dx)*180/Math.PI;
    angle=((angle+90)%360+360)%360; // 0° at top, clockwise
    const sec=Math.round(angle/360*2700);
    TimerDOWN.setTime(sec);
  },

  setArc(rem) {
    // idle → proportion of max (45min=2700s); running/paused → proportion of set total
    const total=TimerDOWN.state==='idle'?2700:TimerDOWN.total;
    const frac=Math.min(1,Math.max(0,total>0?rem/total:0));
    this._updateArc(534.07*(1-frac));
  },

  _updateArc(offset) {
    document.getElementById('knob-arc').setAttribute('stroke-dashoffset',offset);
  },

  _setEditable(editable) {
    document.getElementById('knob-time').style.display=editable?'':'none';
    document.getElementById('knob-edit').style.display='none';
    document.querySelector('#knob .knob-label').textContent=editable?'触摸旋转或点击时间设定':'';
  },

  _highlightPreset(seconds) {
    const min=Math.round(seconds/60);
    document.querySelectorAll('.preset-btn').forEach(b=>{
      b.classList.toggle('active',parseInt(b.dataset.minutes)===min);
    });
  },

  _confirmInput() {
    const inp=document.getElementById('knob-input');
    const min=Math.max(1,Math.min(45,parseInt(inp.value)||25));
    document.getElementById('knob-time').style.display='';
    document.getElementById('knob-edit').style.display='none';
    TimerDOWN.setTime(min*60);
  }
};

/* ============================== Stats ============================== */
function renderStats() {
  const {count,totalMinutes,records}=DB.getStats(today());
  document.getElementById('today-count').textContent=count;
  document.getElementById('today-duration').textContent=totalMinutes;
  const list=document.getElementById('records-list');
  if(!records.length){list.innerHTML='<div class="empty-state">还没有计时记录</div>';return;}
  list.innerHTML=records.map(r=>{
    const st=r.startTime,et=r.endTime||st+r.duration;
    return '<div class="record-item"><div class="left"><div class="time">'+fmtClockTime(st)+' - '+fmtClockTime(et)+'</div><div class="activity-text">'+esc(r.activity||'未记录')+'</div></div><div class="duration">'+fmtDuration(r.duration)+'</div><button class="delete-btn" data-action="del-rec" data-id="'+r.id+'">✕</button></div>';
  }).join('');
}

/* ============================== Todos (date-aware) ============================== */
function renderTodosFor(date, listId, inputId, addBtnId, dateLabelId, journalId) {
  const todos=DB.getTodos(date);
  const list=document.getElementById(listId);
  if(dateLabelId) document.getElementById(dateLabelId).textContent=date;
  document.getElementById(journalId).value=DB.getJournal(date);
  if(!todos.length){list.innerHTML='<div class="empty-state">还没有待办事项</div>';return;}
  list.innerHTML=todos.map((t,i)=>'<li class="todo-item" data-date="'+date+'" data-index="'+i+'"><div class="checkbox'+(t.done?' done':'')+'" data-action="toggle"></div><span class="todo-text'+(t.done?' done':'')+'">'+esc(t.text)+'</span><button class="delete-btn" data-action="delete">✕</button></li>').join('');
}

function addTodoFor(date, inputId, listId, journalId) {
  const input=document.getElementById(inputId);
  const text=input.value.trim(); if(!text)return;
  const todos=DB.getTodos(date); todos.push({text,done:false}); DB.saveTodos(date,todos);
  input.value=''; renderTodosFor(date,listId,inputId,null,null,journalId);
}

function toggleTodoFor(date,index,listId,inputId,journalId) {
  const todos=DB.getTodos(date);
  if(todos[index]){todos[index].done=!todos[index].done;DB.saveTodos(date,todos);renderTodosFor(date,listId,inputId,null,null,journalId);}
}

function deleteTodoFor(date,index,listId,inputId,journalId) {
  let todos=DB.getTodos(date);
  todos=todos.filter((_,i)=>i!==index); DB.saveTodos(date,todos);
  renderTodosFor(date,listId,inputId,null,null,journalId);
}

function saveJournalFor(date, journalId) {
  DB.saveJournal(date,document.getElementById(journalId).value);
}

/* ============================== Calendar ============================== */
const Calendar={
  year:0,month:0,selected:'',
  init(){const d=new Date();this.year=d.getFullYear();this.month=d.getMonth();this.selected=today();this.render();},
  render(){this._renderMonth();this._renderDetail(this.selected);},
  _renderMonth(){
    const daysInMonth=new Date(this.year,this.month+1,0).getDate();
    const startDay=new Date(this.year,this.month,1).getDay();
    const prefix=this.year+'-'+String(this.month+1).padStart(2,'0');
    const monthRecords=DB.getRecords().filter(r=>r.date.startsWith(prefix));
    const hasRecord=new Set(monthRecords.map(r=>r.date));
    const t=today();
    let html='';
    for(let i=0;i<startDay;i++)html+='<div class="cal-day empty"></div>';
    for(let d=1;d<=daysInMonth;d++){
      const ds=prefix+'-'+String(d).padStart(2,'0');
      const cls='cal-day'+(ds===t?' today':'')+(hasRecord.has(ds)?' has-record':'')+(ds===this.selected?' selected':'');
      html+='<div class="'+cls+'" data-date="'+ds+'">'+d+'</div>';
    }
    document.getElementById('cal-grid').innerHTML=html;
    document.getElementById('cal-title').textContent=this.year+'年'+(this.month+1)+'月';
    // Click days
    document.querySelectorAll('.cal-day:not(.empty)').forEach(el=>{
      el.addEventListener('click',()=>{
        this.selected=el.dataset.date;
        this.render();
      });
    });
  },
  _renderDetail(ds){
    const el=document.getElementById('cal-detail');
    const records=DB.getRecordsByDate(ds);
    const journal=DB.getJournal(ds);
    const totalMin=Math.round(records.reduce((s,r)=>s+r.duration,0)/60);
    let html='<div class="cal-date">📅 '+ds+'</div>';
    if(records.length)html+='<div class="cal-summary">计时 '+records.length+' 次，共 '+totalMin+' 分钟</div>';
    if(!records.length&&!journal){html+='<div class="empty-state">这一天还没有记录</div>';el.innerHTML=html;return;}
    if(records.length){
      html+='<div style="margin-top:4px">';
      records.forEach(r=>{
        const st=r.startTime,et=r.endTime||st+r.duration;
        html+='<div class="record-item" style="margin-bottom:4px"><div class="left"><div class="time">'+fmtClockTime(st)+' - '+fmtClockTime(et)+'</div><div class="activity-text">'+esc(r.activity||'未记录')+'</div></div><div class="duration">'+fmtDuration(r.duration)+'</div><button class="delete-btn" data-action="del-rec" data-id="'+r.id+'">✕</button></div>';
      });
      html+='</div>';
    }
    if(journal){html+='<div class="journal-section" style="margin-top:4px"><label>📝 日志</label><div style="font-size:13px;color:var(--text);line-height:1.6;white-space:pre-wrap;user-select:text">'+esc(journal)+'</div></div>';}
    el.innerHTML=html;
  },
  prevMonth(){this.month--;if(this.month<0){this.month=11;this.year--;}this.selected='';this.render();},
  nextMonth(){this.month++;if(this.month>11){this.month=0;this.year++;}this.selected='';this.render();}
};

/* ============================== System Tab ============================== */
function exportData() {
  const data = {};
  let count = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('tc_')) {
      try { data[key] = JSON.parse(localStorage.getItem(key)); count++; } catch {}
    }
  }
  const blob = new Blob(
    [JSON.stringify({ version: 1, exportedAt: Date.now(), data }, null, 2)],
    { type: 'application/json' }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tomato-clock-' + today() + '.json';
  a.click();
  URL.revokeObjectURL(url);
  Log.add('数据已导出（' + count + ' 个表）');
  showToast('数据已导出');
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      try {
        const pkg = JSON.parse(ev.target.result);
        if (!pkg.data || !pkg.version) return showToast('无效的备份文件');
        if (!confirm('导入将覆盖所有本地数据，页面将重新加载。确认继续？')) return;
        for (const key of Object.keys(pkg.data)) {
          localStorage.setItem(key, JSON.stringify(pkg.data[key]));
        }
        Log.add('数据已导入（' + Object.keys(pkg.data).length + ' 个表）');
        showToast('数据导入成功');
        setTimeout(() => location.reload(), 800);
      } catch { showToast('文件格式错误'); }
    };
    reader.readAsText(file);
  };
  input.click();
}

function renderSystemTab() {
  const logs = Log.getAll();
  const list = document.getElementById('system-log-list');
  if (!logs.length) {
    list.innerHTML = '<div class="empty-state">暂无系统日志</div>';
    return;
  }
  list.innerHTML = logs.map(l => {
    const d = new Date(l.time);
    const t = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return '<div class="log-item"><span class="log-time">' + t + '</span><span class="log-msg">' + esc(l.msg) + '</span></div>';
  }).join('');
}

/* ============================== Tab ============================== */
let currentTab='timer';

function switchTab(tab) {
  currentTab=tab;
  document.querySelectorAll('.tab-content').forEach(e=>e.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(e=>e.classList.remove('active'));
  document.getElementById('tab-'+tab).classList.add('active');
  document.querySelector('.tab-btn[data-tab="'+tab+'"]').classList.add('active');
  if(tab==='timer'){renderStats();}
  if(tab==='today'){renderTodosFor(today(),'today-list','today-input','today-add','today-date','today-journal');}
  if(tab==='tomorrow'){renderTodosFor(tomorrow(),'tomorrow-list','tomorrow-input','tomorrow-add','tomorrow-date','tomorrow-journal');}
  if(tab==='calendar'){Calendar.render();}
  if(tab==='system'){renderSystemTab();}
}

/* ============================== Init ============================== */
document.addEventListener('DOMContentLoaded',()=>{
  // Tab switcher
  document.querySelectorAll('.tab-btn').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.tab)));

  // Mode toggle
  document.querySelectorAll('.mode-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      if(btn.dataset.mode==='down'&&TimerUP.state!=='idle'){showToast('请先停止正向计时');return;}
      if(btn.dataset.mode==='up'&&TimerDOWN.state!=='idle'){showToast('请先停止倒计时');return;}
      document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.timer-mode').forEach(m=>m.classList.remove('active'));
      document.getElementById('mode-'+btn.dataset.mode).classList.add('active');
    });
  });

  // Timer UP controls
  document.getElementById('up-controls').addEventListener('click',e=>{
    const b=e.target.closest('button'); if(!b)return;
    const a=b.dataset.action;
    if(a==='start')TimerUP.start();else if(a==='pause')TimerUP.pause();else if(a==='resume')TimerUP.resume();else if(a==='stop')TimerUP.stop();else if(a==='reset')TimerUP.reset();
  });
  document.getElementById('up-activity-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();TimerUP.stop();}});

  // Timer DOWN controls
  document.getElementById('cd-controls').addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    const a=b.dataset.action;
    if(a==='start')TimerDOWN.start();else if(a==='pause')TimerDOWN.pause();else if(a==='resume')TimerDOWN.resume();else if(a==='stop')TimerDOWN.stop();else if(a==='reset')TimerDOWN.reset();
  });
  document.getElementById('cd-activity-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();TimerDOWN.stop();}});

  // Today todos
  document.getElementById('today-add').addEventListener('click',()=>addTodoFor(today(),'today-input','today-list','today-journal'));
  document.getElementById('today-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addTodoFor(today(),'today-input','today-list','today-journal');}});
  document.getElementById('today-list').addEventListener('click',e=>{
    const item=e.target.closest('.todo-item');if(!item)return;
    const i=parseInt(item.dataset.index),a=e.target.dataset.action,date=item.dataset.date;
    if(a==='toggle')toggleTodoFor(date,i,'today-list','today-input','today-journal');
    if(a==='delete')deleteTodoFor(date,i,'today-list','today-input','today-journal');
  });
  document.getElementById('today-journal').addEventListener('blur',()=>saveJournalFor(today(),'today-journal'));

  // Tomorrow todos
  document.getElementById('tomorrow-add').addEventListener('click',()=>addTodoFor(tomorrow(),'tomorrow-input','tomorrow-list','tomorrow-journal'));
  document.getElementById('tomorrow-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addTodoFor(tomorrow(),'tomorrow-input','tomorrow-list','tomorrow-journal');}});
  document.getElementById('tomorrow-list').addEventListener('click',e=>{
    const item=e.target.closest('.todo-item');if(!item)return;
    const i=parseInt(item.dataset.index),a=e.target.dataset.action,date=item.dataset.date;
    if(a==='toggle')toggleTodoFor(date,i,'tomorrow-list','tomorrow-input','tomorrow-journal');
    if(a==='delete')deleteTodoFor(date,i,'tomorrow-list','tomorrow-input','tomorrow-journal');
  });
  document.getElementById('tomorrow-journal').addEventListener('blur',()=>saveJournalFor(tomorrow(),'tomorrow-journal'));

  // Record deletion (stats + calendar)
  document.getElementById('records-list').addEventListener('click',e=>{const b=e.target.closest('[data-action="del-rec"]');if(b&&confirm('删除这条记录？')){DB.deleteRecord(parseInt(b.dataset.id));renderStats();}});
  document.getElementById('cal-detail').addEventListener('click',e=>{const b=e.target.closest('[data-action="del-rec"]');if(b&&confirm('删除这条记录？')){DB.deleteRecord(parseInt(b.dataset.id));Calendar._renderDetail(Calendar.selected);}});

  // Calendar nav
  document.getElementById('cal-prev').addEventListener('click',()=>Calendar.prevMonth());
  document.getElementById('cal-next').addEventListener('click',()=>Calendar.nextMonth());

  // System tab
  document.getElementById('btn-export').addEventListener('click',exportData);
  document.getElementById('btn-import').addEventListener('click',importData);

  // Init
  TimerUP.init();
  TimerDOWN.init();
  Knob.init();
  Calendar.init();

  // 每日数据快照
  Log.dataSnapshot();

  // 渲染当前 Tab（计时页初始显示）
  renderStats();

  // SW
  if('serviceWorker'in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
});
