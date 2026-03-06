// Download Notification Service — Shows download progress in system notification bar
// Works in release APK builds with expo-notifications
// NOTE: expo-notifications crashes on import in Expo Go SDK 53+, so we lazy-load it

import { Platform } from 'react-native';
import Constants from 'expo-constants';

let Notifications = null;
let isAvailable = false;
let permissionGranted = false;
let _loadAttempted = false;

// Lazy-load expo-notifications only when first needed (not at import time)
// This avoids the crash in Expo Go SDK 53+
function loadNotifications() {
    if (_loadAttempted) return isAvailable;
    _loadAttempted = true;

    // Skip entirely in Expo Go — it will crash
    const isExpoGo = Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
    if (isExpoGo) {
        console.log('[Notif] Skipping expo-notifications (Expo Go detected)');
        isAvailable = false;
        return false;
    }

    try {
        Notifications = require('expo-notifications');
        isAvailable = true;
        console.log('[Notif] expo-notifications loaded');
        return true;
    } catch (e) {
        console.warn('[Notif] expo-notifications not available:', e.message);
        isAvailable = false;
        return false;
    }
}

const DOWNLOAD_NOTIFICATION_ID = 'musika-download-progress';
let isSetup = false;

// ---------------------------------------------------------------------------
// Request notification permission + setup channel
// ---------------------------------------------------------------------------
async function setup() {
    if (isSetup) return permissionGranted;
    if (Platform.OS !== 'android' || !isAvailable) return false;

    try {
        // Request permission (required on Android 13+)
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            console.warn('[Notif] Permission denied');
            isAvailable = false;
            return false;
        }
        permissionGranted = true;

        // Set handler
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowAlert: true,
                shouldPlaySound: false,
                shouldSetBadge: false,
            }),
        });

        // Create notification channel
        await Notifications.setNotificationChannelAsync('downloads', {
            name: 'Downloads',
            importance: Notifications.AndroidImportance.LOW,
            vibrationPattern: [0],
            lightColor: '#6C5CE7',
            enableVibrate: false,
            sound: null,
        });

        isSetup = true;
        console.log('[Notif] ✓ Setup complete');
        return true;
    } catch (e) {
        console.warn('[Notif] Setup failed:', e.message);
        isAvailable = false;
        return false;
    }
}

// ---------------------------------------------------------------------------
// Show/Update download progress notification
// ---------------------------------------------------------------------------
export async function showDownloadProgress(currentTrack, done, total) {
    if (Platform.OS !== 'android') return;
    loadNotifications();
    if (!isAvailable) return;

    const ready = await setup();
    if (!ready) return;

    const progress = total > 0 ? Math.round((done / total) * 100) : 0;

    try {
        await Notifications.scheduleNotificationAsync({
            identifier: DOWNLOAD_NOTIFICATION_ID,
            content: {
                title: `Downloading music (${done}/${total})`,
                body: currentTrack ? `♪ ${currentTrack}` : `${progress}% complete`,
                data: { type: 'download-progress' },
                sticky: true,
                autoDismiss: false,
                channelId: 'downloads',
            },
            trigger: null,
        });
    } catch (e) {
        // Silent fail — don't break downloads
    }
}

// ---------------------------------------------------------------------------
// Show download complete notification
// ---------------------------------------------------------------------------
export async function showDownloadComplete(playlistName, trackCount) {
    if (Platform.OS !== 'android') return;
    loadNotifications();
    if (!isAvailable) return;

    const ready = await setup();
    if (!ready) return;

    try {
        await Notifications.dismissNotificationAsync(DOWNLOAD_NOTIFICATION_ID);
        await Notifications.scheduleNotificationAsync({
            identifier: 'musika-download-done',
            content: {
                title: '✓ Download Complete',
                body: `${playlistName} — ${trackCount} tracks ready`,
                data: { type: 'download-complete' },
                sticky: false,
                channelId: 'downloads',
            },
            trigger: null,
        });
    } catch (e) {
        // Silent fail
    }
}

// ---------------------------------------------------------------------------
// Dismiss download notification
// ---------------------------------------------------------------------------
export async function dismissDownloadNotification() {
    loadNotifications();
    if (!isAvailable) return;
    try {
        await Notifications.dismissNotificationAsync(DOWNLOAD_NOTIFICATION_ID);
    } catch { }
}
