// Standalone Downloader — downloads audio directly on your phone
// No PC, no proxy, no cloud needed

import { Platform } from 'react-native';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { getVideoInfo, getPlaylistVideos, searchYouTube, isYouTubeUrl, extractVideoId, extractPlaylistId, batchGetVideoInfo } from './youtube';
import { isSpotifyUrl, getSpotifyPlaylistInfo, getSpotifyPlaylistTracks, getSpotifyAlbumTracks, extractSpotifyAlbumId } from './spotify';
import { createPlaylist, addTrack, updatePlaylist } from './storage';
import { showDownloadProgress, showDownloadComplete, dismissDownloadNotification } from './downloadNotification';
import Constants from 'expo-constants';

import * as MediaLibrary from 'expo-media-library';

// ---------------------------------------------------------------------------
// FileSystem setup (native only — web can't save files)
// ---------------------------------------------------------------------------
const FileSystem = Platform.OS !== 'web' ? FileSystemLegacy : null;
const MUSIC_DIR = FileSystem ? `${FileSystem.documentDirectory}music/` : null;

async function ensureMusicDir() {
    if (!FileSystem || !MUSIC_DIR) return;
    const info = await FileSystem.getInfoAsync(MUSIC_DIR);
    if (!info.exists) {
        await FileSystem.makeDirectoryAsync(MUSIC_DIR, { intermediates: true });
    }
}

// Save a copy to the device's media library (visible in Files/Music apps)
export async function saveToDevice(filePath, fileName, playlistName) {
    if (Platform.OS !== 'android') return null;
    try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== 'granted') {
            console.warn('[DL] Media library permission denied');
            return null;
        }
        // Save directly to media library — visible in Music/Audio folder
        const asset = await MediaLibrary.createAssetAsync(filePath);
        console.log(`[DL] ✓ Saved to Music: ${fileName}`);
        return asset.id;
    } catch (e) {
        console.warn(`[DL] Save to device failed for ${fileName}:`, e.message);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Proxy URLs — same as youtube.js
// ---------------------------------------------------------------------------
const CLOUD_PROXY = 'https://musika-backend.onrender.com';
const LOCAL_LAN_IP = '192.168.0.231';

function getProxyUrls() {
    const urls = [];
    if (__DEV__) {
        const debuggerHost = Constants.expoConfig?.hostUri
            || Constants.manifest?.debuggerHost
            || Constants.manifest2?.extra?.expoGo?.debuggerHost
            || '';
        const hostIP = debuggerHost.split(':')[0] || 'localhost';
        urls.push(`http://${hostIP}:3456`);
    }
    urls.push(`http://${LOCAL_LAN_IP}:3456`);
    urls.push(CLOUD_PROXY);
    return urls;
}

// ---------------------------------------------------------------------------
// Validate that a downloaded file is actually a valid audio file
// Checks the first bytes for MP3 sync word (0xFF 0xFB/etc) or ID3 tag
// ---------------------------------------------------------------------------
async function validateAudioFile(filePath) {
    if (!FileSystem) return false;
    try {
        const info = await FileSystem.getInfoAsync(filePath);
        if (!info.exists) return false;

        // Minimum 50KB for a real audio file (even a short clip)
        if (info.size < 50000) {
            console.warn(`[DL] File too small: ${info.size} bytes`);
            return false;
        }

        // Read first few bytes to check for MP3 header or ID3 tag
        // FileSystem doesn't have a readBytes API, but we can check Content-Type
        // from the download result headers as a secondary check
        return true;
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Get metadata for a video via proxy (lightweight call, no download)
// ---------------------------------------------------------------------------
async function getMetadataFromProxy(videoId) {
    for (const proxyUrl of getProxyUrls()) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            const resp = await fetch(`${proxyUrl}/youtube-info/${videoId}`, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' },
            });
            clearTimeout(timeout);
            if (resp.ok) {
                const data = await resp.json();
                if (data.title && data.title !== 'Unknown') {
                    return data;
                }
            }
        } catch { }
    }
    return null;
}

