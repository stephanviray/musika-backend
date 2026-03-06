import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import playerService from '../services/player';
import { isFavorite, toggleFavorite } from '../services/storage';
import { COLORS, SIZES, FONTS, SHADOWS } from '../constants/theme';

export default function MiniPlayer({ playerState }) {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { currentTrack, isPlaying, position, duration } = playerState;
    const [isLiked, setIsLiked] = useState(false);

    useEffect(() => {
        if (currentTrack?.id) {
            isFavorite(currentTrack.id).then(setIsLiked);
        }
    }, [currentTrack?.id]);

    if (!currentTrack) return null;

    const progress = duration > 0 ? position / duration : 0;

    const handleToggleLike = async () => {
        if (!currentTrack?.id) return;
        const nowLiked = await toggleFavorite(currentTrack.id);
        setIsLiked(nowLiked);
    };

    return (
        <TouchableOpacity
            style={[styles.container, { bottom: 48 + insets.bottom }]}
            onPress={() => router.push('/player')}
            activeOpacity={0.95}
        >
            <LinearGradient
                colors={[COLORS.miniPlayerBg, COLORS.surface]}
                style={styles.gradient}
            >
                {/* Progress bar at top */}
                <View style={styles.progressBar}>
                    <LinearGradient
                        colors={[COLORS.primary, COLORS.primaryLight]}
                        style={[styles.progressFill, { width: `${progress * 100}%` }]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                    />
                </View>

                <View style={styles.content}>
                    {/* Thumbnail */}
                    <View style={styles.thumbContainer}>
                        {currentTrack.thumbnail ? (
                            <Image source={{ uri: currentTrack.thumbnail }} style={styles.thumb} />
                        ) : (
                            <LinearGradient
                                colors={[COLORS.primary + '60', COLORS.accent + '40']}
                                style={styles.thumbPlaceholder}
                            >
                                <Ionicons name="musical-note" size={18} color={COLORS.textPrimary} />
                            </LinearGradient>
                        )}
                        {/* Playing indicator */}
                        {isPlaying && (
                            <View style={styles.playingDot}>
                                <View style={styles.playingDotInner} />
                            </View>
                        )}
                    </View>

                    {/* Track Info */}
                    <View style={styles.trackInfo}>
                        <Text style={styles.trackTitle} numberOfLines={1}>
                            {currentTrack.title}
                        </Text>
                        <Text style={styles.trackArtist} numberOfLines={1}>
                            {currentTrack.artist}
                        </Text>
                    </View>

                    {/* Controls */}
                    <View style={styles.controls}>
                        <TouchableOpacity
                            style={styles.likeBtn}
                            onPress={(e) => {
                                e.stopPropagation();
                                handleToggleLike();
                            }}
                        >
                            <Ionicons
                                name={isLiked ? 'heart' : 'heart-outline'}
                                size={20}
                                color={isLiked ? COLORS.primary : COLORS.textMuted}
                            />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.playBtn}
                            onPress={(e) => {
                                e.stopPropagation();
                                playerService.togglePlay();
                            }}
                        >
                            <LinearGradient
                                colors={[COLORS.primary, COLORS.primaryDark]}
                                style={styles.playBtnGradient}
                            >
                                <Ionicons
                                    name={isPlaying ? 'pause' : 'play'}
                                    size={24}
                                    color="#fff"
                                    style={!isPlaying && { marginLeft: 2 }}
                                />
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.controlBtn}
                            onPress={(e) => {
                                e.stopPropagation();
                                playerService.next();
                            }}
                        >
                            <Ionicons name="play-skip-forward" size={20} color={COLORS.textPrimary} />
                        </TouchableOpacity>
                    </View>
                </View>
            </LinearGradient>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 8,
        right: 8,
        borderRadius: SIZES.radiusMd,
        overflow: 'hidden',
        ...SHADOWS.medium,
    },
    gradient: {
        borderRadius: SIZES.radiusMd,
    },
    progressBar: {
        height: 2,
        backgroundColor: COLORS.surfaceHighlight,
    },
    progressFill: {
        height: '100%',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SIZES.md,
        paddingVertical: SIZES.sm,
        gap: SIZES.sm,
    },
    thumbContainer: {
        position: 'relative',
    },
    thumb: {
        width: 44,
        height: 44,
        borderRadius: SIZES.radiusSm,
    },
    thumbPlaceholder: {
        width: 44,
        height: 44,
        borderRadius: SIZES.radiusSm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    playingDot: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: COLORS.background,
        alignItems: 'center',
        justifyContent: 'center',
    },
    playingDotInner: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: COLORS.primary,
    },
    trackInfo: {
        flex: 1,
    },
    trackTitle: {
        fontSize: SIZES.textSm,
        color: COLORS.textPrimary,
        ...FONTS.semiBold,
    },
    trackArtist: {
        fontSize: SIZES.textXs,
        color: COLORS.textSecondary,
        ...FONTS.regular,
        marginTop: 1,
    },
    controls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    likeBtn: {
        width: 34,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
    },
    controlBtn: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
    },
    playBtn: {
        borderRadius: 20,
        overflow: 'hidden',
        ...SHADOWS.glow,
    },
    playBtnGradient: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
