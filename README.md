# What to Watch — Plex Recommender

Finds unwatched movies in your Plex library that match the vibe of a film you've enjoyed, powered by TMDB recommendations.

## How it works

1. Enter a movie you liked (e.g. "Parasite")
2. The app searches TMDB for that film and fetches its recommendations
3. Those recommendations are cross-referenced against your **unwatched** Plex movies by title + year
4. Matching films display with TMDB posters, ratings, and overviews

## Setup

### 1. Get a TMDB API key (free)

1. Create an account at [themoviedb.org](https://www.themoviedb.org)
2. Go to Settings → API → Create → Developer
3. Copy the **API Read Access Token** (the long JWT, not the short API key)

### 2. Deploy to Netlify

Drag the unzipped folder into [app.netlify.com](https://app.netlify.com), or:

```bash
npm install -g netlify-cli
netlify deploy --prod --dir=.
```

### 3. Set environment variable in Netlify

Go to **Site settings → Environment variables** and add:

| Variable | Value | Secret? |
|---|---|---|
| `PLEX_TOKEN` | Your Plex auth token | Yes |

The TMDB key does **not** need to be an environment variable — it's entered in the app's Settings UI and stored in your browser. TMDB read-only keys are safe to use in the browser.

### 4. Open the app → Settings

Enter:
- Your **Plex token** (used server-side via the Netlify function)
- Your **TMDB Read Access Token**
- Optionally your **Plex server URL** (only needed on local network)

### Finding your Plex token

1. Open [app.plex.tv](https://app.plex.tv) in a browser
2. Play any media item
3. Open DevTools → Network tab
4. Find any request to `plex.tv` and look for `X-Plex-Token` in the URL

[Full guide](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/)

## Project structure

```
plex-recommender/
├── public/
│   └── index.html              # Frontend (static, no build step)
├── netlify/
│   └── functions/
│       └── plex.js             # Plex API proxy (keeps token server-side)
├── netlify.toml
└── README.md
```

## Local development

```bash
# Create a .env file with:
# PLEX_TOKEN=your_token_here

netlify dev
# Open http://localhost:8888
```

## Notes

- Only **unwatched** movies are shown (Plex viewCount = 0)
- Matching is done by normalised title + release year (±1 year tolerance)
- TMDB fetches both `/recommendations` and `/similar` endpoints and merges them
- All credentials stay in your browser's localStorage — nothing is logged or stored server-side