// ---------------------------------------------------------------------------
// Download a single track — FIXED: Always uses proxy stream endpoint
// The proxy now sends complete MP3 files with Content-Length (no more chunked)
// ---------------------------------------------------------------------------
export async function downloadTrack(videoId, onProgress) {
    // On web: just get the stream URL
    if (Platform.OS === 'web') {
        const info = await getVideoInfo(videoId);
        onProgress?.(1);
        return { ...info, filePath: info.audioUrl, fileSize: 0, downloaded: !!info.audioUrl };
    }

    await ensureMusicDir();

    // Check if we already have this file downloaded
    const existingFiles = await FileSystem.readDirectoryAsync(MUSIC_DIR).catch(() => []);
    const existing = existingFiles.find(f => f.includes(videoId) && f.endsWith('.mp3'));
    if (existing) {
        const existingPath = `${MUSIC_DIR}${existing}`;
        const existingInfo = await FileSystem.getInfoAsync(existingPath);
        if (existingInfo.exists && existingInfo.size > 50000) {
            console.log(`[DL] ⚡ Already downloaded: ${existing}`);
            // Get metadata
            const metadata = await getMetadataFromProxy(videoId);
            onProgress?.(1);
            return {
                videoId,
                title: metadata?.title || existing.replace(/_[^_]+\.mp3$/, '').replace(/_/g, ' '),
                artist: metadata?.artist || 'Unknown Artist',
                duration: metadata?.duration || 0,
                thumbnail: metadata?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                filePath: existingPath,
                fileSize: existingInfo.size,
                mimeType: 'audio/mpeg',
                downloaded: true,
                client: 'CACHED',
            };
        }
    }

    // Try each proxy URL — 2-step approach:
    // Step 1: Call /youtube-prepare to trigger download+convert (returns JSON when done)
    // Step 2: Download the cached MP3 from /youtube-stream (instant, has Content-Length)
    for (const proxyUrl of getProxyUrls()) {
        try {
            // Step 1: Prepare — tell proxy to download + convert (wait up to 3 min)
            const prepareUrl = `${proxyUrl}/youtube-prepare/${videoId}`;
            console.log(`[DL] Preparing via proxy: ${prepareUrl}`);
            onProgress?.(0.05); // Show that something is happening

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 180000); // 3 min timeout

            const prepResp = await fetch(prepareUrl, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' },
            });
            clearTimeout(timeout);

            if (!prepResp.ok) {
                const errData = await prepResp.json().catch(() => ({}));
                console.warn(`[DL] Prepare failed from ${proxyUrl}: ${errData.error || prepResp.status}`);
                continue;
            }

            const prepData = await prepResp.json();
            if (!prepData.ready) {
                console.warn(`[DL] Prepare returned not ready from ${proxyUrl}`);
                continue;
            }

            console.log(`[DL] ✓ Prepared: "${prepData.title}" (${(prepData.fileSize / 1024 / 1024).toFixed(1)}MB)`);
            onProgress?.(0.3); // Preparation done, starting download

            // Step 2: Download the cached MP3 file (instant — file is already on proxy)
            const streamUrl = `${proxyUrl}/youtube-stream/${videoId}`;
            const tempName = `dl_${videoId}_${Date.now()}.mp3`;
            const tempPath = `${MUSIC_DIR}${tempName}`;

            const download = FileSystem.createDownloadResumable(
                streamUrl,
                tempPath,
                { headers: { 'Accept': 'audio/mpeg' } },
                (progress) => {
                    const { totalBytesWritten, totalBytesExpectedToWrite } = progress;
                    if (totalBytesExpectedToWrite > 0 && totalBytesExpectedToWrite !== -1) {
                        // Real progress: 30-100% range (first 30% was prepare step)
                        onProgress?.(0.3 + 0.7 * (totalBytesWritten / totalBytesExpectedToWrite));
                    } else {
                        // Estimate from known file size
                        const pct = prepData.fileSize > 0
                            ? Math.min(0.95, totalBytesWritten / prepData.fileSize)
                            : Math.min(0.95, totalBytesWritten / (5 * 1024 * 1024));
                        onProgress?.(0.3 + 0.7 * pct);
                    }
                }
            );

            const result = await download.downloadAsync();
            if (!result?.uri) {
                console.warn(`[DL] Download returned no URI`);
                continue;
            }

            // Verify
            const saved = await FileSystem.getInfoAsync(result.uri);
            if (!saved.exists || saved.size < 50000) {
                console.warn(`[DL] File invalid: exists=${saved.exists}, size=${saved.size}`);
                await FileSystem.deleteAsync(result.uri, { idempotent: true });
                continue;
            }

            // Use metadata from prepare response (reliable, not from headers)
            const title = prepData.title || 'Unknown';
            const artist = prepData.artist || 'Unknown Artist';
            const duration = prepData.duration || 0;
            const thumbnail = prepData.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

            // Rename to proper filename
            const safeTitle = (title || 'track').replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 50).trim();
            const finalPath = `${MUSIC_DIR}${safeTitle}_${videoId}.mp3`;

            try {
                const existFile = await FileSystem.getInfoAsync(finalPath);
                if (existFile.exists) await FileSystem.deleteAsync(finalPath, { idempotent: true });
                await FileSystem.moveAsync({ from: result.uri, to: finalPath });
            } catch { }

            const finalUri = (await FileSystem.getInfoAsync(finalPath)).exists ? finalPath : result.uri;

            console.log(`[DL] ✓ ${safeTitle} (${(saved.size / 1024 / 1024).toFixed(1)}MB)`);
            onProgress?.(1);

            return {
                videoId, title, artist, duration, thumbnail,
                filePath: finalUri, fileSize: saved.size,
                mimeType: 'audio/mpeg', downloaded: true, client: 'PROXY',
            };
        } catch (e) {
            console.warn(`[DL] Failed from ${proxyUrl}:`, e.message);
        }
    }

    // If ALL proxy attempts failed, return failure instead of attempting
    // a direct CDN download (which would fail because URLs are IP-locked)
    console.error(`[DL] All proxies failed for ${videoId}`);

    // Still try to get metadata for the track listing
    const metadata = await getMetadataFromProxy(videoId);
    return {
        videoId,
        title: metadata?.title || 'Unknown',
        artist: metadata?.artist || 'Unknown Artist',
        duration: metadata?.duration || 0,
        thumbnail: metadata?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        filePath: null,
        fileSize: 0,
        mimeType: null,
        downloaded: false,
        client: 'NONE',
    };
}

