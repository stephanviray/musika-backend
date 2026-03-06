import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Animated, Image, Alert, Dimensions, Modal, FlatList, Vibration,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import TrackItem from '../../components/TrackItem';
import {
    getPlaylist, getPlaylists, getPlaylistTracks, deletePlaylist,
    deleteTrack, updateTrack, deleteMultipleTracks, moveTracksToPlaylist,
} from '../../services/storage';
import { deleteAudioFile, downloadTrack } from '../../services/downloader';
import { extractVideoId } from '../../services/youtube';
import playerService from '../../services/player';
import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';

const { width } = Dimensions.get('window');

export default function PlaylistScreen() {
    const { id } = useLocalSearchParams();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [playlist, setPlaylist] = useState(null);
    const [tracks, setTracks] = useState([]);
    const [scrollY] = useState(new Animated.Value(0));
    const [playerState, setPlayerState] = useState(playerService.getState());

    // Multi-select state
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [allPlaylists, setAllPlaylists] = useState([]);

    const loadData = useCallback(async () => {
        const pl = await getPlaylist(id);
        const tr = await getPlaylistTracks(id);
        setPlaylist(pl);
        setTracks(tr);
    }, [id]);

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 3000);
        return () => clearInterval(interval);
    }, [loadData]);

    useEffect(() => {
        const unsubscribe = playerService.subscribe((state) => {
            setPlayerState(state);
        });
        return unsubscribe;
    }, []);

    // Exit selection mode cleanly
    const exitSelectionMode = () => {
        setSelectionMode(false);
        setSelectedIds(new Set());
    };

    // Toggle a track's selection
    const toggleSelect = (trackId) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(trackId)) {
                next.delete(trackId);
                if (next.size === 0) setSelectionMode(false);
            } else {
                next.add(trackId);
            }
            return next;
        });
    };

    // Long press on a track — enter selection mode
    const handleLongPress = (trackId) => {
        if (!selectionMode) {
            Vibration.vibrate(30);
            setSelectionMode(true);
            setSelectedIds(new Set([trackId]));
        } else {
            toggleSelect(trackId);
        }
    };

    // Select/Deselect all
    const handleSelectAll = () => {
        if (selectedIds.size === tracks.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(tracks.map(t => t.id)));
        }
    };

    // Delete selected tracks
    const handleDeleteSelected = () => {
        const count = selectedIds.size;
        Alert.alert(
            'Delete Tracks',
            `Delete ${count} selected track${count > 1 ? 's' : ''}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        // Delete audio files
                        for (const trackId of selectedIds) {
                            const track = tracks.find(t => t.id === trackId);
                            if (track?.filePath) {
                                await deleteAudioFile(track.filePath);
                            }
                        }
                        await deleteMultipleTracks([...selectedIds]);
                        exitSelectionMode();
                        await loadData();
                    },
                },
            ]
        );
    };

    // Move selected to another playlist
    const handleMoveSelected = async () => {
        const pls = await getPlaylists();
        setAllPlaylists(pls.filter(p => p.id !== id)); // Exclude current playlist
        setShowMoveModal(true);
    };

    const handleMoveToPlaylist = async (targetPlaylist) => {
        setShowMoveModal(false);
        try {
            await moveTracksToPlaylist([...selectedIds], targetPlaylist.id);
            Alert.alert('Done', `Copied ${selectedIds.size} track${selectedIds.size > 1 ? 's' : ''} to "${targetPlaylist.name}"`);
            exitSelectionMode();
        } catch (e) {
            Alert.alert('Error', e.message);
        }
    };

    const handlePlayAll = () => {
        const downloadedTracks = tracks.filter(t => t.downloaded);
        if (downloadedTracks.length > 0) {
            playerService.playTrack(downloadedTracks[0], downloadedTracks, 0);
        }
    };

    const handleShuffle = () => {
        const downloadedTracks = tracks.filter(t => t.downloaded);
        if (downloadedTracks.length > 0) {
            const randomIndex = Math.floor(Math.random() * downloadedTracks.length);
            playerService.isShuffled = true;
            playerService.playTrack(downloadedTracks[randomIndex], downloadedTracks, randomIndex);
        }
    };

    const handlePlayTrack = async (track, index) => {
        if (track.downloaded && track.filePath) {
            const downloadedTracks = tracks.filter(t => t.downloaded);
            const dlIndex = downloadedTracks.findIndex(t => t.id === track.id);
            playerService.playTrack(track, downloadedTracks, dlIndex >= 0 ? dlIndex : 0);
            return;
        }

        if (track.sourceUrl) {
            try {
                const videoId = extractVideoId(track.sourceUrl);
                if (!videoId) return;

                Alert.alert('Retry Download', `Re-download "${track.title}"?`, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Download', onPress: async () => {
                            try {
                                const result = await downloadTrack(videoId);
                                if (result.downloaded && result.filePath) {
                                    await updateTrack(track.id, {
                                        filePath: result.filePath,
                                        fileSize: result.fileSize,
                                        downloaded: true,
                                    });
                                    await loadData();
                                    const updatedTracks = await getPlaylistTracks(id);
                                    const dlTracks = updatedTracks.filter(t => t.downloaded);
                                    const updatedTrack = dlTracks.find(t => t.id === track.id);
                                    if (updatedTrack) {
                                        playerService.playTrack(updatedTrack, dlTracks,
                                            dlTracks.indexOf(updatedTrack));
                                    }
                                } else {
                                    Alert.alert('Download Failed',
                                        'Could not download audio. YouTube may be blocking the request.');
                                }
                            } catch (err) {
                                Alert.alert('Error', err.message);
                            }
                        }
                    },
                ]);
            } catch (e) {
                console.warn('Retry failed:', e.message);
            }
        }
    };

    const handleDeleteTrack = (track) => {
        Alert.alert(
            'Delete Track',
            `Remove "${track.title}" from this playlist?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        if (track.filePath) {
                            await deleteAudioFile(track.filePath);
                        }
                        await deleteTrack(track.id);
                        await loadData();
                    },
                },
            ]
        );
    };

    const handleDeletePlaylist = () => {
        Alert.alert(
            'Delete Playlist',
            `Delete "${playlist?.name}" and all its tracks?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        for (const track of tracks) {
                            if (track.filePath) {
                                await deleteAudioFile(track.filePath);
                            }
                        }
                        await deletePlaylist(id);
                        router.back();
                    },
                },
            ]
        );
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const formatTotalDuration = (seconds) => {
        if (!seconds) return '0 min';
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        if (hrs > 0) return `${hrs} hr ${mins} min`;
        return `${mins} min`;
    };

    const downloadedCount = tracks.filter(t => t.downloaded).length;

    const headerOpacity = scrollY.interpolate({
        inputRange: [0, 150],
        outputRange: [1, 0],
        extrapolate: 'clamp',
    });

    const headerScale = scrollY.interpolate({
        inputRange: [-100, 0],
        outputRange: [1.3, 1],
        extrapolate: 'clamp',
    });

    const sourceIcon = playlist?.source === 'spotify' ? 'logo-youtube'
        : playlist?.source === 'youtube' ? 'logo-youtube'
            : 'musical-notes';

    const sourceColor = playlist?.source === 'spotify' ? '#1DB954'
        : playlist?.source === 'youtube' ? '#FF0000'
            : COLORS.primary;

    if (!playlist) {
        return (
            <View style={[styles.container, { paddingTop: insets.top }]}>
                <View style={styles.loadingContainer}>
                    <Ionicons name="musical-notes" size={48} color={COLORS.textMuted} />
                    <Text style={styles.loadingText}>Loading...</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header — changes based on selection mode */}
            {selectionMode ? (
                <View style={styles.selectionHeader}>
                    <TouchableOpacity style={styles.selHeaderBtn} onPress={exitSelectionMode}>
                        <Ionicons name="close" size={24} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.selHeaderTitle}>
                        {selectedIds.size} selected
                    </Text>
                    <TouchableOpacity style={styles.selHeaderBtn} onPress={handleSelectAll}>
                        <Ionicons
                            name={selectedIds.size === tracks.length ? 'checkbox' : 'checkbox-outline'}
                            size={22}
                            color={COLORS.primary}
                        />
                    </TouchableOpacity>
                </View>
            ) : (
                <View style={styles.floatingHeader}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuBtn} onPress={handleDeletePlaylist}>
                        <Ionicons name="trash-outline" size={22} color={COLORS.danger} />
                    </TouchableOpacity>
                </View>
            )}

            <Animated.ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                    { useNativeDriver: true }
                )}
                scrollEventThrottle={16}
            >
                {/* Playlist Header */}
                {!selectionMode && (
                    <Animated.View
                        style={[
                            styles.playlistHeader,
                            { opacity: headerOpacity, transform: [{ scale: headerScale }] },
                        ]}
                    >
                        <LinearGradient
                            colors={[sourceColor + '40', COLORS.background]}
                            style={styles.headerGradient}
                        >
                            <View style={styles.coverContainer}>
                                {playlist.coverArt || (tracks[0] && tracks[0].thumbnail) ? (
                                    <Image
                                        source={{ uri: playlist.coverArt || tracks[0]?.thumbnail }}
                                        style={styles.coverImage}
                                    />
                                ) : (
                                    <LinearGradient
                                        colors={[sourceColor + '60', sourceColor + '20']}
                                        style={styles.coverPlaceholder}
                                    >
                                        <Ionicons name="musical-notes" size={64} color={sourceColor} />
                                    </LinearGradient>
                                )}
                                <LinearGradient
                                    colors={['transparent', COLORS.background + '80']}
                                    style={styles.coverOverlay}
                                />
                            </View>

                            <Text style={styles.playlistName} numberOfLines={2}>
                                {playlist.name}
                            </Text>
                            <View style={styles.metaRow}>
                                <Ionicons name={sourceIcon} size={14} color={sourceColor} />
                                <Text style={styles.metaText}>
                                    {downloadedCount}/{tracks.length} tracks • {formatTotalDuration(playlist.totalDuration)}
                                </Text>
                            </View>
                        </LinearGradient>
                    </Animated.View>
                )}

                {/* Playback Controls (hidden in selection mode) */}
                {!selectionMode && (
                    <View style={styles.controls}>
                        <TouchableOpacity style={styles.shuffleBtn} onPress={handleShuffle}>
                            <Ionicons name="shuffle" size={20} color={playerState.isShuffled ? COLORS.primary : COLORS.textSecondary} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.controlBtn}
                            onPress={() => playerService.previous()}
                        >
                            <Ionicons name="play-skip-back" size={26} color={COLORS.textPrimary} />
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.playAllBtn} onPress={() => {
                            if (playerState.isPlaying && playerState.currentTrack) {
                                playerService.togglePlay();
                            } else if (playerState.currentTrack && !playerState.isPlaying) {
                                playerService.play();
                            } else {
                                handlePlayAll();
                            }
                        }} activeOpacity={0.8}>
                            <LinearGradient
                                colors={[COLORS.primary, COLORS.primaryDark]}
                                style={styles.playAllGradient}
                            >
                                <Ionicons
                                    name={playerState.isPlaying ? 'pause' : 'play'}
                                    size={30}
                                    color="#fff"
                                    style={!playerState.isPlaying ? { marginLeft: 3 } : undefined}
                                />
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.controlBtn}
                            onPress={() => playerService.next()}
                        >
                            <Ionicons name="play-skip-forward" size={26} color={COLORS.textPrimary} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.shuffleBtn}
                            onPress={() => playerService.toggleLoop()}
                        >
                            <Ionicons name="repeat" size={20} color={playerState.isLooping ? COLORS.primary : COLORS.textSecondary} />
                        </TouchableOpacity>
                    </View>
                )}

                {/* Track List */}
                <View style={styles.trackList}>
                    {tracks.length === 0 ? (
                        <View style={styles.emptyTracks}>
                            <Text style={styles.emptyText}>No tracks yet</Text>
                        </View>
                    ) : (
                        tracks.map((track, index) => (
                            <TrackItem
                                key={track.id}
                                track={track}
                                index={index}
                                onPress={() => handlePlayTrack(track, index)}
                                onDelete={() => handleDeleteTrack(track)}
                                onLongPress={() => handleLongPress(track.id)}
                                isPlaying={
                                    playerState.currentTrack?.id === track.id && playerState.isPlaying
                                }
                                selectionMode={selectionMode}
                                isSelected={selectedIds.has(track.id)}
                            />
                        ))
                    )}
                </View>

                <View style={{ height: 140 }} />
            </Animated.ScrollView>

            {/* Selection Action Bar */}
            {selectionMode && selectedIds.size > 0 && (
                <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
                    <TouchableOpacity style={styles.actionBtn} onPress={handleMoveSelected}>
                        <Ionicons name="folder-open-outline" size={22} color={COLORS.primary} />
                        <Text style={styles.actionText}>Copy to</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn} onPress={handleDeleteSelected}>
                        <Ionicons name="trash-outline" size={22} color={COLORS.danger} />
                        <Text style={[styles.actionText, { color: COLORS.danger }]}>Delete</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Move to Playlist Modal */}
            <Modal visible={showMoveModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { paddingBottom: insets.bottom + 16 }]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Copy to Playlist</Text>
                            <TouchableOpacity onPress={() => setShowMoveModal(false)}>
                                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
                            </TouchableOpacity>
                        </View>

                        {allPlaylists.length === 0 ? (
                            <View style={styles.modalEmpty}>
                                <Ionicons name="albums-outline" size={48} color={COLORS.textMuted} />
                                <Text style={styles.modalEmptyText}>No other playlists</Text>
                            </View>
                        ) : (
                            <FlatList
                                data={allPlaylists}
                                keyExtractor={(item) => item.id}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={styles.playlistItem}
                                        onPress={() => handleMoveToPlaylist(item)}
                                    >
                                        <View style={styles.playlistItemIcon}>
                                            <Ionicons name="musical-notes" size={20} color={COLORS.primary} />
                                        </View>
                                        <View style={styles.playlistItemInfo}>
                                            <Text style={styles.playlistItemName} numberOfLines={1}>
                                                {item.name}
                                            </Text>
                                            <Text style={styles.playlistItemMeta}>
                                                {item.trackCount || 0} tracks
                                            </Text>
                                        </View>
                                        <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                                    </TouchableOpacity>
                                )}
                                style={styles.playlistList}
                            />
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        fontSize: SIZES.textBase,
        color: COLORS.textMuted,
        marginTop: SIZES.md,
    },
    // Selection mode header
    selectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SIZES.base,
        paddingVertical: SIZES.sm,
        backgroundColor: COLORS.surface,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.surfaceLight,
        zIndex: 10,
    },
    selHeaderBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    selHeaderTitle: {
        fontSize: SIZES.textLg,
        color: COLORS.textPrimary,
        ...FONTS.semiBold,
    },
    // Normal header
    floatingHeader: {
        position: 'absolute',
        top: 50,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: SIZES.base,
        zIndex: 10,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: COLORS.overlay,
        alignItems: 'center',
        justifyContent: 'center',
    },
    menuBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: COLORS.overlay,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: SIZES.xxxl,
    },
    playlistHeader: {
        alignItems: 'center',
    },
    headerGradient: {
        width: '100%',
        alignItems: 'center',
        paddingTop: SIZES.xxxl + 20,
        paddingBottom: SIZES.lg,
    },
    coverContainer: {
        width: width * 0.55,
        height: width * 0.55,
        borderRadius: SIZES.radiusMd,
        overflow: 'hidden',
        ...SHADOWS.large,
    },
    coverImage: {
        width: '100%',
        height: '100%',
        borderRadius: SIZES.radiusMd,
    },
    coverPlaceholder: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: SIZES.radiusMd,
    },
    coverOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 40,
    },
    playlistName: {
        fontSize: SIZES.text2xl,
        color: COLORS.textPrimary,
        ...FONTS.bold,
        textAlign: 'center',
        marginTop: SIZES.lg,
        paddingHorizontal: SIZES.xl,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SIZES.xs,
        marginTop: SIZES.sm,
    },
    metaText: {
        fontSize: SIZES.textSm,
        color: COLORS.textSecondary,
        ...FONTS.medium,
    },
    controls: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: SIZES.lg,
        gap: SIZES.lg,
        marginVertical: SIZES.base,
        paddingVertical: SIZES.sm,
    },
    controlBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: COLORS.surfaceLight,
        alignItems: 'center',
        justifyContent: 'center',
    },
    shuffleBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: COLORS.surfaceLight,
        alignItems: 'center',
        justifyContent: 'center',
    },
    playAllBtn: {
        borderRadius: SIZES.radiusFull,
        overflow: 'hidden',
        ...SHADOWS.glow,
    },
    playAllGradient: {
        width: 60,
        height: 60,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center',
    },
    trackList: {
        paddingHorizontal: SIZES.base,
    },
    emptyTracks: {
        padding: SIZES.xxxl,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: SIZES.textBase,
        color: COLORS.textMuted,
    },
    // Action Bar (bottom)
    actionBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        alignItems: 'center',
        backgroundColor: COLORS.surface,
        borderTopWidth: 1,
        borderTopColor: COLORS.surfaceLight,
        paddingTop: 12,
    },
    actionBtn: {
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 20,
        paddingVertical: 6,
    },
    actionText: {
        fontSize: SIZES.textXs,
        color: COLORS.primary,
        ...FONTS.medium,
    },
    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: COLORS.surface,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '60%',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: SIZES.base,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.surfaceLight,
    },
    modalTitle: {
        fontSize: SIZES.textLg,
        color: COLORS.textPrimary,
        ...FONTS.semiBold,
    },
    modalEmpty: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: SIZES.xxxl,
    },
    modalEmptyText: {
        fontSize: SIZES.textBase,
        color: COLORS.textMuted,
        marginTop: SIZES.md,
    },
    playlistList: {
        padding: SIZES.sm,
    },
    playlistItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: SIZES.md,
        gap: SIZES.md,
        borderRadius: SIZES.radiusSm,
    },
    playlistItemIcon: {
        width: 44,
        height: 44,
        borderRadius: SIZES.radiusSm,
        backgroundColor: COLORS.primary + '15',
        alignItems: 'center',
        justifyContent: 'center',
    },
    playlistItemInfo: {
        flex: 1,
    },
    playlistItemName: {
        fontSize: SIZES.textBase,
        color: COLORS.textPrimary,
        ...FONTS.medium,
    },
    playlistItemMeta: {
        fontSize: SIZES.textSm,
        color: COLORS.textSecondary,
        marginTop: 2,
    },
});
