import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES, FONTS, SHADOWS } from '../constants/theme';

export default function PlaylistCard({ playlist, index, onPress }) {
    const sourceIcon = playlist.source === 'spotify' ? 'logo-youtube'
        : playlist.source === 'youtube' ? 'logo-youtube'
            : 'musical-notes';

    const sourceColor = playlist.source === 'spotify' ? '#1DB954'
        : playlist.source === 'youtube' ? '#FF0000'
            : COLORS.accent;

    const formatDuration = (seconds) => {
        if (!seconds) return '';
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        if (hrs > 0) return `${hrs}h ${mins}m`;
        return `${mins}m`;
    };

    return (
        <TouchableOpacity
            style={styles.container}
            onPress={onPress}
            activeOpacity={0.7}
        >
            {/* Cover Art */}
            <View style={styles.coverContainer}>
                {playlist.coverArt ? (
                    <Image source={{ uri: playlist.coverArt }} style={styles.coverImage} />
                ) : (
                    <LinearGradient
                        colors={[
                            sourceColor + '40',
                            COLORS.surfaceLight,
                        ]}
                        style={styles.coverPlaceholder}
                    >
                        <Ionicons name="musical-notes" size={28} color={sourceColor} />
                    </LinearGradient>
                )}
                {/* Source Badge */}
                {playlist.source !== 'manual' && (
                    <View style={[styles.sourceBadge, { backgroundColor: sourceColor + '20' }]}>
                        <Ionicons name={sourceIcon} size={10} color={sourceColor} />
                    </View>
                )}
            </View>

            {/* Info */}
            <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>
                    {playlist.name}
                </Text>
                <View style={styles.metaRow}>
                    <Text style={styles.meta}>
                        {playlist.trackCount || 0} tracks
                    </Text>
                    {playlist.totalDuration > 0 && (
                        <Text style={styles.meta}> • {formatDuration(playlist.totalDuration)}</Text>
                    )}
                </View>
            </View>

            {/* Arrow */}
            <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: SIZES.md,
        marginBottom: SIZES.sm,
        backgroundColor: COLORS.surface,
        borderRadius: SIZES.radiusMd,
        borderWidth: 1,
        borderColor: COLORS.border,
        gap: SIZES.md,
    },
    coverContainer: {
        position: 'relative',
    },
    coverImage: {
        width: 56,
        height: 56,
        borderRadius: SIZES.radiusSm,
    },
    coverPlaceholder: {
        width: 56,
        height: 56,
        borderRadius: SIZES.radiusSm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sourceBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: COLORS.surface,
    },
    info: {
        flex: 1,
    },
    name: {
        fontSize: SIZES.textBase,
        color: COLORS.textPrimary,
        ...FONTS.semiBold,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 3,
    },
    meta: {
        fontSize: SIZES.textSm,
        color: COLORS.textMuted,
        ...FONTS.regular,
    },
});
