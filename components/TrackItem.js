import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES, FONTS } from '../constants/theme';

export default function TrackItem({ track, index, onPress, onDelete, isPlaying }) {
    const [barAnims] = useState(
        Array.from({ length: 3 }, () => new Animated.Value(0.3))
    );

    useEffect(() => {
        if (isPlaying) {
            const animations = barAnims.map((anim, i) =>
                Animated.loop(
                    Animated.sequence([
                        Animated.timing(anim, {
                            toValue: 0.8 + Math.random() * 0.2,
                            duration: 300 + i * 100,
                            useNativeDriver: true,
                        }),
                        Animated.timing(anim, {
                            toValue: 0.2 + Math.random() * 0.2,
                            duration: 300 + i * 100,
                            useNativeDriver: true,
                        }),
                    ])
                )
            );
            animations.forEach(a => a.start());
            return () => animations.forEach(a => a.stop());
        } else {
            barAnims.forEach(a => a.setValue(0.3));
        }
    }, [isPlaying]);

    const formatDuration = (seconds) => {
        if (!seconds) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <TouchableOpacity
            style={[
                styles.container,
                isPlaying && styles.containerActive,
                !track.downloaded && styles.containerDisabled,
            ]}
            onPress={onPress}
            onLongPress={onDelete}
            activeOpacity={track.downloaded ? 0.6 : 1}
        >
            {/* Index or Playing indicator */}
            <View style={styles.indexContainer}>
                {isPlaying ? (
                    <View style={styles.barsContainer}>
                        {barAnims.map((anim, i) => (
                            <Animated.View
                                key={i}
                                style={[
                                    styles.bar,
                                    { transform: [{ scaleY: anim }] },
                                ]}
                            />
                        ))}
                    </View>
                ) : (
                    <Text style={[styles.indexText, !track.downloaded && styles.textDisabled]}>
                        {index + 1}
                    </Text>
                )}
            </View>

            {/* Thumbnail */}
            <View style={styles.thumbContainer}>
                {track.thumbnail ? (
                    <Image source={{ uri: track.thumbnail }} style={styles.thumb} />
                ) : (
                    <View style={styles.thumbPlaceholder}>
                        <Ionicons
                            name="musical-note"
                            size={16}
                            color={COLORS.textMuted}
                        />
                    </View>
                )}
                {!track.downloaded && (
                    <View style={styles.downloadOverlay}>
                        <Ionicons name="cloud-download-outline" size={16} color={COLORS.textSecondary} />
                    </View>
                )}
            </View>

            {/* Track Info */}
            <View style={styles.info}>
                <Text
                    style={[
                        styles.title,
                        isPlaying && styles.titlePlaying,
                        !track.downloaded && styles.textDisabled,
                    ]}
                    numberOfLines={1}
                >
                    {track.title}
                </Text>
                <Text
                    style={[styles.artist, !track.downloaded && styles.textDisabled]}
                    numberOfLines={1}
                >
                    {track.artist}
                </Text>
            </View>

            {/* Duration */}
            <Text style={[styles.duration, !track.downloaded && styles.textDisabled]}>
                {formatDuration(track.duration)}
            </Text>

            {/* Play Button */}
            {track.downloaded && !isPlaying && (
                <View style={styles.playIcon}>
                    <Ionicons name="play" size={16} color={COLORS.primary} style={{ marginLeft: 1 }} />
                </View>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SIZES.md,
        paddingHorizontal: SIZES.sm,
        gap: SIZES.md,
        borderRadius: SIZES.radiusSm,
        marginBottom: 2,
    },
    containerActive: {
        backgroundColor: COLORS.primary + '10',
    },
    containerDisabled: {
        opacity: 0.5,
    },
    indexContainer: {
        width: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    indexText: {
        fontSize: SIZES.textSm,
        color: COLORS.textMuted,
        ...FONTS.medium,
    },
    barsContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 2,
        height: 16,
    },
    bar: {
        width: 3,
        height: 16,
        backgroundColor: COLORS.primary,
        borderRadius: 1.5,
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
        backgroundColor: COLORS.surfaceLight,
        alignItems: 'center',
        justifyContent: 'center',
    },
    downloadOverlay: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: SIZES.radiusSm,
        backgroundColor: COLORS.overlay,
        alignItems: 'center',
        justifyContent: 'center',
    },
    info: {
        flex: 1,
    },
    title: {
        fontSize: SIZES.textBase,
        color: COLORS.textPrimary,
        ...FONTS.medium,
    },
    titlePlaying: {
        color: COLORS.primary,
        ...FONTS.semiBold,
    },
    artist: {
        fontSize: SIZES.textSm,
        color: COLORS.textSecondary,
        ...FONTS.regular,
        marginTop: 2,
    },
    textDisabled: {
        color: COLORS.textMuted,
    },
    duration: {
        fontSize: SIZES.textSm,
        color: COLORS.textMuted,
        ...FONTS.medium,
        minWidth: 40,
        textAlign: 'right',
    },
    playIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: COLORS.primary + '20',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
