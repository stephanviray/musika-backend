import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Image, Animated, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import playerService from '../services/player';
import { COLORS, SIZES, FONTS, SHADOWS } from '../constants/theme';

const { width, height } = Dimensions.get('window');

export default function PlayerScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [playerState, setPlayerState] = useState(playerService.getState());
    const [spinAnim] = useState(new Animated.Value(0));
    const [pulseAnim] = useState(new Animated.Value(1));

    useEffect(() => {
        const unsubscribe = playerService.subscribe((state) => {
            setPlayerState(state);
        });
        return unsubscribe;
    }, []);

    // Vinyl spin animation
    useEffect(() => {
        if (playerState.isPlaying) {
            const spin = Animated.loop(
                Animated.timing(spinAnim, {
                    toValue: 1,
                    duration: 8000,
                    useNativeDriver: true,
                })
            );
            spin.start();

            // Pulse animation for the play button glow
            const pulse = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.08,
                        duration: 1500,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 1500,
                        useNativeDriver: true,
                    }),
                ])
            );
            pulse.start();

            return () => {
                spin.stop();
                pulse.stop();
            };
        }
    }, [playerState.isPlaying]);

    const spin = spinAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    const formatTime = (millis) => {
        if (!millis) return '0:00';
        const totalSecs = Math.floor(millis / 1000);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const progress = playerState.duration > 0
        ? playerState.position / playerState.duration
        : 0;

    const track = playerState.currentTrack;

    if (!track) {
        return (
            <View style={[styles.container, { paddingTop: insets.top }]}>
                <Text style={styles.noTrack}>No track playing</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Background Gradient */}
            <LinearGradient
                colors={[COLORS.primary + '30', COLORS.accent + '15', COLORS.background]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />

            {/* Background blur image */}
            {track.thumbnail && (
                <Image
                    source={{ uri: track.thumbnail }}
                    style={styles.bgImage}
                    blurRadius={60}
                />
            )}
            <View style={styles.bgOverlay} />

            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + SIZES.sm }]}>
                <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
                    <Ionicons name="chevron-down" size={28} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Now Playing</Text>
                <View style={{ width: 40 }} />
            </View>

            <View style={styles.content}>
                {/* Album Art */}
                <View style={styles.artContainer}>
                    <Animated.View
                        style={[
                            styles.artWrapper,
                            playerState.isPlaying && {
                                transform: [{ rotate: spin }, { scale: pulseAnim }],
                            },
                        ]}
                    >
                        {track.thumbnail ? (
                            <Image source={{ uri: track.thumbnail }} style={styles.artImage} />
                        ) : (
                            <LinearGradient
                                colors={[COLORS.primary + '60', COLORS.accent + '40']}
                                style={styles.artPlaceholder}
                            >
                                <Ionicons name="musical-notes" size={80} color={COLORS.textPrimary} />
                            </LinearGradient>
                        )}
                        {/* Vinyl hole */}
                        <View style={styles.vinylHole}>
                            <View style={styles.vinylHoleInner} />
                        </View>
                    </Animated.View>

                    {/* Glow effect */}
                    {playerState.isPlaying && (
                        <Animated.View
                            style={[
                                styles.artGlow,
                                { transform: [{ scale: pulseAnim }] },
                            ]}
                        />
                    )}
                </View>

                {/* Track Info */}
                <View style={styles.trackInfo}>
                    <Text style={styles.trackTitle} numberOfLines={2}>
                        {track.title}
                    </Text>
                    <Text style={styles.trackArtist} numberOfLines={1}>
                        {track.artist}
                    </Text>
                </View>

                {/* Progress Bar */}
                <View style={styles.progressContainer}>
                    <TouchableOpacity
                        style={styles.progressBar}
                        onPress={(e) => {
                            const x = e.nativeEvent.locationX;
                            const barWidth = width - SIZES.xl * 2;
                            const pos = (x / barWidth) * playerState.duration;
                            playerService.seekTo(pos);
                        }}
                        activeOpacity={1}
                    >
                        <View style={styles.progressBg}>
                            <LinearGradient
                                colors={[COLORS.primary, COLORS.primaryLight]}
                                style={[styles.progressFill, { width: `${progress * 100}%` }]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            />
                            <View
                                style={[
                                    styles.progressThumb,
                                    { left: `${progress * 100}%` },
                                ]}
                            />
                        </View>
                    </TouchableOpacity>
                    <View style={styles.timeRow}>
                        <Text style={styles.timeText}>{formatTime(playerState.position)}</Text>
                        <Text style={styles.timeText}>{formatTime(playerState.duration)}</Text>
                    </View>
                </View>

                {/* Controls */}
                <View style={styles.controls}>
                    <TouchableOpacity
                        style={styles.secondaryBtn}
                        onPress={() => playerService.toggleShuffle()}
                    >
                        <Ionicons
                            name="shuffle"
                            size={24}
                            color={playerState.isShuffled ? COLORS.primary : COLORS.textSecondary}
                        />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.controlBtn}
                        onPress={() => playerService.previous()}
                    >
                        <Ionicons name="play-skip-back" size={32} color={COLORS.textPrimary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.playBtn}
                        onPress={() => playerService.togglePlay()}
                        activeOpacity={0.8}
                    >
                        <LinearGradient
                            colors={[COLORS.primary, COLORS.primaryDark]}
                            style={styles.playBtnGradient}
                        >
                            <Ionicons
                                name={playerState.isPlaying ? 'pause' : 'play'}
                                size={36}
                                color="#fff"
                                style={!playerState.isPlaying && { marginLeft: 4 }}
                            />
                        </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.controlBtn}
                        onPress={() => playerService.next()}
                    >
                        <Ionicons name="play-skip-forward" size={32} color={COLORS.textPrimary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.secondaryBtn}
                        onPress={() => playerService.toggleLoop()}
                    >
                        <Ionicons
                            name="repeat"
                            size={24}
                            color={playerState.isLooping ? COLORS.primary : COLORS.textSecondary}
                        />
                    </TouchableOpacity>
                </View>

                {/* Waveform visualization */}
                {playerState.isPlaying && (
                    <View style={styles.waveform}>
                        {Array.from({ length: 20 }).map((_, i) => (
                            <WaveformBar key={i} index={i} />
                        ))}
                    </View>
                )}
            </View>
        </View>
    );
}

