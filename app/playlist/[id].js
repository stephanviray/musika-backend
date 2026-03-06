import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Animated, Image, Alert, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import TrackItem from '../../components/TrackItem';
import { getPlaylist, getPlaylistTracks, deletePlaylist, deleteTrack, updateTrack } from '../../services/storage';
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

        // Track not downloaded — try to re-download
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
                                    // Auto play the newly downloaded track
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
                        // Delete all audio files
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

    // Header image opacity based on scroll
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
            {/* Back Button (floating) */}
            <View style={styles.floatingHeader}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuBtn} onPress={handleDeletePlaylist}>
                    <Ionicons name="trash-outline" size={22} color={COLORS.danger} />
                </TouchableOpacity>
            </View>

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
                        {/* Cover Art */}
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

                        {/* Playlist Info */}
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

                {/* Playback Controls */}
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
                                isPlaying={
                                    playerState.currentTrack?.id === track.id && playerState.isPlaying
                                }
                            />
                        ))
                    )}
                </View>

                {/* Bottom spacing */}
                <View style={{ height: 140 }} />
            </Animated.ScrollView>
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
});
