// Musika Proxy Server
// Uses yt-dlp for YouTube audio extraction + MP3 conversion

const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const { execFile, spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3456;

const YT_DLP = process.platform === 'win32'
    ? path.join(__dirname, 'yt-dlp.exe')
    : (process.env.YTDLP_PATH || 'yt-dlp');

const FFMPEG = process.platform === 'win32'
    ? (fs.existsSync(path.join(__dirname, 'ffmpeg.exe'))
        ? path.join(__dirname, 'ffmpeg.exe') : 'ffmpeg')
    : 'ffmpeg';

const TEMP_DIR = path.join(os.tmpdir(), 'musika-cache');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ytDlp(args, opts = {}) {
    return new Promise((resolve, reject) => {
        execFile(YT_DLP, args, {
            maxBuffer: 50 * 1024 * 1024,
            timeout: opts.timeout || 45000,
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        }, (err, stdout, stderr) => {
            if (err && !stdout?.trim()) {
                const msg = (stderr || err.message || '').split('\n')
                    .find(l => l.includes('ERROR')) || err.message;
                return reject(new Error(msg.replace(/^ERROR:\s*/, '')));
            }
            const out = stdout?.trim();
            if (!out) return reject(new Error('yt-dlp returned empty output'));
            try { resolve(JSON.parse(out)); }
            catch { reject(new Error('yt-dlp output not valid JSON')); }
        });
    });
}

function ytDlpLines(args, opts = {}) {
    return new Promise((resolve, reject) => {
        execFile(YT_DLP, args, {
            maxBuffer: 50 * 1024 * 1024,
            timeout: opts.timeout || 45000,
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        }, (err, stdout, stderr) => {
            if (err && !stdout) return reject(new Error((stderr || err.message).split('\n')[0]));
            const results = (stdout || '').trim().split('\n')
                .filter(Boolean)
                .reduce((acc, line) => {
                    try { acc.push(JSON.parse(line)); } catch { } return acc;
                }, []);
            resolve(results);
        });
    });
}

function proxyHttps(options, res) {
    return new Promise((resolve, reject) => {
        const req = https.request({ method: 'GET', ...options }, proxyRes => {
            res.status(proxyRes.statusCode);
            ['content-type', 'content-length'].forEach(h => {
                if (proxyRes.headers[h]) res.setHeader(h, proxyRes.headers[h]);
            });
            proxyRes.pipe(res);
            proxyRes.on('end', resolve);
        });
        req.on('error', reject);
        req.end();
    });
}

// ---------------------------------------------------------------------------
// Metadata cache
// ---------------------------------------------------------------------------
const urlCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 min

function getCached(videoId) {
    const entry = urlCache.get(videoId);
    if (entry && (Date.now() - entry.timestamp) < CACHE_TTL) return entry;
    urlCache.delete(videoId);
    return null;
}

// ---------------------------------------------------------------------------
// Core: download + convert a video to MP3 using yt-dlp
// ---------------------------------------------------------------------------
const inProgress = new Map();

// Quick metadata fetch (no download, ~1-2 sec)
async function fetchMetadata(videoId) {
    const cached = getCached(videoId);
    if (cached && cached.title && cached.title !== 'Unknown') return cached;

    try {
        const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const result = await new Promise((resolve, reject) => {
            execFile(YT_DLP, [
                ytUrl, '--no-download', '--no-warnings', '--no-check-certificates',
                '--no-playlist', '--print', '%(title)s\t%(channel)s\t%(duration)s\t%(thumbnail)s',
            ], { timeout: 15000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
                (err, stdout) => {
                    if (err) return reject(err);
                    const line = (stdout || '').trim();
                    const parts = line.split('\t');
                    resolve({
                        title: parts[0] || 'Unknown',
                        channel: parts[1] || 'Unknown Artist',
                        duration: parseInt(parts[2]) || 0,
                        thumbnail: parts[3] || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    });
                });
        });
        urlCache.set(videoId, { videoId, ...result, artist: result.channel, audioUrl: '', ext: 'mp3', timestamp: Date.now() });
        return result;
    } catch (e) {
        console.warn(`[meta] Failed for ${videoId}:`, e.message);
        return { title: 'Unknown', channel: 'Unknown Artist', duration: 0, thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` };
    }
}

async function downloadAndConvert(videoId) {
    const mp3Path = path.join(TEMP_DIR, `${videoId}.mp3`);

    // Already done? Just fetch metadata if needed
    if (fs.existsSync(mp3Path) && fs.statSync(mp3Path).size > 50000) {
        const meta = await fetchMetadata(videoId);
        return { cached: true, mp3Path, meta };
    }

    // Already in progress? Wait for it
    if (inProgress.has(videoId)) {
        await inProgress.get(videoId).catch(() => { });
        if (fs.existsSync(mp3Path) && fs.statSync(mp3Path).size > 50000) {
            const meta = await fetchMetadata(videoId);
            return { cached: true, mp3Path, meta };
        }
    }

    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`[yt-dlp] Downloading + converting: ${videoId}`);

    // Fetch metadata in parallel (fast, no download)
    const metaPromise = fetchMetadata(videoId);

    // Download + convert (NO --print flag — it prevents download!)
    const downloadPromise = new Promise((resolve, reject) => {
        const outBase = path.join(TEMP_DIR, videoId);
        const proc = spawn(YT_DLP, [
            ytUrl,
            '-x',
            '--audio-format', 'mp3',
            '--audio-quality', '2',
            '-f', 'bestaudio[ext=m4a]/bestaudio/best',
            '--no-playlist',
            '--no-warnings',
            '--no-check-certificates',
            '--ffmpeg-location', path.dirname(FFMPEG),
            '-o', outBase + '.%(ext)s',
        ], {
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        });

        let stderr = '';
        proc.stderr.on('data', d => { stderr += d.toString(); });

        const timer = setTimeout(() => {
            proc.kill();
            reject(new Error('yt-dlp timed out (3 min)'));
        }, 180000);

        proc.on('close', code => {
            clearTimeout(timer);
            if (code !== 0) {
                const errLine = stderr.split('\n').find(l => l.includes('ERROR')) || `exit code ${code}`;
                return reject(new Error(errLine));
            }
            let found = null;
            try {
                for (const f of fs.readdirSync(TEMP_DIR)) {
                    if (f.startsWith(videoId) && f.endsWith('.mp3')) {
                        const p = path.join(TEMP_DIR, f);
                        if (fs.statSync(p).size > 10000) { found = p; break; }
                    }
                }
            } catch { }
            if (!found) return reject(new Error('No MP3 output file'));
            if (found !== mp3Path) {
                try { fs.renameSync(found, mp3Path); } catch { }
            }
            resolve();
        });

        proc.on('error', err => { clearTimeout(timer); reject(err); });
    });

    inProgress.set(videoId, downloadPromise);
    try {
        const [meta] = await Promise.all([metaPromise, downloadPromise]);
        urlCache.set(videoId, {
            videoId,
            title: meta.title || 'Unknown',
            artist: meta.channel || meta.uploader || 'Unknown Artist',
            duration: meta.duration || 0,
            thumbnail: meta.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            audioUrl: '', ext: 'mp3', timestamp: Date.now(),
        });
        return { cached: false, mp3Path, meta };
    } finally {
        inProgress.delete(videoId);
    }
}

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
    execFile(YT_DLP, ['--version'], (err, stdout) => {
        res.json({ status: 'ok', ytdlp: stdout?.trim() || 'not found', platform: process.platform, port: PORT });
    });
});

// ---------------------------------------------------------------------------
// GET /youtube-prepare/:videoId — Trigger download, return JSON when ready
// Phone calls this first (long timeout fetch), then downloads cached file
// ---------------------------------------------------------------------------
app.get('/youtube-prepare/:videoId', async (req, res) => {
    const { videoId } = req.params;
    console.log(`[yt-prepare] ${videoId}`);

    try {
        const result = await downloadAndConvert(videoId);
        const stat = fs.statSync(result.mp3Path);
        const entry = getCached(videoId) || result.meta || {};

        console.log(`[yt-prepare] ✓ "${entry.title || 'Unknown'}" (${(stat.size / 1024 / 1024).toFixed(1)}MB)`);
        res.json({
            ready: true,
            videoId,
            title: entry.title || 'Unknown',
            artist: entry.artist || entry.channel || entry.uploader || 'Unknown Artist',
            duration: entry.duration || 0,
            thumbnail: entry.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            fileSize: stat.size,
        });
    } catch (err) {
        console.error(`[yt-prepare] Failed ${videoId}:`, err.message);
        res.status(500).json({ error: err.message, ready: false });
    }
});

// ---------------------------------------------------------------------------
// GET /youtube-stream/:videoId — Serve the cached MP3 file
// After /youtube-prepare completes, this returns the file instantly
// ---------------------------------------------------------------------------
app.get('/youtube-stream/:videoId', async (req, res) => {
    const { videoId } = req.params;
    const mp3Path = path.join(TEMP_DIR, `${videoId}.mp3`);

    try {
        // If not cached yet, trigger download (for direct calls)
        if (!fs.existsSync(mp3Path) || fs.statSync(mp3Path).size < 50000) {
            await downloadAndConvert(videoId);
        }

        if (!fs.existsSync(mp3Path)) throw new Error('MP3 not found');
        const stat = fs.statSync(mp3Path);
        if (stat.size < 50000) throw new Error(`MP3 too small: ${stat.size} bytes`);

        const entry = getCached(videoId) || {};

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Length', stat.size);
        res.setHeader('X-Title', encodeURIComponent(entry.title || 'Unknown'));
        res.setHeader('X-Artist', encodeURIComponent(entry.artist || 'Unknown Artist'));
        res.setHeader('X-Duration', String(entry.duration || 0));
        res.setHeader('X-Thumbnail', encodeURIComponent(entry.thumbnail || ''));
        res.setHeader('X-Video-Id', videoId);

        fs.createReadStream(mp3Path).pipe(res);
    } catch (err) {
        console.error(`[yt-stream] Failed ${videoId}:`, err.message);
        if (!res.headersSent) res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// GET /youtube-info/:videoId
// ---------------------------------------------------------------------------
app.get('/youtube-info/:videoId', async (req, res) => {
    const { videoId } = req.params;
    console.log(`[yt-info] ${videoId}`);
    try {
        const info = await ytDlp([
            `https://www.youtube.com/watch?v=${videoId}`,
            '--dump-json', '-f', 'bestaudio[ext=m4a]/bestaudio/best',
            '--no-playlist', '--no-warnings', '--no-check-certificates', '--quiet',
        ]);
        const audioUrl = info.url || info.requested_formats?.[0]?.url || null;
        if (!audioUrl) throw new Error('No audio URL');
        console.log(`[yt-info] ✓ "${info.title}"`);
        res.json({
            videoId, title: info.title || 'Unknown',
            artist: info.channel || info.uploader || 'Unknown Artist',
            duration: info.duration || 0,
            thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            audioUrl, mimeType: info.ext === 'webm' ? 'audio/webm' : 'audio/mp4',
        });
    } catch (err) {
        console.error(`[yt-info] Failed:`, err.message);
        res.status(206).json({ videoId, title: 'Unknown', artist: 'Unknown Artist', duration: 0, thumbnail: null, audioUrl: null });
    }
});

