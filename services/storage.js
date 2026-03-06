import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveToDevice } from './downloader';

const PLAYLISTS_KEY = '@musika_playlists';
const TRACKS_KEY = '@musika_tracks';
const FAVORITES_KEY = '@musika_favorites';
const RECENTLY_PLAYED_KEY = '@musika_recently_played';
const MAX_RECENT = 30;

// Generate a simple unique ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ============= PLAYLIST OPERATIONS =============

export async function getPlaylists() {
    try {
        const data = await AsyncStorage.getItem(PLAYLISTS_KEY);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('Error getting playlists:', error);
        return [];
    }
}

export async function getPlaylist(id) {
    const playlists = await getPlaylists();
    return playlists.find(p => p.id === id) || null;
}

export async function createPlaylist(name, source = 'manual', sourceUrl = '') {
    const playlists = await getPlaylists();
    const playlist = {
        id: generateId(),
        name,
        source,       // 'manual', 'youtube', 'spotify'
        sourceUrl,
        coverArt: null,
        trackCount: 0,
        totalDuration: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    playlists.unshift(playlist); // Add to top
    await AsyncStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
    return playlist;
}

export async function updatePlaylist(id, updates) {
    const playlists = await getPlaylists();
    const index = playlists.findIndex(p => p.id === id);
    if (index === -1) return null;
    playlists[index] = { ...playlists[index], ...updates, updatedAt: new Date().toISOString() };
    await AsyncStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
    return playlists[index];
}

export async function deletePlaylist(id) {
    const playlists = await getPlaylists();
    const filtered = playlists.filter(p => p.id !== id);
    await AsyncStorage.setItem(PLAYLISTS_KEY, JSON.stringify(filtered));
    // Also delete all tracks for this playlist
    const tracks = await getAllTracks();
    const filteredTracks = tracks.filter(t => t.playlistId !== id);
    await AsyncStorage.setItem(TRACKS_KEY, JSON.stringify(filteredTracks));
}

// ============= TRACK OPERATIONS =============

export async function getAllTracks() {
    try {
        const data = await AsyncStorage.getItem(TRACKS_KEY);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('Error getting tracks:', error);
        return [];
    }
}

export async function getPlaylistTracks(playlistId) {
    const tracks = await getAllTracks();
    return tracks
        .filter(t => t.playlistId === playlistId)
        .sort((a, b) => a.order - b.order);
}

export async function addTrack(playlistId, trackData) {
    const tracks = await getAllTracks();
    const playlistTracks = tracks.filter(t => t.playlistId === playlistId);

    const track = {
        id: generateId(),
        playlistId,
        title: trackData.title || 'Unknown Track',
        artist: trackData.artist || 'Unknown Artist',
        duration: trackData.duration || 0,
        filePath: trackData.filePath || '',
        thumbnail: trackData.thumbnail || null,
        sourceUrl: trackData.sourceUrl || '',
        fileSize: trackData.fileSize || 0,
        order: playlistTracks.length,
        downloaded: trackData.downloaded || false,
        createdAt: new Date().toISOString(),
    };

    tracks.push(track);
    await AsyncStorage.setItem(TRACKS_KEY, JSON.stringify(tracks));

    // Update playlist track count
    await updatePlaylist(playlistId, {
        trackCount: playlistTracks.length + 1,
        totalDuration: playlistTracks.reduce((sum, t) => sum + (t.duration || 0), 0) + (track.duration || 0),
        coverArt: track.thumbnail || (await getPlaylist(playlistId))?.coverArt,
    });

    return track;
}

export async function updateTrack(trackId, updates) {
    const tracks = await getAllTracks();
    const index = tracks.findIndex(t => t.id === trackId);
    if (index === -1) return null;
    tracks[index] = { ...tracks[index], ...updates };
    await AsyncStorage.setItem(TRACKS_KEY, JSON.stringify(tracks));
    return tracks[index];
}

export async function deleteTrack(trackId) {
    const tracks = await getAllTracks();
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    const filtered = tracks.filter(t => t.id !== trackId);
    await AsyncStorage.setItem(TRACKS_KEY, JSON.stringify(filtered));

    // Update playlist
    const remainingPlaylistTracks = filtered.filter(t => t.playlistId === track.playlistId);
    await updatePlaylist(track.playlistId, {
        trackCount: remainingPlaylistTracks.length,
        totalDuration: remainingPlaylistTracks.reduce((sum, t) => sum + (t.duration || 0), 0),
    });
}

// ============= UTILITY =============

export async function clearAllData() {
    await AsyncStorage.multiRemove([PLAYLISTS_KEY, TRACKS_KEY]);
}

export async function getStats() {
    const playlists = await getPlaylists();
    const tracks = await getAllTracks();
    const downloaded = tracks.filter(t => t.downloaded);
    return {
        totalPlaylists: playlists.length,
        totalTracks: tracks.length,
        downloadedTracks: downloaded.length,
        totalDuration: tracks.reduce((sum, t) => sum + (t.duration || 0), 0),
        totalSize: downloaded.reduce((sum, t) => sum + (t.fileSize || 0), 0),
    };
}

export async function moveTracksToPlaylist(trackIds, targetPlaylistId) {
    const tracks = await getAllTracks();
    const movedTracks = [];

    for (const trackId of trackIds) {
        const src = tracks.find(t => t.id === trackId);
        if (!src) continue;
        const targetCount = tracks.filter(t => t.playlistId === targetPlaylistId).length + movedTracks.length;
        movedTracks.push({
            ...src,
            id: generateId(),
            playlistId: targetPlaylistId,
            order: targetCount,
            createdAt: new Date().toISOString(),
        });
    }

    tracks.push(...movedTracks);
    await AsyncStorage.setItem(TRACKS_KEY, JSON.stringify(tracks));

    const targetPlaylist = await getPlaylist(targetPlaylistId);
    const targetName = targetPlaylist?.name || 'Musika';

    const targetTracks = tracks.filter(t => t.playlistId === targetPlaylistId);
    await updatePlaylist(targetPlaylistId, {
        trackCount: targetTracks.length,
        totalDuration: targetTracks.reduce((sum, t) => sum + (t.duration || 0), 0),
        coverArt: movedTracks[0]?.thumbnail || targetPlaylist?.coverArt,
    });

    // Also save copied files to the target playlist's folder on device
    for (const t of movedTracks) {
        if (t.filePath && t.downloaded) {
            const safeName = (t.title || 'track').replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 50).trim();
            await saveToDevice(t.filePath, `${safeName}.mp3`, targetName);
        }
    }

    return movedTracks;
}

