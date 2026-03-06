import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Image, Animated, Dimensions, Modal, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import playerService from '../services/player';
import { isFavorite, toggleFavorite } from '../services/storage';
import { COLORS, SIZES, FONTS, SHADOWS } from '../constants/theme';

const { width, height } = Dimensions.get('window');

const SLEEP_OPTIONS = [
    { label: '5 min', value: 5 },
    { label: '15 min', value: 15 },
    { label: '30 min', value: 30 },
    { label: '45 min', value: 45 },
    { label: '1 hour', value: 60 },
    { label: '2 hours', value: 120 },
];

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export default function PlayerScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [playerState, setPlayerState] = useState(playerService.getState());
    const [spinAnim] = useState(new Animated.Value(0));
    const [pulseAnim] = useState(new Animated.Value(1));
    const [isLiked, setIsLiked] = useState(false);
    const [showSleepTimer, setShowSleepTimer] = useState(false);
    const [showSpeedPicker, setShowSpeedPicker] = useState(false);
    const [sleepRemaining, setSleepRemaining] = useState(null);

    useEffect(() => {
        const unsubscribe = playerService.subscribe((state) => {
            setPlayerState(state);
        });
        return unsubscribe;
    }, []);

    // Check if current track is liked
    useEffect(() => {
        if (playerState.currentTrack?.id) {
            isFavorite(playerState.currentTrack.id).then(setIsLiked);
        }
    }, [playerState.currentTrack?.id]);

    // Sleep timer countdown
    useEffect(() => {
        const interval = setInterval(() => {
            const remaining = playerService.getSleepTimerRemaining();
            setSleepRemaining(remaining);
        }, 10000);
        return () => clearInterval(interval);
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

    const handleToggleLike = async () => {
        if (!playerState.currentTrack?.id) return;
        const nowLiked = await toggleFavorite(playerState.currentTrack.id);
        setIsLiked(nowLiked);
    };

    const handleSetSleepTimer = (minutes) => {
        playerService.setSleepTimer(minutes);
        setSleepRemaining(minutes);
        setShowSleepTimer(false);
    };

    const handleCancelSleepTimer = () => {
        playerService.cancelSleepTimer();
        setSleepRemaining(null);
        setShowSleepTimer(false);
    };

    const handleSetSpeed = async (speed) => {
        await playerService.setPlaybackSpeed(speed);
        setShowSpeedPicker(false);
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
                <TouchableOpacity style={styles.queueBtn} onPress={() => router.push('/queue')}>
                    <Ionicons name="list" size={22} color={COLORS.textPrimary} />
                </TouchableOpacity>
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

                {/* Track Info + Like Button */}
                <View style={styles.trackInfoRow}>
                    <View style={styles.trackInfo}>
                        <Text style={styles.trackTitle} numberOfLines={2}>
                            {track.title}
                        </Text>
                        <Text style={styles.trackArtist} numberOfLines={1}>
                            {track.artist}
                        </Text>
                    </View>
                    <TouchableOpacity style={styles.likeBtn} onPress={handleToggleLike}>
                        <Ionicons
                            name={isLiked ? 'heart' : 'heart-outline'}
                            size={26}
                            color={isLiked ? COLORS.primary : COLORS.textSecondary}
                        />
                    </TouchableOpacity>
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

                {/* Bottom Actions Row */}
                <View style={styles.bottomActions}>
                    <TouchableOpacity
                        style={styles.bottomActionBtn}
                        onPress={() => setShowSpeedPicker(true)}
                    >
                        <Text style={[
                            styles.speedLabel,
                            playerState.playbackSpeed !== 1.0 && { color: COLORS.primary },
                        ]}>
                            {playerState.playbackSpeed}x
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.bottomActionBtn}
                        onPress={() => setShowSleepTimer(true)}
                    >
                        <Ionicons
                            name="moon-outline"
                            size={20}
                            color={sleepRemaining ? COLORS.primary : COLORS.textSecondary}
                        />
                        {sleepRemaining && (
                            <Text style={styles.sleepBadge}>{sleepRemaining}m</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.bottomActionBtn}
                        onPress={() => {
                            if (track.downloaded) {
                                playerService.addToQueue(track);
                                Alert.alert('Added to Queue', `"${track.title}" added to your queue`);
                            }
                        }}
                    >
                        <Ionicons name="add-circle-outline" size={22} color={COLORS.textSecondary} />
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

            {/* Sleep Timer Modal */}
            <Modal visible={showSleepTimer} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Ionicons name="moon" size={22} color={COLORS.primary} />
                            <Text style={styles.modalTitle}>Sleep Timer</Text>
                            <TouchableOpacity onPress={() => setShowSleepTimer(false)}>
                                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
                            </TouchableOpacity>
                        </View>
                        {sleepRemaining && (
                            <TouchableOpacity
                                style={styles.cancelTimerBtn}
                                onPress={handleCancelSleepTimer}
                            >
                                <Ionicons name="close-circle" size={18} color={COLORS.danger} />
                                <Text style={styles.cancelTimerText}>
                                    Cancel timer ({sleepRemaining} min remaining)
                                </Text>
                            </TouchableOpacity>
                        )}
                        {SLEEP_OPTIONS.map((opt) => (
                            <TouchableOpacity
                                key={opt.value}
                                style={styles.timerOption}
                                onPress={() => handleSetSleepTimer(opt.value)}
                            >
                                <Text style={styles.timerOptionText}>{opt.label}</Text>
                                <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </Modal>

            {/* Speed Picker Modal */}
            <Modal visible={showSpeedPicker} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Ionicons name="speedometer-outline" size={22} color={COLORS.primary} />
                            <Text style={styles.modalTitle}>Playback Speed</Text>
                            <TouchableOpacity onPress={() => setShowSpeedPicker(false)}>
                                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
                            </TouchableOpacity>
                        </View>
                        {SPEED_OPTIONS.map((speed) => (
                            <TouchableOpacity
                                key={speed}
                                style={[
                                    styles.timerOption,
                                    playerState.playbackSpeed === speed && styles.timerOptionActive,
                                ]}
                                onPress={() => handleSetSpeed(speed)}
                            >
                                <Text style={[
                                    styles.timerOptionText,
                                    playerState.playbackSpeed === speed && { color: COLORS.primary },
                                ]}>
                                    {speed}x {speed === 1.0 ? '(Normal)' : ''}
                                </Text>
                                {playerState.playbackSpeed === speed && (
                                    <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </Modal>
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
    queueBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
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
    trackInfoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        marginBottom: SIZES.xxl,
        paddingHorizontal: SIZES.sm,
    },
    trackInfo: {
        flex: 1,
    },
    trackTitle: {
        fontSize: SIZES.text2xl,
        color: COLORS.textPrimary,
        ...FONTS.bold,
    },
    trackArtist: {
        fontSize: SIZES.textLg,
        color: COLORS.textSecondary,
        ...FONTS.medium,
        marginTop: SIZES.xs,
    },
    likeBtn: {
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    progressContainer: {
        width: '100%',
        marginBottom: SIZES.xl,
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
        marginBottom: SIZES.lg,
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
    // Bottom action row
    bottomActions: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: SIZES.xxl,
        marginBottom: SIZES.md,
    },
    bottomActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: SIZES.sm,
        paddingVertical: SIZES.xs,
    },
    speedLabel: {
        fontSize: SIZES.textSm,
        color: COLORS.textSecondary,
        ...FONTS.bold,
    },
    sleepBadge: {
        fontSize: SIZES.textXs,
        color: COLORS.primary,
        ...FONTS.bold,
    },
    // Waveform
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
    // Modals
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: COLORS.surface,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: 40,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: SIZES.base,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.surfaceLight,
        gap: SIZES.sm,
    },
    modalTitle: {
        flex: 1,
        fontSize: SIZES.textLg,
        color: COLORS.textPrimary,
        ...FONTS.bold,
    },
    cancelTimerBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SIZES.sm,
        margin: SIZES.base,
        padding: SIZES.md,
        backgroundColor: COLORS.danger + '10',
        borderRadius: SIZES.radiusSm,
        borderWidth: 1,
        borderColor: COLORS.danger + '30',
    },
    cancelTimerText: {
        fontSize: SIZES.textSm,
        color: COLORS.danger,
        ...FONTS.medium,
    },
    timerOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: SIZES.base,
        paddingHorizontal: SIZES.lg,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.surfaceLight,
    },
    timerOptionActive: {
        backgroundColor: COLORS.primary + '10',
    },
    timerOptionText: {
        fontSize: SIZES.textBase,
        color: COLORS.textPrimary,
        ...FONTS.medium,
    },
});
