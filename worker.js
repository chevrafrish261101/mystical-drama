export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/api/health") {
        return Response.json({
          ok: true,
          website: "Mystical Drama"
        });
      }

      if (path === "/api/dramas" && request.method === "GET") {
        const result = await env.DB.prepare(
          "SELECT id, title, description, poster_url, genre, created_at FROM dramas ORDER BY id DESC"
        ).all();

        return Response.json(result.results || []);
      }

      const episodeMatch = path.match(/^\/api\/dramas\/(\d+)\/episodes$/);

      if (episodeMatch && request.method === "GET") {
        const dramaId = Number(episodeMatch[1]);

        const result = await env.DB.prepare(
          "SELECT id, drama_id, episode_number, title, video_url FROM episodes WHERE drama_id = ? ORDER BY episode_number ASC"
        ).bind(dramaId).all();

        return Response.json(result.results || []);
      }

      if (path.startsWith("/api/")) {
        return Response.json(
          { error: "API tidak ditemukan" },
          { status: 404 }
        );
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      return Response.json(
        { error: "Terjadi kesalahan pada server" },
        { status: 500 }
      );
    }
  }
};