export async function deleteMultipleTracks(trackIds) {
    const tracks = await getAllTracks();
    const affectedPlaylists = new Set();
    for (const id of trackIds) {
        const t = tracks.find(t => t.id === id);
        if (t) affectedPlaylists.add(t.playlistId);
    }
    const filtered = tracks.filter(t => !trackIds.includes(t.id));
    await AsyncStorage.setItem(TRACKS_KEY, JSON.stringify(filtered));
    for (const plId of affectedPlaylists) {
        const remaining = filtered.filter(t => t.playlistId === plId);
        await updatePlaylist(plId, {
            trackCount: remaining.length,
            totalDuration: remaining.reduce((sum, t) => sum + (t.duration || 0), 0),
        });
    }
}

// ============= FAVORITES (Liked Songs) =============

export async function getFavorites() {
    try {
        const data = await AsyncStorage.getItem(FAVORITES_KEY);
        return data ? JSON.parse(data) : [];
    } catch { return []; }
}

export async function isFavorite(trackId) {
    const favs = await getFavorites();
    return favs.includes(trackId);
}

export async function toggleFavorite(trackId) {
    const favs = await getFavorites();
    const idx = favs.indexOf(trackId);
    if (idx >= 0) {
        favs.splice(idx, 1);
    } else {
        favs.unshift(trackId);
    }
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
    return idx < 0; // returns true if now favorited
}

export async function getFavoriteTracks() {
    const favIds = await getFavorites();
    if (favIds.length === 0) return [];
    const allTracks = await getAllTracks();
    return favIds
        .map(id => allTracks.find(t => t.id === id))
        .filter(Boolean);
}

// ============= RECENTLY PLAYED =============

export async function getRecentlyPlayed() {
    try {
        const data = await AsyncStorage.getItem(RECENTLY_PLAYED_KEY);
        return data ? JSON.parse(data) : [];
    } catch { return []; }
}

export async function addRecentlyPlayed(track) {
    if (!track?.id) return;
    const recent = await getRecentlyPlayed();
    // Remove existing entry if present
    const filtered = recent.filter(r => r.id !== track.id);
    // Add to front
    filtered.unshift({
        id: track.id,
        title: track.title,
        artist: track.artist,
        thumbnail: track.thumbnail,
        filePath: track.filePath,
        downloaded: track.downloaded,
        playlistId: track.playlistId,
        playedAt: new Date().toISOString(),
    });
    // Cap at MAX_RECENT
    if (filtered.length > MAX_RECENT) filtered.length = MAX_RECENT;
    await AsyncStorage.setItem(RECENTLY_PLAYED_KEY, JSON.stringify(filtered));
}

// ============= SEARCH =============

export async function searchTracks(query) {
    if (!query || query.trim().length === 0) return [];
    const q = query.toLowerCase().trim();
    const allTracks = await getAllTracks();
    return allTracks.filter(t =>
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.artist && t.artist.toLowerCase().includes(q))
    );
}

export async function searchPlaylists(query) {
    if (!query || query.trim().length === 0) return [];
    const q = query.toLowerCase().trim();
    const playlists = await getPlaylists();
    return playlists.filter(p =>
        p.name && p.name.toLowerCase().includes(q)
    );
}