// ---------------------------------------------------------------------------
// GET /youtube-playlist/:playlistId
// ---------------------------------------------------------------------------
app.get('/youtube-playlist/:playlistId', async (req, res) => {
    const { playlistId } = req.params;
    const fullUrl = req.query.url ? decodeURIComponent(req.query.url) : `https://www.youtube.com/playlist?list=${playlistId}`;
    console.log(`[yt-playlist] ${fullUrl}`);
    try {
        const info = await ytDlp([fullUrl, '--flat-playlist', '--dump-single-json', '--no-warnings'], { timeout: 60000 });
        const title = info.title || info.playlist_title || 'YouTube Playlist';
        const entries = info.entries || [];
        if (!entries.length && info.id) {
            return res.json({ playlistTitle: info.title || 'YouTube Video', videos: [{ videoId: info.id, title: info.title || 'Unknown', artist: info.channel || info.uploader || 'Unknown', duration: info.duration || 0, thumbnail: info.thumbnail || null }] });
        }
        const videos = entries.map(e => ({ videoId: e.id || e.url, title: e.title || 'Unknown', artist: e.channel || e.uploader || e.uploader_id || 'Unknown', duration: e.duration || 0, thumbnail: e.thumbnail || e.thumbnails?.slice(-1)[0]?.url || null })).filter(v => v.videoId);
        console.log(`[yt-playlist] ✓ "${title}" — ${videos.length} videos`);
        res.json({ playlistTitle: title, videos });
    } catch (err) {
        console.error('[yt-playlist]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// POST /youtube-search
// ---------------------------------------------------------------------------
app.post('/youtube-search', async (req, res) => {
    const { query, maxResults = 3 } = req.body;
    console.log(`[yt-search] "${query}"`);
    try {
        const items = await ytDlpLines([`ytsearch${maxResults}:${query}`, '--flat-playlist', '--dump-json', '--no-warnings', '--quiet']);
        const results = items.map(item => ({ videoId: item.id || item.url, title: item.title || 'Unknown', artist: item.channel || item.uploader || 'Unknown', duration: item.duration || 0, thumbnail: item.thumbnail || null })).filter(r => r.videoId);
        console.log(`[yt-search] ✓ ${results.length} results`);
        res.json({ results });
    } catch (err) {
        console.error('[yt-search]', err.message);
        res.json({ results: [] });
    }
});

// ---------------------------------------------------------------------------
// Spotify proxy
// ---------------------------------------------------------------------------
app.get('/spotify-embed/:type/:id', async (req, res) => {
    try { await proxyHttps({ hostname: 'open.spotify.com', path: `/embed/${req.params.type}/${req.params.id}`, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html,*/*' } }, res); }
    catch (err) { if (!res.headersSent) res.status(502).json({ error: err.message }); }
});
app.get('/spotify-oembed', async (req, res) => {
    const spotUrl = req.query.url;
    if (!spotUrl) return res.status(400).json({ error: 'Missing ?url=' });
    try { await proxyHttps({ hostname: 'open.spotify.com', path: `/oembed?url=${encodeURIComponent(spotUrl)}`, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }, res); }
    catch (err) { if (!res.headersSent) res.status(502).json({ error: err.message }); }
});

// ---------------------------------------------------------------------------
// Cleanup old cached files every 10 min
// ---------------------------------------------------------------------------
setInterval(() => {
    try {
        const now = Date.now();
        for (const f of fs.readdirSync(TEMP_DIR)) {
            const p = path.join(TEMP_DIR, f);
            if (now - fs.statSync(p).mtimeMs > 30 * 60 * 1000) {
                fs.unlinkSync(p);
                console.log(`[cache] Cleaned: ${f}`);
            }
        }
    } catch { }
}, 10 * 60 * 1000);

// ---------------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`\n🎵 Musika Proxy → port ${PORT}`);
    console.log(`   yt-dlp: ${YT_DLP}`);
    console.log(`   ffmpeg: ${FFMPEG}`);
    console.log(`   cache:  ${TEMP_DIR}`);
    console.log(`   GET  /youtube-prepare/:videoId  (download+convert, returns JSON)`);
    console.log(`   GET  /youtube-stream/:videoId   (serve cached MP3)`);
    console.log(`   GET  /youtube-info/:videoId`);
    console.log(`   GET  /youtube-playlist/:id`);
    console.log(`   POST /youtube-search\n`);

    if (process.env.RENDER) {
        const url = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/health`;
        setInterval(() => { fetch(url).catch(() => { }); }, 14 * 60 * 1000);
        console.log(`   🔄 Keep-alive: ${url}`);
    }
});
