import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();
const PORT = 4500;
const API_BASE_URL = 'https://0538-73-172-108-123.ngrok-free.app';
const REQUEST_TIMEOUT_MS = 10_000; // 10 seconds (check ngrok's timeout limits)

app.use(cors());

// Middleware to parse JSON bodies
app.use(express.json());

async function proxyGet(path: string, res: Response) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const url = new URL(path, API_BASE_URL);
        const upstream = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller.signal
        });
        const bodyText = await upstream.text();

        res
            .status(upstream.status)
            .type(upstream.headers.get('content-type') ?? 'application/json')
            .send(bodyText || JSON.stringify({ error: upstream.statusText }));
    } catch (error) {
        const status = error instanceof Error && error.name === 'AbortError' ? 504 : 502;
        const message = error instanceof Error ? error.message : 'Upstream request failed';
        res.status(status).json({ error: message });
    } finally {
        clearTimeout(timeoutId);
    }
}

app.get('/', (request: Request, res: Response) => {
    res.json({ status: 'ok', upstream: API_BASE_URL });
});

app.get('/projects', async (request: Request, res: Response) => {
    await proxyGet('/projects', res);
});

app.get('/projects/:id', async (request: Request, res: Response) => {
    await proxyGet(`/projects/${request.params.id}`, res);
});

app.get('/projects/:id/tasks', async (request: Request, res: Response) => {
    await proxyGet(`/projects/${request.params.id}/tasks`, res);
});

app.get('/projects/:id/tasks/:taskId', async (request: Request, res: Response) => {
    await proxyGet(`/projects/${request.params.id}/tasks/${request.params.taskId}`, res);
});

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