// Animated waveform bar component
function WaveformBar({ index }) {
    const [anim] = useState(new Animated.Value(0));

    useEffect(() => {
        const delay = index * 80;
        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(anim, {
                    toValue: 1,
                    duration: 400 + Math.random() * 400,
                    delay,
                    useNativeDriver: true,
                }),
                Animated.timing(anim, {
                    toValue: 0.2,
                    duration: 400 + Math.random() * 400,
                    useNativeDriver: true,
                }),
            ])
        );
        animation.start();
        return () => animation.stop();
    }, []);

    const scaleY = anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.2, 0.6 + Math.random() * 0.4],
    });

    return (
        <Animated.View
            style={[
                styles.waveformBar,
                { transform: [{ scaleY }] },
            ]}
        />
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    bgImage: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.3,
    },
    bgOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: COLORS.background + 'CC',
    },
    noTrack: {
        fontSize: SIZES.textLg,
        color: COLORS.textMuted,
        textAlign: 'center',
        marginTop: 100,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SIZES.lg,
        paddingBottom: SIZES.md,
    },
    closeBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: SIZES.textSm,
        color: COLORS.textSecondary,
        ...FONTS.semiBold,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
    },
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: SIZES.xl,
    },
    artContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: SIZES.xxl,
    },
    artWrapper: {
        width: width * 0.65,
        height: width * 0.65,
        borderRadius: width * 0.325,
        overflow: 'hidden',
        ...SHADOWS.large,
    },
    artImage: {
        width: '100%',
        height: '100%',
    },
    artPlaceholder: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    vinylHole: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: 30,
        height: 30,
        marginTop: -15,
        marginLeft: -15,
        borderRadius: 15,
        backgroundColor: COLORS.background,
        alignItems: 'center',
        justifyContent: 'center',
    },
    vinylHoleInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: COLORS.textMuted,
    },
    artGlow: {
        position: 'absolute',
        width: width * 0.7,
        height: width * 0.7,
        borderRadius: width * 0.35,
        backgroundColor: COLORS.primary,
        opacity: 0.1,
        zIndex: -1,
    },
    trackInfo: {
        alignItems: 'center',
        marginBottom: SIZES.xxl,
        paddingHorizontal: SIZES.lg,
    },
    trackTitle: {
        fontSize: SIZES.text2xl,
        color: COLORS.textPrimary,
        ...FONTS.bold,
        textAlign: 'center',
    },
    trackArtist: {
        fontSize: SIZES.textLg,
        color: COLORS.textSecondary,
        ...FONTS.medium,
        marginTop: SIZES.xs,
    },
    progressContainer: {
        width: '100%',
        marginBottom: SIZES.xxl,
    },
    progressBar: {
        width: '100%',
        paddingVertical: SIZES.sm,
    },
    progressBg: {
        height: 4,
        borderRadius: 2,
        backgroundColor: COLORS.surfaceHighlight,
        overflow: 'visible',
    },
    progressFill: {
        height: '100%',
        borderRadius: 2,
    },
    progressThumb: {
        position: 'absolute',
        top: -5,
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: COLORS.primary,
        marginLeft: -7,
        ...SHADOWS.small,
    },
    timeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: SIZES.sm,
    },
    timeText: {
        fontSize: SIZES.textXs,
        color: COLORS.textMuted,
        ...FONTS.medium,
    },
    controls: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: SIZES.lg,
        marginBottom: SIZES.xl,
    },
    secondaryBtn: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    controlBtn: {
        width: 52,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
    },
    playBtn: {
        borderRadius: SIZES.radiusFull,
        overflow: 'hidden',
        ...SHADOWS.glow,
    },
    playBtnGradient: {
        width: 72,
        height: 72,
        borderRadius: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    waveform: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        height: 30,
    },
    waveformBar: {
        width: 3,
        height: 30,
        borderRadius: 2,
        backgroundColor: COLORS.primary,
        opacity: 0.6,
    },
});