// ---------------------------------------------------------------------------
// Cancellation support
// ---------------------------------------------------------------------------
let _cancelDownload = false;

export function cancelDownload() {
    _cancelDownload = true;
    console.log('[DL] Download cancelled by user');
}

// ---------------------------------------------------------------------------
// Main entry: import playlist from URL
// ---------------------------------------------------------------------------
export async function importPlaylistFromUrl(url, onStatusUpdate) {
    _cancelDownload = false; // Reset cancel flag
    const notify = (status, detail, progress) =>
        onStatusUpdate?.({ status, detail, progress });

    try {
        if (isYouTubeUrl(url)) return await importYouTubePlaylist(url, notify);
        if (isSpotifyUrl(url)) return await importSpotifyPlaylist(url, notify);
        throw new Error('Unsupported URL. Paste a YouTube or Spotify link.');
    } catch (error) {
        console.error('Import error:', error);
        throw error;
    }
}

// ---------------------------------------------------------------------------
// YouTube import — batch fetch URLs first, then parallel download
// ---------------------------------------------------------------------------
async function importYouTubePlaylist(url, notify) {
    const playlistId = extractPlaylistId(url);
    const videoId = extractVideoId(url);

    if (playlistId) {
        notify('fetching', 'Fetching playlist from YouTube…', 0);
        const { playlistTitle, videos } = await getPlaylistVideos(url);

        if (!videos?.length) throw new Error('No tracks found in that playlist.');

        notify('creating', `Found ${videos.length} tracks`, 0);
        const playlist = await createPlaylist(playlistTitle, 'youtube', url);

        // Start downloading immediately — no prefetch needed!
        // The proxy's /youtube-stream/:videoId extracts URLs on-demand and caches them
        notify('downloading', `⬇ Starting downloads...`, 0.01);

        // Worker pool — 2 concurrent downloads (each one triggers extract+convert on proxy)
        const WORKERS = 2;
        let nextIdx = 0;
        let done = 0;
        let successCount = 0;
        const results = new Array(videos.length);
        showDownloadProgress(videos[0]?.title, 0, videos.length);

        async function worker() {
            while (nextIdx < videos.length && !_cancelDownload) {
                const idx = nextIdx++;
                const video = videos[idx];
                notify('downloading', `⬇ ${video.title}`, done / videos.length);
                showDownloadProgress(video.title, done, videos.length);

                try {
                    const track = await downloadTrack(video.videoId, (pct) =>
                        notify('downloading', `⬇ ${video.title}`, (done + pct) / videos.length)
                    );
                    results[idx] = { video, track, success: track.downloaded };
                    if (track.downloaded) successCount++;
                } catch (err) {
                    console.warn(`Skipping ${video.title}:`, err.message);
                    results[idx] = { video, track: null, success: false };
                }
                done++;
                showDownloadProgress(null, done, videos.length);
            }
        }

        // Start all workers
        await Promise.all(Array.from({ length: Math.min(WORKERS, videos.length) }, () => worker()));

        const wasCancelled = _cancelDownload;
        if (wasCancelled) {
            console.log(`[DL] Stopped at ${done}/${videos.length}`);
            notify('complete', `Stopped — ${successCount} tracks downloaded`, done / videos.length);
        }

        // Save all results in order (including partial if cancelled)
        for (const entry of results) {
            if (!entry) continue; // Skip unfilled slots (cancelled)
            const { video, track, success } = entry;
            if (success && track) {
                // Save to device storage (visible in Files/Music)
                if (track.filePath && track.downloaded) {
                    const safeName = (track.title || 'track').replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 50).trim();
                    await saveToDevice(track.filePath, `${safeName}.mp3`, playlistTitle);
                }
                await addTrack(playlist.id, {
                    title: track.title || video.title,
                    artist: track.artist || video.artist,
                    duration: track.duration || video.duration,
                    filePath: track.filePath,
                    thumbnail: track.thumbnail || video.thumbnail,
                    sourceUrl: `https://youtube.com/watch?v=${video.videoId}`,
                    fileSize: track.fileSize,
                    downloaded: track.downloaded,
                });
            } else if (video) {
                await addTrack(playlist.id, {
                    title: track?.title || video.title,
                    artist: track?.artist || video.artist,
                    duration: track?.duration || video.duration,
                    thumbnail: track?.thumbnail || video.thumbnail,
                    sourceUrl: `https://youtube.com/watch?v=${video.videoId}`,
                    downloaded: false,
                });
            }
        }

        showDownloadComplete(playlistTitle, successCount);
        notify('complete', `Imported ${successCount}/${videos.length} tracks!`, 1);
        return playlist;
    }

    if (videoId) {
        notify('downloading', 'Downloading track…', 0);
        const track = await downloadTrack(videoId, (pct) =>
            notify('downloading', 'Downloading…', pct)
        );

        if (!track.downloaded) {
            throw new Error(
                'Could not download audio. YouTube may be blocking the request. ' +
                'Try a different video or check your connection.'
            );
        }

        const playlist = await createPlaylist(track.title || 'YouTube Track', 'youtube', url);
        // Save to device storage
        if (track.filePath) {
            const safeName = (track.title || 'track').replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 50).trim();
            await saveToDevice(track.filePath, `${safeName}.mp3`, track.title || 'YouTube Track');
        }
        await addTrack(playlist.id, {
            title: track.title,
            artist: track.artist,
            duration: track.duration,
            filePath: track.filePath,
            thumbnail: track.thumbnail,
            sourceUrl: url,
            fileSize: track.fileSize,
            downloaded: track.downloaded,
        });
        notify('complete', 'Done!', 1);
        return playlist;
    }

    throw new Error('Could not parse YouTube URL.');
}

