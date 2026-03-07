import { useState, useMemo, useEffect } from "react";

// ══════════════════════════════════════════════════════════════════
//  ★★★ 여기에 Google Apps Script URL을 입력하세요 ★★★
//  Apps Script 배포 후 생성된 URL을 아래 따옴표 안에 붙여넣기
//  예: const GAS_URL = "https://script.google.com/macros/s/XXXXX/exec";
// ══════════════════════════════════════════════════════════════════
const GAS_URL = "https://script.google.com/macros/s/AKfycbz21agW9jXczsPdeuBTnyB9Vp3UNNcu0eukwFvwUQjjudW9_V_dTHYapXLP4FH8iw2p/exec";

const OVERLAP_ALLOWED = [9, 10];

// 매주 일요일 예약 불가 공간 (주일예배)
const WORSHIP_BLOCKED_SPACES = [1, 2, 3, 4, 5, 7, 8, 10];
const WORSHIP_START  = "08:00";
const WORSHIP_END    = "13:00";
const DREAMHALL_ID   = 5;
const DREAMHALL_END  = "13:00";

// 매주 토요일 예약 불가 (본당 — 성인예배팀 찬양 연습)
const SAT_BLOCKED_SPACE = 1; // 본당
const SAT_START = "09:00";
const SAT_END   = "12:00";

// 매주 수요일 예약 불가 (본당 — 수요예배)
const WED_BLOCKED_SPACE = 1; // 본당
const WED_START = "19:00";
const WED_END   = "22:00";
const SPACES = [
  { id: 1,  name: "본당",            icon: "⛪"  },
  { id: 2,  name: "샤이닝글로리",    icon: "☕"  },
  { id: 3,  name: "Acts29",          icon: "🤝🏻" },
  { id: 4,  name: "비전홀",          icon: "🎓"  },
  { id: 5,  name: "드림홀",          icon: "🧒🏻" },
  { id: 6,  name: "기도실",          icon: "🙏🏻" },
  { id: 7,  name: "두란노홀-Table1", icon: "📚"  },
  { id: 8,  name: "두란노홀-Table2", icon: "📚"  },
  { id: 9,  name: "주방",            icon: "🍳"  },
  { id: 10, name: "2층",             icon: "🏠"  },
];

const RECUR_DAYS = [
  { label:"매일",        value:"daily" },
  { label:"매주 일요일", value:"0" },
  { label:"매주 월요일", value:"1" },
  { label:"매주 화요일", value:"2" },
  { label:"매주 수요일", value:"3" },
  { label:"매주 목요일", value:"4" },
  { label:"매주 금요일", value:"5" },
  { label:"매주 토요일", value:"6" },
];

const WEEK_KO   = ["일","월","화","수","목","금","토"];
const MONTHS_KO = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

function toAMPM(t24) {
  if (!t24) return "";
  const [hStr, mStr] = t24.split(":");
  const h = parseInt(hStr, 10);
  return `${h % 12 || 12}:${mStr} ${h < 12 ? "AM" : "PM"}`;
}
function genTimeSlots() {
  const s = [];
  for (let h = 4; h <= 22; h++) {
    s.push(`${String(h).padStart(2,"0")}:00`);
    if (h < 22) s.push(`${String(h).padStart(2,"0")}:30`);
  }
  return s;
}
const TIME_SLOTS = genTimeSlots();
const today      = new Date();
const fmtDate    = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const todayStr   = fmtDate(today);
const maxDate    = new Date(today); maxDate.setDate(maxDate.getDate() + 30);
const maxDateStr = fmtDate(maxDate);
function localDate(ds) { const [y,m,d] = ds.split("-").map(Number); return new Date(y, m-1, d); }
function isPhoneValid(v) { return v && v.replace(/\D/g,"").length >= 10; }
function genId() { return Math.random().toString(36).slice(2,10); }
const isGasReady = GAS_URL && GAS_URL !== "여기에_URL_붙여넣기";

function nthWeekday(y, mo, wd, n) { const d = new Date(y,mo,1); return new Date(y,mo,1+(wd-d.getDay()+7)%7+(n-1)*7); }
function lastWeekday(y, mo, wd)   { const l = new Date(y,mo+1,0); return new Date(y,mo,l.getDate()-(l.getDay()-wd+7)%7); }
function getHolidays(y) {
  const h = {}, a = (d,n) => { h[fmtDate(d)] = n; };
  a(new Date(y,0,1),"New Year's"); a(nthWeekday(y,0,1,3),"MLK Day"); a(nthWeekday(y,1,1,3),"Presidents'");
  a(lastWeekday(y,4,1),"Memorial"); a(new Date(y,5,19),"Juneteenth"); a(new Date(y,6,4),"July 4th");
  a(nthWeekday(y,8,1,1),"Labor Day"); a(nthWeekday(y,9,1,2),"Columbus"); a(new Date(y,10,11),"Veterans");
  a(nthWeekday(y,10,4,4),"Thanksgiving"); a(new Date(y,11,25),"Christmas");
  return h;
}

async function gasRequest(action, extra = {}) {
  if (!isGasReady) return { error: "GAS URL not configured" };
  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action, ...extra }),
    });
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

const c = {
  bg:"#eef0ff", card:"#ffffff", border:"#d4d8f5",
  primary:"#6366f1", header:"#f5f6ff", chipBg:"#e0e7ff",
  text:"#1e1b4b", sub:"#6b7280", light:"#a5b4fc",
  success:"#16a34a", successBg:"#f0fdf4",
  danger:"#dc2626", dangerBg:"#fef2f2",
  gold:"#d97706", goldBg:"#fffbeb",
  SUN:"#dc2626", SAT:"#2563eb",
  radius:"14px", radiusSm:"9px",
  shadow:"0 2px 14px rgba(99,102,241,0.10)",
};
const IS = {
  width:"100%", boxSizing:"border-box", background:"#fff",
  border:"1.5px solid #d4d8f5", borderRadius:"9px",
  padding:"12px 14px", color:"#1e1b4b", fontSize:16,
  fontFamily:"inherit", outline:"none",
};

