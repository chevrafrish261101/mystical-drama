
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const cors = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    };

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: cors });

    const cookie = request.headers.get("Cookie") || "";
    const token = cookie.match(/(?:^|;\s*)md_admin=([^;]+)/)?.[1];
    const isAdmin = async () => {
      if (!token || !env.ADMIN_PASSWORD) return false;
      const expected = await sha256(env.ADMIN_PASSWORD);
      return safeEqual(decodeURIComponent(token), expected);
    };

    try {
      if (path === "/api/health") {
        return json({ ok: true, website: "Mystical Drama" });
      }

      if (path === "/api/admin/login" && request.method === "POST") {
        const body = await request.json();
        if (!env.ADMIN_PASSWORD || body.password !== env.ADMIN_PASSWORD) {
          return json({ error: "Kata sandi salah" }, 401);
        }

        const hash = await sha256(env.ADMIN_PASSWORD);
        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            ...cors,
            "Set-Cookie": `md_admin=${hash}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`
          }
        });
      }

      if (path === "/api/admin/logout" && request.method === "POST") {
        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            ...cors,
            "Set-Cookie": "md_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0",
            ...cors
          }
        });
      }

      if (path === "/api/admin/me" && request.method === "GET") {
        return json({ loggedIn: await isAdmin() });
      }

      if (path === "/api/dramas" && request.method === "GET") {
        const result = await env.DB.prepare(
          "SELECT id, title, description, poster_url, genre, created_at FROM dramas ORDER BY id DESC"
        ).all();
        return json(result.results || []);
      }

      const episodeMatch = path.match(/^\/api\/dramas\/(\d+)\/episodes$/);

      if (episodeMatch && request.method === "GET") {
        const result = await env.DB.prepare(
          "SELECT id, drama_id, episode_number, title, video_url FROM episodes WHERE drama_id = ? ORDER BY episode_number ASC"
        ).bind(Number(episodeMatch[1])).all();
        return json(result.results || []);
      }

      if (path.startsWith("/api/admin/") || 
          (path.startsWith("/api/dramas") && request.method !== "GET")) {
        if (!await isAdmin()) {
          return json({ error: "Silakan login sebagai admin" }, 401);
        }

        if (path === "/api/admin/dramas" && request.method === "POST") {
          const body = await request.json();
          if (!body.title?.trim()) return json({ error: "Judul wajib diisi" }, 400);

          const result = await env.DB.prepare(
            "INSERT INTO dramas (title, description, poster_url, genre) VALUES (?, ?, ?, ?)"
          ).bind(
            body.title.trim(),
            body.description || "",
            body.poster_url || "",
            body.genre || ""
          ).run();

          return json({ ok: true, id: result.meta.last_row_id }, 201);
        }

        const dramaDelete = path.match(/^\/api\/admin\/dramas\/(\d+)$/);
        if (dramaDelete && request.method === "DELETE") {
          const id = Number(dramaDelete[1]);
          await env.DB.batch([
            env.DB.prepare("DELETE FROM episodes WHERE drama_id = ?").bind(id),
            env.DB.prepare("DELETE FROM dramas WHERE id = ?").bind(id)
          ]);
          return json({ ok: true });
        }

        const addEpisode = path.match(/^\/api\/admin\/dramas\/(\d+)\/episodes$/);
        if (addEpisode && request.method === "POST") {
          const id = Number(addEpisode[1]);
          const body = await request.json();
          if (!Number.isInteger(Number(body.episode_number)) ||
              Number(body.episode_number) < 1 ||
              !body.video_url?.trim()) {
            return json({ error: "Nomor episode dan tautan video wajib diisi" }, 400);
          }

          const result = await env.DB.prepare(
            "INSERT INTO episodes (drama_id, episode_number, title, video_url) VALUES (?, ?, ?, ?)"
          ).bind(id, Number(body.episode_number), body.title || "", body.video_url.trim()).run();

          return json({ ok: true, id: result.meta.last_row_id }, 201);
        }

        const episodeDelete = path.match(/^\/api\/admin\/episodes\/(\d+)$/);
        if (episodeDelete && request.method === "DELETE") {
          await env.DB.prepare("DELETE FROM episodes WHERE id = ?")
            .bind(Number(episodeDelete[1])).run();
          return json({ ok: true });
        }

        return json({ error: "API admin tidak ditemukan" }, 404);
      }

      if (path.startsWith("/api/")) return json({ error: "API tidak ditemukan" }, 404);
      return env.ASSETS.fetch(request);
    } catch (error) {
      return json({ error: "Terjadi kesalahan pada server" }, 500);
    }
  }
};

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
