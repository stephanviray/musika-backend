// Spotify Playlist Parser — Standalone (no proxy needed)
// On native Android: fetch directly (no CORS restrictions)
// Extracts track names from Spotify embed pages

export function isSpotifyUrl(url) {
    return /open\.spotify\.com/.test(url);
}

export function extractSpotifyPlaylistId(url) {
    const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
}

export function extractSpotifyAlbumId(url) {
    const match = url.match(/album\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
}

// Fetch helper — direct on native, works without proxy
async function spotifyFetch(url, isHtml = false) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            'Accept': isHtml ? 'text/html,*/*' : 'application/json',
        },
    });
    if (!response.ok) throw new Error(`Spotify returned ${response.status}`);
    return response;
}

export async function getSpotifyPlaylistInfo(url) {
    try {
        const response = await spotifyFetch(
            `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`
        );
        const data = await response.json();
        return {
            title: data.title || 'Spotify Playlist',
            thumbnail: data.thumbnail_url || null,
            provider: 'spotify',
        };
    } catch (error) {
        console.error('Spotify oEmbed error:', error);
        return { title: 'Spotify Playlist', thumbnail: null, provider: 'spotify' };
    }
}

// Parse tracks from Spotify embed HTML
function parseTracksFromHtml(html) {
    const tracks = [];

    // Method 1: resource script tag
    const resourceMatch = html.match(/<script[^>]*id="resource"[^>]*>([^<]+)<\/script>/);
    if (resourceMatch) {
        try {
            const data = JSON.parse(decodeURIComponent(resourceMatch[1]));
            const items = data.tracks?.items || [];
            for (const item of items) {
                const track = item.track || item;
                if (!track.name) continue;
                const artists = (track.artists || []).map(a => a.name).join(', ');
                tracks.push({
                    title: track.name,
                    artist: artists || 'Unknown Artist',
                    duration: Math.floor((track.duration_ms || 0) / 1000),
                    searchQuery: `${track.name} ${artists}`,
                    thumbnail: track.album?.images?.[0]?.url || null,
                });
            }
        } catch (e) {
            console.warn('Resource parse error:', e);
        }
    }

    // Method 2: JSON-LD
    if (tracks.length === 0) {
        const jsonLdMatch = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
        if (jsonLdMatch) {
            try {
                const jsonLd = JSON.parse(jsonLdMatch[1]);
                if (jsonLd.track) {
                    for (const track of jsonLd.track) {
                        tracks.push({
                            title: track.name || 'Unknown',
                            artist: track.byArtist?.name || 'Unknown',
                            duration: 0,
                            searchQuery: `${track.name} ${track.byArtist?.name || ''}`,
                            thumbnail: null,
                        });
                    }
                }
            } catch (e) {
                console.warn('JSON-LD parse error:', e);
            }
        }
    }

    // Method 3: __NEXT_DATA__
    if (tracks.length === 0) {
        const nextMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
        if (nextMatch) {
            try {
                const nextData = JSON.parse(nextMatch[1]);
                const entity = nextData?.props?.pageProps?.state?.data?.entity;
                if (entity?.trackList) {
                    for (const t of entity.trackList) {
                        tracks.push({
                            title: t.title || t.name || 'Unknown',
                            artist: t.subtitle || 'Unknown',
                            duration: Math.floor((t.duration || 0) / 1000),
                            searchQuery: `${t.title || t.name} ${t.subtitle || ''}`,
                            thumbnail: null,
                        });
                    }
                }
            } catch (e) {
                console.warn('NEXT_DATA parse error:', e);
            }
        }
    }

    return tracks;
}

export async function getSpotifyPlaylistTracks(url) {
    const playlistId = extractSpotifyPlaylistId(url);
    if (!playlistId) throw new Error('Invalid Spotify playlist URL');

    const response = await spotifyFetch(
        `https://open.spotify.com/embed/playlist/${playlistId}`,
        true
    );
    const html = await response.text();
    return parseTracksFromHtml(html);
}

export async function getSpotifyAlbumTracks(url) {
    const albumId = extractSpotifyAlbumId(url);
    if (!albumId) throw new Error('Invalid Spotify album URL');

    const response = await spotifyFetch(
        `https://open.spotify.com/embed/album/${albumId}`,
        true
    );
    const html = await response.text();
    const tracks = parseTracksFromHtml(html);

    // If tracks have no thumbnails, try to get album art
    if (tracks.length > 0 && !tracks[0].thumbnail) {
        const resourceMatch = html.match(/<script[^>]*id="resource"[^>]*>([^<]+)<\/script>/);
        if (resourceMatch) {
            try {
                const data = JSON.parse(decodeURIComponent(resourceMatch[1]));
                const albumArt = data.images?.[0]?.url || null;
                if (albumArt) tracks.forEach(t => { t.thumbnail = albumArt; });
            } catch { }
        }
    }

    return tracks;
}
