// schedule.js
// Tournament Schedule UI + Supabase Auth + Vercel API (/api/scores)

(function () {
  // -----------------------------
  // Supabase client (frontend)
  // -----------------------------
  const supabaseClient =
    window.supabase &&
    window.supabase.createClient &&
    window.SUPABASE_URL &&
    window.SUPABASE_ANON_KEY
      ? window.supabase.createClient(
          window.SUPABASE_URL,
          window.SUPABASE_ANON_KEY
        )
      : null;

  async function getAccessToken() {
    if (!supabaseClient) return "";
    const { data } = await supabaseClient.auth.getSession();
    return data?.session?.access_token || "";
  }

  // ✅ Single source of truth for API base
  function getApiBase() {
    // If you want to override manually in HTML:
    // <script>window.API_BASE_URL="https://yourdomain.vercel.app"</script>
    if (window.API_BASE_URL)
      return String(window.API_BASE_URL).replace(/\/$/, "");

    // When running locally (live-server / localhost), call your deployed Vercel API
    if (
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1"
    ) {
      return "https://adrenale5.vercel.app"; // <-- CHANGE if your domain differs
    }

    // When already on Vercel domain, relative works
    return "";
  }

  async function apiFetchScores() {
    const token = await getAccessToken();
    const API_BASE = getApiBase();

    // ✅ FIX: actually store res
    const res = await fetch(`${API_BASE}/api/scores`, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Failed to load scores");

    return {
      scores: json.scores || {},
      canEdit: !!json.canEdit,
    };
  }

  async function apiSaveScore(gameId, a, b) {
    const token = await getAccessToken();
    if (!token) throw new Error("Not logged in");

    const API_BASE = getApiBase();

    const res = await fetch(`${API_BASE}/api/scores`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ gameId, a, b }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Save failed");
    return true;
  }

  // -----------------------------
  // Helpers
  // -----------------------------
  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function parseTime12h(str) {
    const m = String(str)
      .trim()
      .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) throw new Error("Bad time format: " + str);
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ap = m[3].toUpperCase();
    if (ap === "PM" && h !== 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return { h, min };
  }

  function formatTime12h(h24, min) {
    const ap = h24 >= 12 ? "PM" : "AM";
    let h = h24 % 12;
    if (h === 0) h = 12;
    return `${h}:${pad2(min)} ${ap}`;
  }

  function addMinutes(timeStr, minsToAdd) {
    const { h, min } = parseTime12h(timeStr);
    const total = h * 60 + min + minsToAdd;
    const h24 = Math.floor(total / 60) % 24;
    const m = total % 60;
    return formatTime12h(h24, m);
  }

  function escapeHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c])
    );
  }

  function escapeAttr(s) {
    return String(s).replace(/"/g, "&quot;");
  }

  // In-memory only
  function loadState() {
    return { scores: {} };
  }

  function getTeamsFromAdmin(teamsOverride) {
    const adminTeams = Array.isArray(teamsOverride)
      ? teamsOverride
      : Array.isArray(window.TOURNAMENT_TEAMS)
      ? window.TOURNAMENT_TEAMS
      : [];

    const teams = [];
    for (let i = 0; i < 16; i++)
      teams.push((adminTeams[i] || `Team ${i + 1}`).trim());
    return teams;
  }

  function buildGames(teams, config) {
    const court = config.courtName || "Dolphins Court";
    const gap = 60; // 1 hour

    const d1MorningStart = config.day1MorningStart || "8:00 AM";
    const d1EveningStart = config.day1EveningStart || "4:00 PM";
    const d2MorningStart = config.day2MorningStart || "9:00 AM";
    const d2EveningStart = config.day2EveningStart || "5:00 PM";
    const d3MorningStart = config.day3MorningStart || "10:00 AM";
    const d3EveningStart = config.day3EveningStart || "5:00 PM";

    // Day 1: 16 teams -> 8 games
    const day1 = [];
    for (let i = 0; i < 8; i++) {
      const tA = teams[i * 2];
      const tB = teams[i * 2 + 1];
      const slot = i < 4 ? "Morning" : "Evening";
      const base = i < 4 ? d1MorningStart : d1EveningStart;
      const idx = i < 4 ? i : i - 4;
      day1.push({
        id: `D1G${i + 1}`,
        day: "Day 1",
        timeSlot: slot,
        hour: addMinutes(base, idx * gap),
        court,
        teamA: tA,
        teamB: tB,
        dependsOn: [],
      });
    }

    // Day 2: winners of Day 1
    const day2 = [
      {
        id: "D2G1",
        day: "Day 2",
        timeSlot: "Morning",
        hour: addMinutes(d2MorningStart, 0 * gap),
        court,
        dependsOn: ["D1G1", "D1G2"],
      },
      {
        id: "D2G2",
        day: "Day 2",
        timeSlot: "Morning",
        hour: addMinutes(d2MorningStart, 1 * gap),
        court,
        dependsOn: ["D1G3", "D1G4"],
      },
      {
        id: "D2G3",
        day: "Day 2",
        timeSlot: "Evening",
        hour: addMinutes(d2EveningStart, 0 * gap),
        court,
        dependsOn: ["D1G5", "D1G6"],
      },
      {
        id: "D2G4",
        day: "Day 2",
        timeSlot: "Evening",
        hour: addMinutes(d2EveningStart, 1 * gap),
        court,
        dependsOn: ["D1G7", "D1G8"],
      },
    ];

    // Day 3: Semis + Final
    const day3 = [
      {
        id: "D3SF1",
        day: "Day 3",
        timeSlot: "Morning",
        hour: addMinutes(d3MorningStart, 0 * gap),
        court,
        dependsOn: ["D2G1", "D2G2"],
        label: "Semifinal 1",
      },
      {
        id: "D3SF2",
        day: "Day 3",
        timeSlot: "Evening",
        hour: addMinutes(d3EveningStart, 0 * gap),
        court,
        dependsOn: ["D2G3", "D2G4"],
        label: "Semifinal 2",
      },
      {
        id: "D3F",
        day: "Day 3",
        timeSlot: "Evening",
        hour: addMinutes(d3EveningStart, 1 * gap),
        court,
        dependsOn: ["D3SF1", "D3SF2"],
        label: "Championship Game",
      },
    ];

    return { day1, day2, day3, all: [...day1, ...day2, ...day3] };
  }

  function getWinner(gameId, state) {
    const s = state.scores?.[gameId];
    if (!s) return null;
    const a = Number(s.a);
    const b = Number(s.b);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (a === b) return null;
    return a > b ? s.teamA : s.teamB;
  }

  function resolveTeamsForGame(game, state) {
    if (game.teamA && game.teamB)
      return { teamA: game.teamA, teamB: game.teamB };

    const [g1, g2] = game.dependsOn || [];
    const w1 = g1 ? getWinner(g1, state) : null;
    const w2 = g2 ? getWinner(g2, state) : null;

    const tA = w1 || (g1 ? `Winner ${g1}` : "TBD");
    const tB = w2 || (g2 ? `Winner ${g2}` : "TBD");
    return { teamA: tA, teamB: tB };
  }

  function isDayComplete(dayGames, state) {
    return dayGames.every((g) => {
      const s = state.scores?.[g.id];
      if (!s) return false;
      const a = Number(s.a);
      const b = Number(s.b);
      return Number.isFinite(a) && Number.isFinite(b) && a !== b;
    });
  }

  function computeLockedDays(games, state) {
    const day1Complete = isDayComplete(games.day1, state);
    const day2Complete = isDayComplete(games.day2, state);
    return {
      "Day 1": false,
      "Day 2": !day1Complete,
      "Day 3": !day2Complete,
    };
  }

  function filterGames(allGames, dayFilter, timeFilter) {
    return allGames.filter((g) => {
      const okDay = dayFilter === "All" || g.day === dayFilter;
      const okTime = timeFilter === "All" || g.timeSlot === timeFilter;
      return okDay && okTime;
    });
  }

  // -----------------------------
  // UI Helpers (toast + login msg)
  // -----------------------------
  function showToast(container, text, type = "info") {
    const toast = container.querySelector("#toast");
    if (!toast) return;

    toast.style.display = "block";
    toast.textContent = text;

    if (type === "success") {
      toast.style.borderColor = "rgba(34,197,94,.5)";
      toast.style.color = "#86efac";
      toast.style.background = "rgba(34,197,94,.10)";
    } else if (type === "error") {
      toast.style.borderColor = "rgba(239,68,68,.5)";
      toast.style.color = "#fca5a5";
      toast.style.background = "rgba(239,68,68,.10)";
    } else {
      toast.style.borderColor = "rgba(255,255,255,.12)";
      toast.style.color = "#e5e7eb";
      toast.style.background = "rgba(0,0,0,.22)";
    }

    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.style.display = "none";
    }, 3500);
  }

  function setLoginMsg(container, text, type) {
    const el = container.querySelector("#loginMsg");
    if (!el) return;

    el.style.display = "block";
    el.textContent = text;

    if (type === "success") {
      el.style.border = "1px solid rgba(34,197,94,.5)";
      el.style.background = "rgba(34,197,94,.12)";
      el.style.color = "#86efac";
    } else {
      el.style.border = "1px solid rgba(239,68,68,.5)";
      el.style.background = "rgba(239,68,68,.12)";
      el.style.color = "#fca5a5";
    }
  }

  // -----------------------------
  // UI Build
  // -----------------------------
  function buildUI(container) {
    container.innerHTML = `
      <div class="schedule-controls" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:14px;">
        <select id="dayFilter" style="padding:10px 14px;border-radius:999px;border:1px solid #00b931;font-weight:800;">
          <option value="All">All Days</option>
          <option value="Day 1">Day 1</option>
          <option value="Day 2">Day 2</option>
          <option value="Day 3">Day 3</option>
        </select>

        <select id="timeFilter" style="padding:10px 14px;border-radius:999px;border:1px solid #00b931;font-weight:800;">
          <option value="All">All Times</option>
          <option value="Morning">Morning</option>
          <option value="Evening">Evening</option>
        </select>

        <button id="printSchedule" style="padding:10px 14px;border-radius:999px;border:1px solid #00b931;font-weight:900;color:#e5e7eb;background:transparent;cursor:pointer;">
          Print Schedule (PDF)
        </button>

        <button id="adminLoginBtn" style="padding:10px 14px;border-radius:999px;border:1px solid #00b931;font-weight:900;color:#e5e7eb;background:transparent;cursor:pointer;">
          Admin Login
        </button>

        <button id="adminLogoutBtn" style="display:none;padding:10px 14px;border-radius:999px;border:1px solid #00b931;font-weight:900;color:#e5e7eb;background:transparent;cursor:pointer;">
          Logout
        </button>
      </div>

      <div id="adminStatus" style="margin:-2px 0 12px 0;font-weight:900;color:#9ca3af;font-size:12px;">
        Viewing mode: Public (read-only)
      </div>

      <div id="toast" style="display:none;margin:10px 0;padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.12);font-weight:900;"></div>

      <div id="lockNotice" style="display:none;margin:10px 0;padding:10px 12px;border-radius:14px;border:1px solid rgba(251,191,36,.35);background:rgba(251,191,36,.08);font-weight:900;color:#fcd34d;"></div>

      <div id="scheduleList"></div>

      <div id="day3BracketWrap" style="margin-top:18px;display:none;">
        <div style="font-weight:1000;margin-bottom:10px;color:#e5e7eb;">Day 3 Bracket</div>
        <div id="day3Bracket"></div>
      </div>

      <!-- Login Modal -->
      <div id="loginModalBackdrop" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;align-items:center;justify-content:center;padding:16px;">
        <div style="width:min(460px,100%);border-radius:18px;border:1px solid rgba(255,255,255,.12);background:#0b1220;box-shadow:0 20px 70px rgba(0,0,0,.6);overflow:hidden;">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 14px;border-bottom:1px solid rgba(255,255,255,.08);">
            <div style="font-weight:1000;color:#e5e7eb;">Admin Login</div>
            <button id="loginClose" style="width:38px;height:38px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:transparent;color:#e5e7eb;cursor:pointer;">✕</button>
          </div>

          <div style="padding:14px;">
            <div style="display:grid;gap:10px;">
              <div>
                <label style="display:block;font-size:12px;color:#9ca3af;font-weight:900;margin-bottom:6px;">Email</label>
                <input id="loginEmail" type="email" placeholder="admin@email.com"
                  style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#e5e7eb;outline:none;">
              </div>

              <div>
                <label style="display:block;font-size:12px;color:#9ca3af;font-weight:900;margin-bottom:6px;">Password</label>
                <input id="loginPassword" type="password" placeholder="••••••••"
                  style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#e5e7eb;outline:none;">
              </div>

              <div id="loginMsg" style="display:none;padding:10px 12px;border-radius:12px;font-weight:1000;"></div>

              <button id="loginSubmit"
                style="padding:12px 14px;border-radius:999px;border:1px solid #00b931;background:#00b931;color:#07110a;font-weight:1000;cursor:pointer;">
                Sign in
              </button>

              <div style="font-size:12px;color:#9ca3af;font-weight:800;line-height:1.4;">
                Note: You must also be allowlisted (Vercel env SCORE_ADMIN_USER_IDS) to edit scores.
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function bracketMatch(title, a, b, gameId, state, locked) {
    const s = state.scores?.[gameId] || {};
    const aScore = s.a ?? "";
    const bScore = s.b ?? "";

    return `
      <div style="border:1px solid rgba(0,185,49,.6);border-radius:16px;padding:12px;background:rgba(12,71,20,.35);">
        <div style="font-weight:1000;margin-bottom:8px;color:#e5e7eb;">${escapeHtml(
          title
        )}</div>

        <div style="display:grid;gap:8px;">
          <div style="display:flex;justify-content:space-between;gap:10px;">
            <div style="font-weight:900;color:#9ca3af;">${escapeHtml(a)}</div>
            <input ${
              locked ? "disabled" : ""
            } data-score-game="${gameId}" data-score-side="a" value="${escapeAttr(
      aScore
    )}"
              inputmode="numeric" placeholder="0"
              style="width:60px;padding:8px;border:1px solid rgba(0,185,49,.7);border-radius:12px;font-weight:1000;color:#e5e7eb;background:rgba(0,0,0,.25);text-align:center;${
                locked ? "opacity:.5;cursor:not-allowed;" : ""
              }">
          </div>

          <div style="display:flex;justify-content:space-between;gap:10px;">
            <div style="font-weight:900;color:#9ca3af;">${escapeHtml(b)}</div>
            <input ${
              locked ? "disabled" : ""
            } data-score-game="${gameId}" data-score-side="b" value="${escapeAttr(
      bScore
    )}"
              inputmode="numeric" placeholder="0"
              style="width:60px;padding:8px;border:1px solid rgba(0,185,49,.7);border-radius:12px;font-weight:1000;color:#e5e7eb;background:rgba(0,0,0,.25);text-align:center;${
                locked ? "opacity:.5;cursor:not-allowed;" : ""
              }">
          </div>
        </div>
      </div>
    `;
  }

  function renderBracket(games, state, lockedDays, canEdit) {
    const day3Games = games.day3;
    const sf1 = day3Games.find((g) => g.id === "D3SF1");
    const sf2 = day3Games.find((g) => g.id === "D3SF2");

    const sf1Teams = resolveTeamsForGame(sf1, state);
    const sf2Teams = resolveTeamsForGame(sf2, state);

    const sf1Winner = getWinner("D3SF1", state) || "TBD";
    const sf2Winner = getWinner("D3SF2", state) || "TBD";

    const finalTeams = {
      teamA: sf1Winner !== "TBD" ? sf1Winner : "Winner D3SF1",
      teamB: sf2Winner !== "TBD" ? sf2Winner : "Winner D3SF2",
    };

    const champ = getWinner("D3F", state) || "TBD";
    const locked = lockedDays["Day 3"] || !canEdit;

    return `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;align-items:center;">
        <div style="display:grid;gap:10px;">
          ${bracketMatch(
            "Semifinal 1",
            sf1Teams.teamA,
            sf1Teams.teamB,
            "D3SF1",
            state,
            locked
          )}
          ${bracketMatch(
            "Semifinal 2",
            sf2Teams.teamA,
            sf2Teams.teamB,
            "D3SF2",
            state,
            locked
          )}
        </div>

        <div style="display:grid;gap:10px;justify-items:center;">
          <div style="font-weight:1000;color:#e5e7eb;">Final</div>
          ${bracketMatch(
            "Championship",
            finalTeams.teamA,
            finalTeams.teamB,
            "D3F",
            state,
            locked
          )}
        </div>

        <div style="display:grid;gap:10px;justify-items:center;">
          <div style="font-weight:1000;color:#e5e7eb;">Champion</div>
          <div style="padding:12px 14px;border:1px solid rgba(0,185,49,.6);border-radius:16px;min-width:220px;text-align:center;font-weight:1000;background:rgba(12,71,20,.35);color:#e5e7eb;">
            ${escapeHtml(champ)}
          </div>
        </div>
      </div>
    `;
  }

  function renderGames(listEl, games, state, lockedDays, canEdit) {
    listEl.innerHTML = games
      .map((g) => {
        const teams = resolveTeamsForGame(g, state);

        if (!state.scores[g.id]) {
          state.scores[g.id] = {
            teamA: teams.teamA,
            teamB: teams.teamB,
            a: "",
            b: "",
          };
        } else {
          state.scores[g.id].teamA = teams.teamA;
          state.scores[g.id].teamB = teams.teamB;
        }

        const locked = lockedDays[g.day] || !canEdit;

        const s = state.scores[g.id] || {};
        const aScore = s.a ?? "";
        const bScore = s.b ?? "";
        const winner = getWinner(g.id, state);

        const label = g.label
          ? `<div style="font-size:12px;font-weight:1000;color:#9ca3af;">${escapeHtml(
              g.label
            )}</div>`
          : "";

        return `
        <div class="game-card" style="border:1px solid rgba(0,185,49,.6);border-radius:16px;padding:14px;margin-bottom:12px;background:rgba(12,71,20,.35);">
          ${label}

          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div>
              <div style="font-weight:1000;color:#e5e7eb;">${escapeHtml(
                teams.teamA
              )} vs ${escapeHtml(teams.teamB)}</div>
              <div style="margin-top:6px;color:#9ca3af;font-weight:900;font-size:12px;">
                ${escapeHtml(g.day)} • ${escapeHtml(g.timeSlot)} • ${escapeHtml(
          g.hour
        )} — ${escapeHtml(g.court)}
              </div>

              <div style="margin-top:6px;font-size:13px;font-weight:1000;color:${
                winner ? "#86efac" : "#9ca3af"
              };">
                ${
                  winner
                    ? `Winner: ${escapeHtml(winner)}`
                    : "Enter scores to determine winner (no ties)."
                }
              </div>

              ${
                !lockedDays[g.day] && !canEdit
                  ? `<div style="margin-top:6px;font-size:12px;font-weight:900;color:#fca5a5;">
                     Read-only. Login as admin to edit.
                   </div>`
                  : ""
              }
            </div>

            <div style="display:flex;gap:10px;align-items:center;">
              <input ${locked ? "disabled" : ""} data-score-game="${
          g.id
        }" data-score-side="a" value="${escapeAttr(aScore)}"
                inputmode="numeric" placeholder="0"
                style="width:64px;padding:10px;border:1px solid rgba(0,185,49,.7);border-radius:12px;font-weight:1000;text-align:center;color:#e5e7eb;background:rgba(0,0,0,.25);${
                  locked ? "opacity:.5;cursor:not-allowed;" : ""
                }">
              <div style="font-weight:1000;color:#e5e7eb;">-</div>
              <input ${locked ? "disabled" : ""} data-score-game="${
          g.id
        }" data-score-side="b" value="${escapeAttr(bScore)}"
                inputmode="numeric" placeholder="0"
                style="width:64px;padding:10px;border:1px solid rgba(0,185,49,.7);border-radius:12px;font-weight:1000;text-align:center;color:#e5e7eb;background:rgba(0,0,0,.25);${
                  locked ? "opacity:.5;cursor:not-allowed;" : ""
                }">
            </div>
          </div>
        </div>
      `;
      })
      .join("");
  }

  // -----------------------------
  // initSchedule
  // -----------------------------
  window.initSchedule = function (
    containerId,
    scheduleData = [],
    options = {}
  ) {
    (async () => {
      const container = document.getElementById(containerId);
      if (!container) return;

      if (!supabaseClient) {
        container.innerHTML = `
          <div style="padding:14px;border:1px solid rgba(239,68,68,.35);background:rgba(239,68,68,.08);border-radius:16px;font-weight:1000;color:#fca5a5;">
            Supabase client not available. Ensure:
            <br>1) Supabase CDN script is added
            <br>2) window.SUPABASE_URL and window.SUPABASE_ANON_KEY are set
            <br>3) schedule.js is loaded AFTER those.
          </div>`;
        return;
      }

      const state = loadState();
      const teams = getTeamsFromAdmin(options.teams);
      const games = buildGames(teams, {
        courtName: options.courtName || "Dolphins Court",
        day1MorningStart: options.day1MorningStart || "8:00 AM",
        day1EveningStart: options.day1EveningStart || "4:00 PM",
        day2MorningStart: options.day2MorningStart || "9:00 AM",
        day2EveningStart: options.day2EveningStart || "5:00 PM",
        day3MorningStart: options.day3MorningStart || "10:00 AM",
        day3EveningStart: options.day3EveningStart || "5:00 PM",
      });

      let canEdit = false;

      async function refreshCanEditAndScores() {
        try {
          const remote = await apiFetchScores();
          canEdit = remote.canEdit;

          for (const [gameId, s] of Object.entries(remote.scores || {})) {
            if (!state.scores[gameId])
              state.scores[gameId] = { a: "", b: "", teamA: "", teamB: "" };
            state.scores[gameId].a = s.a ?? "";
            state.scores[gameId].b = s.b ?? "";
          }
          return true;
        } catch (e) {
          canEdit = false;
          console.warn(e?.message || e);
          return false;
        }
      }

      const okFetch = await refreshCanEditAndScores();

      buildUI(container);

      const list = container.querySelector("#scheduleList");
      const dayFilterEl = container.querySelector("#dayFilter");
      const timeFilterEl = container.querySelector("#timeFilter");
      const lockNotice = container.querySelector("#lockNotice");
      const bracketWrap = container.querySelector("#day3BracketWrap");
      const bracketEl = container.querySelector("#day3Bracket");

      const adminStatus = container.querySelector("#adminStatus");
      const loginBtn = container.querySelector("#adminLoginBtn");
      const logoutBtn = container.querySelector("#adminLogoutBtn");

      const loginBackdrop = container.querySelector("#loginModalBackdrop");
      const loginClose = container.querySelector("#loginClose");
      const loginEmail = container.querySelector("#loginEmail");
      const loginPassword = container.querySelector("#loginPassword");
      const loginSubmit = container.querySelector("#loginSubmit");

      function updateAdminStatusUI() {
        if (canEdit) {
          adminStatus.textContent = "Viewing mode: Admin (you can edit scores)";
          loginBtn.style.display = "none";
          logoutBtn.style.display = "inline-block";
        } else {
          adminStatus.textContent = "Viewing mode: Public (read-only)";
          loginBtn.style.display = "inline-block";
          logoutBtn.style.display = "none";
        }
      }

      async function render() {
        const lockedDays = computeLockedDays(games, state);

        const selectedDay = dayFilterEl.value;
        if (selectedDay !== "All" && lockedDays[selectedDay]) {
          lockNotice.style.display = "block";
          lockNotice.textContent =
            selectedDay === "Day 2"
              ? "Day 2 is locked. Complete all Day 1 games (enter scores) to unlock."
              : "Day 3 is locked. Complete all Day 2 games (enter scores) to unlock.";
        } else {
          lockNotice.style.display = "none";
          lockNotice.textContent = "";
        }

        const filtered = filterGames(
          games.all,
          dayFilterEl.value,
          timeFilterEl.value
        );
        renderGames(list, filtered, state, lockedDays, canEdit);

        const showBracket =
          (dayFilterEl.value === "Day 3" || dayFilterEl.value === "All") &&
          !lockedDays["Day 3"];

        if (showBracket) {
          bracketWrap.style.display = "block";
          bracketEl.innerHTML = renderBracket(
            games,
            state,
            lockedDays,
            canEdit
          );
        } else {
          bracketWrap.style.display = "none";
          bracketEl.innerHTML = "";
        }

        updateAdminStatusUI();
      }

      function openLoginModal() {
        const msg = container.querySelector("#loginMsg");
        if (msg) msg.style.display = "none";
        loginEmail.value = "";
        loginPassword.value = "";
        loginBackdrop.style.display = "flex";
        setTimeout(() => loginEmail.focus(), 50);
      }

      function closeLoginModal() {
        loginBackdrop.style.display = "none";
      }

      loginBtn.addEventListener("click", openLoginModal);
      loginClose.addEventListener("click", closeLoginModal);
      loginBackdrop.addEventListener("click", (e) => {
        if (e.target === loginBackdrop) closeLoginModal();
      });

      loginSubmit.addEventListener("click", async () => {
        const email = (loginEmail.value || "").trim();
        const password = loginPassword.value || "";

        if (!email || !password) {
          setLoginMsg(container, "Please enter email and password.", "error");
          showToast(container, "Login failed.", "error");
          return;
        }

        loginSubmit.disabled = true;
        const prevText = loginSubmit.textContent;
        loginSubmit.textContent = "Signing in...";

        try {
          const { error } = await supabaseClient.auth.signInWithPassword({
            email,
            password,
          });

          if (error) {
            setLoginMsg(container, "Login failed: " + error.message, "error");
            showToast(container, "Login failed.", "error");
            return;
          }

          const ok = await refreshCanEditAndScores();

          if (!ok) {
            setLoginMsg(
              container,
              "Logged in, but failed to reach /api/scores.",
              "error"
            );
            showToast(container, "Login OK, but API fetch failed.", "error");
            await render();
            return;
          }

          if (!canEdit) {
            setLoginMsg(
              container,
              "Login successful, but you are NOT authorized to edit. Add your Supabase user ID to Vercel env SCORE_ADMIN_USER_IDS.",
              "error"
            );
            showToast(container, "Logged in but not authorized.", "error");
            await render();
            return;
          }

          setLoginMsg(
            container,
            "Login successful. Admin editing enabled.",
            "success"
          );
          showToast(container, "Admin mode enabled.", "success");
          await render();

          setTimeout(() => closeLoginModal(), 700);
        } finally {
          loginSubmit.disabled = false;
          loginSubmit.textContent = prevText;
        }
      });

      logoutBtn.addEventListener("click", async () => {
        await supabaseClient.auth.signOut();
        canEdit = false;
        await refreshCanEditAndScores();
        showToast(container, "Logged out.", "info");
        await render();
      });

      supabaseClient.auth.onAuthStateChange(async () => {
        await refreshCanEditAndScores();
        await render();
      });

      container.addEventListener("input", async (e) => {
        const el = e.target;
        if (!(el instanceof HTMLElement)) return;
        if (!el.matches("input[data-score-game][data-score-side]")) return;

        if (!canEdit) {
          await render();
          return;
        }

        const gameId = el.getAttribute("data-score-game");
        const side = el.getAttribute("data-score-side");
        const val = String(el.value || "").replace(/[^\d]/g, "");
        el.value = val;

        const game = games.all.find((g) => g.id === gameId);
        if (!game) return;

        const lockedDays = computeLockedDays(games, state);
        if (lockedDays[game.day]) {
          await render();
          return;
        }

        if (!state.scores[gameId]) {
          const teamsNow = resolveTeamsForGame(game, state);
          state.scores[gameId] = {
            teamA: teamsNow.teamA,
            teamB: teamsNow.teamB,
            a: "",
            b: "",
          };
        }

        const teamsNow = resolveTeamsForGame(game, state);
        state.scores[gameId].teamA = teamsNow.teamA;
        state.scores[gameId].teamB = teamsNow.teamB;

        state.scores[gameId][side] = val;

        const aVal = state.scores[gameId].a;
        const bVal = state.scores[gameId].b;

        if (aVal !== "" && bVal !== "" && Number(aVal) !== Number(bVal)) {
          try {
            await apiSaveScore(gameId, Number(aVal), Number(bVal));
            showToast(container, "Score saved.", "success");
          } catch (err) {
            showToast(container, err?.message || "Save failed", "error");
            await refreshCanEditAndScores();
          }
        }

        await render();
      });

      dayFilterEl.addEventListener("change", () => render());
      timeFilterEl.addEventListener("change", () => render());

      container
        .querySelector("#printSchedule")
        .addEventListener("click", () => window.print());

      if (!okFetch) {
        showToast(
          container,
          "Warning: /api/scores not reachable or returned error.",
          "error"
        );
      }

      await render();
    })();
  };
})();
