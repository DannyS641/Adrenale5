import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ALLOWLIST = (process.env.SCORE_ADMIN_USER_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice("Bearer ".length).trim();
}

async function canEditFromRequest(req) {
  const token = getBearerToken(req);
  if (!token) return false;

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(
    token
  );
  if (userErr || !userData?.user) return false;

  return ALLOWLIST.includes(userData.user.id);
}

export default async function handler(req, res) {
  try {
    // ---------- READ (public) ----------
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("scores")
        .select("game_id,a,b");

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      const map = {};
      for (const row of data || []) {
        map[row.game_id] = { a: row.a, b: row.b };
      }

      // ✅ FIX: return canEdit too (your frontend expects it)
      const canEdit = await canEditFromRequest(req);

      return res.status(200).json({ scores: map, canEdit });
    }

    // ---------- WRITE (admin only) ----------
    if (req.method === "POST") {
      const auth = req.headers.authorization || "";
      if (!auth.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing token" });
      }

      const token = auth.replace("Bearer ", "").trim();
      const { data: userData, error: userErr } =
        await supabaseAdmin.auth.getUser(token);

      if (userErr || !userData?.user) {
        return res.status(401).json({ error: "Invalid token" });
      }

      const userId = userData.user.id;
      if (!ALLOWLIST.includes(userId)) {
        return res.status(403).json({ error: "Not allowed" });
      }

      const { gameId, a, b } = req.body || {};
      if (!gameId) {
        return res.status(400).json({ error: "Missing gameId" });
      }

      const aNum = Number(a);
      const bNum = Number(b);
      if (!Number.isFinite(aNum) || !Number.isFinite(bNum)) {
        return res.status(400).json({ error: "Scores must be numbers" });
      }
      if (aNum === bNum) {
        return res.status(400).json({ error: "No ties allowed" });
      }

      const { error } = await supabaseAdmin.from("scores").upsert(
        {
          game_id: gameId,
          a: aNum,
          b: bNum,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "game_id" }
      );

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
}
