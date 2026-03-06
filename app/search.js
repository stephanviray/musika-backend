import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    ScrollView, Image, Animated, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { searchTracks, searchPlaylists, getRecentlyPlayed } from '../services/storage';
import playerService from '../services/player';
import { COLORS, SIZES, FONTS, SHADOWS } from '../constants/theme';

const { width } = Dimensions.get('window');

export default function SearchScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [tracks, setTracks] = useState([]);
    const [playlists, setPlaylists] = useState([]);
    const [recentlyPlayed, setRecentlyPlayed] = useState([]);
    const [searching, setSearching] = useState(false);
    const [fadeAnim] = useState(new Animated.Value(0));
    const inputRef = useRef(null);
    const debounceTimer = useRef(null);

    useEffect(() => {
        loadRecent();
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
        }).start();
        setTimeout(() => inputRef.current?.focus(), 300);
    }, []);

    const loadRecent = async () => {
        const recent = await getRecentlyPlayed();
        setRecentlyPlayed(recent.slice(0, 10));
    };

    const handleSearch = (text) => {
        setQuery(text);
        if (debounceTimer.current) clearTimeout(debounceTimer.current);

        if (!text.trim()) {
            setTracks([]);
            setPlaylists([]);
            setSearching(false);
            return;
        }

        setSearching(true);
        debounceTimer.current = setTimeout(async () => {
            const [foundTracks, foundPlaylists] = await Promise.all([
                searchTracks(text),
                searchPlaylists(text),
            ]);
            setTracks(foundTracks);
            setPlaylists(foundPlaylists);
            setSearching(false);
        }, 300);
    };

    const handlePlayTrack = (track) => {
        if (track.downloaded && track.filePath) {
            playerService.playTrack(track, [track], 0);
        }
    };

    const hasResults = tracks.length > 0 || playlists.length > 0;
    const showRecent = !query.trim() && recentlyPlayed.length > 0;

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Search Header */}
            <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
                <Text style={styles.title}>Search</Text>
                <Text style={styles.subtitle}>Find your downloaded music</Text>

                {/* Search Input */}
                <View style={styles.searchBar}>
                    <Ionicons name="search" size={20} color={COLORS.textMuted} />
                    <TextInput
                        ref={inputRef}
                        style={styles.searchInput}
                        placeholder="Songs, artists, playlists..."
                        placeholderTextColor={COLORS.textMuted}
                        value={query}
                        onChangeText={handleSearch}
                        selectionColor={COLORS.primary}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    {query.length > 0 && (
                        <TouchableOpacity onPress={() => handleSearch('')}>
                            <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
                        </TouchableOpacity>
                    )}
                </View>
            </Animated.View>

            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentContainer}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Recently Played (shown when no query) */}
                {showRecent && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="time-outline" size={18} color={COLORS.primary} />
                            <Text style={styles.sectionTitle}>Recently Played</Text>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recentScroll}>
                            {recentlyPlayed.map((track, i) => (
                                <TouchableOpacity
                                    key={`${track.id}-${i}`}
                                    style={styles.recentCard}
                                    onPress={() => handlePlayTrack(track)}
                                    activeOpacity={0.7}
                                >
                                    {track.thumbnail ? (
                                        <Image source={{ uri: track.thumbnail }} style={styles.recentThumb} />
                                    ) : (
                                        <LinearGradient
                                            colors={[COLORS.primary + '40', COLORS.surfaceLight]}
                                            style={styles.recentThumb}
                                        >
                                            <Ionicons name="musical-note" size={24} color={COLORS.primary} />
                                        </LinearGradient>
                                    )}
                                    <Text style={styles.recentTitle} numberOfLines={2}>{track.title}</Text>
                                    <Text style={styles.recentArtist} numberOfLines={1}>{track.artist}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* No Query Prompt */}
                {!query.trim() && !showRecent && (
                    <View style={styles.emptyState}>
                        <Ionicons name="search-outline" size={64} color={COLORS.textMuted} />
                        <Text style={styles.emptyTitle}>Search your music</Text>
                        <Text style={styles.emptySubtitle}>
                            Find songs, artists, and playlists{'\n'}from your library
                        </Text>
                    </View>
                )}

                {/* Search Results - Playlists */}
                {query.trim().length > 0 && playlists.length > 0 && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="albums-outline" size={18} color={COLORS.accent} />
                            <Text style={styles.sectionTitle}>Playlists</Text>
                        </View>
                        {playlists.map((pl) => (
                            <TouchableOpacity
                                key={pl.id}
                                style={styles.resultRow}
                                onPress={() => router.push(`/playlist/${pl.id}`)}
                            >
                                <View style={[styles.resultIcon, { backgroundColor: COLORS.accent + '15' }]}>
                                    <Ionicons name="musical-notes" size={20} color={COLORS.accent} />
                                </View>
                                <View style={styles.resultInfo}>
                                    <Text style={styles.resultTitle} numberOfLines={1}>{pl.name}</Text>
                                    <Text style={styles.resultMeta}>{pl.trackCount || 0} tracks • Playlist</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* Search Results - Tracks */}
                {query.trim().length > 0 && tracks.length > 0 && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="musical-note-outline" size={18} color={COLORS.primary} />
                            <Text style={styles.sectionTitle}>Songs</Text>
                            <Text style={styles.resultCount}>{tracks.length} result{tracks.length !== 1 ? 's' : ''}</Text>
                        </View>
                        {tracks.map((track) => (
                            <TouchableOpacity
                                key={track.id}
                                style={styles.resultRow}
                                onPress={() => handlePlayTrack(track)}
                                activeOpacity={0.6}
                            >
                                {track.thumbnail ? (
                                    <Image source={{ uri: track.thumbnail }} style={styles.trackThumb} />
                                ) : (
                                    <View style={[styles.resultIcon, { backgroundColor: COLORS.primary + '15' }]}>
                                        <Ionicons name="musical-note" size={18} color={COLORS.primary} />
                                    </View>
                                )}
                                <View style={styles.resultInfo}>
                                    <Text style={styles.resultTitle} numberOfLines={1}>{track.title}</Text>
                                    <Text style={styles.resultMeta}>{track.artist} • Song</Text>
                                </View>
                                {track.downloaded ? (
                                    <View style={styles.playIcon}>
                                        <Ionicons name="play" size={14} color={COLORS.primary} style={{ marginLeft: 1 }} />
                                    </View>
                                ) : (
                                    <Ionicons name="cloud-download-outline" size={18} color={COLORS.textMuted} />
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* No Results */}
                {query.trim().length > 0 && !searching && !hasResults && (
                    <View style={styles.noResults}>
                        <Ionicons name="search-outline" size={48} color={COLORS.textMuted} />
                        <Text style={styles.noResultsTitle}>No results found</Text>
                        <Text style={styles.noResultsText}>Try different keywords</Text>
                    </View>
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
    header: {
        paddingHorizontal: SIZES.lg,
        paddingBottom: SIZES.md,
    },
    title: {
        fontSize: SIZES.text3xl,
        color: COLORS.textPrimary,
        ...FONTS.extraBold,
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: SIZES.textSm,
        color: COLORS.textSecondary,
        ...FONTS.regular,
        marginTop: 2,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.surfaceLight,
        borderRadius: SIZES.radiusMd,
        paddingHorizontal: SIZES.md,
        paddingVertical: SIZES.sm,
        marginTop: SIZES.base,
        gap: SIZES.sm,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    searchInput: {
        flex: 1,
        fontSize: SIZES.textBase,
        color: COLORS.textPrimary,
        ...FONTS.regular,
        paddingVertical: 4,
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        paddingHorizontal: SIZES.lg,
    },
    section: {
        marginTop: SIZES.lg,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SIZES.sm,
        marginBottom: SIZES.md,
    },
    sectionTitle: {
        fontSize: SIZES.textLg,
        color: COLORS.textPrimary,
        ...FONTS.bold,
        flex: 1,
    },
    resultCount: {
        fontSize: SIZES.textSm,
        color: COLORS.textMuted,
        ...FONTS.medium,
    },
    // Recently played horizontal cards
    recentScroll: {
        marginHorizontal: -SIZES.lg,
        paddingHorizontal: SIZES.lg,
    },
    recentCard: {
        width: 130,
        marginRight: SIZES.md,
    },
    recentThumb: {
        width: 130,
        height: 130,
        borderRadius: SIZES.radiusMd,
        alignItems: 'center',
        justifyContent: 'center',
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
    // Search results
    resultRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SIZES.md,
        gap: SIZES.md,
    },
    resultIcon: {
        width: 44,
        height: 44,
        borderRadius: SIZES.radiusSm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    trackThumb: {
        width: 44,
        height: 44,
        borderRadius: SIZES.radiusSm,
    },
    resultInfo: {
        flex: 1,
    },
    resultTitle: {
        fontSize: SIZES.textBase,
        color: COLORS.textPrimary,
        ...FONTS.medium,
    },
    resultMeta: {
        fontSize: SIZES.textSm,
        color: COLORS.textMuted,
        ...FONTS.regular,
        marginTop: 2,
    },
    playIcon: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: COLORS.primary + '20',
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Empty states
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
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
    noResults: {
        alignItems: 'center',
        paddingTop: 60,
    },
    noResultsTitle: {
        fontSize: SIZES.textLg,
        color: COLORS.textPrimary,
        ...FONTS.bold,
        marginTop: SIZES.lg,
    },
    noResultsText: {
        fontSize: SIZES.textBase,
        color: COLORS.textMuted,
        ...FONTS.regular,
        marginTop: SIZES.xs,
    },
});
