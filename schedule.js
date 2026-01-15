// schedule.js
// Secure scores with Supabase (Auth) + Vercel API (/api/scores)
// - Public users: read-only
// - Only allowlisted admins (enforced server-side): can edit scores
// - Auto-advance winners
// - Lock Day 2 until Day 1 complete; Lock Day 3 until Day 2 complete
// - 1 hour between games
// - Day 3 bracket visualization
//
// Requirements (in your HTML BEFORE this file):
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
// <script>window.SUPABASE_URL="..."; window.SUPABASE_ANON_KEY="...";</script>
//
// Optional teams input:
// window.TOURNAMENT_TEAMS = ["Team 1", "Team 2", ... up to 16];
// window.initSchedule("scheduleModalContainer");

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

  async function apiFetchScores() {
    const token = await getAccessToken();
    const res = await fetch("/api/scores", {
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

    const res = await fetch("/api/scores", {
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
    // "8:00 AM"
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

  // State is in-memory only; persistent truth is Supabase via API
  function loadState() {
    return { scores: {} };
  }

  function saveState(_) {
    // no-op
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
    const gap = 60; // 1 hour between games

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

    // Day 2: 8 teams -> 4 games; winners of Day 1
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
  // UI
  // -----------------------------
  function buildUI(container) {
    container.innerHTML = `
      <div class="schedule-controls" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:14px;">
        <select id="dayFilter" style="padding:10px 14px;border-radius:999px;border:1px solid #00b931;font-weight:700;">
          <option value="All">All Days</option>
          <option value="Day 1">Day 1</option>
          <option value="Day 2">Day 2</option>
          <option value="Day 3">Day 3</option>
        </select>

        <select id="timeFilter" style="padding:10px 14px;border-radius:999px;border:1px solid #00b931;font-weight:700;">
          <option value="All">All Times</option>
          <option value="Morning">Morning</option>
          <option value="Evening">Evening</option>
        </select>

        <button id="printSchedule" style="padding:10px 14px;border-radius:999px;border:1px solid #00b931;font-weight:800;color:#6b7280;cursor:pointer;">
          Print Schedule (PDF)
        </button>

        <button id="adminLoginBtn" style="padding:10px 14px;border-radius:999px;border:1px solid #00b931;font-weight:800;color:#6b7280;cursor:pointer;">
          Admin Login
        </button>

        <button id="adminLogoutBtn" style="display:none;padding:10px 14px;border-radius:999px;border:1px solid #00b931;font-weight:800;color:#6b7280;cursor:pointer;">
          Logout
        </button>
      </div>

      <div id="adminStatus" style="margin:-2px 0 12px 0;font-weight:800;color:#6b7280;color:#6b7280;font-size:12px;">
        Viewing mode: Public (read-only)
      </div>

      <div id="lockNotice" style="display:none;margin:10px 0;padding:10px 12px;border-radius:14px;border:1px solid #ffe1c8;background:#0c4714597f0;font-weight:700;color:#9a4a00;"></div>

      <div id="scheduleList"></div>

      <div id="day3BracketWrap" style="margin-top:18px;display:none;">
        <div style="font-weight:900;margin-bottom:10px;">Day 3 Bracket</div>
        <div id="day3Bracket"></div>
      </div>
    `;
  }

  function bracketMatch(title, a, b, gameId, state, locked) {
    const s = state.scores?.[gameId] || {};
    const aScore = s.a ?? "";
    const bScore = s.b ?? "";
    return `
      <div style="border:1px solid #00b931;border-radius:16px;padding:12px;background:#0c471459;">
        <div style="font-weight:900;margin-bottom:8px;">${escapeHtml(
          title
        )}</div>
        <div style="display:grid;gap:8px;">
          <div style="display:flex;justify-content:space-between;gap:10px;">
            <div style="font-weight:800;color:#6b7280;">${escapeHtml(a)}</div>
            <div style="display:flex;gap:6px;align-items:center;">
              <input ${
                locked ? "disabled" : ""
              } data-score-game="${gameId}" data-score-side="a" value="${escapeAttr(
      aScore
    )}"
                     inputmode="numeric" placeholder="0"
                     style="width:60px;padding:8px;border:1px solid #00b931;border-radius:12px;font-weight:800;color:#6b7280;text-align:center;${
                       locked ? "opacity:.5;cursor:not-allowed;" : ""
                     }">
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;gap:10px;">
            <div style="font-weight:800;color:#6b7280;">${escapeHtml(b)}</div>
            <div style="display:flex;gap:6px;align-items:center;">
              <input ${
                locked ? "disabled" : ""
              } data-score-game="${gameId}" data-score-side="b" value="${escapeAttr(
      bScore
    )}"
                     inputmode="numeric" placeholder="0"
                     style="width:60px;padding:8px;border:1px solid #00b931;border-radius:12px;font-weight:800;color:#6b7280;text-align:center;${
                       locked ? "opacity:.5;cursor:not-allowed;" : ""
                     }">
            </div>
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
          <div style="font-weight:900;">Final</div>
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
          <div style="font-weight:900;">Champion</div>
          <div style="padding:12px 14px;border:1px solid #00b931;border-radius:16px;min-width:220px;text-align:center;font-weight:900;background:#0c471459;">
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

        // Ensure score record exists
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
          ? `<div style="font-size:12px;font-weight:900;color:#6b7280;">${escapeHtml(
              g.label
            )}</div>`
          : "";

        return `
          <div class="game-card" style="border:1px solid #00b931;border-radius:16px;padding:14px;margin-bottom:12px;background:#0c471459;">
            ${label}
            <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
              <div>
                <div style="font-weight:900;">${escapeHtml(
                  teams.teamA
                )} vs ${escapeHtml(teams.teamB)}</div>
                <div style="margin-top:6px;color:#6b7280;font-weight:700;font-size:12px;">
                  ${escapeHtml(g.day)} • ${escapeHtml(
          g.timeSlot
        )} • ${escapeHtml(g.hour)} — ${escapeHtml(g.court)}
                </div>
                  winner ? "#0f7a3b" : "#6b7280"
                };">
                  ${
                    winner
                      ? `Winner: ${escapeHtml(winner)}`
                      : "Enter scores to determine winner (no ties)."
                  }
                </div>
                ${
                  !canEdit
                    ? `<div style="margin-top:6px;font-size:12px;font-weight:800;color:#6b7280;color:#6b7280;"></div>`
                    : ""
                }
              </div>

              <div style="display:flex;gap:10px;align-items:center;">
                <input ${locked ? "disabled" : ""} data-score-game="${
          g.id
        }" data-score-side="a" value="${escapeAttr(aScore)}"
                       inputmode="numeric" placeholder="0"
                       style="width:64px;padding:10px;border:1px solid #00b931;border-radius:12px;font-weight:900;text-align:center;${
                         locked ? "opacity:.5;cursor:not-allowed;" : ""
                       }">
                <div style="font-weight:900;">-</div>
                <input ${locked ? "disabled" : ""} data-score-game="${
          g.id
        }" data-score-side="b" value="${escapeAttr(bScore)}"
                       inputmode="numeric" placeholder="0"
                       style="width:64px;padding:10px;border:1px solid #00b931;border-radius:12px;font-weight:900;text-align:center;${
                         locked ? "opacity:.5;cursor:not-allowed;" : ""
                       }">
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    saveState(state);
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
        container.innerHTML = `<div style="padding:14px;border:1px solid #ffd0d0;background:#0c471459;border-radius:16px;font-weight:800;color:#6b7280;">
            Supabase client not available. Ensure you added the Supabase CDN script and window.SUPABASE_URL / window.SUPABASE_ANON_KEY before schedule.js.
          </div>`;
        return;
      }

      const state = loadState();

      // Build schedule structure
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

      // Load scores from server
      let canEdit = false;
      try {
        const remote = await apiFetchScores();
        canEdit = remote.canEdit;

        // Merge remote scores into state (preserve team names later in renderGames)
        for (const [gameId, s] of Object.entries(remote.scores || {})) {
          if (!state.scores[gameId])
            state.scores[gameId] = { a: "", b: "", teamA: "", teamB: "" };
          state.scores[gameId].a = s.a ?? "";
          state.scores[gameId].b = s.b ?? "";
        }
      } catch (e) {
        console.warn(e?.message || e);
      }

      // Render UI
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
        } catch (e) {
          console.warn(e?.message || e);
        }
      }

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

      // Admin login (prompt-based; replace later with a form if you want)
      loginBtn.addEventListener("click", async () => {
        const email = prompt("Admin email:");
        const password = prompt("Password:");
        if (!email || !password) return;

        const { error } = await supabaseClient.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          alert(error.message);
          return;
        }

        await refreshCanEditAndScores();
        await render();
      });

      logoutBtn.addEventListener("click", async () => {
        await supabaseClient.auth.signOut();
        canEdit = false;
        await refreshCanEditAndScores(); // will come back with canEdit=false
        await render();
      });

      // Also react to auth changes (if session refreshes)
      supabaseClient.auth.onAuthStateChange(async () => {
        await refreshCanEditAndScores();
        await render();
      });

      // Delegate score input
      container.addEventListener("input", async (e) => {
        const el = e.target;
        if (!(el instanceof HTMLElement)) return;
        if (!el.matches("input[data-score-game][data-score-side]")) return;

        // Enforce client-side read-only too (server enforces regardless)
        if (!canEdit) {
          // revert by re-rendering from state
          await render();
          return;
        }

        const gameId = el.getAttribute("data-score-game");
        const side = el.getAttribute("data-score-side"); // "a" or "b"
        const val = el.value.replace(/[^\d]/g, "");
        el.value = val;

        const game = games.all.find((g) => g.id === gameId);
        if (!game) return;

        const lockedDays = computeLockedDays(games, state);
        if (lockedDays[game.day]) {
          await render();
          return;
        }

        // Ensure record exists
        if (!state.scores[gameId]) {
          const teamsNow = resolveTeamsForGame(game, state);
          state.scores[gameId] = {
            teamA: teamsNow.teamA,
            teamB: teamsNow.teamB,
            a: "",
            b: "",
          };
        }

        // Keep team names current for winner calc
        const teamsNow = resolveTeamsForGame(game, state);
        state.scores[gameId].teamA = teamsNow.teamA;
        state.scores[gameId].teamB = teamsNow.teamB;

        state.scores[gameId][side] = val;

        // Save only when both set and not tied
        const aVal = state.scores[gameId].a;
        const bVal = state.scores[gameId].b;

        if (aVal !== "" && bVal !== "" && Number(aVal) !== Number(bVal)) {
          try {
            await apiSaveScore(gameId, Number(aVal), Number(bVal));
          } catch (err) {
            alert(err?.message || "Save failed");
            // Refresh from server to avoid client drifting
            await refreshCanEditAndScores();
          }
        }

        await render();
      });

      dayFilterEl.addEventListener("change", () => render());
      timeFilterEl.addEventListener("change", () => render());

      container
        .querySelector("#printSchedule")
        .addEventListener("click", () => {
          window.print();
        });

      // Reset scores: only admins can actually clear server state.
      // Here we just clear the in-memory UI and prompt you to clear rows in Supabase if needed.
      container
        .querySelector("#resetScores")
        ?.addEventListener("click", async () => {
          if (!canEdit) {
            alert("Only admins can reset scores.");
            return;
          }
          const ok = confirm(
            "This will clear local UI state and reload from server. To fully reset, delete rows in Supabase 'scores' table. Continue?"
          );
          if (!ok) return;

          // Clear local, then reload from server
          state.scores = {};
          await refreshCanEditAndScores();
          await render();
        });

      await render();
    })();
  };
})();
