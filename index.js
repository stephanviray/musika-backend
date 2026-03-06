// Register the background playback service for react-native-track-player
// Wrapped in try-catch because TrackPlayer requires native code (won't work in Expo Go)
try {
    const tp = require('react-native-track-player');
    const TrackPlayer = tp.default || tp;
    if (TrackPlayer && TrackPlayer.registerPlaybackService) {
        TrackPlayer.registerPlaybackService(() => require('./services/playbackService'));
    }
} catch (e) {
    console.warn('[Index] TrackPlayer not available (Expo Go?):', e.message);
}

import 'expo-router/entry';
