# Task Management Viewer

A small React + TypeScript UI for viewing projects and their tasks.

## Run locally

1) Install dependencies:

```bash
npm install
```

2) Start the API proxy and Vite dev server (two terminals):

```bash
npm run serve
```

```bash
npm run dev
```

Or run both together:

```bash
npm run dev:all
```

### API base URL

By default the app expects the proxy on `http://localhost:4500`. To point at a different API base, set `VITE_API_BASE_URL` in your environment.
