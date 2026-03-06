// YouTube Service — Uses local yt-dlp proxy for reliable audio extraction
// The proxy handles ALL signature deciphering via yt-dlp (no client-side crypto needed)
import { Innertube, UniversalCache } from 'youtubei.js/react-native';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Proxy URL configuration — tries local first, then cloud
// The proxy.js server (port 3456) uses yt-dlp to extract pre-deciphered audio URLs
// ---------------------------------------------------------------------------
const CLOUD_PROXY = 'https://musika-backend.onrender.com';
const LOCAL_LAN_IP = '192.168.0.231'; // Your PC's LAN IP — update if it changes

function getProxyUrls() {
  const urls = [];

  if (__DEV__) {
    // In dev, auto-detect host IP from Expo's debugger
    const debuggerHost = Constants.expoConfig?.hostUri
      || Constants.manifest?.debuggerHost
      || Constants.manifest2?.extra?.expoGo?.debuggerHost
      || '';
    const hostIP = debuggerHost.split(':')[0] || 'localhost';
    urls.push(`http://${hostIP}:3456`);
  }

  // Always try local LAN proxy (works when PC is on same network)
  urls.push(`http://${LOCAL_LAN_IP}:3456`);
  // Cloud fallback (always available when deployed)
  urls.push(CLOUD_PROXY);

  return urls;
}

let _ytInstance = null;