export default function App() {
  const [view,         setView]        = useState("home");
  const [selSpace,     setSelSpace]    = useState(null);
  const [calYear,      setCalYear]     = useState(today.getFullYear());
  const [calMonth,     setCalMonth]    = useState(today.getMonth());
  const [selDate,      setSelDate]     = useState(null);
  const [form,         setForm]        = useState({ name:"", phone:"", team:"", purpose:"", startTime:"", endTime:"", note:"", password:"" });
  const [reservations, setReservations]= useState([]);
  const [submitted,    setSubmitted]   = useState(false);
  const [loading,      setLoading]     = useState(false);
  const [syncStatus,   setSyncStatus]  = useState(null);

  const [adminPin,     setAdminPin]    = useState("");
  const [adminAuth,    setAdminAuth]   = useState(false);
  const [adminFilter,  setAdminFilter] = useState("all");
  const [adminDate,    setAdminDate]   = useState("");
  const [showRecur,    setShowRecur]   = useState(false);
  const [recurForm,    setRecurForm]   = useState({
    spaceId:1, startDate:todayStr, endDate:maxDateStr,
    recurType:"0", startTime:"09:00", endTime:"13:00",
    name:"", phone:"", team:"", purpose:"", note:""
  });
  const [recurDone,    setRecurDone]   = useState(false);
  const [currentPin,   setCurrentPin]  = useState("4Federalst!");
  const [showPwChange, setShowPwChange]= useState(false);
  const [pwForm,       setPwForm]      = useState({ cur:"", next:"", confirm:"" });
  const [pwMsg,        setPwMsg]       = useState(null);

  const [homeSelDate,  setHomeSelDate] = useState(null);
  const [homeCalYear,  setHomeCalYear] = useState(today.getFullYear());
  const [homeCalMonth, setHomeCalMonth]= useState(today.getMonth());

  const [cancelModal, setCancelModal] = useState(null);
  const [cancelPw,    setCancelPw]    = useState("");
  const [cancelError, setCancelError] = useState("");
  const [editForm,    setEditForm]    = useState(null);

  useEffect(() => {
    if (!isGasReady) return;
    setLoading(true);
    gasRequest("getAll").then(data => {
      if (data.reservations) {
        setReservations(data.reservations.map(r => ({ ...r, spaceId: Number(r.spaceId) })));
      }
      setLoading(false);
    });
  }, []);

  const holidays = useMemo(() => ({
    ...getHolidays(calYear-1), ...getHolidays(calYear), ...getHolidays(calYear+1),
  }), [calYear]);

  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const spaceRes    = selSpace ? reservations.filter(r => r.spaceId === selSpace.id) : [];
  const bookedDates = [...new Set(spaceRes.map(r => r.date))];
  const dateRes     = selDate ? spaceRes.filter(r => r.date === selDate) : [];

  // 일요일 주일예배 시간 차단 여부
  const isWorshipDay      = selDate && localDate(selDate).getDay() === 0;
  const isWorshipBlocked  = selSpace && WORSHIP_BLOCKED_SPACES.includes(selSpace.id) && isWorshipDay;
  const worshipEnd        = selSpace?.id === DREAMHALL_ID ? DREAMHALL_END : WORSHIP_END;
  const isTimeInWorship   = t => t >= WORSHIP_START && t < worshipEnd;

  // 토요일 본당 찬양 연습 시간 차단 여부
  const isSatDay      = selDate && localDate(selDate).getDay() === 6;
  const isSatBlocked  = selSpace && selSpace.id === SAT_BLOCKED_SPACE && isSatDay;
  const isTimeInSat   = t => t >= SAT_START && t < SAT_END;

  // 수요일 본당 수요예배 시간 차단 여부
  const isWedDay      = selDate && localDate(selDate).getDay() === 3;
  const isWedBlocked  = selSpace && selSpace.id === WED_BLOCKED_SPACE && isWedDay;
  const isTimeInWed   = t => t >= WED_START && t < WED_END;

  const isSlotBusy = t => {
    if (selSpace && OVERLAP_ALLOWED.includes(selSpace.id)) return false;
    if (isWorshipBlocked && isTimeInWorship(t)) return true;
    if (isSatBlocked && isTimeInSat(t)) return true;
    if (isWedBlocked && isTimeInWed(t)) return true;
    return dateRes.some(r => t >= r.startTime && t < r.endTime);
  };

  // 선택한 시작~종료 시간이 차단 시간과 겹치는지 확인
  const overlapsWorship = isWorshipBlocked && form.startTime && form.endTime &&
    form.startTime < worshipEnd && form.endTime > WORSHIP_START;
  const overlapsSat = isSatBlocked && form.startTime && form.endTime &&
    form.startTime < SAT_END && form.endTime > SAT_START;
  const overlapsWed = isWedBlocked && form.startTime && form.endTime &&
    form.startTime < WED_END && form.endTime > WED_START;

  const isPwValid = form.password && /^\d{4}$/.test(form.password);
  const canSubmit = form.name && isPhoneValid(form.phone) && form.purpose &&
    form.startTime && form.endTime && form.startTime < form.endTime &&
    isPwValid && !overlapsWorship && !overlapsSat && !overlapsWed;

  async function handleSubmit() {
    if (!canSubmit) return;
    const space = SPACES.find(s => s.id === selSpace.id);
    const tempId = genId();
    const newRes = { id: tempId, spaceId: selSpace.id, spaceName: space?.name||"", date: selDate, ...form, recurring: false };
    setReservations(p => [...p, newRes]);
    setSubmitted(true);
    setSyncStatus("saving");
    const result = await gasRequest("add", { reservation: newRes });
    if (result.ok) {
      // 서버에서 생성된 실제 ID로 교체
      if (result.id) setReservations(p => p.map(r => r.id === tempId ? { ...r, id: result.id } : r));
      setSyncStatus("saved");
    } else {
      setSyncStatus("error");
    }
  }

  function resetBook() {
    setSelSpace(null); setSelDate(null);
    setForm({ name:"", phone:"", team:"", purpose:"", startTime:"", endTime:"", note:"", password:"" });
    setSubmitted(false); setSyncStatus(null); setView("home");
  }

  async function handleRecurSubmit() {
    const { spaceId, startDate, endDate, recurType, startTime, endTime, name, phone, team, purpose, note } = recurForm;
    if (!name || !purpose || startTime >= endTime) return;
    const space = SPACES.find(s => s.id === parseInt(spaceId));
    const rows = [];
    let cur = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    while (cur <= end) {
      if (recurType === "daily" || String(cur.getDay()) === recurType) {
        rows.push({ id: genId(), spaceId: parseInt(spaceId), spaceName: space?.name||"", date: fmtDate(cur), startTime, endTime, name, phone, team, purpose, note, password:"", recurring:true });
      }
      cur.setDate(cur.getDate() + 1);
    }
    setRecurDone(true);
    const result = await gasRequest("addBatch", { reservations: rows });
    // 서버에서 생성된 실제 ID 목록으로 교체
    const finalRows = result.ids
      ? rows.map((r, i) => ({ ...r, id: result.ids[i] || r.id }))
      : rows;
    setReservations(p => [...p, ...finalRows]);
  }

  function openCancelModal(resId) { setCancelModal({ resId, mode:"prompt" }); setCancelPw(""); setCancelError(""); }
  function verifyPassword() {
    const res = reservations.find(r => r.id === cancelModal.resId);
    if (!res) return;
    if (!res.password || res.password === cancelPw) { setCancelError(""); setCancelModal(m => ({...m, mode:"choice"})); }
    else setCancelError("비밀번호가 맞지 않습니다.");
  }
  async function doCancel() {
    const res = reservations.find(r => r.id === cancelModal.resId);
    setReservations(p => p.filter(r => r.id !== cancelModal.resId));
    setCancelModal(null); setCancelPw("");
    if (res) await gasRequest("delete", { id: res.id });
  }
  function openEdit() { const res = reservations.find(r => r.id === cancelModal.resId); setEditForm({...res}); setCancelModal(m => ({...m, mode:"edit"})); }
  async function saveEdit() {
    if (!editForm.name||!editForm.purpose||editForm.startTime>=editForm.endTime) return;
    const space = SPACES.find(s => s.id === editForm.spaceId);
    const updated = { ...editForm, spaceName: space?.name||"" };
    setReservations(p => p.map(r => r.id === editForm.id ? updated : r));
    setCancelModal(null); setEditForm(null);
    await gasRequest("edit", { id: updated.id, reservation: updated });
  }
  async function adminDelete(id) { setReservations(p => p.filter(r => r.id !== id)); await gasRequest("delete", { id }); }

  let adminRes = reservations;
  if (adminFilter !== "all") adminRes = adminRes.filter(r => r.spaceId === parseInt(adminFilter));
  if (adminDate) adminRes = adminRes.filter(r => r.date === adminDate);
  adminRes = [...adminRes].sort((a,b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  function prevMonth() { if(calMonth===0){setCalYear(y=>y-1);setCalMonth(11);}else setCalMonth(m=>m-1); }
  function nextMonth() { if(calMonth===11){setCalYear(y=>y+1);setCalMonth(0);}else setCalMonth(m=>m+1); }
  function getDayColor(ds, dow, isSel, dis) {
    if (dis) return "#c7cbe8"; if (isSel) return "#fff";
    if (holidays[ds] || dow === 0) return c.SUN;
    if (dow === 6) return c.SAT;
    return c.text;
  }

  function prevHomeMonth() { if(homeCalMonth===0){setHomeCalYear(y=>y-1);setHomeCalMonth(11);}else setHomeCalMonth(m=>m-1); }
  function nextHomeMonth() { if(homeCalMonth===11){setHomeCalYear(y=>y+1);setHomeCalMonth(0);}else setHomeCalMonth(m=>m+1); }

  return (
    <div style={{minHeight:"100vh",background:c.bg,fontFamily:"-apple-system,BlinkMacSystemFont,'Malgun Gothic','맑은 고딕',sans-serif",color:c.text}}>

      {/* Cancel/Edit Modal */}
      {cancelModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(30,27,75,0.45)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"#fff",borderRadius:c.radius,padding:28,width:"100%",maxWidth:420,boxShadow:"0 8px 40px rgba(99,102,241,0.25)"}}>
            {cancelModal.mode==="prompt"&&(<>
              <div style={{fontSize:19,fontWeight:700,marginBottom:6}}>예약 취소 / 변경</div>
              <div style={{fontSize:14,color:c.sub,marginBottom:18}}>예약 비밀번호를 입력하세요.<br/>비밀번호가 없으면 빈칸으로 확인을 누르세요.</div>
              <input type="password" placeholder="비밀번호" value={cancelPw} onChange={e=>{setCancelPw(e.target.value);setCancelError("");}} onKeyDown={e=>e.key==="Enter"&&verifyPassword()} style={{...IS,marginBottom:8}}/>
              {cancelError&&<div style={{fontSize:13,color:c.danger,marginBottom:8}}>{cancelError}</div>}
              <div style={{display:"flex",gap:8}}>
                <button onClick={verifyPassword} style={{flex:1,background:c.primary,border:"none",borderRadius:c.radiusSm,padding:"12px",color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>확인</button>
                <button onClick={()=>setCancelModal(null)} style={{flex:1,background:"none",border:`1.5px solid ${c.border}`,borderRadius:c.radiusSm,padding:"12px",color:c.sub,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>닫기</button>
              </div>
            </>)}
            {cancelModal.mode==="choice"&&(<>
              <div style={{fontSize:19,fontWeight:700,marginBottom:16}}>어떻게 하시겠어요?</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {(()=>{
                  const res = reservations.find(r=>r.id===cancelModal.resId);
                  const hasPw = res && res.password;
                  return (<>
                    <button onClick={openEdit} disabled={!hasPw} style={{background:hasPw?c.chipBg:"#f3f4f6",border:`1.5px solid ${hasPw?c.primary:c.border}`,borderRadius:c.radiusSm,padding:"13px",color:hasPw?c.primary:c.sub,fontSize:16,fontWeight:700,cursor:hasPw?"pointer":"default",fontFamily:"inherit"}}>예약 변경</button>
                    {!hasPw&&<div style={{fontSize:12,color:c.sub,textAlign:"center",marginTop:-4}}>비밀번호가 없는 예약은 변경할 수 없습니다</div>}
                  </>);
                })()}
                <button onClick={doCancel} style={{background:c.dangerBg,border:`1.5px solid ${c.danger}55`,borderRadius:c.radiusSm,padding:"13px",color:c.danger,fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>예약 취소 (삭제)</button>
                <button onClick={()=>setCancelModal(null)} style={{background:"none",border:`1.5px solid ${c.border}`,borderRadius:c.radiusSm,padding:"12px",color:c.sub,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>닫기</button>
              </div>
            </>)}
            {cancelModal.mode==="edit"&&editForm&&(<>
              <div style={{fontSize:19,fontWeight:700,marginBottom:16}}>예약 변경</div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {[["name","이름","text"],["phone","연락처","tel"],["team","예약 팀","text"],["purpose","사용 목적","text"]].map(([k,lbl,t])=>(
                  <div key={k}><div style={{fontSize:13,fontWeight:600,color:c.sub,marginBottom:5}}>{lbl}</div><input type={t} value={editForm[k]||""} onChange={e=>setEditForm(f=>({...f,[k]:e.target.value}))} style={IS}/></div>
                ))}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  {[["startTime","시작 시간"],["endTime","종료 시간"]].map(([k,lbl])=>(
                    <div key={k}><div style={{fontSize:13,fontWeight:600,color:c.sub,marginBottom:5}}>{lbl}</div>
                    <select value={editForm[k]} onChange={e=>setEditForm(f=>({...f,[k]:e.target.value}))} style={IS}>
                      {TIME_SLOTS.map(t=>{
                        const dow = editForm.date ? localDate(editForm.date).getDay() : -1;
                        const sp  = editForm.spaceId;
                        const isOverlapAllowed = OVERLAP_ALLOWED.includes(sp);
                        // 고정 차단 시간
                        const blocked =
                          (WORSHIP_BLOCKED_SPACES.includes(sp) && dow===0 && t>=WORSHIP_START && t<(sp===DREAMHALL_ID?DREAMHALL_END:WORSHIP_END)) ||
                          (sp===SAT_BLOCKED_SPACE && dow===6 && t>=SAT_START && t<SAT_END) ||
                          (sp===WED_BLOCKED_SPACE && dow===3 && t>=WED_START && t<WED_END);
                        return <option key={t} value={t} disabled={blocked}>{toAMPM(t)}{blocked?" ●":""}</option>;
                      })}
                    </select></div>
                  ))}
                </div>
                {editForm.startTime>=editForm.endTime&&<div style={{fontSize:13,color:c.danger}}>종료 시간은 시작 시간보다 늦어야 합니다</div>}
                <div><div style={{fontSize:13,fontWeight:600,color:c.sub,marginBottom:5}}>비고</div><textarea value={editForm.note||""} onChange={e=>setEditForm(f=>({...f,note:e.target.value}))} rows={2} style={{...IS,resize:"vertical"}}/></div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={saveEdit} style={{flex:1,background:c.primary,border:"none",borderRadius:c.radiusSm,padding:"12px",color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>저장</button>
                  <button onClick={()=>setCancelModal(null)} style={{flex:1,background:"none",border:`1.5px solid ${c.border}`,borderRadius:c.radiusSm,padding:"12px",color:c.sub,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>닫기</button>
                </div>
              </div>
            </>)}
          </div>
        </div>
      )}

      {/* Header */}
      <header style={{background:c.header,borderBottom:`1.5px solid ${c.border}`,padding:"0 16px",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 12px rgba(99,102,241,0.10)"}}>
        <div style={{maxWidth:900,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:58}}>
          <div onClick={()=>{setView("home");setSubmitted(false);setSelSpace(null);setSelDate(null);}} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
            <img src="/logo.jpg" alt="온누리교회 로고" style={{width:38,height:38,borderRadius:7,objectFit:"cover",flexShrink:0}}/>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:c.primary,lineHeight:1.2}}>보스턴 온누리교회</div>
              <div style={{fontSize:11,color:c.sub,lineHeight:1.2}}>장소 예약 시스템</div>
            </div>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <button onClick={()=>{setView("home");setSubmitted(false);setSelSpace(null);setSelDate(null);}} style={{background:view==="home"?c.chipBg:"transparent",border:`1.5px solid ${view==="home"?c.primary:c.border}`,color:view==="home"?c.primary:c.sub,borderRadius:c.radiusSm,padding:"7px 13px",cursor:"pointer",fontSize:20,lineHeight:1,fontFamily:"inherit"}}>🏠</button>
            <button onClick={()=>setView("admin")} style={{background:view==="admin"?c.chipBg:"transparent",border:`1.5px solid ${view==="admin"?c.primary:c.border}`,color:view==="admin"?c.primary:c.sub,borderRadius:c.radiusSm,padding:"7px 12px",cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:view==="admin"?700:400}}>관리자</button>
          </div>
        </div>
      </header>

      <main style={{maxWidth:900,margin:"0 auto",padding:"20px 16px"}}>

        {loading&&(
          <div style={{textAlign:"center",padding:"60px 20px",color:c.sub}}>
            <div style={{fontSize:36,marginBottom:12}}>⏳</div>
            <div style={{fontSize:17}}>예약 데이터를 불러오는 중...</div>
          </div>
        )}

        {!isGasReady&&!loading&&(
          <div style={{background:"#fffbeb",border:"1.5px solid #f59e0b55",borderRadius:c.radiusSm,padding:"12px 16px",marginBottom:20,fontSize:13,color:c.gold}}>
            ⚠️ <strong>설정 필요:</strong> App.jsx 파일의 <code>GAS_URL</code>에 Google Apps Script URL을 입력하고 재배포해주세요.
          </div>
        )}

        {/* Space selection */}
        {!loading&&view==="home"&&!submitted&&!selSpace&&(
          <div>
            <div style={{marginBottom:14}}>
              <h1 style={{fontSize:24,fontWeight:700,margin:"0 0 6px",color:c.text}}>장소 예약 신청</h1>
              <p style={{fontSize:14,color:c.sub,margin:0}}>사용할 공간을 선택하세요 · 오늘부터 30일 이내 예약 가능</p>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:8}}>
              {SPACES.map(sp=>(
                <div key={sp.id} onClick={()=>{setSelSpace(sp);setView("book");}}
                  style={{background:c.card,border:`1.5px solid ${c.border}`,borderRadius:c.radius,padding:"10px 8px",cursor:"pointer",transition:"all .15s",boxShadow:c.shadow,textAlign:"center"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=c.primary;e.currentTarget.style.background=c.chipBg;e.currentTarget.style.transform="translateY(-2px)";}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=c.border;e.currentTarget.style.background=c.card;e.currentTarget.style.transform="none";}}>
                  <div style={{fontSize:22,marginBottom:4}}>{sp.icon}</div>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:OVERLAP_ALLOWED.includes(sp.id)?2:0}}>{sp.name}</div>
                  {OVERLAP_ALLOWED.includes(sp.id)&&<div style={{fontSize:9,color:c.primary,fontWeight:600}}>중복예약 가능</div>}
                </div>
              ))}
            </div>

            {/* Home overview calendar */}
            {(()=>{
              const homeDaysInMonth = new Date(homeCalYear, homeCalMonth+1, 0).getDate();
              const homeFirstDay    = new Date(homeCalYear, homeCalMonth, 1).getDay();
              const homeHolidays    = {...getHolidays(homeCalYear-1),...getHolidays(homeCalYear),...getHolidays(homeCalYear+1)};
              const homeSelRes = homeSelDate ? reservations.filter(r=>r.date===homeSelDate).sort((a,b)=>a.startTime.localeCompare(b.startTime)) : [];

              return (
                <div style={{marginTop:20}}>
                  <div style={{background:c.card,border:`1.5px solid ${c.border}`,borderRadius:c.radius,padding:18,boxShadow:c.shadow}}>
                    <div style={{fontSize:16,fontWeight:700,marginBottom:14,color:c.text}}>📅 예약 현황 달력</div>
                    {/* Month nav */}
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                      <button onClick={prevHomeMonth} style={{background:"none",border:"none",fontSize:26,cursor:"pointer",color:c.primary,padding:"0 10px"}}>‹</button>
                      <span style={{fontSize:17,fontWeight:700}}>{homeCalYear}년 {MONTHS_KO[homeCalMonth]}</span>
                      <button onClick={nextHomeMonth} style={{background:"none",border:"none",fontSize:26,cursor:"pointer",color:c.primary,padding:"0 10px"}}>›</button>
                    </div>
                    {/* Weekday headers */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
                      {WEEK_KO.map((d,i)=>(
                        <div key={d} style={{textAlign:"center",fontSize:12,fontWeight:700,padding:"2px 0",color:i===0?c.SUN:i===6?c.SAT:c.sub}}>{d}</div>
                      ))}
                    </div>
                    {/* Days */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
                      {Array(homeFirstDay).fill(null).map((_,i)=><div key={i}/>)}
                      {Array(homeDaysInMonth).fill(null).map((_,i)=>{
                        const day=i+1;
                        const m=String(homeCalMonth+1).padStart(2,"0");
                        const d=String(day).padStart(2,"0");
                        const ds=`${homeCalYear}-${m}-${d}`;
                        const dow=localDate(ds).getDay();
                        const isSel=homeSelDate===ds;
                        const dis=ds<todayStr||ds>maxDateStr;
                        const isToday=ds===todayStr;
                        const holiday=homeHolidays[ds];
                        const resCount=reservations.filter(r=>r.date===ds).length;
                        return (
                          <button key={day} onClick={()=>setHomeSelDate(homeSelDate===ds?null:ds)}
                            style={{
                              padding:"5px 2px 4px",borderRadius:7,lineHeight:1.2,
                              border:isSel?`2px solid ${c.primary}`:isToday?`2px solid ${c.gold}`:"2px solid transparent",
                              background:isSel?c.primary:"transparent",
                              color:getDayColor(ds,dow,isSel,dis),
                              fontSize:14,fontFamily:"inherit",cursor:"pointer",fontWeight:isToday?700:400,
                            }}>
                            <div>{day}</div>
                            {holiday&&<div style={{fontSize:7,lineHeight:1.1,color:isSel?"rgba(255,255,255,0.85)":dis?"#c7cbe8":c.SUN,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{holiday}</div>}
                            {resCount>0&&<div style={{fontSize:10,fontWeight:700,color:isSel?"#fff":c.primary,marginTop:1}}>{resCount}건</div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Selected date reservation list */}
                  {homeSelDate&&(
                    <div style={{marginTop:12,background:c.card,border:`1.5px solid ${c.border}`,borderRadius:c.radius,padding:18,boxShadow:c.shadow}}>
                      <div style={{fontSize:15,fontWeight:700,marginBottom:12,color:c.text}}>
                        {homeSelDate} 예약 현황
                        <span style={{marginLeft:8,fontSize:13,fontWeight:500,color:c.sub}}>
                          {homeSelRes.length===0?"예약 없음":`총 ${homeSelRes.length}건`}
                        </span>
                      </div>
                      {homeSelRes.length===0
                        ?<div style={{textAlign:"center",color:c.light,fontSize:14,padding:"20px 0"}}>이 날짜에는 예약이 없습니다</div>
                        :<div style={{display:"flex",flexDirection:"column",gap:8}}>
                          {homeSelRes.map(r=>{
                            const sp=SPACES.find(s=>s.id===r.spaceId);
                            return (
                              <div key={r.id} style={{display:"grid",gridTemplateColumns:"auto 1fr auto",gap:12,alignItems:"center",borderRadius:c.radiusSm,padding:"10px 14px",background:c.chipBg,border:`1px solid ${c.primary}22`}}>
                                <div style={{textAlign:"center",minWidth:52}}>
                                  <div style={{fontSize:20}}>{sp?.icon||"📍"}</div>
                                  <div style={{fontSize:11,fontWeight:700,color:c.primary,marginTop:2}}>{sp?.name||"?"}</div>
                                </div>
                                <div>
                                  <div style={{fontSize:14,fontWeight:700,color:c.primary}}>{toAMPM(r.startTime)} – {toAMPM(r.endTime)}</div>
                                  <div style={{fontSize:13,color:c.text,marginTop:2}}>
                                    {r.name}
                                    {r.team&&<span style={{marginLeft:6,fontSize:12,color:c.sub,background:"#e0e7ff",borderRadius:4,padding:"1px 6px"}}>{r.team}</span>}
                                  </div>
                                  {r.purpose&&<div style={{fontSize:12,color:c.sub,marginTop:1}}>{r.purpose}</div>}
                                </div>
                                <button onClick={()=>openCancelModal(r.id)} style={{background:"none",border:`1px solid ${c.border}`,borderRadius:6,padding:"6px 10px",fontSize:12,cursor:"pointer",color:c.sub,fontFamily:"inherit",whiteSpace:"nowrap"}}>취소 / 변경</button>
                              </div>
                            );
                          })}
                        </div>
                      }
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Book view — fully vertical */}
        {!loading&&view==="book"&&selSpace&&!submitted&&(
          <div>
            <button onClick={()=>{setView("home");setSelSpace(null);setSelDate(null);}} style={{background:"none",border:"none",color:c.primary,cursor:"pointer",fontSize:15,padding:"0 0 16px"}}>← 장소 목록으로</button>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,padding:"14px 16px",background:c.chipBg,borderRadius:c.radius,border:`1.5px solid ${c.primary}44`}}>
              <span style={{fontSize:28}}>{selSpace.icon}</span>
              <div>
                <div style={{fontSize:18,fontWeight:700}}>{selSpace.name}</div>
                <div style={{fontSize:12,color:c.sub}}>
                  예약 가능: {todayStr} ~ {maxDateStr}
                  {OVERLAP_ALLOWED.includes(selSpace.id)&&<span style={{marginLeft:8,fontSize:11,background:c.primary,color:"#fff",borderRadius:5,padding:"2px 6px",fontWeight:600}}>중복예약 허용</span>}
                </div>
              </div>
            </div>

            {/* Calendar — full width */}
            <div style={{background:c.card,border:`1.5px solid ${c.border}`,borderRadius:c.radius,padding:18,boxShadow:c.shadow,marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <button onClick={prevMonth} style={{background:"none",border:"none",fontSize:26,cursor:"pointer",color:c.primary,padding:"0 10px"}}>‹</button>
                <span style={{fontSize:18,fontWeight:700}}>{calYear}년 {MONTHS_KO[calMonth]}</span>
                <button onClick={nextMonth} style={{background:"none",border:"none",fontSize:26,cursor:"pointer",color:c.primary,padding:"0 10px"}}>›</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
                {WEEK_KO.map((d,i)=>(
                  <div key={d} style={{textAlign:"center",fontSize:13,fontWeight:700,padding:"3px 0",color:i===0?c.SUN:i===6?c.SAT:c.sub}}>{d}</div>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
                {Array(firstDay).fill(null).map((_,i)=><div key={i}/>)}
                {Array(daysInMonth).fill(null).map((_,i)=>{
                  const day=i+1, m=String(calMonth+1).padStart(2,"0"), d=String(day).padStart(2,"0");
                  const ds=`${calYear}-${m}-${d}`;
                  const dow=localDate(ds).getDay();
                  const isSel=selDate===ds, hasBk=bookedDates.includes(ds);
                  const dis=ds<todayStr||ds>maxDateStr, isToday=ds===todayStr, holiday=holidays[ds];
                  return (
                    <button key={day} disabled={dis} onClick={()=>setSelDate(ds)} style={{
                      padding:"6px 2px 4px",borderRadius:7,lineHeight:1.2,
                      border:isSel?`2px solid ${c.primary}`:isToday?`2px solid ${c.gold}`:"2px solid transparent",
                      background:isSel?c.primary:"transparent",
                      color:getDayColor(ds,dow,isSel,dis),
                      fontSize:15,fontFamily:"inherit",cursor:dis?"default":"pointer",fontWeight:isToday?700:400,
                    }}>
                      <div>{day}</div>
                      {holiday&&<div style={{fontSize:7,lineHeight:1.1,color:isSel?"rgba(255,255,255,0.85)":dis?"#c7cbe8":c.SUN,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{holiday}</div>}
                      {hasBk&&!dis&&<div style={{fontSize:10,fontWeight:700,color:isSel?"#fff":c.primary,marginTop:1}}>{spaceRes.filter(r=>r.date===ds).length}건</div>}
                    </button>
                  );
                })}
              </div>
              {selDate&&(
                <div style={{marginTop:16,paddingTop:14,borderTop:`1px solid ${c.border}`}}>
                  <div style={{fontSize:15,fontWeight:700,marginBottom:10}}>{selDate} 예약 현황</div>
                  {dateRes.length===0
                    ?<div style={{fontSize:14,color:c.light}}>예약 없음 — 사용 가능합니다</div>
                    :dateRes.map(r=>(
                      <div key={r.id} style={{background:c.chipBg,borderRadius:c.radiusSm,padding:"10px 14px",marginBottom:8,border:`1px solid ${c.primary}33`}}>
                        <div style={{fontSize:15,fontWeight:700,color:c.primary,marginBottom:4}}>{toAMPM(r.startTime)} – {toAMPM(r.endTime)}</div>
                        <div style={{fontSize:14,color:c.sub,lineHeight:1.7}}>{r.name}{r.team?` | ${r.team}`:""} | {r.purpose} | {r.phone}</div>
                        <button onClick={()=>openCancelModal(r.id)} style={{marginTop:8,background:"none",border:`1px solid ${c.border}`,borderRadius:6,padding:"5px 12px",fontSize:13,cursor:"pointer",color:c.sub,fontFamily:"inherit"}}>취소 / 변경</button>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>

            {/* Form — full width, below calendar */}
            <div style={{background:c.card,border:`1.5px solid ${c.border}`,borderRadius:c.radius,padding:18,boxShadow:c.shadow}}>
              <div style={{fontSize:17,fontWeight:700,marginBottom:16}}>예약 정보 입력</div>
              {!selDate
                ?<div style={{textAlign:"center",color:c.light,fontSize:15,padding:"30px 10px"}}>↑ 날짜를 먼저 선택해 주세요</div>
                :<div style={{display:"flex",flexDirection:"column",gap:14}}>
                  <div style={{fontSize:15,fontWeight:600,color:c.primary,background:c.chipBg,borderRadius:c.radiusSm,padding:"8px 12px"}}>{selDate}</div>
                  {isWorshipBlocked&&(
                    <div style={{background:"#fff7ed",border:"1.5px solid #fb923c55",borderRadius:c.radiusSm,padding:"10px 14px",fontSize:13,color:"#c2410c"}}>
                      ⛪ <strong>주일예배 시간 예약 불가</strong><br/>
                      {selSpace?.id === DREAMHALL_ID
                        ? "매주 주일 8:00 AM – 1:00 PM 은 어린이부 예배가 있어 이 공간을 예약할 수 없습니다. 양해 부탁드립니다!"
                        : "매주 주일 8:00 AM – 1:00 PM 은 이 공간을 예약할 수 없습니다. 양해 부탁드립니다!"
                      }
                    </div>
                  )}
                  {isSatBlocked&&(
                    <div style={{background:"#fff7ed",border:"1.5px solid #fb923c55",borderRadius:c.radiusSm,padding:"10px 14px",fontSize:13,color:"#c2410c"}}>
                      🎵 <strong>성인예배팀 찬양 연습</strong><br/>
                      매주 주일 9:00 AM – 12:00 PM 은 이 공간을 예약할 수 없습니다. 양해 부탁드립니다!
                    </div>
                  )}
                  {isWedBlocked&&(
                    <div style={{background:"#fff7ed",border:"1.5px solid #fb923c55",borderRadius:c.radiusSm,padding:"10px 14px",fontSize:13,color:"#c2410c"}}>
                      🙏 <strong>수요예배</strong><br/>
                      매주 수요일 7:00 PM – 10:00 PM 은 수요예배가 있어 이 공간을 예약할 수 없습니다. 양해 부탁드립니다!
                    </div>
                  )}
                  <FL label="신청자 이름" required><input type="text" placeholder="홍길동" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={IS}/></FL>
                  <FL label="연락처 (전화번호)" required>
                    <input type="tel" placeholder="617-000-0000" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} style={{...IS,borderColor:form.phone&&!isPhoneValid(form.phone)?"#f87171":"#d4d8f5"}}/>
                    {form.phone&&!isPhoneValid(form.phone)&&<div style={{fontSize:12,color:c.danger,marginTop:4}}>올바른 전화번호를 입력해주세요</div>}
                  </FL>
                  <FL label="예약 팀"><input type="text" placeholder="예: 청년부, 찬양팀" value={form.team} onChange={e=>setForm(f=>({...f,team:e.target.value}))} style={IS}/></FL>
                  <FL label="사용 목적" required><input type="text" placeholder="예: 주일예배, 소그룹 모임" value={form.purpose} onChange={e=>setForm(f=>({...f,purpose:e.target.value}))} style={IS}/></FL>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    {[["startTime","시작 시간"],["endTime","종료 시간"]].map(([key,lbl])=>(
                      <FL key={key} label={lbl} required>
                        <select value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={{...IS,color:form[key]?c.text:c.sub}}>
                          <option value="">선택</option>
                          {TIME_SLOTS.map(t=>{
                            const isOverlapAllowed = selSpace && OVERLAP_ALLOWED.includes(selSpace.id);
                            // 고정 차단 시간 (장소별 예배/행사)
                            const inWorship = isWorshipBlocked && t >= WORSHIP_START && t < worshipEnd;
                            const inSat     = isSatBlocked     && t >= SAT_START     && t < SAT_END;
                            const inWed     = isWedBlocked     && t >= WED_START     && t < WED_END;
                            // 기존 예약 충돌 — 중복예약 허용 장소는 체크 안 함
                            const inExisting = isOverlapAllowed ? false : (
                              key==="endTime"
                                ? dateRes.some(r => form.startTime >= r.startTime && t > r.startTime && form.startTime < r.endTime && t <= r.endTime)
                                : dateRes.some(r => t >= r.startTime && t < r.endTime)
                            );
                            const blocked = inWorship || inSat || inWed || inExisting;
                            return (
                              <option key={t} value={t} disabled={blocked}>
                                {toAMPM(t)}{blocked?" ●":""}
                              </option>
                            );
                          })}
                        </select>
                      </FL>
                    ))}
                  </div>
                  {form.startTime&&form.endTime&&form.startTime>=form.endTime&&<div style={{fontSize:13,color:c.danger,background:c.dangerBg,borderRadius:c.radiusSm,padding:"8px 12px"}}>종료 시간은 시작 시간보다 늦어야 합니다</div>}
                  {overlapsWorship&&<div style={{fontSize:13,color:"#c2410c",background:"#fff7ed",borderRadius:c.radiusSm,padding:"8px 12px"}}>
                    ⛪ 선택한 시간이 주일예배 시간(8:00 AM – 1:00 PM)과 겹칩니다
                  </div>}
                  {overlapsSat&&<div style={{fontSize:13,color:"#c2410c",background:"#fff7ed",borderRadius:c.radiusSm,padding:"8px 12px"}}>
                    🎵 선택한 시간이 찬양 연습 시간(9:00 AM – 12:00 PM)과 겹칩니다
                  </div>}
                  {overlapsWed&&<div style={{fontSize:13,color:"#c2410c",background:"#fff7ed",borderRadius:c.radiusSm,padding:"8px 12px"}}>
                    🙏 선택한 시간이 수요예배 시간(7:00 PM – 10:00 PM)과 겹칩니다
                  </div>}
                  <FL label="예약 비밀번호" required hint="숫자 4자리">
                    <input type="password" inputMode="numeric" maxLength={4} placeholder="숫자 4자리" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value.replace(/\D/g,"").slice(0,4)}))} style={{...IS,borderColor:form.password&&!/^\d{4}$/.test(form.password)?"#f87171":"#d4d8f5"}}/>
                    {form.password&&!/^\d{4}$/.test(form.password)&&<div style={{fontSize:12,color:c.danger,marginTop:4}}>숫자 4자리로 입력해주세요</div>}
                  </FL>
                  <FL label="비고" hint="선택"><textarea value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="특이사항이나 요청사항" rows={2} style={{...IS,resize:"vertical"}}/></FL>
                  <button onClick={handleSubmit} disabled={!canSubmit} style={{background:canSubmit?c.primary:"#c7d2fe",border:"none",borderRadius:c.radiusSm,padding:"15px",color:"#fff",fontSize:17,fontWeight:700,cursor:canSubmit?"pointer":"default",fontFamily:"inherit"}}>예약 신청하기</button>
                </div>
              }
            </div>
          </div>
        )}

        {/* Success */}
        {submitted&&(
          <div style={{textAlign:"center",padding:"60px 20px"}}>
            <div style={{fontSize:64,marginBottom:18}}>✅</div>
            <h2 style={{fontSize:26,fontWeight:700,margin:"0 0 10px",color:c.success}}>예약 신청 완료!</h2>
            <div style={{fontSize:17,color:c.sub,marginBottom:4}}>{selSpace?.name} · {selDate}</div>
            <div style={{fontSize:17,color:c.sub,marginBottom:4}}>{toAMPM(form.startTime)} – {toAMPM(form.endTime)}</div>
            {form.team&&<div style={{fontSize:15,color:c.sub,marginBottom:4}}>{form.team}</div>}
            <div style={{margin:"16px auto",maxWidth:320,padding:"10px 16px",borderRadius:c.radiusSm,
              background:syncStatus==="saved"?c.successBg:syncStatus==="error"?c.dangerBg:"#f5f6ff",
              border:`1px solid ${syncStatus==="saved"?"#bbf7d0":syncStatus==="error"?"#fecaca":"#e0e7ff"}`,
              fontSize:14,color:syncStatus==="saved"?c.success:syncStatus==="error"?c.danger:c.sub}}>
              {syncStatus==="saving"&&"📊 구글 시트에 저장 중..."}
              {syncStatus==="saved" &&"✅ 구글 시트에 저장되었습니다"}
              {syncStatus==="error" &&"⚠️ 시트 저장 실패 — 관리자에게 문의하세요"}
            </div>
            <button onClick={resetBook} style={{background:c.primary,border:"none",borderRadius:c.radiusSm,padding:"14px 36px",color:"#fff",fontSize:17,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>처음으로 돌아가기</button>
          </div>
        )}

        {/* Admin */}
        {view==="admin"&&(
          <div>
            <h2 style={{fontSize:22,fontWeight:700,marginBottom:20}}>관리자 페이지</h2>
            {!adminAuth?(
              <div style={{maxWidth:320,margin:"40px auto",background:c.card,border:`1.5px solid ${c.border}`,borderRadius:c.radius,padding:28,boxShadow:c.shadow,textAlign:"center"}}>
                <div style={{fontSize:40,marginBottom:12}}>🔑</div>
                <div style={{fontSize:16,color:c.sub,marginBottom:14}}>비밀번호를 입력하세요</div>
                <input type="password" placeholder="" value={adminPin} onChange={e=>setAdminPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(adminPin===currentPin?setAdminAuth(true):alert("비밀번호가 맞지 않습니다"))} style={{...IS,textAlign:"center",fontSize:20,letterSpacing:6,marginBottom:12}}/>
                <button onClick={()=>adminPin===currentPin?setAdminAuth(true):alert("비밀번호가 맞지 않습니다")} style={{width:"100%",background:c.primary,border:"none",borderRadius:c.radiusSm,padding:"13px",color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>로그인</button>
              </div>
            ):(
              <div>
                {/* Recurring */}
                <div style={{background:c.goldBg,border:"1.5px solid #f59e0b55",borderRadius:c.radius,padding:20,marginBottom:20}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div>
                      <div style={{fontSize:16,fontWeight:700}}>반복 예약 등록 <span style={{fontSize:11,background:"#f59e0b",color:"#fff",borderRadius:5,padding:"2px 7px",marginLeft:6,fontWeight:600}}>관리자 전용</span></div>
                      <div style={{fontSize:13,color:c.sub,marginTop:2}}>매주/매일 반복 일정 일괄 등록</div>
                    </div>
                    <button onClick={()=>{setShowRecur(v=>!v);setRecurDone(false);}} style={{background:showRecur?"#fff":"#f59e0b",border:"1.5px solid #f59e0b",borderRadius:c.radiusSm,padding:"8px 16px",cursor:"pointer",fontSize:14,fontWeight:700,fontFamily:"inherit",color:showRecur?"#f59e0b":"#fff"}}>{showRecur?"닫기":"등록하기"}</button>
                  </div>
                  {showRecur&&!recurDone&&(
                    <div style={{marginTop:18,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                      <div><div style={{fontSize:13,fontWeight:600,color:c.sub,marginBottom:5}}>장소 *</div><select value={recurForm.spaceId} onChange={e=>setRecurForm(f=>({...f,spaceId:e.target.value}))} style={IS}>{SPACES.map(sp=><option key={sp.id} value={sp.id}>{sp.icon} {sp.name}</option>)}</select></div>
                      <div><div style={{fontSize:13,fontWeight:600,color:c.sub,marginBottom:5}}>반복 주기 *</div><select value={recurForm.recurType} onChange={e=>setRecurForm(f=>({...f,recurType:e.target.value}))} style={IS}>{RECUR_DAYS.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
                      <div><div style={{fontSize:13,fontWeight:600,color:c.sub,marginBottom:5}}>시작 날짜 *</div><input type="date" value={recurForm.startDate} min={todayStr} onChange={e=>setRecurForm(f=>({...f,startDate:e.target.value}))} style={IS}/></div>
                      <div><div style={{fontSize:13,fontWeight:600,color:c.sub,marginBottom:5}}>종료 날짜 *</div><input type="date" value={recurForm.endDate} onChange={e=>setRecurForm(f=>({...f,endDate:e.target.value}))} style={IS}/></div>
                      <div><div style={{fontSize:13,fontWeight:600,color:c.sub,marginBottom:5}}>시작 시간 *</div><select value={recurForm.startTime} onChange={e=>setRecurForm(f=>({...f,startTime:e.target.value}))} style={IS}>{TIME_SLOTS.map(t=><option key={t} value={t}>{toAMPM(t)}</option>)}</select></div>
                      <div><div style={{fontSize:13,fontWeight:600,color:c.sub,marginBottom:5}}>종료 시간 *</div><select value={recurForm.endTime} onChange={e=>setRecurForm(f=>({...f,endTime:e.target.value}))} style={IS}>{TIME_SLOTS.map(t=><option key={t} value={t}>{toAMPM(t)}</option>)}</select></div>
                      <div><div style={{fontSize:13,fontWeight:600,color:c.sub,marginBottom:5}}>담당자 이름 *</div><input type="text" placeholder="홍길동" value={recurForm.name} onChange={e=>setRecurForm(f=>({...f,name:e.target.value}))} style={IS}/></div>
                      <div><div style={{fontSize:13,fontWeight:600,color:c.sub,marginBottom:5}}>연락처</div><input type="tel" placeholder="617-000-0000" value={recurForm.phone} onChange={e=>setRecurForm(f=>({...f,phone:e.target.value}))} style={IS}/></div>
                      <div style={{gridColumn:"1/-1"}}><div style={{fontSize:13,fontWeight:600,color:c.sub,marginBottom:5}}>예약 팀</div><input type="text" placeholder="예: 청년부" value={recurForm.team} onChange={e=>setRecurForm(f=>({...f,team:e.target.value}))} style={IS}/></div>
                      <div style={{gridColumn:"1/-1"}}><div style={{fontSize:13,fontWeight:600,color:c.sub,marginBottom:5}}>사용 목적 *</div><input type="text" placeholder="예: 주일예배" value={recurForm.purpose} onChange={e=>setRecurForm(f=>({...f,purpose:e.target.value}))} style={IS}/></div>
                      <div style={{gridColumn:"1/-1"}}><button disabled={!recurForm.name||!recurForm.purpose||recurForm.startTime>=recurForm.endTime} onClick={handleRecurSubmit} style={{width:"100%",background:"#f59e0b",border:"none",borderRadius:c.radiusSm,padding:"13px",color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:(!recurForm.name||!recurForm.purpose||recurForm.startTime>=recurForm.endTime)?0.4:1}}>반복 예약 일괄 등록</button></div>
                    </div>
                  )}
                  {showRecur&&recurDone&&(
                    <div style={{marginTop:18,textAlign:"center",padding:"16px 0"}}>
                      <div style={{fontSize:30,marginBottom:6}}>✅</div>
                      <div style={{fontSize:17,fontWeight:700,color:c.success,marginBottom:10}}>반복 예약이 등록되었습니다!</div>
                      <button onClick={()=>{setRecurDone(false);setRecurForm({spaceId:1,startDate:todayStr,endDate:maxDateStr,recurType:"0",startTime:"09:00",endTime:"13:00",name:"",phone:"",team:"",purpose:"",note:""}); }} style={{background:"none",border:"1.5px solid #f59e0b",borderRadius:c.radiusSm,padding:"8px 20px",cursor:"pointer",fontSize:14,fontFamily:"inherit",color:"#f59e0b",fontWeight:600}}>새로 등록</button>
                    </div>
                  )}
                </div>

                {/* Reservation list */}
                <div style={{background:c.card,border:`1.5px solid ${c.border}`,borderRadius:c.radius,padding:20,boxShadow:c.shadow}}>
                  <div style={{fontSize:17,fontWeight:700,marginBottom:14}}>예약 내역 조회</div>
                  <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
                    <select value={adminFilter} onChange={e=>setAdminFilter(e.target.value)} style={{...IS,width:"auto",flex:1,minWidth:130}}>
                      <option value="all">전체 장소</option>
                      {SPACES.map(sp=><option key={sp.id} value={sp.id}>{sp.name}</option>)}
                    </select>
                    <input type="date" value={adminDate} onChange={e=>setAdminDate(e.target.value)} style={{...IS,width:"auto",flex:1,minWidth:130}}/>
                    {adminDate&&<button onClick={()=>setAdminDate("")} style={{background:"none",border:`1.5px solid ${c.border}`,borderRadius:c.radiusSm,padding:"11px 12px",cursor:"pointer",fontSize:14,fontFamily:"inherit",color:c.sub}}>초기화</button>}
                    <div style={{fontSize:14,color:c.sub,whiteSpace:"nowrap"}}>총 <strong>{adminRes.length}</strong>건</div>
                  </div>
                  {adminRes.length===0&&<div style={{textAlign:"center",color:c.light,padding:"40px 0",fontSize:16}}>예약 내역이 없습니다</div>}
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {adminRes.map(r=>{
                      const sp=SPACES.find(s=>s.id===r.spaceId);
                      return(
                        <div key={r.id} style={{border:`1.5px solid ${c.border}`,borderRadius:c.radiusSm,padding:"12px 14px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr auto",gap:8,alignItems:"center"}}>
                          <div>
                            <div style={{fontSize:11,color:c.light,marginBottom:2}}>장소</div>
                            <div style={{fontSize:14,fontWeight:700}}>{sp?.icon} {sp?.name}</div>
                            {r.recurring&&<span style={{fontSize:10,background:c.goldBg,color:c.gold,borderRadius:4,padding:"1px 5px",display:"inline-block",marginTop:2,fontWeight:600}}>반복</span>}
                          </div>
                          <div>
                            <div style={{fontSize:11,color:c.light,marginBottom:2}}>일시</div>
                            <div style={{fontSize:14,fontWeight:700,color:c.primary}}>{r.date}</div>
                            <div style={{fontSize:12,color:c.sub}}>{toAMPM(r.startTime)} – {toAMPM(r.endTime)}</div>
                          </div>
                          <div>
                            <div style={{fontSize:11,color:c.light,marginBottom:2}}>신청자</div>
                            <div style={{fontSize:14,fontWeight:700}}>{r.name}</div>
                            {r.team&&<div style={{fontSize:12,color:c.sub}}>{r.team}</div>}
                            <div style={{fontSize:12,color:c.sub}}>{r.purpose}</div>
                            <div style={{fontSize:11,color:c.light}}>{r.phone}</div>
                          </div>
                          <button onClick={()=>adminDelete(r.id)} style={{background:c.dangerBg,border:`1.5px solid ${c.danger}44`,color:c.danger,borderRadius:c.radiusSm,padding:"8px 11px",fontSize:13,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>삭제</button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{marginTop:18,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                  <button onClick={()=>setAdminAuth(false)} style={{background:"none",border:`1.5px solid ${c.border}`,borderRadius:c.radiusSm,padding:"10px 20px",color:c.sub,cursor:"pointer",fontSize:14,fontFamily:"inherit"}}>로그아웃</button>
                  <button onClick={()=>{setShowPwChange(v=>!v);setPwForm({cur:"",next:"",confirm:""});setPwMsg(null);}} style={{background:c.chipBg,border:`1.5px solid ${c.primary}`,borderRadius:c.radiusSm,padding:"10px 20px",color:c.primary,cursor:"pointer",fontSize:14,fontFamily:"inherit",fontWeight:600}}>🔒 비밀번호 변경</button>
                </div>
                {showPwChange&&(
                  <div style={{marginTop:14,background:c.card,border:`1.5px solid ${c.border}`,borderRadius:c.radius,padding:20,boxShadow:c.shadow,maxWidth:360}}>
                    <div style={{fontSize:16,fontWeight:700,marginBottom:14}}>관리자 비밀번호 변경</div>
                    <div style={{display:"flex",flexDirection:"column",gap:12}}>
                      {[["cur","현재 비밀번호"],["next","새 비밀번호"],["confirm","새 비밀번호 확인"]].map(([k,lbl])=>(
                        <div key={k}><div style={{fontSize:13,fontWeight:600,color:c.sub,marginBottom:5}}>{lbl}</div><input type="password" value={pwForm[k]} onChange={e=>setPwForm(f=>({...f,[k]:e.target.value}))} style={IS}/></div>
                      ))}
                      {pwMsg&&<div style={{fontSize:13,padding:"8px 12px",borderRadius:c.radiusSm,background:pwMsg.ok?c.successBg:c.dangerBg,color:pwMsg.ok?c.success:c.danger}}>{pwMsg.text}</div>}
                      <button onClick={()=>{
                        if(pwForm.cur!==currentPin){setPwMsg({ok:false,text:"현재 비밀번호가 맞지 않습니다."});return;}
                        if(pwForm.next.length<4){setPwMsg({ok:false,text:"새 비밀번호는 4자 이상이어야 합니다."});return;}
                        if(pwForm.next!==pwForm.confirm){setPwMsg({ok:false,text:"새 비밀번호가 일치하지 않습니다."});return;}
                        setCurrentPin(pwForm.next); setPwMsg({ok:true,text:"비밀번호가 변경되었습니다!"}); setPwForm({cur:"",next:"",confirm:""});
                      }} style={{background:c.primary,border:"none",borderRadius:c.radiusSm,padding:"12px",color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>변경하기</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function FL({ label, required, hint, children }) {
  return (
    <div>
      <div style={{fontSize:15,fontWeight:600,color:"#6b7280",marginBottom:6}}>
        {label}{required&&<span style={{color:"#dc2626"}}> *</span>}
        {hint&&<span style={{fontSize:12,fontWeight:400,color:"#9ca3af",marginLeft:4}}>({hint})</span>}
      </div>
      {children}
    </div>
  );
}