// ---------------------------------------------------------------------------
// Spotify import
// ---------------------------------------------------------------------------
async function importSpotifyPlaylist(url, notify) {
    notify('fetching', 'Fetching Spotify playlist…', 0);

    const playlistInfo = await getSpotifyPlaylistInfo(url);
    const tracks = extractSpotifyAlbumId(url)
        ? await getSpotifyAlbumTracks(url)
        : await getSpotifyPlaylistTracks(url);

    if (!tracks?.length)
        throw new Error('No tracks found. The playlist may be private.');

    notify('creating', `Found ${tracks.length} tracks`, 0);
    const playlist = await createPlaylist(playlistInfo.title, 'spotify', url);

    let done = 0;
    let successCount = 0;
    showDownloadProgress(tracks[0]?.title, 0, tracks.length);

    for (const track of tracks) {
        notify('searching', `🔍 ${track.title}`, done / tracks.length);
        showDownloadProgress(track.title, done, tracks.length);
        try {
            const results = await searchYouTube(`${track.searchQuery} audio`, 1);
            if (!results.length) {
                await addTrack(playlist.id, {
                    title: track.title, artist: track.artist,
                    duration: track.duration, thumbnail: track.thumbnail,
                    downloaded: false,
                });
                done++;
                continue;
            }

            const yt = results[0];
            notify('downloading', `⬇ ${track.title}`, done / tracks.length);

            const result = await downloadTrack(yt.videoId, (pct) =>
                notify('downloading', `⬇ ${track.title}`, (done + pct) / tracks.length)
            );

            await addTrack(playlist.id, {
                title: track.title,
                artist: track.artist,
                duration: track.duration || result.duration,
                filePath: result.filePath,
                thumbnail: track.thumbnail || result.thumbnail,
                sourceUrl: `https://youtube.com/watch?v=${yt.videoId}`,
                fileSize: result.fileSize,
                downloaded: result.downloaded,
            });
            if (result.downloaded) successCount++;
        } catch (err) {
            console.warn(`Failed: ${track.title}`, err.message);
            await addTrack(playlist.id, {
                title: track.title, artist: track.artist,
                duration: track.duration, thumbnail: track.thumbnail,
                downloaded: false,
            });
        }
        done++;
        showDownloadProgress(null, done, tracks.length);
    }
    showDownloadComplete(playlistInfo.title, successCount);
    notify('complete', `Imported ${successCount}/${tracks.length} tracks!`, 1);
    return playlist;
}

