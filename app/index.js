import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    RefreshControl, Animated, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import PlaylistCard from '../components/PlaylistCard';
import ImportModal from '../components/ImportModal';
import { getPlaylists, getStats, createPlaylist } from '../services/storage';
import { COLORS, SIZES, FONTS } from '../constants/theme';

const { width } = Dimensions.get('window');

export default function LibraryScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [playlists, setPlaylists] = useState([]);
    const [stats, setStats] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [fadeAnim] = useState(new Animated.Value(0));
    const [slideAnim] = useState(new Animated.Value(30));

    const loadData = useCallback(async () => {
        const [pl, st] = await Promise.all([getPlaylists(), getStats()]);
        setPlaylists(pl);
        setStats(st);
    }, []);

    useEffect(() => {
        loadData();
        // Entrance animation
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

    // Refresh when returning to this screen
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

    const formatDuration = (seconds) => {
        if (!seconds) return '0 min';
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        if (hrs > 0) return `${hrs}h ${mins}m`;
        return `${mins} min`;
    };

    const formatSize = (bytes) => {
        if (!bytes) return '0 MB';
        const mb = bytes / (1024 * 1024);
        if (mb > 1024) return `${(mb / 1024).toFixed(1)} GB`;
        return `${mb.toFixed(0)} MB`;
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header */}
            <LinearGradient
                colors={[COLORS.primary + '30', COLORS.background]}
                style={styles.headerGradient}
            >
                <View style={styles.header}>
                    <View>
                        <Text style={styles.greeting}>Your Music</Text>
                        <Text style={styles.title}>Musika</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.settingsBtn}
                        onPress={handleCreatePlaylist}
                    >
                        <Ionicons name="add-circle" size={28} color={COLORS.primary} />
                    </TouchableOpacity>
                </View>

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
            </LinearGradient>

            {/* Playlists */}
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
                <Text style={styles.sectionTitle}>Your Playlists</Text>

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

                {/* Bottom spacing for mini player */}
                <View style={{ height: 140 }} />
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
        paddingBottom: SIZES.lg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: SIZES.base,
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
    settingsBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: COLORS.surfaceLight,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statsRow: {
        flexDirection: 'row',
        gap: SIZES.sm,
        marginTop: SIZES.sm,
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
    content: {
        flex: 1,
    },
    contentContainer: {
        paddingHorizontal: SIZES.lg,
    },
    sectionTitle: {
        fontSize: SIZES.textXl,
        color: COLORS.textPrimary,
        ...FONTS.bold,
        marginBottom: SIZES.base,
        marginTop: SIZES.sm,
    },
    emptyState: {
        marginTop: SIZES.xl,
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
        bottom: 90,
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
