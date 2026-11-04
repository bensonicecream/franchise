/* ================================================================
   메일 회신 붙여넣기 → 문의 데이터 자동 채우기
   기존 안내 메일(1~10번 질문 + "답변:") 형식을 읽습니다.
   자동 인식 결과는 관리자가 확인·수정한 뒤 등록하는 것을 전제로 합니다.
   ================================================================ */
import { REGIONS } from "./config.js";

export function fmtPhone(v) {
  const d = String(v || "").replace(/\D/g, "").slice(0, 11);
  if (d.startsWith("02")) {
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`;
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

const KEYS = ["name", "age", "region", "invest", "fnb", "motive", "open", "oper", "store", "etc"];
const TITLE_RE = [/성함|연락처|이름/, /연령|나이/, /지역|상권/, /투자|예산|금액/, /외식|F\s*&\s*B|경험/i,
  /사유|동기|지원/, /오픈|개점|시기/, /운영/, /점포|매장|상가/, /기타|문의/];

const norm = s => String(s).replace(/\s+/g, "");
const TEMPLATE = new Set([
  "시·군·구 또는 희망 상권을 기재해 주세요. 복수 지역도 가능합니다.",
  "보증금·권리금 등을 포함한 총예산을 기재해 주세요.",
  "업종, 주요 업무, 기간을 기재해 주세요.",
  "벤슨을 선택하신 이유와 창업 동기를 간단히 작성해 주세요.",
  "미확보 / 검토 중 / 확보 완료 중 선택해 주세요.",
  "확보 또는 검토 중인 점포가 있다면 소재지와 면적도 함께 기재해 주세요."
].map(norm));

const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/* 앞 글자가 한글이 아닐 때만 일치 (예: '서구'가 '강서구'에 걸리지 않게) */
function findWord(text, word) {
  const m = new RegExp(`(^|[^가-힣])${reEsc(word)}`).exec(text);
  return m ? m.index + m[1].length : -1;
}

/* ---------- 지역 ---------- */
const SIDO_ALIASES = Object.entries({
  "서울": ["서울특별시", "서울시", "서울"], "부산": ["부산광역시", "부산시", "부산"], "대구": ["대구광역시", "대구시", "대구"],
  "인천": ["인천광역시", "인천시", "인천"], "광주": ["광주광역시"], "대전": ["대전광역시", "대전시", "대전"],
  "울산": ["울산광역시", "울산시", "울산"], "세종": ["세종특별자치시", "세종시", "세종"], "경기": ["경기도", "경기"],
  "강원": ["강원특별자치도", "강원도", "강원"], "충북": ["충청북도", "충북"], "충남": ["충청남도", "충남"],
  "전북": ["전북특별자치도", "전라북도", "전북"], "전남": ["전라남도", "전남"], "경북": ["경상북도", "경북"],
  "경남": ["경상남도", "경남"], "제주": ["제주특별자치도", "제주도"]
}).flatMap(([s, list]) => list.map(a => [s, a])).sort((a, b) => b[1].length - a[1].length);

const ENTRIES = Object.entries(REGIONS).flatMap(([sido, list]) => list.map(full => {
  const p = full.split(" ");
  return { sido, full, last: p[p.length - 1], city: p.length > 1 ? p[0] : null };
}));

function findSido(text) {
  for (const [sido, alias] of SIDO_ALIASES) if (findWord(text, alias) >= 0) return { sido, alias };
  return null;
}

function findPlaces(text, sido) {
  const groups = new Map();                       // 일치한 글자 → 후보들
  for (const e of ENTRIES) {
    if (sido && e.sido !== sido) continue;
    let word = null, score = 0, at = -1;
    if ((at = findWord(text, e.full)) >= 0) { word = e.full; score = 3; }
    else if (e.last !== e.full && (at = findWord(text, e.last)) >= 0) { word = e.last; score = 2; }
    else if (e.city && (at = findWord(text, e.city)) >= 0) { word = e.city; score = 1; }
    if (!word) continue;
    const g = groups.get(word) || { word, score, at, list: [] };
    g.list.push(e); groups.set(word, g);
  }
  let arr = [...groups.values()];
  arr = arr.filter(g => !arr.some(o => o !== g && o.score > g.score && o.word.includes(g.word)));
  return arr.sort((a, b) => a.at - b.at);
}

export function parseRegions(text) {
  const warnings = [], regions = [];
  const parts = String(text || "").split(/[\/,\n;|，]/).map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    let sd = findSido(part);
    let places = findPlaces(part, sd?.sido);
    if (sd && !places.length) {                    // 시·도 오인식 대비: 제한 없이 다시 찾기
      const any = findPlaces(part, null);
      if (any.length === 1 && any[0].list.length === 1) { places = any; sd = null; }
    }
    let rest = part;
    if (sd) rest = rest.replace(sd.alias, " ");
    places.forEach(g => { rest = rest.replace(g.word, " "); });
    rest = rest.replace(/\s+/g, " ").replace(/^[\s:：\-–—~·,.]+|[\s:：\-–—~·,]+$/g, "").trim();

    if (!places.length) {
      if (sd) {
        const only = REGIONS[sd.sido].length === 1 ? REGIONS[sd.sido][0] : "";
        regions.push({ sido: sd.sido, sigungu: only, area: rest.slice(0, 60) });
        if (!only) warnings.push(`'${part}': 시·군·구를 찾지 못해 '${sd.sido}'만 넣었습니다.`);
      } else if (regions.length) {
        const prev = regions[regions.length - 1];
        prev.area = [prev.area, part].filter(Boolean).join(" ").slice(0, 60);
      } else if (part.length >= 2) {
        warnings.push(`'${part}': 지역을 인식하지 못했습니다. 직접 선택해 주세요.`);
      }
      continue;
    }
    places.forEach((g, i) => {
      const e = g.list[0];
      if (g.list.length > 1 && new Set(g.list.map(x => x.sido)).size > 1)
        warnings.push(`'${g.word}'는 여러 시·도에 있어 '${e.sido}'로 넣었습니다. 확인해 주세요.`);
      const area = i === 0 && places.length === 1 ? rest : "";
      if (g.score === 1) {
        regions.push({ sido: e.sido, sigungu: "", area: `${g.word} ${area}`.trim().slice(0, 60) });
        warnings.push(`'${g.word}': 구가 적혀 있지 않아 시까지만 넣었습니다.`);
      } else {
        regions.push({ sido: e.sido, sigungu: e.full, area: area.slice(0, 60) });
      }
    });
  }
  if (regions.length > 3) warnings.push(`희망 지역이 ${regions.length}곳이라 앞의 3곳만 넣었습니다.`);
  return { regions: regions.slice(0, 3), warnings };
}

/* ---------- 금액 (만원) ---------- */
export function parseInvest(text) {
  const s = String(text || "").replace(/[_\s]/g, "");
  if (!s) return { v: 0 };
  const m = s.match(/(\d+(?:\.\d+)?)억(?:(\d[\d,]*)(천만|천|만)?)?/);
  if (m) {
    let v = parseFloat(m[1]) * 10000;
    if (m[2]) { const n = Number(m[2].replace(/,/g, "")); v += (m[3] === "천" || m[3] === "천만") ? n * 1000 : n; }
    return { v: Math.round(v) };
  }
  const d = s.match(/\d[\d,]*/);
  if (!d) return { v: 0 };
  const n = Number(d[0].replace(/,/g, ""));
  if (/만/.test(s)) return { v: n };
  if (n >= 1000000) return { v: Math.round(n / 10000) };
  return { v: n, warn: true };
}

/* ---------- 오픈 시기 ---------- */
export function parseOpen(text, today = new Date()) {
  const t = String(text || "");
  if (!t.trim()) return { v: "" };
  const y0 = today.getFullYear();
  const years = [...t.matchAll(/(20\d{2})\s*년?/g)].map(m => ({ at: m.index, y: Number(m[1]) }));
  const yearAt = (idx, own) => {
    if (own) return Number(own);
    const prev = years.filter(x => x.at < idx).pop();
    if (prev) return prev.y;
    if (/내년/.test(t)) return y0 + 1;
    return null;
  };
  const spans = [];
  const push = (y, m1, m2) => spans.push({ start: new Date(y, m1 - 1, 1), end: new Date(y, m2, 0) });
  for (const m of t.matchAll(/(?:(20\d{2})\s*년?\s*)?(상반기|하반기)/g)) {
    const y = yearAt(m.index, m[1]) ?? y0; m[2] === "상반기" ? push(y, 1, 6) : push(y, 7, 12);
  }
  for (const m of t.matchAll(/(?:(20\d{2})\s*년?\s*)?([1-4])\s*분기/g)) {
    const y = yearAt(m.index, m[1]) ?? y0, q = Number(m[2]); push(y, q * 3 - 2, q * 3);
  }
  for (const m of t.matchAll(/(?:(20\d{2})\s*년?\s*)?(\d{1,2})\s*월/g)) {
    const mo = Number(m[2]); if (mo < 1 || mo > 12) continue;
    let y = yearAt(m.index, m[1]); if (y == null) y = mo >= today.getMonth() + 1 ? y0 : y0 + 1;
    push(y, mo, mo);
  }
  if (!spans.length) for (const y of years) push(y.y, 1, 12);
  const mm = t.match(/(\d{1,2})\s*개월/);
  if (mm) { const n = Number(mm[1]); const s = new Date(today); const e = new Date(today); e.setMonth(e.getMonth() + n); spans.push({ start: s, end: e }); }
  if (/즉시|바로|최대한\s*빨리|가능한\s*빨리|ASAP/i.test(t)) spans.push({ start: today, end: today });

  if (!spans.length) {
    if (/협의|미정|무관|상관\s*없/.test(t)) return { v: "nego" };
    return { v: "", warn: `오픈 시기 '${t}'를 인식하지 못했습니다. 직접 선택해 주세요.` };
  }
  spans.sort((a, b) => a.start - b.start);
  const s = spans[0];
  const months = ((s.start.getTime() + s.end.getTime()) / 2 - today.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  const v = months <= 3 ? "m3" : months <= 6 ? "m6" : months <= 12 ? "m12" : "y1";
  return { v, months: Math.round(months * 10) / 10 };
}

/* ---------- 전체 ---------- */
export function parseMail(raw, today = new Date()) {
  const warnings = [];
  const lines = String(raw || "").replace(/\r/g, "").split("\n").map(l => l.replace(/^\s*>+\s?/, ""));
  const sec = {};
  let cur = null, expect = 1;
  for (const line of lines) {
    const m = expect <= 10 && line.match(/^\s*(\d{1,2})\s*[.)．]\s*(.*)$/);
    if (m && Number(m[1]) === expect && TITLE_RE[expect - 1].test(m[2])) {
      cur = KEYS[expect - 1]; sec[cur] = [];
      const c = m[2].search(/[:：]/);
      if (c >= 0 && m[2].slice(c + 1).trim()) sec[cur].push(m[2].slice(c + 1));
      expect++; continue;
    }
    if (cur) sec[cur].push(line);
  }
  const found = expect - 1;
  if (found < 10) warnings.push(found
    ? `질문 ${found + 1}번부터 찾지 못했습니다. 빠진 항목은 직접 입력해 주세요.`
    : "질문 번호(1~10)를 찾지 못했습니다. 메일 본문의 1~10번 부분을 붙여넣었는지 확인해 주세요.");

  /* 기타 문의 뒤에 붙은 서명·이전 메일 잘라내기 */
  if (sec.etc) {
    const out = []; let blank = 0;
    for (const l of sec.etc) {
      if (/^\s*(-{3,}|_{3,}|From:|보낸\s*사람|원본\s*메일|-----Original|On .+wrote:)/i.test(l)) break;
      blank = l.trim() ? 0 : blank + 1;
      if (blank >= 2 && out.some(x => x.trim())) break;
      out.push(l);
    }
    sec.etc = out;
  }

  const clean = arr => (arr || [])
    .map(l => l.replace(/^\s*답변\s*[:：]?\s*/, "").replace(/_{2,}/g, " ").trim())
    .filter(l => l && !/^예시\s*[:：]/.test(l) && !TEMPLATE.has(norm(l)) && !/(기재|작성|선택)해\s*주세요\.?$/.test(l))
    .join("\n").trim();
  const T = Object.fromEntries(KEYS.map(k => [k, clean(sec[k])]));
  const d = {};

  // 1. 성함·연락처·이메일
  const pm = T.name.match(/0\d{1,2}[-.\s)]*\d{3,4}[-.\s]*\d{4}/);
  const em = T.name.match(/[^\s@/,()<>]+@[^\s@/,()<>]+\.[^\s@/,()<>]+/);
  d.phone = pm ? fmtPhone(pm[0]) : "";
  d.email = em ? em[0] : "";
  const rest = T.name.replace(pm?.[0] || "\u0000", " ").replace(em?.[0] || "\u0000", " ");
  d.name = (rest.match(/[가-힣]{2,5}/g) || []).find(w => !["성함", "연락처", "이메일", "답변", "휴대폰", "전화", "번호"].includes(w)) || "";
  if (!d.name) warnings.push("성함을 찾지 못했습니다.");
  if (!d.phone) warnings.push("연락처를 찾지 못했습니다.");

  // 2. 연령대
  const am = T.age.match(/([2-6])0\s*대/), an = T.age.match(/(\d{2})\s*세/);
  d.ageBand = am ? am[1] + "0" : an ? String(Math.min(60, Math.max(20, Math.floor(Number(an[1]) / 10) * 10))) : "";
  if (!d.ageBand) warnings.push("연령대를 찾지 못했습니다.");

  // 3. 희망 지역
  const rg = parseRegions(T.region);
  d.regions = rg.regions; warnings.push(...rg.warnings);
  if (!d.regions.length) warnings.push("희망 지역을 넣지 못했습니다. 직접 선택해 주세요.");

  // 4. 투자 금액
  const iv = parseInvest(T.invest);
  d.investment = iv.v;
  if (!iv.v) warnings.push("투자 가능 금액을 찾지 못했습니다.");
  else if (iv.warn) warnings.push(`투자 금액 '${T.invest}'의 단위를 확인해 주세요. (만원으로 넣었습니다)`);

  // 5. 외식업 경험
  const f = T.fnb;
  d.fnbDetail = f;
  if (!f) { d.fnbExp = ""; warnings.push("외식업 경험 답변이 없습니다."); }
  else if (/^(없음|없습니다|무|해당\s*없음)/.test(f) || /경험\s*(이|은)?\s*없/.test(f)) { d.fnbExp = "none"; d.fnbDetail = ""; }
  else if (/운영|점주|창업|사장|오너|대표|가맹점주/.test(f)) d.fnbExp = "owner";
  else if (/근무|매니저|점장|직원|알바|아르바이트|스태프|크루|바리스타|경력|\d+\s*(년|개월)/.test(f)) d.fnbExp = "staff";
  else { d.fnbExp = "staff"; warnings.push("외식업 경험 구분(운영/근무)을 확인해 주세요."); }

  // 6. 지원 사유
  d.motive = T.motive.slice(0, 2000);

  // 7. 오픈 시기
  const op = parseOpen(T.open, today);
  d.openTiming = op.v; d.openTimingNote = T.open.slice(0, 100);
  if (op.warn) warnings.push(op.warn);

  // 8. 운영 참여
  const o = T.oper, self = /직접|본인/.test(o), mgr = /관리자|채용|오토|위탁/.test(o);
  d.operation = !o ? "" : self && !mgr ? "self" : mgr && !self ? "manager" : "other";
  d.operationNote = d.operation === "other" ? o.slice(0, 200) : "";
  if (!o) warnings.push("운영 참여 계획 답변이 없습니다.");

  // 9. 점포
  const s = T.store;
  d.store = !s ? "" : /미\s*확보|없음|미정|아직/.test(s) ? "none"
    : /검토|알아보|물색|협의\s*중/.test(s) ? "reviewing"
    : /확보|계약|보유/.test(s) ? "secured" : "";
  if (!d.store) warnings.push("점포 확보 여부를 확인해 주세요.");
  const ar = s.match(/(\d+(?:\.\d+)?)\s*평/), sq = s.match(/(\d+(?:\.\d+)?)\s*(㎡|m2|제곱미터)/);
  d.storeArea = ar ? ar[1] : sq ? (Number(sq[1]) / 3.3058).toFixed(1) : "";
  d.storeAddress = d.store && d.store !== "none"
    ? s.replace(/확보\s*완료|확보|검토\s*중|검토|계약\s*완료|계약/g, " ").replace(ar?.[0] || sq?.[0] || "\u0000", " ")
        .replace(/\s+/g, " ").replace(/^[\s:/,\-()]+|[\s:/,\-()]+$/g, "").slice(0, 200)
    : "";

  // 10. 기타
  d.etc = T.etc.slice(0, 2000);

  return { data: d, warnings, found };
}
