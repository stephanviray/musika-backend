import AsyncStorage from '@react-native-async-storage/async-storage';

const PLAYLISTS_KEY = '@musika_playlists';
const TRACKS_KEY = '@musika_tracks';

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