async function getYT() {
  if (_ytInstance) return _ytInstance;
  try {
    _ytInstance = await Innertube.create({
      cache: new UniversalCache(false),
      generate_session_locally: true
    });
    return _ytInstance;
  } catch (e) {
    console.error('[YT] Init Error:', e);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------
export function extractVideoId(url) {
  const p = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const r of p) { const m = url.match(r); if (m) return m[1]; }
  return null;
}
export function extractPlaylistId(url) {
  const m = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}
export function isYouTubeUrl(url) {
  return /(?:youtube\.com|youtu\.be)/.test(url);
}

// ---------------------------------------------------------------------------
// BATCH GET VIDEO INFO — Fetch multiple audio URLs in one call (much faster)
// ---------------------------------------------------------------------------
export async function batchGetVideoInfo(videoIds) {
  const proxyUrls = getProxyUrls();

  for (const proxyUrl of proxyUrls) {
    try {
      console.log(`[YT] Batch fetching ${videoIds.length} videos via ${proxyUrl}...`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000); // 2 min for batch

      const resp = await fetch(`${proxyUrl}/youtube-batch`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoIds }),
      });
      clearTimeout(timeout);

      if (!resp.ok) continue;
      const data = await resp.json();

      if (data.results?.length > 0) {
        const withUrls = data.results.filter(r => r.audioUrl).length;
        console.log(`[YT] ✓ Batch success! ${withUrls}/${data.results.length} with audio URLs`);
        // Return as a map: videoId -> info
        const infoMap = {};
        for (const r of data.results) {
          infoMap[r.videoId] = { ...r, client: 'PROXY' };
        }
        return infoMap;
      }
    } catch (e) {
      console.warn(`[YT] Batch ${proxyUrl} failed:`, e.message);
    }
  }
  return null; // Fallback to individual fetches
}
// ---------------------------------------------------------------------------
// GET VIDEO INFO — Via yt-dlp proxy (primary, most reliable)
// ---------------------------------------------------------------------------
async function getVideoInfoViaProxy(videoId) {
  const proxyUrls = getProxyUrls();

  for (const proxyUrl of proxyUrls) {
    try {
      console.log(`[YT] Trying proxy: ${proxyUrl}/youtube-info/${videoId}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const resp = await fetch(`${proxyUrl}/youtube-info/${videoId}`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        console.warn(`[YT] Proxy ${proxyUrl} returned ${resp.status}`);
        continue;
      }

      const data = await resp.json();
      if (!data.audioUrl) {
        console.warn(`[YT] Proxy ${proxyUrl} returned no audioUrl`);
        continue;
      }

      console.log(`[YT] ✓ Proxy success! "${data.title}"`);
      return {
        videoId,
        title: data.title || 'Unknown',
        artist: data.artist || 'Unknown Artist',
        duration: data.duration || 0,
        thumbnail: data.thumbnail || null,
        audioUrl: data.audioUrl,
        mimeType: data.mimeType || 'audio/mp4',
        client: 'PROXY',
      };
    } catch (e) {
      console.warn(`[YT] Proxy ${proxyUrl} failed:`, e.message);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// INNERTUBE FALLBACK — Direct API (may fail due to signature issues)
// ---------------------------------------------------------------------------
async function getVideoInfoViaInnertube(videoId) {
  const clients = ['IOS', 'WEB', 'TV_EMBEDDED'];
  try {
    const yt = await getYT();
    for (const clientName of clients) {
      try {
        console.log(`[YT] Trying Innertube client: ${clientName}...`);
        const info = await yt.getBasicInfo(videoId, { client: clientName });
        const format = info.chooseFormat({ type: 'audio', quality: 'best' });
        if (format) {
          const d = info.basic_info;
          let audioUrl = format.decipher(yt.session.player);
          if (audioUrl && typeof audioUrl.then === 'function') audioUrl = await audioUrl;
          if (!audioUrl) audioUrl = format.url;
          if (audioUrl) {
            console.log(`[YT] ✓ Innertube success with ${clientName}!`);
            return {
              videoId,
              title: d.title || 'Unknown',
              artist: d.author || 'Unknown Artist',
              duration: d.duration || 0,
              thumbnail: d.thumbnail?.length ? d.thumbnail[d.thumbnail.length - 1].url : null,
              audioUrl,
              mimeType: format.mime_type || 'audio/mp4',
              client: clientName,
            };
          }
        }
      } catch (e) {
        console.warn(`[YT] Innertube ${clientName} failed:`, e.message);
      }
    }
  } catch (e) {
    console.warn(`[YT] Innertube fatal error:`, e.message);
  }
  return null;
}

// ---------------------------------------------------------------------------
// GET VIDEO INFO — Main entry point
// ---------------------------------------------------------------------------
export async function getVideoInfo(videoId) {
  console.log(`[YT] getVideoInfo: ${videoId}`);

  // 1) Try local yt-dlp proxy first (handles all deciphering server-side)
  const proxyResult = await getVideoInfoViaProxy(videoId);
  if (proxyResult?.audioUrl) return proxyResult;

  // 2) Fallback to Innertube (direct YouTube API — may fail on signatures)
  console.log(`[YT] Proxy unavailable, trying Innertube...`);
  const innertubeResult = await getVideoInfoViaInnertube(videoId);
  if (innertubeResult?.audioUrl) return innertubeResult;

  // 3) Last resort: metadata only via oEmbed
  console.warn('[YT] All methods failed, returning metadata only.');
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${videoId}&format=json`);
    if (r.ok) {
      const m = await r.json();
      return {
        videoId, title: m.title || 'Unknown', artist: m.author_name || 'Unknown',
        duration: 0, thumbnail: m.thumbnail_url || null, audioUrl: null, mimeType: null
      };
    }
  } catch { }

  return {
    videoId, title: 'Unknown', artist: 'Unknown', duration: 0,
    thumbnail: null, audioUrl: null, mimeType: null
  };
}

// ---------------------------------------------------------------------------
// GET PLAYLIST VIDEOS
// ---------------------------------------------------------------------------
export async function getPlaylistVideos(url) {
  const playlistId = extractPlaylistId(url);
  console.log(`[YT] Playlist: ${playlistId}`);

  // Try proxy first
  for (const proxyUrl of getProxyUrls()) {
    try {
      const resp = await fetch(`${proxyUrl}/youtube-playlist/${playlistId}?url=${encodeURIComponent(url)}`, {
        headers: { 'Accept': 'application/json' },
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.videos?.length > 0) {
          console.log(`[YT] ✓ Proxy playlist "${data.playlistTitle}" — ${data.videos.length} tracks`);
          return data;
        }
      }
    } catch (e) {
      console.warn(`[YT] Proxy playlist ${proxyUrl} failed:`, e.message);
    }
  }

  // Fallback to youtubei.js
  const yt = await getYT();
  const playlist = await yt.getPlaylist(playlistId);

  const videos = playlist.videos.map(v => ({
    videoId: v.id,
    title: v.title?.text || 'Unknown',
    artist: v.author?.name || 'Unknown',
    duration: v.duration?.seconds || 0,
    thumbnail: v.thumbnails?.length ? v.thumbnails[v.thumbnails.length - 1].url : null,
  }));

  if (!videos.length) throw new Error('No tracks found in playlist.');
  console.log(`[YT] ✓ "${playlist.info.title}" — ${videos.length} tracks`);
  return { playlistTitle: playlist.info.title, videos };
}

// ---------------------------------------------------------------------------
// SEARCH YOUTUBE
// ---------------------------------------------------------------------------
export async function searchYouTube(query, maxResults = 3) {
  // Try proxy first
  for (const proxyUrl of getProxyUrls()) {
    try {
      const resp = await fetch(`${proxyUrl}/youtube-search`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, maxResults }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.results?.length > 0) return data.results;
      }
    } catch { }
  }

  // Fallback to youtubei.js
  try {
    const yt = await getYT();
    const results = await yt.search(query, { type: 'video' });
    return results.videos.slice(0, maxResults).map(v => ({
      videoId: v.id,
      title: v.title?.text || 'Unknown',
      artist: v.author?.name || 'Unknown',
      duration: v.duration?.seconds || 0,
      thumbnail: v.thumbnails?.length ? v.thumbnails[v.thumbnails.length - 1].url : null,
    }));
  } catch { return []; }
}
