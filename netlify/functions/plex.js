const PLEX_HEADERS = (token) => ({
  Accept: "application/json",
  "X-Plex-Token": token,
  "X-Plex-Client-Identifier": "plex-recommender",
  "X-Plex-Product": "Plex Recommender",
  "X-Plex-Version": "1.0",
});

const CORS = { "Access-Control-Allow-Origin": "*" };

async function testConnection(uri, token) {
  try {
    const res = await fetch(`${uri}/identity`, {
      headers: PLEX_HEADERS(token),
      signal: AbortSignal.timeout(4000),
    });
    return res.ok || res.status === 401;
  } catch {
    return false;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: { ...CORS, "Access-Control-Allow-Headers": "Content-Type" }, body: "" };
  }

  const PLEX_TOKEN = process.env.PLEX_TOKEN;
  if (!PLEX_TOKEN) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: "PLEX_TOKEN environment variable not set" }),
    };
  }

  const { action, path: plexPath, serverUrl, accessToken } = event.queryStringParameters || {};

  // ── Discover: find server and test all connections server-side
  if (action === "discover") {
    try {
      const res = await fetch(
        "https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1&includeIPv6=1",
        { headers: PLEX_HEADERS(PLEX_TOKEN) }
      );
      if (!res.ok) {
        const text = await res.text();
        return {
          statusCode: res.status,
          headers: CORS,
          body: JSON.stringify({ error: `plex.tv responded ${res.status}: ${text.slice(0, 200)}` }),
        };
      }

      const resources = await res.json();
      const servers = resources.filter(
        (r) => r.provides && r.provides.includes("server") && r.connections && r.connections.length
      );

      if (!servers.length) {
        return {
          statusCode: 404,
          headers: CORS,
          body: JSON.stringify({ error: "No Plex Media Servers found on this account." }),
        };
      }

      const server = servers[0];
      const token = server.accessToken || PLEX_TOKEN;

      // Relay is most reliably reachable from external servers like Netlify
      const ordered = [
        ...server.connections.filter(c => c.relay),
        ...server.connections.filter(c => !c.relay && !c.local),
        ...server.connections.filter(c => c.local),
      ];

      let workingUri = null;
      for (const conn of ordered) {
        const ok = await testConnection(conn.uri, token);
        if (ok) { workingUri = conn.uri; break; }
      }

      if (!workingUri) {
        return {
          statusCode: 502,
          headers: CORS,
          body: JSON.stringify({
            error: `Tested ${ordered.length} connection(s) for "${server.name}" but none responded. Make sure Remote Access is enabled in Plex Settings → Remote Access.`,
          }),
        };
      }

      return {
        statusCode: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ name: server.name, serverUrl: workingUri, accessToken: token }),
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers: CORS,
        body: JSON.stringify({ error: `Discovery failed: ${err.message}` }),
      };
    }
  }

  // ── Proxy: forward a library API request to the known server
  if (!plexPath || !serverUrl) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: "Missing 'path' or 'serverUrl' parameter" }),
    };
  }

  const token = accessToken || PLEX_TOKEN;
  const base = serverUrl.replace(/\/$/, "");
  const sep = plexPath.includes("?") ? "&" : "?";
  const targetUrl = `${base}${plexPath}${sep}X-Plex-Token=${token}`;

  try {
    const response = await fetch(targetUrl, {
      headers: PLEX_HEADERS(token),
      signal: AbortSignal.timeout(55000),
    });
    const contentType = response.headers.get("content-type") || "application/json";
    const body = await response.text();
    return {
      statusCode: response.status,
      headers: { "Content-Type": contentType, ...CORS },
      body,
    };
  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({
        error: isTimeout
          ? `Request to Plex server timed out. Your library may be large — try again, or check that your Plex server isn't asleep.`
          : `Proxy failed: ${err.message}`,
      }),
    };
  }
};
