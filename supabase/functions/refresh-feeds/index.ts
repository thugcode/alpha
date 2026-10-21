// @ts-nocheck
// 알파: '내 알림 링크' 지금 업데이트
// Supabase → Edge Functions → 이름 refresh-feeds 로 이 파일을 통째로 붙여 넣고 Deploy 한다.
//
// 하는 일
// 1. 로그인한 사용자가 등록한 링크(user_docs의 watch 문서)를 읽는다.
// 2. 하루 3번(한국 시간 기준)까지만 허용한다. 횟수는 사용자가 고칠 수 없는 feed_refresh 표에 센다.
// 3. 각 링크의 페이지를 열어 새 글 목록을 뽑는다. RSS가 있으면 RSS를 쓰고, 없으면 페이지의 글 링크를 고른다.
//    사이트가 robots.txt로 자동 수집을 막아 두었으면 가져오지 않는다.
// 4. 결과를 user_docs의 feeds 문서에 링크별로 저장한다. 앱은 이 문서를 읽어 화면에 보여 준다.

import { createClient } from "jsr:@supabase/supabase-js@2";

const DAILY_LIMIT = 3;
const MAX_ITEMS = 8;
const FETCH_TIMEOUT_MS = 10000;
const MAX_BYTES = 1_500_000;
const UA = "AlphaFeedBot/1.0 (+https://thugcode.github.io/alpha/)";
const ALLOWED_ORIGINS = ["https://thugcode.github.io", "http://localhost:8000", "http://127.0.0.1:8000"];

function cors(origin: string | null) {
  const o = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function kstDay(d = new Date()) {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return k.toISOString().slice(0, 10);
}

// ---------- 주소 안전 검사 (내부망·로컬 주소 차단) ----------
function safeUrl(raw: string) {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return null;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return null;
  if (h.startsWith("[") || h.includes(":")) return null; // IPv6 직접 주소는 받지 않는다
  return u;
}

async function fetchText(url: string) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.5", "Accept-Language": "ko,en;q=0.8" }, redirect: "follow", signal: ctl.signal });
    const finalUrl = res.url || url;
    if (!safeUrl(finalUrl)) throw new Error("내부 주소로 이동해서 열지 않았다");
    const buf = new Uint8Array(await res.arrayBuffer()).slice(0, MAX_BYTES);
    const ctype = res.headers.get("content-type") || "";
    let charset = (/charset=([\w-]+)/i.exec(ctype) || [])[1];
    if (!charset) {
      const head = new TextDecoder("latin1").decode(buf.slice(0, 4096));
      charset = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(head) || [])[1] || "utf-8";
    }
    let text: string;
    try { text = new TextDecoder(charset.toLowerCase()).decode(buf); } catch { text = new TextDecoder("utf-8").decode(buf); }
    return { status: res.status, ok: res.ok, text, finalUrl, ctype };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- robots.txt ----------