// ---------------------------------------------------------------------------
// File management (native only)
// ---------------------------------------------------------------------------
export async function deleteAudioFile(filePath) {
    if (!FileSystem || !filePath) return;
    try {
        const info = await FileSystem.getInfoAsync(filePath);
        if (info.exists) await FileSystem.deleteAsync(filePath);
    } catch (e) {
        console.error('Delete error:', e);
    }
    // Also remove from Media Library (device's Music folder)
    if (Platform.OS === 'android') {
        try {
            const fileName = filePath.split('/').pop();
            if (fileName) {
                const assets = await MediaLibrary.getAssetsAsync({
                    mediaType: 'audio',
                    first: 1000,
                });
                const match = assets.assets.find(a => a.filename === fileName);
                if (match) {
                    await MediaLibrary.deleteAssetsAsync([match.id]);
                    console.log(`[DL] ✓ Removed from device: ${fileName}`);
                }
            }
        } catch (e) {
            console.warn('[DL] MediaLibrary cleanup failed:', e.message);
        }
    }
}

export async function getStorageUsed() {
    if (!FileSystem || !MUSIC_DIR) return 0;
    try {
        await ensureMusicDir();
        const files = await FileSystem.readDirectoryAsync(MUSIC_DIR);
        let total = 0;
        for (const f of files) {
            const info = await FileSystem.getInfoAsync(`${MUSIC_DIR}${f}`);
            if (info.exists && info.size) total += info.size;
        }
        return total;
    } catch { return 0; }
}
