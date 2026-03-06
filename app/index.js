import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    RefreshControl, Animated, Dimensions, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import PlaylistCard from '../components/PlaylistCard';
import ImportModal from '../components/ImportModal';
import { getPlaylists, getStats, createPlaylist, getRecentlyPlayed, getFavoriteTracks } from '../services/storage';
import playerService from '../services/player';
import { COLORS, SIZES, FONTS, SHADOWS } from '../constants/theme';

const { width } = Dimensions.get('window');

function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
}

export default function LibraryScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [playlists, setPlaylists] = useState([]);
    const [stats, setStats] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [fadeAnim] = useState(new Animated.Value(0));
    const [slideAnim] = useState(new Animated.Value(30));
    const [recentlyPlayed, setRecentlyPlayed] = useState([]);
    const [likedCount, setLikedCount] = useState(0);

    const loadData = useCallback(async () => {
        const [pl, st, recent, liked] = await Promise.all([
            getPlaylists(),
            getStats(),
            getRecentlyPlayed(),
            getFavoriteTracks(),
        ]);
        setPlaylists(pl);
        setStats(st);
        setRecentlyPlayed(recent.slice(0, 8));
        setLikedCount(liked.length);
    }, []);

    useEffect(() => {
        loadData();
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 600,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    useEffect(() => {
        const interval = setInterval(loadData, 2000);
        return () => clearInterval(interval);
    }, [loadData]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    }, [loadData]);

    const handleCreatePlaylist = async () => {
        const playlist = await createPlaylist('New Playlist');
        await loadData();
        router.push(`/playlist/${playlist.id}`);
    };

    const handlePlayRecent = (track) => {
        if (track.downloaded && track.filePath) {
            playerService.playTrack(track, [track], 0);
        }
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '0 min';
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        if (hrs > 0) return `${hrs}h ${mins}m`;
        return `${mins} min`;
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header */}
            <LinearGradient
                colors={[COLORS.primary + '20', COLORS.background]}
                style={styles.headerGradient}
            >
                <View style={styles.header}>
                    <View>
                        <Text style={styles.greeting}>{getGreeting()}</Text>
                        <Text style={styles.title}>Musika</Text>
                    </View>
                    <View style={styles.headerActions}>
                        <TouchableOpacity
                            style={styles.headerActionBtn}
                            onPress={handleCreatePlaylist}
                        >
                            <Ionicons name="add-circle" size={26} color={COLORS.primary} />
                        </TouchableOpacity>
                    </View>
                </View>
            </LinearGradient>

            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentContainer}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={COLORS.primary}
                        colors={[COLORS.primary]}
                    />
                }
                showsVerticalScrollIndicator={false}
            >
                {/* Quick Access Grid - Spotify-style chips */}
                <Animated.View
                    style={[
                        styles.quickAccess,
                        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
                    ]}
                >
                    {/* Liked Songs chip */}
                    <TouchableOpacity
                        style={styles.quickChip}
                        onPress={() => router.push('/liked')}
                        activeOpacity={0.7}
                    >
                        <LinearGradient
                            colors={['#8B5CF6', '#3B82F6']}
                            style={styles.chipIcon}
                        >
                            <Ionicons name="heart" size={14} color="#fff" />
                        </LinearGradient>
                        <Text style={styles.chipText} numberOfLines={1}>Liked Songs</Text>
                    </TouchableOpacity>

                    {/* Recently Played chip - to queue */}
                    <TouchableOpacity
                        style={styles.quickChip}
                        onPress={() => router.push('/queue')}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.chipIcon, { backgroundColor: COLORS.primary + '30' }]}>
                            <Ionicons name="list" size={14} color={COLORS.primary} />
                        </View>
                        <Text style={styles.chipText} numberOfLines={1}>Queue</Text>
                    </TouchableOpacity>

                    {/* Show first 4 playlists as quick chips */}
                    {playlists.slice(0, 4).map((pl) => (
                        <TouchableOpacity
                            key={pl.id}
                            style={styles.quickChip}
                            onPress={() => router.push(`/playlist/${pl.id}`)}
                            activeOpacity={0.7}
                        >
                            {pl.coverArt ? (
                                <Image source={{ uri: pl.coverArt }} style={styles.chipCover} />
                            ) : (
                                <View style={[styles.chipIcon, { backgroundColor: COLORS.surfaceHighlight }]}>
                                    <Ionicons name="musical-notes" size={14} color={COLORS.textSecondary} />
                                </View>
                            )}
                            <Text style={styles.chipText} numberOfLines={1}>{pl.name}</Text>
                        </TouchableOpacity>
                    ))}
                </Animated.View>

                {/* Recently Played */}
                {recentlyPlayed.length > 0 && (
                    <Animated.View
                        style={[styles.section, { opacity: fadeAnim }]}
                    >
                        <Text style={styles.sectionTitle}>Recently Played</Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.recentScroll}
                            contentContainerStyle={{ paddingHorizontal: SIZES.lg }}
                        >
                            {recentlyPlayed.map((track, i) => (
                                <TouchableOpacity
                                    key={`${track.id}-${i}`}
                                    style={styles.recentCard}
                                    onPress={() => handlePlayRecent(track)}
                                    activeOpacity={0.7}
                                >
                                    {track.thumbnail ? (
                                        <Image source={{ uri: track.thumbnail }} style={styles.recentThumb} />
                                    ) : (
                                        <LinearGradient
                                            colors={[COLORS.primary + '40', COLORS.surfaceLight]}
                                            style={[styles.recentThumb, { alignItems: 'center', justifyContent: 'center' }]}
                                        >
                                            <Ionicons name="musical-note" size={28} color={COLORS.primary} />
                                        </LinearGradient>
                                    )}
                                    <Text style={styles.recentTitle} numberOfLines={2}>{track.title}</Text>
                                    <Text style={styles.recentArtist} numberOfLines={1}>{track.artist}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </Animated.View>
                )}

                {/* Stats Cards */}
                {stats && (
                    <Animated.View
                        style={[
                            styles.statsRow,
                            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
                        ]}
                    >
                        <View style={styles.statCard}>
                            <LinearGradient
                                colors={[COLORS.primary + '20', COLORS.primary + '05']}
                                style={styles.statCardGradient}
                            >
                                <Ionicons name="musical-notes" size={20} color={COLORS.primary} />
                                <Text style={styles.statValue}>{stats.totalTracks}</Text>
                                <Text style={styles.statLabel}>Tracks</Text>
                            </LinearGradient>
                        </View>
                        <View style={styles.statCard}>
                            <LinearGradient
                                colors={[COLORS.accent + '20', COLORS.accent + '05']}
                                style={styles.statCardGradient}
                            >
                                <Ionicons name="list" size={20} color={COLORS.accent} />
                                <Text style={styles.statValue}>{stats.totalPlaylists}</Text>
                                <Text style={styles.statLabel}>Playlists</Text>
                            </LinearGradient>
                        </View>
                        <View style={styles.statCard}>
                            <LinearGradient
                                colors={[COLORS.accentBlue + '20', COLORS.accentBlue + '05']}
                                style={styles.statCardGradient}
                            >
                                <Ionicons name="time" size={20} color={COLORS.accentBlue} />
                                <Text style={styles.statValue}>{formatDuration(stats.totalDuration)}</Text>
                                <Text style={styles.statLabel}>Duration</Text>
                            </LinearGradient>
                        </View>
                    </Animated.View>
                )}

                {/* Your Playlists */}
                <Text style={styles.sectionTitle2}>Your Playlists</Text>

                {playlists.length === 0 ? (
                    <Animated.View
                        style={[
                            styles.emptyState,
                            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
                        ]}
                    >
                        <LinearGradient
                            colors={[COLORS.surfaceLight, COLORS.surface]}
                            style={styles.emptyCard}
                        >
                            <Ionicons name="musical-notes-outline" size={64} color={COLORS.textMuted} />
                            <Text style={styles.emptyTitle}>No playlists yet</Text>
                            <Text style={styles.emptySubtitle}>
                                Import your favorite playlists from{'\n'}Spotify or YouTube
                            </Text>
                            <TouchableOpacity
                                style={styles.importBtnLarge}
                                onPress={() => setShowImport(true)}
                                activeOpacity={0.8}
                            >
                                <LinearGradient
                                    colors={[COLORS.primary, COLORS.primaryDark]}
                                    style={styles.importBtnGradient}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                >
                                    <Ionicons name="link" size={20} color="#fff" />
                                    <Text style={styles.importBtnText}>Paste Playlist Link</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </LinearGradient>
                    </Animated.View>
                ) : (
                    <Animated.View style={{ opacity: fadeAnim }}>
                        {playlists.map((playlist, index) => (
                            <PlaylistCard
                                key={playlist.id}
                                playlist={playlist}
                                index={index}
                                onPress={() => router.push(`/playlist/${playlist.id}`)}
                            />
                        ))}
                    </Animated.View>
                )}

                {/* Bottom spacing for mini player + tab bar */}
                <View style={{ height: 180 }} />
            </ScrollView>

            {/* FAB - Import Button */}
            <TouchableOpacity
                style={styles.fab}
                onPress={() => setShowImport(true)}
                activeOpacity={0.8}
            >
                <LinearGradient
                    colors={[COLORS.primary, COLORS.primaryDark]}
                    style={styles.fabGradient}
                >
                    <Ionicons name="download" size={26} color="#fff" />
                </LinearGradient>
            </TouchableOpacity>

            {/* Import Modal */}
            <ImportModal
                visible={showImport}
                onClose={() => setShowImport(false)}
                onImportComplete={loadData}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    headerGradient: {
        paddingHorizontal: SIZES.lg,
        paddingBottom: SIZES.sm,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: SIZES.sm,
    },
    headerActions: {
        flexDirection: 'row',
        gap: SIZES.sm,
    },
    headerActionBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: COLORS.surfaceLight,
        alignItems: 'center',
        justifyContent: 'center',
    },
    greeting: {
        fontSize: SIZES.textSm,
        color: COLORS.textSecondary,
        ...FONTS.medium,
    },
    title: {
        fontSize: SIZES.text3xl,
        color: COLORS.textPrimary,
        ...FONTS.extraBold,
        letterSpacing: -0.5,
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        paddingTop: SIZES.xs,
    },
    // Quick Access Grid (Spotify-style chips)
    quickAccess: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: SIZES.lg,
        gap: SIZES.sm,
        marginBottom: SIZES.lg,
    },
    quickChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.surface,
        borderRadius: SIZES.radiusSm,
        paddingRight: SIZES.md,
        gap: SIZES.sm,
        width: (width - SIZES.lg * 2 - SIZES.sm) / 2,
        height: 48,
        overflow: 'hidden',
    },
    chipIcon: {
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: SIZES.radiusSm,
    },
    chipCover: {
        width: 48,
        height: 48,
        borderRadius: SIZES.radiusSm,
    },
    chipText: {
        flex: 1,
        fontSize: SIZES.textSm,
        color: COLORS.textPrimary,
        ...FONTS.semiBold,
    },
    // Sections
    section: {
        marginBottom: SIZES.lg,
    },
    sectionTitle: {
        fontSize: SIZES.textXl,
        color: COLORS.textPrimary,
        ...FONTS.bold,
        paddingHorizontal: SIZES.lg,
        marginBottom: SIZES.md,
    },
    sectionTitle2: {
        fontSize: SIZES.textXl,
        color: COLORS.textPrimary,
        ...FONTS.bold,
        paddingHorizontal: SIZES.lg,
        marginBottom: SIZES.base,
        marginTop: SIZES.sm,
    },
    // Recently Played horizontal cards
    recentScroll: {
        marginHorizontal: -SIZES.lg,
    },
    recentCard: {
        width: 140,
        marginRight: SIZES.md,
    },
    recentThumb: {
        width: 140,
        height: 140,
        borderRadius: SIZES.radiusMd,
        marginBottom: SIZES.sm,
    },
    recentTitle: {
        fontSize: SIZES.textSm,
        color: COLORS.textPrimary,
        ...FONTS.medium,
    },
    recentArtist: {
        fontSize: SIZES.textXs,
        color: COLORS.textMuted,
        ...FONTS.regular,
        marginTop: 2,
    },
    // Stats
    statsRow: {
        flexDirection: 'row',
        gap: SIZES.sm,
        paddingHorizontal: SIZES.lg,
        marginBottom: SIZES.lg,
    },
    statCard: {
        flex: 1,
        borderRadius: SIZES.radiusMd,
        overflow: 'hidden',
    },
    statCardGradient: {
        padding: SIZES.md,
        alignItems: 'center',
        borderRadius: SIZES.radiusMd,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    statValue: {
        fontSize: SIZES.textLg,
        color: COLORS.textPrimary,
        ...FONTS.bold,
        marginTop: SIZES.xs,
    },
    statLabel: {
        fontSize: SIZES.textXs,
        color: COLORS.textMuted,
        ...FONTS.medium,
        marginTop: 2,
    },
    // Empty state
    emptyState: {
        marginTop: SIZES.xl,
        paddingHorizontal: SIZES.lg,
    },
    emptyCard: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: SIZES.xxxl,
        borderRadius: SIZES.radiusLg,
        borderWidth: 1,
        borderColor: COLORS.border,
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
    importBtnLarge: {
        marginTop: SIZES.xl,
        borderRadius: SIZES.radiusFull,
        overflow: 'hidden',
    },
    importBtnGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SIZES.sm,
        paddingHorizontal: SIZES.xl,
        paddingVertical: SIZES.md,
    },
    importBtnText: {
        fontSize: SIZES.textBase,
        color: '#fff',
        ...FONTS.semiBold,
    },
    fab: {
        position: 'absolute',
        bottom: 130,
        right: SIZES.lg,
        borderRadius: SIZES.radiusFull,
        overflow: 'hidden',
        elevation: 8,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
    },
    fabGradient: {
        width: 58,
        height: 58,
        borderRadius: 29,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