// PARSE-START (아래 함수들은 node로도 시험할 수 있게 일반 자바스크립트 문법으로 쓴다)
function robotsAllows(robotsTxt, path) {
  // User-agent: * 그룹(우리 봇 이름 그룹이 있으면 그것)의 Allow/Disallow 중 가장 길게 일치하는 규칙을 따른다
  const lines = robotsTxt.split(/\r?\n/).map(l => l.replace(/#.*/, "").trim()).filter(Boolean);
  const groups = []; let cur = null; let lastWasAgent = false;
  for (const l of lines) {
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(l); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") { if (!lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false;
    if (!cur) continue;
    if (k === "allow" || k === "disallow") cur.rules.push({ allow: k === "allow", p: v });
  }
  const mine = groups.find(g => g.agents.some(a => a !== "*" && "alphafeedbot".includes(a))) || groups.find(g => g.agents.includes("*"));
  if (!mine) return true;
  let best = null;
  for (const r of mine.rules) {
    if (r.p === "") { if (!r.allow) continue; }
    const re = new RegExp("^" + r.p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (re.test(path) && (!best || r.p.length > best.p.length || (r.p.length === best.p.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

function decodeEntities(s) {
  return s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function clean(s) { return decodeEntities(String(s || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim(); }

const DATE_RE = /(20\d{2}[.\-/]\s?\d{1,2}[.\-/]\s?\d{1,2}|\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2}|\d{1,2}[.\-/]\d{1,2}(?![\d.]))/;
const NAV_WORDS = /^(홈|home|로그인|로그아웃|회원가입|사이트맵|개인정보|이용약관|이전|다음|더보기|more|목록|처음|마지막|검색|메뉴|닫기|top|위로|바로가기|본문|english|korean|kor|eng|공지사항|자료실|커뮤니티|소개|오시는 길|copyright|facebook|instagram|youtube|blog|twitter|카카오|네이버)$/i;

function parseFeedXml(xml, base) {
  const items = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  for (const b of blocks) {
    const t = clean((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(b) || [])[1]);
    let link = (/<link[^>]*href=["']([^"']+)["']/i.exec(b) || [])[1] || clean((/<link[^>]*>([\s\S]*?)<\/link>/i.exec(b) || [])[1]);
    const d = clean((/<(pubDate|updated|published|dc:date)[^>]*>([\s\S]*?)<\/\1>/i.exec(b) || [])[2]);
    if (!t) continue;
    try { link = new URL(link, base).href; } catch { link = base; }
    let date = "";
    if (d) { const dt = new Date(d); date = isNaN(+dt) ? d.slice(0, 16) : `${dt.getMonth() + 1}.${dt.getDate()}`; }
    items.push({ t: t.slice(0, 120), url: link, date });
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

function findFeedLink(html, base) {
  const m = /<link[^>]+type=["']application\/(rss|atom)\+xml["'][^>]*>/i.exec(html);
  if (!m) return null;
  const href = (/href=["']([^"']+)["']/i.exec(m[0]) || [])[1];
  try { return href ? new URL(href, base).href : null; } catch { return null; }
}

function extractFromHtml(html, base) {
  const body = html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  // 머리말·메뉴·바닥글은 건너뛴다
  const main = body.replace(/<(header|nav|footer)\b[\s\S]*?<\/\1>/gi, " ");
  const baseHost = (() => { try { return new URL(base).host; } catch { return ""; } })();
  const cands = []; const seen = new Set();
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi; let m;
  while ((m = re.exec(main))) {
    const attrs = m[1];
    let href = (/href\s*=\s*["']([^"']*)["']/i.exec(attrs) || [])[1] || "";
    const text = clean(m[2]) || clean((/title\s*=\s*["']([^"']+)["']/i.exec(attrs) || [])[1]);
    if (!text || text.length < 6 || text.length > 140 || NAV_WORDS.test(text)) continue;
    if (/^(#|javascript:|mailto:|tel:)/i.test(href) && !/onclick/i.test(attrs)) continue;
    let abs = base;
    try { abs = href && !/^(#|javascript:)/i.test(href) ? new URL(decodeEntities(href), base).href : base; } catch { continue; }
    if (abs.replace(/#.*$/, "") === base.replace(/#.*$/, "") && !/onclick/i.test(attrs)) continue;
    const key = text + "|" + abs; if (seen.has(key)) continue; seen.add(key);
    // 글 목록의 한 줄(표의 행·목록 항목) 안에서 날짜를 찾는다
    const after = main.slice(m.index, m.index + 600);
    const rowEnd = after.search(/<\/(tr|li)>/i);
    const near = clean(rowEnd > 0 ? after.slice(0, rowEnd) : after.slice(0, 250));
    const dm = DATE_RE.exec(near.slice(text.length));
    const inList = /<(tr|li)\b[^>]*>(?:(?!<\/(tr|li)>)[\s\S])*$/i.test(main.slice(Math.max(0, m.index - 400), m.index));
    let host = ""; try { host = new URL(abs).host; } catch { /* ignore */ }
    let score = 0;
    if (dm) score += 4;
    if (inList) score += 2;
    if (host === baseHost) score += 1;
    if (/(view|read|detail|article|board|bbs|notice|seq|idx|no=|id=)/i.test(abs)) score += 2;
    if (text.length >= 12) score += 1;
    if (/모집|채용|공고|선발|안내|신청|접수|행사|프로그램|공모|대회|특강|설명회|마감|인턴|장학/.test(text)) score += 2;
    cands.push({ t: text.slice(0, 120), url: abs, date: dm ? dm[1].replace(/\s/g, "") : "", score, i: cands.length });
  }
  const good = cands.filter(c => c.score >= 4);
  const pick = (good.length >= 3 ? good : cands.filter(c => c.score >= 3)).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, MAX_ITEMS).sort((a, b) => a.i - b.i);
  return pick.map(({ t, url, date }) => ({ t, url, date }));
}
// PARSE-END

async function collect(link: { id: string; url: string }) {
  const now = new Date().toISOString();
  const u = safeUrl(link.url);
  if (!u) return { status: "error", fetchedAt: now, items: [], note: "열 수 없는 주소다. https://로 시작하는 공개 주소인지 확인한다.", source: "manual" };
  // robots.txt 확인
  try {
    const r = await fetchText(`${u.protocol}//${u.host}/robots.txt`);
    if (r.ok && /user-agent/i.test(r.text) && !robotsAllows(r.text, u.pathname + u.search)) {
      return { status: "blocked", fetchedAt: now, items: [], note: "이 사이트는 자동 수집을 허용하지 않는다. 링크를 눌러 직접 확인한다.", source: "manual" };
    }
  } catch { /* robots.txt가 없거나 열리지 않으면 허용으로 본다 */ }
  let page;
  try { page = await fetchText(u.href); } catch (e) {
    return { status: "error", fetchedAt: now, items: [], note: "사이트가 응답하지 않았다. 잠시 후 다시 시도한다.", source: "manual" };
  }
  if (!page.ok) return { status: page.status === 401 || page.status === 403 ? "blocked" : "error", fetchedAt: now, items: [], note: page.status === 401 || page.status === 403 ? "로그인해야 볼 수 있는 페이지라 가져오지 못했다." : `사이트가 오류(${page.status})를 돌려줬다.`, source: "manual" };
  let items: any[] = [];
  if (/xml|rss|atom/i.test(page.ctype) || /^\s*<\?xml/.test(page.text)) items = parseFeedXml(page.text, page.finalUrl);
  if (!items.length) {
    const feed = findFeedLink(page.text, page.finalUrl);
    if (feed && safeUrl(feed)) { try { const f = await fetchText(feed); if (f.ok) items = parseFeedXml(f.text, f.finalUrl); } catch { /* ignore */ } }
  }
  if (!items.length) items = extractFromHtml(page.text, page.finalUrl);
  if (!items.length) return { status: "error", fetchedAt: now, items: [], note: "글 목록을 찾지 못했다. 화면을 연 뒤에 내용을 불러오는 사이트이거나 로그인이 필요한 사이트일 수 있다.", source: "manual" };
  return { status: "ok", fetchedAt: now, items, note: "", source: "manual" };
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get("origin")), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  const reply = (code: number, body: unknown) => new Response(JSON.stringify(body), { status: code, headers });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: ud, error: ue } = await service.auth.getUser(jwt);
    if (ue || !ud?.user) return reply(401, { error: "login_required", message: "로그인해야 업데이트할 수 있다." });
    const uid = ud.user.id;

    const { data: w } = await service.from("user_docs").select("data").eq("user_id", uid).eq("doc_id", "watch").maybeSingle();
    const links = ((w?.data?.links) || []).slice(0, 5).filter((l: any) => l && l.id && l.url);
    if (!links.length) return reply(400, { error: "no_links", message: "등록한 링크가 없다." });

    const day = kstDay();
    const { data: used, error: be } = await service.rpc("bump_feed_refresh", { p_user: uid, p_day: day, p_max: DAILY_LIMIT });
    if (be) return reply(500, { error: "counter", message: "업데이트 횟수를 확인하지 못했다. schema.sql의 3번을 실행했는지 확인한다." });
    if (used === -1) return reply(429, { error: "limit", message: "오늘 업데이트 3번을 모두 썼다. 내일 다시 할 수 있다.", used: DAILY_LIMIT, limit: DAILY_LIMIT });

    const results = await Promise.all(links.map((l: any) => collect(l).catch(() => ({ status: "error", fetchedAt: new Date().toISOString(), items: [], note: "가져오는 중 문제가 생겼다.", source: "manual" }))));

    const { data: fdoc } = await service.from("user_docs").select("data").eq("user_id", uid).eq("doc_id", "feeds").maybeSingle();
    const prev = (fdoc?.data) || {};
    const byId: Record<string, unknown> = {};
    const ids = new Set(links.map((l: any) => l.id));
    for (const [k, v] of Object.entries(prev.byId || {})) if (ids.has(k)) byId[k] = v;
    links.forEach((l: any, i: number) => { byId[l.id] = results[i]; });
    const data = { ...prev, byId, manual: { day, used, limit: DAILY_LIMIT }, updatedAt: new Date().toISOString() };
    const { error: we } = await service.from("user_docs").upsert({ user_id: uid, doc_id: "feeds", data, updated_at: new Date().toISOString() }, { onConflict: "user_id,doc_id" });
    if (we) return reply(500, { error: "save", message: "가져온 내용을 저장하지 못했다." });

    return reply(200, { ok: true, used, limit: DAILY_LIMIT, byId });
  } catch (e) {
    return reply(500, { error: "server", message: "업데이트 중 문제가 생겼다: " + ((e as Error)?.message || e) });
  }
});
