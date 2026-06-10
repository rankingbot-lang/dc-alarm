// ==UserScript==
// @name         디시 키워드 알람
// @namespace    https://gall.dcinside.com
// @version      0.1.3
// @description  디시인사이드 새 글 제목 키워드를 감지해 페이지 안 알림을 띄웁니다.
// @author       rankingbot
// @license      MIT
// @homepageURL  https://sleazyfork.org/ko/scripts/581303
// @match        https://gall.dcinside.com/*/board/*
// @match        https://gall.dcinside.com/board/*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
  "use strict";

  const ALLOWED_PAGE_RE = /^\/(?:(?:mini|mgallery|person)\/)?board\/(?:lists|view)\/?$/;

  if (!ALLOWED_PAGE_RE.test(location.pathname)) {
    return;
  }

  const DEFAULT_KEYWORDS = ["나눔", "선착", "배민"];
  const DEFAULT_INTERVAL_MS = 1000;
  const DEFAULT_TOAST_LIMIT = 3;
  const MAX_SEEN = 500;
  const MAX_DROPDOWN_WIDTH = 164;

  const state = {
    running: GM_getValue("running", true),
    polling: false,
    failCount: 0,
    timer: null,
    galleryKey: getGalleryKey(),
    baselineReady: false,
  };

  const els = buildPanel();
  loadPanelValues();
  bindPanelEvents();
  logStatus("대기 중");

  state.baselineReady = seedCurrentPageBaseline();
  scheduleNext(0);

  function buildPanel() {
    const panel = document.createElement("div");
    panel.id = "dc-keyword-alarm";
    panel.innerHTML = `
      <div class="dgn-head">
        <button type="button" data-role="collapse"></button>
      </div>
      <div class="dgn-body" data-role="body">
        <div class="inner">
          <ul>
            <li class="dgn-panel-top">
              <strong>디시 키워드 알람</strong>
              <button type="button" data-role="toggle"></button>
            </li>
            <li class="dgn-field dgn-keyword-field">
              <label>키워드</label>
              <textarea data-role="keywords" rows="4" placeholder="비우면 모든 새 글"></textarea>
            </li>
            <li class="dgn-field">
              <label>주기</label>
              <input data-role="interval" type="number" min="1000" step="100" />
            </li>
            <li class="dgn-field">
              <label>이동</label>
              <select data-role="openTarget">
                <option value="article">본문</option>
                <option value="comment">댓글</option>
              </select>
            </li>
            <li class="dgn-field">
              <label>알림</label>
              <select data-role="toastMode">
                <option value="auto">사라지기</option>
                <option value="hold">안사라지기</option>
              </select>
            </li>
            <li class="dgn-field">
              <label>개수</label>
              <input data-role="toastLimit" type="number" min="1" max="10" step="1" />
            </li>
            <li class="dgn-status">
              <span>상태</span><strong data-role="runStatus"></strong>
            </li>
          </ul>
        </div>
      </div>
      <div class="dgn-toast-stack" data-role="toastStack"></div>
    `;

    const style = document.createElement("style");
    style.id = "dc-keyword-alarm-style";
    style.textContent = `
      #dc-keyword-alarm {
        position: relative;
        display: inline-block;
        margin-right: 8px;
        vertical-align: middle;
        color: #333;
        font: 12px/1.4 Arial, sans-serif;
      }
      #dc-keyword-alarm * {
        box-sizing: border-box;
      }
      #dc-keyword-alarm .dgn-head,
      #dc-keyword-alarm .dgn-panel-top,
      #dc-keyword-alarm .dgn-field,
      #dc-keyword-alarm .dgn-status {
        display: flex;
        align-items: center;
      }
      #dc-keyword-alarm .dgn-head {
        width: auto;
        height: 18px;
        gap: 4px;
        justify-content: flex-end;
      }
      #dc-keyword-alarm .dgn-body {
        position: absolute;
        right: 0;
        top: 26px;
        width: var(--dgn-panel-width, 150px);
        z-index: 20;
        border: 1px solid #bbb;
        background: #fff;
        color: #333;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.16);
      }
      #dc-keyword-alarm .inner {
        padding: 4px 0;
      }
      #dc-keyword-alarm ul {
        margin: 0;
        padding: 0;
        list-style: none;
      }
      #dc-keyword-alarm .dgn-panel-top {
        justify-content: space-between;
        gap: 8px;
        min-height: 24px;
      }
      #dc-keyword-alarm .dgn-panel-top strong {
        overflow: hidden;
        color: #111;
        font-weight: 400;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #dc-keyword-alarm .dgn-body li {
        min-height: 26px;
        padding: 4px 8px;
        border-bottom: 1px solid #eee;
      }
      #dc-keyword-alarm .dgn-body li:last-child {
        border-bottom: 0;
      }
      #dc-keyword-alarm .dgn-field {
        gap: 8px;
      }
      #dc-keyword-alarm .dgn-keyword-field {
        align-items: flex-start;
      }
      #dc-keyword-alarm .dgn-toast-stack {
        position: fixed;
        left: 0;
        bottom: 12px;
        width: var(--dgn-panel-width, 150px);
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 6px;
        pointer-events: none;
      }
      #dc-keyword-alarm:not(.dgn-collapsed) .dgn-toast-stack {
        bottom: 12px;
      }
      #dc-keyword-alarm .dgn-page-toast {
        border: 1px solid #444;
        border-radius: 4px;
        min-width: 116px;
        padding: 10px 11px;
        background: #fff;
        color: #111;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
        cursor: pointer;
        pointer-events: auto;
      }
      #dc-keyword-alarm .dgn-page-toast span {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #dc-keyword-alarm.dgn-collapsed {
        width: auto;
        height: auto;
        padding: 0;
        overflow: visible;
        background: transparent;
      }
      #dc-keyword-alarm.dgn-collapsed .dgn-body {
        display: none;
      }
      #dc-keyword-alarm.dgn-collapsed .dgn-head {
        width: auto;
        height: 18px;
        margin: 0;
        justify-content: flex-end;
      }
      #dc-keyword-alarm label {
        display: block;
        flex: 0 0 34px;
        margin: 4px 0 0;
        color: #333;
      }
      #dc-keyword-alarm textarea,
      #dc-keyword-alarm input,
      #dc-keyword-alarm select {
        flex: 1;
        width: 100%;
        min-width: 0;
        border: 1px solid #ccc;
        border-radius: 0;
        padding: 3px;
        background: #fff;
        color: #333;
        font: inherit;
      }
      #dc-keyword-alarm button {
        border: 1px solid #666;
        border-radius: 4px;
        padding: 3px 6px;
        background: #333;
        color: #fff;
        cursor: pointer;
        font: inherit;
      }
      #dc-keyword-alarm .dgn-head button {
        border: 0;
        padding: 0;
        background: transparent;
        color: #111;
      }
      #dc-keyword-alarm.dgn-running [data-role="toggle"] {
        border: 0;
        background: transparent;
        color: #111;
      }
      #dc-keyword-alarm:not(.dgn-running) [data-role="toggle"] {
        border: 0;
        background: transparent;
        color: #777;
      }
      #dc-keyword-alarm button:hover {
        background: #444;
      }
      #dc-keyword-alarm [data-role="toggle"]:hover {
        background: transparent;
        text-decoration: underline;
      }
      #dc-keyword-alarm .dgn-head [data-role="collapse"] {
        width: auto;
        min-width: 26px;
        height: 18px;
        border: 0;
        padding: 0;
        border-radius: 0;
        background: transparent;
        color: #111;
        font-weight: 400;
        line-height: 18px;
      }
      #dc-keyword-alarm:not(.dgn-collapsed) .dgn-head [data-role="collapse"] {
        width: auto;
      }
      #dc-keyword-alarm.dgn-running .dgn-head [data-role="collapse"] {
        color: #111;
      }
      #dc-keyword-alarm:not(.dgn-running) .dgn-head [data-role="collapse"] {
        color: #111;
      }
      #dc-keyword-alarm .dgn-head [data-role="collapse"]:hover {
        background: transparent;
        text-decoration: underline;
      }
      #dc-keyword-alarm .dgn-status {
        gap: 8px;
        word-break: break-all;
      }
      #dc-keyword-alarm .dgn-status span {
        flex: 0 0 30px;
        color: #666;
      }
      #dc-keyword-alarm .dgn-status strong {
        flex: 1;
        color: #333;
        font-weight: 400;
        text-align: right;
      }
    `;

    document.documentElement.appendChild(style);
    attachPanelToPage(panel);

    return {
      panel,
      body: panel.querySelector('[data-role="body"]'),
      collapse: panel.querySelector('[data-role="collapse"]'),
      toggle: panel.querySelector('[data-role="toggle"]'),
      keywords: panel.querySelector('[data-role="keywords"]'),
      interval: panel.querySelector('[data-role="interval"]'),
      openTarget: panel.querySelector('[data-role="openTarget"]'),
      toastMode: panel.querySelector('[data-role="toastMode"]'),
      toastLimit: panel.querySelector('[data-role="toastLimit"]'),
      runStatus: panel.querySelector('[data-role="runStatus"]'),
      toastStack: panel.querySelector('[data-role="toastStack"]'),
    };
  }

  function loadPanelValues() {
    els.keywords.value = GM_getValue("keywords", DEFAULT_KEYWORDS.join(", "));
    els.interval.value = String(GM_getValue("intervalMs", DEFAULT_INTERVAL_MS));
    els.openTarget.value = GM_getValue("openTarget", "article");
    els.toastMode.value = GM_getValue("toastMode", "auto");
    els.toastLimit.value = String(toastLimit());
    setToggleText();
    setCollapsed(Boolean(GM_getValue("collapsed", false)));
    positionPanel();
    renderStatus();
  }

  function bindPanelEvents() {
    window.addEventListener("resize", positionPanel);

    els.collapse.addEventListener("click", () => {
      const collapsed = !els.panel.classList.contains("dgn-collapsed");
      GM_setValue("collapsed", collapsed);
      setCollapsed(collapsed);
      fitDropdown();
    });

    els.toggle.addEventListener("click", () => {
      state.running = !state.running;
      GM_setValue("running", state.running);
      setToggleText();
      if (state.running) {
        logStatus("감시 중");
        scheduleNext(0);
      } else {
        window.clearTimeout(state.timer);
        logStatus("감시 중지됨");
      }
    });

    let keywordSaveTimer = null;
    els.keywords.addEventListener("input", () => {
      window.clearTimeout(keywordSaveTimer);
      keywordSaveTimer = window.setTimeout(() => {
        persistPanelValues();
        logStatus("설정 반영됨");
      }, 300);
    });

    els.interval.addEventListener("input", persistAndLogPanelValues);
    els.openTarget.addEventListener("change", persistAndLogPanelValues);
    els.toastMode.addEventListener("change", persistAndLogPanelValues);
    els.toastLimit.addEventListener("input", persistAndLogPanelValues);
  }

  function persistAndLogPanelValues() {
    persistPanelValues();
    logStatus("설정 반영됨");
  }

  function persistPanelValues() {
    GM_setValue("keywords", normalizeKeywords(els.keywords.value).join(", "));
    GM_setValue("intervalMs", Math.max(1000, Number(els.interval.value) || DEFAULT_INTERVAL_MS));
    GM_setValue("openTarget", els.openTarget.value === "comment" ? "comment" : "article");
    GM_setValue("toastMode", els.toastMode.value === "hold" ? "hold" : "auto");
    GM_setValue("toastLimit", clampNumber(els.toastLimit.value, 1, 10, DEFAULT_TOAST_LIMIT));
  }

  function setToggleText() {
    els.toggle.textContent = state.running ? "ON" : "OFF";
    els.panel.classList.toggle("dgn-running", state.running);
  }

  function setCollapsed(collapsed) {
    els.panel.classList.toggle("dgn-collapsed", collapsed);
    els.collapse.textContent = "알림";
    els.collapse.title = "DC 알림 설정";
    if (!collapsed) window.setTimeout(() => {
      fitDropdown();
    }, 0);
  }

  function positionPanel() {
    attachPanelToPage(els.panel);
    applyPanelWidth(MAX_DROPDOWN_WIDTH);
    els.panel.style.width = "auto";
    fitDropdown();
  }

  function fitDropdown() {
    if (!els.panel.classList.contains("dgn-collapsed")) {
      els.body.style.left = "auto";
      els.body.style.right = "0px";
    }
    els.toastStack.style.left = "0px";
  }

  function attachPanelToPage(panel) {
    const issueAnchor = issueLeftAnchor();
    if (issueAnchor?.parentNode) {
      issueAnchor.parentNode.insertBefore(panel, issueAnchor);
      return;
    }

    if (!panel.parentNode) {
      document.body.appendChild(panel);
    }
  }

  function issueLeftAnchor() {
    return document.querySelector(".gall_issuebox .issue_gallinfo, #issue_setting, .gall_issuebox .issue_setting");
  }

  function applyPanelWidth(width) {
    els.panel.style.setProperty("--dgn-panel-width", `${Math.round(width)}px`);
  }

  function scheduleNext(delayMs) {
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(pollOnce, Math.max(0, delayMs));
  }

  async function pollOnce() {
    if (!state.running || state.polling) {
      if (!state.running) logStatus("감시 중지됨");
      return;
    }
    state.polling = true;

    try {
      const posts = await fetchPosts();
      if (posts[0]) {
        renderStatus();
      }
      const currentMaxNumber = maxPostNumber(posts);

      if (!state.baselineReady) {
        savePostBaseline(posts);
        state.baselineReady = true;
        logStatus(`기준점 저장: ${posts.length}개`);
        renderStatus();
        state.failCount = 0;
        return;
      }

      const lastNumber = loadLastNumber();
      const seen = loadSeen();
      const seenSet = new Set(seen);
      const newPosts = posts
        .filter((post) => Number(post.number) > lastNumber)
        .filter((post) => !seenSet.has(post.number))
        .reverse();
      let sent = 0;

      for (const post of newPosts) {
        seenSet.add(post.number);
        const matchedKeywords = matchKeywords(post.title);
        if (matchedKeywords.length === 0) continue;

        const matchedPost = { ...post, matchedKeywords };
        notifyBrowser(matchedPost, matchedKeywords);
        sent += 1;
      }

      saveSeen(Array.from(seenSet));
      if (currentMaxNumber > lastNumber) {
        saveLastNumber(currentMaxNumber);
      }
      logStatus(sent > 0 ? `알림 ${sent}건 전송` : `확인 완료 ${new Date().toLocaleTimeString()}`);
      renderStatus();
      state.failCount = 0;
    } catch (error) {
      state.failCount += 1;
      logStatus(`오류: ${error.message}`);
    } finally {
      state.polling = false;
      const interval = Number(GM_getValue("intervalMs", DEFAULT_INTERVAL_MS));
      const backoff = state.failCount > 0 ? Math.min(30000, 1000 * 2 ** state.failCount) : 0;
      scheduleNext(Math.max(interval, backoff));
    }
  }

  async function fetchPosts() {
    const url = listUrlForCurrentPage();
    url.searchParams.set("page", "1");
    url.searchParams.set("_dgn_ts", String(Date.now()));

    const response = await fetch(url.toString(), {
      cache: "no-store",
      credentials: "include",
      headers: {
        "Accept": "text/html",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(`목록 요청 실패 ${response.status}`);
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const posts = [];

    for (const row of doc.querySelectorAll("tr.ub-content[data-no]")) {
      const number = String(row.getAttribute("data-no") || "").trim();
      const type = String(row.getAttribute("data-type") || "").trim();
      const link = row.querySelector("td.gall_tit a[href]:not(.reply_numbox)");

      if (!number || !/^\d+$/.test(number) || type === "icon_notice" || !link) continue;

      posts.push({
        number,
        title: extractPostTitle(link),
        url: new URL(link.getAttribute("href"), location.origin).href,
        author: cleanText(row.querySelector("td.gall_writer")?.getAttribute("data-nick") || row.querySelector("td.gall_writer")?.textContent || ""),
        createdAt: cleanText(row.querySelector("td.gall_date")?.getAttribute("title") || row.querySelector("td.gall_date")?.textContent || ""),
      });
    }

    return posts;
  }

  function listUrlForCurrentPage() {
    const url = new URL(location.href);
    url.pathname = url.pathname.replace(/\/board\/view\/?$/, "/board/lists/");
    url.searchParams.delete("no");
    url.searchParams.delete("t");
    return url;
  }

  function notifyBrowser(post, matchedKeywords) {
    const urlToOpen = openUrl(post.url);
    showPageToast(post.title, urlToOpen);
  }

  function showPageToast(text, urlToOpen = "") {
    const toast = document.createElement("button");
    toast.type = "button";
    toast.className = "dgn-page-toast";
    toast.innerHTML = `<span></span>`;
    toast.querySelector("span").textContent = text;
    toast.addEventListener("click", () => {
      toast.remove();
      if (urlToOpen) window.location.assign(urlToOpen);
    });

    els.toastStack.prepend(toast);
    while (els.toastStack.children.length > toastLimit()) {
      els.toastStack.lastElementChild.remove();
    }

    if (GM_getValue("toastMode", "auto") === "hold") return;

    let hovered = false;
    toast.addEventListener("mouseenter", () => {
      hovered = true;
    });
    toast.addEventListener("mouseleave", () => {
      hovered = false;
    });
    window.setTimeout(() => {
      if (!hovered) toast.remove();
    }, 10000);
  }

  function openUrl(postUrl) {
    if (GM_getValue("openTarget", "article") === "comment") {
      return commentUrl(postUrl);
    }
    return postUrl;
  }

  function toastLimit() {
    return clampNumber(GM_getValue("toastLimit", DEFAULT_TOAST_LIMIT), 1, 10, DEFAULT_TOAST_LIMIT);
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, Math.round(number)));
  }

  function commentUrl(postUrl) {
    const url = new URL(postUrl, location.origin);
    url.searchParams.set("t", "cv");
    if (!url.searchParams.has("page")) {
      url.searchParams.set("page", "1");
    }
    url.hash = "focus_cmt";
    return url.href;
  }

  function seedCurrentPageBaseline() {
    if (!isCurrentFirstListPage()) return false;

    const posts = [];
    for (const row of document.querySelectorAll("tr.ub-content[data-no]")) {
      const number = String(row.getAttribute("data-no") || "").trim();
      const type = String(row.getAttribute("data-type") || "").trim();
      if (/^\d+$/.test(number) && type !== "icon_notice") posts.push(number);
    }
    if (posts.length === 0) return false;
    saveSeen(posts);
    saveLastNumber(Math.max(...posts.map((number) => Number(number) || 0)));
    return true;
  }

  function isCurrentFirstListPage() {
    if (!/\/board\/lists\/?$/.test(location.pathname)) return false;
    const page = new URL(location.href).searchParams.get("page");
    return !page || page === "1";
  }

  function savePostBaseline(posts) {
    saveSeen(posts.map((post) => post.number));
    saveLastNumber(maxPostNumber(posts));
  }

  function matchKeywords(title) {
    const keywords = normalizeKeywords(GM_getValue("keywords", DEFAULT_KEYWORDS.join(", ")));
    if (keywords.length === 0) return ["*"];

    const lowerTitle = title.toLocaleLowerCase();
    return keywords.filter((keyword) => lowerTitle.includes(keyword.toLocaleLowerCase()));
  }

  function normalizeKeywords(value) {
    const keywords = [];
    const seen = new Set();
    for (const item of String(value).split(/[,\n]/)) {
      const keyword = item.trim();
      if (!keyword || seen.has(keyword)) continue;
      keywords.push(keyword);
      seen.add(keyword);
    }
    return keywords;
  }

  function getGalleryKey() {
    const url = new URL(location.href);
    const galleryId = url.searchParams.get("id") || "unknown";
    const path = url.pathname;
    if (path.includes("/mgallery/")) return `minor:${galleryId}`;
    if (path.includes("/mini/")) return `mini:${galleryId}`;
    if (path.includes("/person/")) return `person:${galleryId}`;
    return `major:${galleryId}`;
  }

  function loadSeen() {
    return GM_getValue(`seen:${state.galleryKey}`, []);
  }

  function saveSeen(values) {
    GM_setValue(`seen:${state.galleryKey}`, values.slice(-MAX_SEEN));
  }

  function loadLastNumber() {
    return Number(GM_getValue(`lastNumber:${state.galleryKey}`, 0)) || 0;
  }

  function saveLastNumber(value) {
    GM_setValue(`lastNumber:${state.galleryKey}`, Number(value) || 0);
  }

  function maxPostNumber(posts) {
    return Math.max(0, ...posts.map((post) => Number(post.number) || 0));
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function extractPostTitle(link) {
    const clone = link.cloneNode(true);
    for (const node of clone.querySelectorAll(".blind, .icon_img, .sp_img, .reply_numbox, .reply_num")) {
      node.remove();
    }
    return cleanTitleText(clone.textContent);
  }

  function cleanTitleText(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map((part) => cleanText(part))
      .filter((part) => part && !/^[|｜]+$/.test(part))
      .join(" ")
      .replace(/\s*[|｜]\s*/g, " ")
      .replace(/^[|｜]\s*/, "")
      .replace(/\s*[|｜]$/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function logStatus(message) {
    renderStatus({ runStatus: state.running ? message : "감시 중지됨" });
  }

  function renderStatus(patch = {}) {
    els.runStatus.textContent = patch.runStatus || (state.running ? (state.polling ? "확인 중" : "감시 중") : "감시 중지됨");
  }

  function nowText() {
    return new Date().toLocaleTimeString();
  }
})();
