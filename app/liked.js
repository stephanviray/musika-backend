import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Animated, Image, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { getFavoriteTracks, toggleFavorite } from '../services/storage';
import playerService from '../services/player';
import { COLORS, SIZES, FONTS, SHADOWS } from '../constants/theme';

const { width } = Dimensions.get('window');

export default function LikedSongsScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [tracks, setTracks] = useState([]);
    const [playerState, setPlayerState] = useState(playerService.getState());
    const [fadeAnim] = useState(new Animated.Value(0));

    const loadData = useCallback(async () => {
        const favTracks = await getFavoriteTracks();
        setTracks(favTracks);
    }, []);

    useEffect(() => {
        loadData();
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
        }).start();
    }, []);

    useEffect(() => {
        const unsub = playerService.subscribe(setPlayerState);
        return unsub;
    }, []);

    useEffect(() => {
        const interval = setInterval(loadData, 3000);
        return () => clearInterval(interval);
    }, [loadData]);

    const handlePlayAll = () => {
        const dl = tracks.filter(t => t.downloaded);
        if (dl.length > 0) {
            playerService.playTrack(dl[0], dl, 0);
        }
    };

    const handleShuffle = () => {
        const dl = tracks.filter(t => t.downloaded);
        if (dl.length > 0) {
            const i = Math.floor(Math.random() * dl.length);
            playerService.isShuffled = true;
            playerService.playTrack(dl[i], dl, i);
        }
    };

    const handlePlayTrack = (track) => {
        if (track.downloaded && track.filePath) {
            const dl = tracks.filter(t => t.downloaded);
            const idx = dl.findIndex(t => t.id === track.id);
            playerService.playTrack(track, dl, idx >= 0 ? idx : 0);
        }
    };

    const handleUnlike = async (trackId) => {
        await toggleFavorite(trackId);
        loadData();
    };

    const downloadedCount = tracks.filter(t => t.downloaded).length;

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={styles.topBar}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero */}
                <Animated.View style={[styles.hero, { opacity: fadeAnim }]}>
                    <LinearGradient
                        colors={['#8B5CF620', '#3B82F610', COLORS.background]}
                        style={styles.heroGradient}
                    >
                        <View style={styles.heroIcon}>
                            <LinearGradient
                                colors={['#8B5CF6', '#3B82F6']}
                                style={styles.heroIconGradient}
                            >
                                <Ionicons name="heart" size={48} color="#fff" />
                            </LinearGradient>
                        </View>
                        <Text style={styles.heroTitle}>Liked Songs</Text>
                        <Text style={styles.heroMeta}>
                            {tracks.length} song{tracks.length !== 1 ? 's' : ''} • {downloadedCount} downloaded
                        </Text>
                    </LinearGradient>
                </Animated.View>

                {/* Controls */}
                {tracks.length > 0 && (
                    <View style={styles.controls}>
                        <TouchableOpacity style={styles.shuffleBtn} onPress={handleShuffle}>
                            <Ionicons name="shuffle" size={20} color={COLORS.textSecondary} />
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.playAllBtn} onPress={handlePlayAll} activeOpacity={0.8}>
                            <LinearGradient
                                colors={[COLORS.primary, COLORS.primaryDark]}
                                style={styles.playAllGradient}
                            >
                                <Ionicons name="play" size={28} color="#fff" style={{ marginLeft: 3 }} />
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Track List */}
                {tracks.length === 0 ? (
                    <View style={styles.empty}>
                        <Ionicons name="heart-outline" size={64} color={COLORS.textMuted} />
                        <Text style={styles.emptyTitle}>No liked songs yet</Text>
                        <Text style={styles.emptySubtitle}>
                            Tap the heart icon on any track{'\n'}to save it here
                        </Text>
                    </View>
                ) : (
                    tracks.map((track, index) => {
                        const isCurrentlyPlaying = playerState.currentTrack?.id === track.id && playerState.isPlaying;
                        return (
                            <TouchableOpacity
                                key={track.id}
                                style={[styles.trackRow, isCurrentlyPlaying && styles.trackRowActive]}
                                onPress={() => handlePlayTrack(track)}
                                activeOpacity={0.6}
                            >
                                {track.thumbnail ? (
                                    <Image source={{ uri: track.thumbnail }} style={styles.trackThumb} />
                                ) : (
                                    <View style={styles.trackThumbPlaceholder}>
                                        <Ionicons name="musical-note" size={16} color={COLORS.textMuted} />
                                    </View>
                                )}
                                <View style={styles.trackInfo}>
                                    <Text style={[styles.trackTitle, isCurrentlyPlaying && { color: COLORS.primary }]} numberOfLines={1}>
                                        {track.title}
                                    </Text>
                                    <Text style={styles.trackArtist} numberOfLines={1}>{track.artist}</Text>
                                </View>
                                <TouchableOpacity
                                    style={styles.heartBtn}
                                    onPress={() => handleUnlike(track.id)}
                                >
                                    <Ionicons name="heart" size={20} color={COLORS.primary} />
                                </TouchableOpacity>
                            </TouchableOpacity>
                        );
                    })
                )}

                <View style={{ height: 140 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    topBar: {
        paddingHorizontal: SIZES.base,
        paddingVertical: SIZES.sm,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: COLORS.overlay,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: SIZES.xxxl,
    },
    hero: {
        alignItems: 'center',
        marginBottom: SIZES.md,
    },
    heroGradient: {
        width: '100%',
        alignItems: 'center',
        paddingVertical: SIZES.xxl,
    },
    heroIcon: {
        borderRadius: SIZES.radiusMd,
        overflow: 'hidden',
        ...SHADOWS.large,
    },
    heroIconGradient: {
        width: width * 0.4,
        height: width * 0.4,
        borderRadius: SIZES.radiusMd,
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroTitle: {
        fontSize: SIZES.text2xl,
        color: COLORS.textPrimary,
        ...FONTS.bold,
        marginTop: SIZES.lg,
    },
    heroMeta: {
        fontSize: SIZES.textSm,
        color: COLORS.textSecondary,
        ...FONTS.medium,
        marginTop: SIZES.xs,
    },
    controls: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingHorizontal: SIZES.lg,
        gap: SIZES.lg,
        marginBottom: SIZES.base,
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
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    trackRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SIZES.md,
        paddingHorizontal: SIZES.lg,
        gap: SIZES.md,
    },
    trackRowActive: {
        backgroundColor: COLORS.primary + '10',
    },
    trackThumb: {
        width: 44,
        height: 44,
        borderRadius: SIZES.radiusSm,
    },
    trackThumbPlaceholder: {
        width: 44,
        height: 44,
        borderRadius: SIZES.radiusSm,
        backgroundColor: COLORS.surfaceLight,
        alignItems: 'center',
        justifyContent: 'center',
    },
    trackInfo: {
        flex: 1,
    },
    trackTitle: {
        fontSize: SIZES.textBase,
        color: COLORS.textPrimary,
        ...FONTS.medium,
    },
    trackArtist: {
        fontSize: SIZES.textSm,
        color: COLORS.textSecondary,
        ...FONTS.regular,
        marginTop: 2,
    },
    heartBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    empty: {
        alignItems: 'center',
        paddingTop: 60,
    },
    emptyTitle: {
        fontSize: SIZES.textXl,
        color: COLORS.textPrimary,
        ...FONTS.bold,
        marginTop: SIZES.lg,
    },
    emptySubtitle: {
        fontSize: SIZES.textBase,
        color: COLORS.textMuted,
        ...FONTS.regular,
        textAlign: 'center',
        marginTop: SIZES.sm,
        lineHeight: 22,
    },
});
