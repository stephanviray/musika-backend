import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, TextInput,
    Modal, Animated, Dimensions, KeyboardAvoidingView, Platform,
    ActivityIndicator, ScrollView,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { importPlaylistFromUrl, cancelDownload } from '../services/downloader';
import { isYouTubeUrl, extractVideoId, extractPlaylistId } from '../services/youtube';
import { isSpotifyUrl } from '../services/spotify';
import { getPlaylistTracks } from '../services/storage';
import playerService from '../services/player';
import { COLORS, SIZES, FONTS, SHADOWS } from '../constants/theme';

const { width, height } = Dimensions.get('window');

export default function ImportModal({ visible, onClose, onImportComplete }) {
    const [url, setUrl] = useState('');
    const [importing, setImporting] = useState(false);
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(null);
    const [completed, setCompleted] = useState(false);
    const [slideAnim] = useState(new Animated.Value(height));
    const [overlayAnim] = useState(new Animated.Value(0));
    const [progressAnim] = useState(new Animated.Value(0));
    const inputRef = useRef(null);

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(slideAnim, {
                    toValue: 0,
                    tension: 65,
                    friction: 11,
                    useNativeDriver: true,
                }),
                Animated.timing(overlayAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
            ]).start();
            // Auto-paste from clipboard when modal opens
            handleAutoPaste();
            setTimeout(() => inputRef.current?.focus(), 400);
        } else {
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: height,
                    duration: 250,
                    useNativeDriver: true,
                }),
                Animated.timing(overlayAnim, {
                    toValue: 0,
                    duration: 250,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [visible]);

    const handleAutoPaste = async () => {
        try {
            if (Platform.OS === 'web') return;
            const hasString = await Clipboard.hasStringAsync();
            if (!hasString) return;
            const clipText = await Clipboard.getStringAsync();
            if (clipText && (isYouTubeUrl(clipText) || isSpotifyUrl(clipText))) {
                setUrl(clipText.trim());
            }
        } catch (e) {
            // Clipboard access may fail silently
        }
    };

    const handlePasteFromClipboard = async () => {
        try {
            const clipText = await Clipboard.getStringAsync();
            if (clipText) {
                setUrl(clipText.trim());
                setError(null);
            }
        } catch (e) {
            setError('Could not read clipboard');
        }
    };

    const handleClose = () => {
        if (importing) return;
        setUrl('');
        setStatus(null);
        setError(null);
        setCompleted(false);
        progressAnim.setValue(0);
        onClose();
    };

    const detectPlatform = (text) => {
        if (isYouTubeUrl(text)) return 'youtube';
        if (isSpotifyUrl(text)) return 'spotify';
        return null;
    };

    const platform = detectPlatform(url);

    // Detect if it's a single video (not a playlist)
    const isSingleVideo = platform === 'youtube' &&
        extractVideoId(url) && !extractPlaylistId(url);

    const handleImport = async () => {
        if (!url.trim() || !platform) return;

        setImporting(true);
        setError(null);
        setCompleted(false);

        try {
            const playlist = await importPlaylistFromUrl(url.trim(), (update) => {
                setStatus(update);
                if (update.progress !== undefined) {
                    Animated.timing(progressAnim, {
                        toValue: update.progress,
                        duration: 300,
                        useNativeDriver: false,
                    }).start();
                }
            });

            setCompleted(true);
            setImporting(false);
            if (onImportComplete) onImportComplete();

            // Auto-play the downloaded track(s)
            if (playlist?.id) {
                try {
                    const tracks = await getPlaylistTracks(playlist.id);
                    const downloadedTracks = tracks.filter(t => t.downloaded && t.filePath);
                    if (downloadedTracks.length > 0) {
                        await playerService.playTrack(downloadedTracks[0], downloadedTracks, 0);
                    }
                } catch (playErr) {
                    console.warn('Auto-play failed:', playErr.message);
                }
            }

            // Auto close after success
            setTimeout(() => {
                handleClose();
            }, 1200);
        } catch (err) {
            console.error('Import failed:', err);
            setError(err.message || 'Import failed. Please try again.');
            setImporting(false);
        }
    };

    const progressWidth = progressAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%'],
    });

    return (
        <Modal visible={visible} transparent animationType="none">
            {/* Overlay */}
            <Animated.View style={[styles.overlay, { opacity: overlayAnim }]}>
                <TouchableOpacity style={StyleSheet.absoluteFill} onPress={handleClose} />
            </Animated.View>

            {/* Sheet */}
            <KeyboardAvoidingView
                style={styles.keyboardView}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <Animated.View
                    style={[
                        styles.sheet,
                        { transform: [{ translateY: slideAnim }] },
                    ]}
                >
                    {/* Handle */}
                    <View style={styles.handleContainer}>
                        <View style={styles.handle} />
                    </View>

                    {/* Header */}
                    <View style={styles.header}>
                        <Ionicons name="download" size={24} color={COLORS.primary} />
                        <Text style={styles.title}>
                            {isSingleVideo ? 'Download Track' : 'Import Playlist'}
                        </Text>
                    </View>

                    <Text style={styles.subtitle}>
                        Paste a YouTube or Spotify link to {isSingleVideo ? 'download and play offline' : 'download all tracks for offline listening'}
                    </Text>

                    {/* URL Input */}
                    <View style={styles.inputContainer}>
                        <View style={[
                            styles.inputWrapper,
                            platform && styles.inputWrapperValid,
                            error && styles.inputWrapperError,
                        ]}>
                            {platform ? (
                                <Ionicons
                                    name={platform === 'youtube' ? 'logo-youtube' : 'musical-notes'}
                                    size={20}
                                    color={platform === 'youtube' ? '#FF0000' : '#1DB954'}
                                />
                            ) : (
                                <Ionicons name="link" size={20} color={COLORS.textMuted} />
                            )}
                            <TextInput
                                ref={inputRef}
                                style={styles.input}
                                placeholder="Paste YouTube URL here..."
                                placeholderTextColor={COLORS.textMuted}
                                value={url}
                                onChangeText={(text) => {
                                    setUrl(text);
                                    setError(null);
                                }}
                                autoCapitalize="none"
                                autoCorrect={false}
                                editable={!importing}
                                selectionColor={COLORS.primary}
                            />
                            {url.length > 0 && !importing ? (
                                <TouchableOpacity onPress={() => setUrl('')}>
                                    <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
                                </TouchableOpacity>
                            ) : !importing && (
                                <TouchableOpacity onPress={handlePasteFromClipboard}>
                                    <Ionicons name="clipboard-outline" size={20} color={COLORS.primary} />
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Platform detection indicator */}
                        <View style={styles.detectionRow}>
                            {platform ? (
                                <View style={styles.platformBadge}>
                                    <Ionicons
                                        name={platform === 'youtube' ? 'logo-youtube' : 'musical-notes'}
                                        size={12}
                                        color={platform === 'youtube' ? '#FF0000' : '#1DB954'}
                                    />
                                    <Text style={styles.platformText}>
                                        {platform === 'youtube' ? 'YouTube' : 'Spotify'}{' '}
                                        {isSingleVideo ? '• Single Track' : '• Playlist'} detected
                                    </Text>
                                </View>
                            ) : url.length > 0 ? (
                                <View style={styles.platformBadge}>
                                    <Ionicons name="alert-circle-outline" size={12} color={COLORS.warning} />
                                    <Text style={[styles.platformText, { color: COLORS.warning }]}>
                                        Not a recognized URL
                                    </Text>
                                </View>
                            ) : null}
                        </View>
                    </View>

                    {/* Error */}
                    {error && (
                        <View style={styles.errorContainer}>
                            <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}

                    {/* Progress */}
                    {importing && status && (
                        <View style={styles.progressContainer}>
                            <View style={styles.progressHeader}>
                                <ActivityIndicator size="small" color={COLORS.primary} />
                                <Text style={styles.progressStatus}>
                                    {status.status === 'fetching' ? '🔍 Fetching info...' :
                                        status.status === 'creating' ? '📋 Creating playlist...' :
                                            status.status === 'searching' ? '🔎 Searching YouTube...' :
                                                status.status === 'downloading' ? '⬇️ Downloading...' :
                                                    status.status === 'complete' ? '✅ Complete!' :
                                                        status.status}
                                </Text>
                            </View>
                            <Text style={styles.progressDetail} numberOfLines={1}>
                                {status.detail}
                            </Text>
                            <View style={styles.progressBar}>
                                <Animated.View style={[styles.progressFill, { width: progressWidth }]}>
                                    <LinearGradient
                                        colors={[COLORS.primary, COLORS.primaryLight]}
                                        style={StyleSheet.absoluteFill}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                    />
                                </Animated.View>
                            </View>
                            <Text style={styles.progressPercent}>
                                {Math.round((status.progress || 0) * 100)}%
                            </Text>
                            {/* Stop Download Button */}
                            {status.status === 'downloading' && (
                                <TouchableOpacity
                                    style={styles.stopBtn}
                                    onPress={() => {
                                        cancelDownload();
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <Ionicons name="stop-circle" size={18} color={COLORS.danger} />
                                    <Text style={styles.stopBtnText}>Stop Download</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    {/* Success */}
                    {completed && (
                        <View style={styles.successContainer}>
                            <Ionicons name="checkmark-circle" size={48} color={COLORS.primary} />
                            <Text style={styles.successText}>
                                {isSingleVideo ? 'Track downloaded! Playing now 🎵' : 'Playlist imported successfully!'}
                            </Text>
                        </View>
                    )}

                    {/* Import/Download Button */}
                    {!completed && (
                        <TouchableOpacity
                            style={[
                                styles.importBtn,
                                (!platform || importing) && styles.importBtnDisabled,
                            ]}
                            onPress={handleImport}
                            disabled={!platform || importing}
                            activeOpacity={0.8}
                        >
                            <LinearGradient
                                colors={platform && !importing
                                    ? [COLORS.primary, COLORS.primaryDark]
                                    : [COLORS.surfaceHighlight, COLORS.surfaceLight]}
                                style={styles.importBtnGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                {importing ? (
                                    <ActivityIndicator size="small" color={COLORS.textPrimary} />
                                ) : (
                                    <>
                                        <Ionicons
                                            name={isSingleVideo ? 'download' : 'download'}
                                            size={20}
                                            color={platform ? '#fff' : COLORS.textMuted}
                                        />
                                        <Text style={[
                                            styles.importBtnText,
                                            !platform && { color: COLORS.textMuted },
                                        ]}>
                                            {isSingleVideo ? 'Download & Play' : 'Import & Download'}
                                        </Text>
                                    </>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    )}

                    {/* Supported platforms */}
                    <View style={styles.supportedPlatforms}>
                        <Text style={styles.supportedTitle}>Supported platforms</Text>
                        <View style={styles.platformsRow}>
                            <View style={styles.platformItem}>
                                <Ionicons name="logo-youtube" size={24} color="#FF0000" />
                                <Text style={styles.platformLabel}>YouTube</Text>
                            </View>
                            <View style={styles.platformItem}>
                                <Ionicons name="musical-notes" size={24} color="#1DB954" />
                                <Text style={styles.platformLabel}>Spotify</Text>
                            </View>
                        </View>
                    </View>
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    keyboardView: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: COLORS.surface,
        borderTopLeftRadius: SIZES.radiusXl,
        borderTopRightRadius: SIZES.radiusXl,
        paddingHorizontal: SIZES.xl,
        paddingBottom: SIZES.xxxl,
        maxHeight: height * 0.85,
    },
    handleContainer: {
        alignItems: 'center',
        paddingVertical: SIZES.md,
    },
    handle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: COLORS.surfaceHighlight,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SIZES.sm,
        marginBottom: SIZES.sm,
    },
    title: {
        fontSize: SIZES.textXl,
        color: COLORS.textPrimary,
        ...FONTS.bold,
    },
    subtitle: {
        fontSize: SIZES.textSm,
        color: COLORS.textSecondary,
        ...FONTS.regular,
        lineHeight: 20,
        marginBottom: SIZES.lg,
    },
    inputContainer: {
        marginBottom: SIZES.md,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.surfaceLight,
        borderRadius: SIZES.radiusMd,
        paddingHorizontal: SIZES.base,
        paddingVertical: SIZES.md,
        gap: SIZES.sm,
        borderWidth: 1.5,
        borderColor: COLORS.border,
    },
    inputWrapperValid: {
        borderColor: COLORS.primary + '60',
    },
    inputWrapperError: {
        borderColor: COLORS.danger + '60',
    },
    input: {
        flex: 1,
        fontSize: SIZES.textBase,
        color: COLORS.textPrimary,
        ...FONTS.regular,
    },
    detectionRow: {
        minHeight: 24,
    },
    platformBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SIZES.xs,
        marginTop: SIZES.sm,
        paddingHorizontal: SIZES.sm,
    },
    platformText: {
        fontSize: SIZES.textXs,
        color: COLORS.textSecondary,
        ...FONTS.medium,
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SIZES.sm,
        marginBottom: SIZES.md,
        padding: SIZES.md,
        backgroundColor: COLORS.danger + '15',
        borderRadius: SIZES.radiusSm,
    },
    errorText: {
        fontSize: SIZES.textSm,
        color: COLORS.danger,
        ...FONTS.medium,
        flex: 1,
    },
    progressContainer: {
        marginBottom: SIZES.lg,
        padding: SIZES.base,
        backgroundColor: COLORS.surfaceLight,
        borderRadius: SIZES.radiusMd,
    },
    progressHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SIZES.sm,
        marginBottom: SIZES.sm,
    },
    progressStatus: {
        fontSize: SIZES.textBase,
        color: COLORS.textPrimary,
        ...FONTS.semiBold,
    },
    progressDetail: {
        fontSize: SIZES.textSm,
        color: COLORS.textSecondary,
        ...FONTS.regular,
        marginBottom: SIZES.sm,
    },
    progressBar: {
        height: 6,
        borderRadius: 3,
        backgroundColor: COLORS.surfaceHighlight,
        overflow: 'hidden',
        marginBottom: SIZES.xs,
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
    },
    progressPercent: {
        fontSize: SIZES.textXs,
        color: COLORS.textMuted,
        ...FONTS.medium,
        textAlign: 'right',
    },
    successContainer: {
        alignItems: 'center',
        paddingVertical: SIZES.xl,
        gap: SIZES.md,
    },
    successText: {
        fontSize: SIZES.textLg,
        color: COLORS.primary,
        ...FONTS.semiBold,
        textAlign: 'center',
    },
    importBtn: {
        borderRadius: SIZES.radiusMd,
        overflow: 'hidden',
        marginBottom: SIZES.lg,
    },
    importBtnDisabled: {
        opacity: 0.6,
    },
    importBtnGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: SIZES.sm,
        paddingVertical: SIZES.base,
    },
    importBtnText: {
        fontSize: SIZES.textBase,
        color: '#fff',
        ...FONTS.bold,
    },
    supportedPlatforms: {
        alignItems: 'center',
    },
    supportedTitle: {
        fontSize: SIZES.textXs,
        color: COLORS.textMuted,
        ...FONTS.medium,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: SIZES.md,
    },
    platformsRow: {
        flexDirection: 'row',
        gap: SIZES.xxl,
    },
    platformItem: {
        alignItems: 'center',
        gap: SIZES.xs,
    },
    platformLabel: {
        fontSize: SIZES.textSm,
        color: COLORS.textSecondary,
        ...FONTS.medium,
    },
    stopBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginTop: SIZES.md,
        paddingVertical: SIZES.sm,
        paddingHorizontal: SIZES.lg,
        borderRadius: SIZES.radiusSm,
        borderWidth: 1,
        borderColor: COLORS.danger + '40',
        backgroundColor: COLORS.danger + '10',
    },
    stopBtnText: {
        fontSize: SIZES.textSm,
        color: COLORS.danger,
        ...FONTS.semiBold,
    },
});
