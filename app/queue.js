import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Image, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import playerService from '../services/player';
import { COLORS, SIZES, FONTS } from '../constants/theme';

export default function QueueScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [playerState, setPlayerState] = useState(playerService.getState());
    const [fadeAnim] = useState(new Animated.Value(0));

    useEffect(() => {
        const unsub = playerService.subscribe(setPlayerState);
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
        }).start();
        return unsub;
    }, []);

    const queue = playerService.getQueue();
    const currentTrack = playerState.currentTrack;
    const upcomingPlaylist = playerService.currentPlaylist.slice(
        playerService.currentIndex + 1
    );

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Queue</Text>
                {queue.length > 0 ? (
                    <TouchableOpacity style={styles.clearBtn} onPress={() => playerService.clearQueue()}>
                        <Text style={styles.clearText}>Clear</Text>
                    </TouchableOpacity>
                ) : (
                    <View style={{ width: 60 }} />
                )}
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <Animated.View style={{ opacity: fadeAnim }}>
                    {/* Now Playing */}
                    {currentTrack && (
                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>NOW PLAYING</Text>
                            <View style={styles.nowPlayingCard}>
                                {currentTrack.thumbnail ? (
                                    <Image source={{ uri: currentTrack.thumbnail }} style={styles.nowThumb} />
                                ) : (
                                    <LinearGradient
                                        colors={[COLORS.primary + '40', COLORS.surfaceLight]}
                                        style={styles.nowThumb}
                                    >
                                        <Ionicons name="musical-note" size={28} color={COLORS.primary} />
                                    </LinearGradient>
                                )}
                                <View style={styles.nowInfo}>
                                    <Text style={styles.nowTitle} numberOfLines={1}>{currentTrack.title}</Text>
                                    <Text style={styles.nowArtist} numberOfLines={1}>{currentTrack.artist}</Text>
                                </View>
                                <View style={styles.playingIndicator}>
                                    <PlayingBars />
                                </View>
                            </View>
                        </View>
                    )}

                    {/* Manual Queue */}
                    {queue.length > 0 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>NEXT IN QUEUE</Text>
                            {queue.map((track, index) => (
                                <View key={`q-${index}`} style={styles.trackRow}>
                                    {track.thumbnail ? (
                                        <Image source={{ uri: track.thumbnail }} style={styles.trackThumb} />
                                    ) : (
                                        <View style={styles.trackThumbPlaceholder}>
                                            <Ionicons name="musical-note" size={14} color={COLORS.textMuted} />
                                        </View>
                                    )}
                                    <View style={styles.trackInfo}>
                                        <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
                                        <Text style={styles.trackArtist} numberOfLines={1}>{track.artist}</Text>
                                    </View>
                                    <TouchableOpacity
                                        style={styles.removeBtn}
                                        onPress={() => playerService.removeFromQueue(index)}
                                    >
                                        <Ionicons name="close-circle-outline" size={22} color={COLORS.textMuted} />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Upcoming from playlist */}
                    {upcomingPlaylist.length > 0 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>NEXT FROM PLAYLIST</Text>
                            {upcomingPlaylist.slice(0, 20).map((track, index) => (
                                <View key={`up-${track.id}-${index}`} style={styles.trackRow}>
                                    <Text style={styles.indexText}>{index + 1}</Text>
                                    {track.thumbnail ? (
                                        <Image source={{ uri: track.thumbnail }} style={styles.trackThumb} />
                                    ) : (
                                        <View style={styles.trackThumbPlaceholder}>
                                            <Ionicons name="musical-note" size={14} color={COLORS.textMuted} />
                                        </View>
                                    )}
                                    <View style={styles.trackInfo}>
                                        <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
                                        <Text style={styles.trackArtist} numberOfLines={1}>{track.artist}</Text>
                                    </View>
                                    <TouchableOpacity
                                        style={styles.addQueueBtn}
                                        onPress={() => playerService.addToQueue(track)}
                                    >
                                        <Ionicons name="add-circle-outline" size={22} color={COLORS.primary} />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Empty Queue */}
                    {!currentTrack && queue.length === 0 && (
                        <View style={styles.empty}>
                            <Ionicons name="list-outline" size={64} color={COLORS.textMuted} />
                            <Text style={styles.emptyTitle}>Your queue is empty</Text>
                            <Text style={styles.emptySubtitle}>
                                Start playing music and{'\n'}your queue will appear here
                            </Text>
                        </View>
                    )}
                </Animated.View>

                <View style={{ height: 140 }} />
            </ScrollView>
        </View>
    );
}

// Small animated playing bars
function PlayingBars() {
    const [bars] = useState(
        Array.from({ length: 3 }, () => new Animated.Value(0.3))
    );

    useEffect(() => {
        const anims = bars.map((bar, i) =>
            Animated.loop(
                Animated.sequence([
                    Animated.timing(bar, {
                        toValue: 0.9,
                        duration: 400 + i * 80,
                        useNativeDriver: true,
                    }),
                    Animated.timing(bar, {
                        toValue: 0.3,
                        duration: 400 + i * 80,
                        useNativeDriver: true,
                    }),
                ])
            )
        );
        anims.forEach(a => a.start());
        return () => anims.forEach(a => a.stop());
    }, []);

    return (
        <View style={styles.bars}>
            {bars.map((bar, i) => (
                <Animated.View
                    key={i}
                    style={[styles.bar, { transform: [{ scaleY: bar }] }]}
                />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SIZES.base,
        paddingVertical: SIZES.sm,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: SIZES.textLg,
        color: COLORS.textPrimary,
        ...FONTS.bold,
    },
    clearBtn: {
        paddingHorizontal: SIZES.md,
        paddingVertical: SIZES.xs,
    },
    clearText: {
        fontSize: SIZES.textSm,
        color: COLORS.primary,
        ...FONTS.semiBold,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: SIZES.lg,
    },
    section: {
        marginTop: SIZES.lg,
    },
    sectionLabel: {
        fontSize: SIZES.textXs,
        color: COLORS.textMuted,
        ...FONTS.bold,
        letterSpacing: 1.5,
        marginBottom: SIZES.md,
    },
    nowPlayingCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.primary + '12',
        borderRadius: SIZES.radiusMd,
        padding: SIZES.md,
        gap: SIZES.md,
        borderWidth: 1,
        borderColor: COLORS.primary + '25',
    },
    nowThumb: {
        width: 56,
        height: 56,
        borderRadius: SIZES.radiusSm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    nowInfo: {
        flex: 1,
    },
    nowTitle: {
        fontSize: SIZES.textBase,
        color: COLORS.primary,
        ...FONTS.semiBold,
    },
    nowArtist: {
        fontSize: SIZES.textSm,
        color: COLORS.textSecondary,
        ...FONTS.regular,
        marginTop: 2,
    },
    playingIndicator: {
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    bars: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 2,
        height: 18,
    },
    bar: {
        width: 3,
        height: 18,
        backgroundColor: COLORS.primary,
        borderRadius: 1.5,
    },
    trackRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SIZES.sm,
        gap: SIZES.md,
    },
    indexText: {
        fontSize: SIZES.textSm,
        color: COLORS.textMuted,
        ...FONTS.medium,
        width: 20,
        textAlign: 'center',
    },
    trackThumb: {
        width: 40,
        height: 40,
        borderRadius: SIZES.radiusSm,
    },
    trackThumbPlaceholder: {
        width: 40,
        height: 40,
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
        marginTop: 1,
    },
    removeBtn: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    addQueueBtn: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    empty: {
        alignItems: 'center',
        paddingTop: 80,
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
