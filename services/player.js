import { Audio } from 'expo-av';
import { Platform } from 'react-native';
import { addRecentlyPlayed } from './storage';

// ---------------------------------------------------------------------------
// Lazy-load react-native-track-player (native module; crashes in Expo Go)
// Falls back to expo-av when TrackPlayer isn't available
// ---------------------------------------------------------------------------
let TrackPlayer = null;
let TP_State = null;
let TP_Capability = null;
let TP_RepeatMode = null;
let TP_AppKilledPlaybackBehavior = null;
let TP_Event = null;
let _tpAvailable = false;
let _tpLoadAttempted = false;

function loadTrackPlayer() {
    if (_tpLoadAttempted) return _tpAvailable;
    _tpLoadAttempted = true;
    try {
        const tp = require('react-native-track-player');
        TrackPlayer = tp.default;
        TP_State = tp.State;
        TP_Capability = tp.Capability;
        TP_RepeatMode = tp.RepeatMode;
        TP_AppKilledPlaybackBehavior = tp.AppKilledPlaybackBehavior;
        TP_Event = tp.Event;

        // Quick smoke-test: the native module must expose constants
        if (TP_Capability.Play == null) throw new Error('Native module not linked');

        _tpAvailable = true;
        console.log('[Player] ✓ react-native-track-player loaded');
    } catch (e) {
        console.warn('[Player] TrackPlayer not available, using expo-av fallback:', e.message);
        _tpAvailable = false;
    }
    return _tpAvailable;
}

// Lazy-load expo-notifications for fallback notification (when TrackPlayer unavailable)
let Notifications = null;
function getNotifications() {
    if (Notifications === null) {
        try {
            Notifications = require('expo-notifications');
        } catch {
            Notifications = false;
        }
    }
    return Notifications || null;
}

// ============================================================================
// Audio Player Service — Singleton
// Uses react-native-track-player when available (Spotify-style notification)
// Falls back to expo-av + expo-notifications when not (e.g. Expo Go)
// ============================================================================
class PlayerService {
    constructor() {
        this.sound = null; // expo-av fallback
        this.isPlaying = false;
        this.currentTrack = null;
        this.currentPlaylist = [];
        this.currentIndex = -1;
        this.position = 0;
        this.duration = 0;
        this.isLooping = false;
        this.isShuffled = false;
        this.listeners = new Set();
        this._initialized = false;
        this._useTrackPlayer = false;
        this._notifSetup = false;
        // Queue (tracks added manually, played after current playlist)
        this.queue = [];
        // Sleep timer
        this.sleepTimerId = null;
        this.sleepTimerEnd = null;
        // Playback speed
        this.playbackSpeed = 1.0;
        // Progress polling (TrackPlayer mode)
        this._progressInterval = null;
    }

    async initialize() {
        if (this._initialized) return;

        // Try TrackPlayer first (gives us Spotify-style notification)
        if (loadTrackPlayer()) {
            try {
                await TrackPlayer.setupPlayer({ waitForBuffer: true });

                await TrackPlayer.updateOptions({
                    capabilities: [
                        TP_Capability.Play,
                        TP_Capability.Pause,
                        TP_Capability.SkipToNext,
                        TP_Capability.SkipToPrevious,
                        TP_Capability.SeekTo,
                        TP_Capability.Stop,
                    ],
                    compactCapabilities: [
                        TP_Capability.Play,
                        TP_Capability.Pause,
                        TP_Capability.SkipToNext,
                        TP_Capability.SkipToPrevious,
                    ],
                    android: {
                        appKilledPlaybackBehavior:
                            TP_AppKilledPlaybackBehavior.ContinuePlayback,
                    },
                });

                // Listen for playback state changes
                TrackPlayer.addEventListener(TP_Event.PlaybackState, (event) => {
                    const playing = event.state === TP_State.Playing;
                    if (this.isPlaying !== playing) {
                        this.isPlaying = playing;
                        this._notify();
                    }
                });

                // Listen for when the queue ends (track finished, no repeat)
                TrackPlayer.addEventListener(TP_Event.PlaybackQueueEnded, (event) => {
                    if (event.position > 0) {
                        this._onTrackFinished();
                    }
                });

                this._startProgressPolling();
                this._useTrackPlayer = true;
                this._initialized = true;
                console.log('[Player] ✓ Using TrackPlayer (MediaStyle notification)');
                return;
            } catch (error) {
                if (error.message?.includes('already') || error.code === 'player_already_initialized') {
                    this._useTrackPlayer = true;
                    this._initialized = true;
                    this._startProgressPolling();
                    console.log('[Player] TrackPlayer was already initialized');
                    return;
                }
                console.warn('[Player] TrackPlayer setup failed, falling back to expo-av:', error.message);
            }
        }

        // Fallback: expo-av
        try {
            await Audio.setAudioModeAsync({
                playsInSilentModeIOS: true,
                staysActiveInBackground: true,
                shouldDuckAndroid: true,
            });
            this._useTrackPlayer = false;
            this._initialized = true;
            await this._setupNotifications();
            console.log('[Player] ✓ Using expo-av fallback');
        } catch (error) {
            console.error('Error initializing audio:', error);
        }
    }

    // ---------- Progress polling (TrackPlayer mode) ----------
    _startProgressPolling() {
        if (this._progressInterval) return;
        this._progressInterval = setInterval(async () => {
            if (!this._initialized || !this.currentTrack || !this._useTrackPlayer) return;
            try {
                const progress = await TrackPlayer.getProgress();
                this.position = (progress.position || 0) * 1000;
                this.duration = (progress.duration || 0) * 1000;
                this._notify();
            } catch { }
        }, 500);
    }

    // ---------- expo-av fallback: notification setup ----------
    async _setupNotifications() {
        if (this._notifSetup) return;
        try {
            const Notif = getNotifications();
            if (!Notif) return;

            if (Platform.OS === 'android') {
                const { status: existingStatus } = await Notif.getPermissionsAsync();
                let finalStatus = existingStatus;
                if (existingStatus !== 'granted') {
                    const { status } = await Notif.requestPermissionsAsync();
                    finalStatus = status;
                }
                if (finalStatus !== 'granted') return;
            }

            Notif.setNotificationHandler({
                handleNotification: async () => ({
                    shouldShowAlert: true,
                    shouldPlaySound: false,
                    shouldSetBadge: false,
                }),
            });

            if (Platform.OS === 'android') {
                await Notif.setNotificationChannelAsync('playback', {
                    name: 'Music Playback',
                    importance: Notif.AndroidImportance.LOW,
                    sound: null,
                    vibrationPattern: null,
                    lockscreenVisibility: Notif.AndroidNotificationVisibility.PUBLIC,
                });
            }

            this._notifSetup = true;
        } catch (e) {
            console.warn('[Player] Notification setup failed:', e.message);
        }
    }

    async _showNotification() {
        // TrackPlayer handles its own notification — nothing to do
        if (this._useTrackPlayer) return;
        if (!this.currentTrack) return;
        if (!this._notifSetup) await this._setupNotifications();

        try {
            const Notif = getNotifications();
            if (!Notif) return;
            await Notif.dismissAllNotificationsAsync();
            await Notif.scheduleNotificationAsync({
                identifier: 'musika-playback',
                content: {
                    title: this.currentTrack.title || 'Playing',
                    body: this.currentTrack.artist || 'Unknown Artist',
                    sticky: true,
                    autoDismiss: false,
                    sound: null,
                    ...(Platform.OS === 'android' ? { priority: 'low', channelId: 'playback' } : {}),
                },
                trigger: null,
            });
        } catch (e) {
            console.warn('[Player] Notification error:', e.message);
        }
    }

    async _dismissNotification() {
        if (this._useTrackPlayer) return;
        try {
            const Notif = getNotifications();
            if (Notif) await Notif.dismissAllNotificationsAsync();
        } catch { }
    }

    // ---------- Common API ----------

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    _notify() {
        const state = this.getState();
        this.listeners.forEach(listener => listener(state));
    }

    getState() {
        return {
            isPlaying: this.isPlaying,
            currentTrack: this.currentTrack,
            position: this.position,
            duration: this.duration,
            isLooping: this.isLooping,
            isShuffled: this.isShuffled,
            currentIndex: this.currentIndex,
            playlistLength: this.currentPlaylist.length,
            queueLength: this.queue.length,
            sleepTimerEnd: this.sleepTimerEnd,
            playbackSpeed: this.playbackSpeed,
        };
    }

    // ---------- expo-av helpers ----------

    async _unloadSound() {
        if (this.sound) {
            try {
                await this.sound.stopAsync().catch(() => { });
                await this.sound.unloadAsync().catch(() => { });
            } catch { }
            this.sound = null;
        }
    }

    _onPlaybackStatusUpdate(status) {
        if (!status.isLoaded) {
            if (status.error) {
                console.error('[Player] Playback error:', status.error);
                this.isPlaying = false;
                this._notify();
            }
            return;
        }
        this.position = status.positionMillis || 0;
        this.duration = status.durationMillis || 0;
        this.isPlaying = status.isPlaying || false;
        if (status.didJustFinish && !this.isLooping) {
            this._onTrackFinished();
        }
        this._notify();
    }

    // ---------- Playback ----------

    async playTrack(track, playlist = [], index = 0) {
        await this.initialize();

        if (!track.filePath || !track.downloaded) {
            console.warn('Track not downloaded:', track.title);
            return;
        }

        try {
            this.currentTrack = track;
            this.currentPlaylist = playlist;
            this.currentIndex = index;

            console.log(`[Player] Loading: ${track.filePath}`);

            if (this._useTrackPlayer) {
                // === TrackPlayer path (Spotify-style notification) ===
                await TrackPlayer.reset();
                await TrackPlayer.add({
                    id: track.id || `track-${index}`,
                    url: track.filePath,
                    title: track.title || 'Unknown',
                    artist: track.artist || 'Unknown Artist',
                    artwork: track.thumbnail || undefined,
                });
                if (this.playbackSpeed !== 1.0) {
                    await TrackPlayer.setRate(this.playbackSpeed);
                }
                await TrackPlayer.setRepeatMode(
                    this.isLooping ? TP_RepeatMode.Track : TP_RepeatMode.Off
                );
                await TrackPlayer.play();
            } else {
                // === expo-av fallback ===
                await this._unloadSound();
                const { sound } = await Audio.Sound.createAsync(
                    { uri: track.filePath },
                    {
                        shouldPlay: true,
                        isLooping: this.isLooping,
                        progressUpdateIntervalMillis: 500,
                    },
                    this._onPlaybackStatusUpdate.bind(this)
                );
                this.sound = sound;
            }

            this.isPlaying = true;
            this._notify();
            await this._showNotification();

            addRecentlyPlayed(track).catch(() => { });
            console.log(`[Player] ✓ Playing: ${track.title}`);
        } catch (error) {
            console.error('[Player] Error playing track:', error.message);
            this.isPlaying = false;
            this._notify();
            try {
                const { Alert } = require('react-native');
                Alert.alert(
                    'Playback Error',
                    `Could not play "${track.title}". ${error.message}`,
                    [{ text: 'OK' }]
                );
            } catch { }
        }
    }

    async _onTrackFinished() {
        if (this.isLooping) {
            if (this._useTrackPlayer) {
                await TrackPlayer.seekTo(0);
                await TrackPlayer.play();
            } else {
                await this.seekTo(0);
                await this.play();
            }
        } else {
            await this.next();
        }
    }

    async play() {
        if (this._useTrackPlayer) {
            await TrackPlayer.play();
        } else if (this.sound) {
            await this.sound.playAsync();
        }
        this.isPlaying = true;
        this._notify();
        await this._showNotification();
    }

    async pause() {
        if (this._useTrackPlayer) {
            await TrackPlayer.pause();
        } else if (this.sound) {
            await this.sound.pauseAsync();
        }
        this.isPlaying = false;
        this._notify();
        await this._showNotification();
    }

    async togglePlay() {
        if (this.isPlaying) {
            await this.pause();
        } else {
            await this.play();
        }
    }

    async seekTo(positionMs) {
        if (this._useTrackPlayer) {
            await TrackPlayer.seekTo(positionMs / 1000); // ms → seconds
        } else if (this.sound) {
            await this.sound.setPositionAsync(positionMs);
        }
        this.position = positionMs;
        this._notify();
    }

    async next() {
        // Check queue first
        if (this.queue.length > 0) {
            const queueTrack = this.queue.shift();
            if (queueTrack && queueTrack.downloaded) {
                await this.playTrack(queueTrack, this.currentPlaylist, this.currentIndex);
                return;
            }
        }

        if (this.currentPlaylist.length === 0) return;

        let nextIndex;
        if (this.isShuffled) {
            nextIndex = Math.floor(Math.random() * this.currentPlaylist.length);
        } else {
            nextIndex = (this.currentIndex + 1) % this.currentPlaylist.length;
        }

        const nextTrack = this.currentPlaylist[nextIndex];
        if (nextTrack && nextTrack.downloaded) {
            await this.playTrack(nextTrack, this.currentPlaylist, nextIndex);
        } else {
            if (nextIndex !== this.currentIndex) {
                this.currentIndex = nextIndex;
                await this.next();
            }
        }
    }

    async previous() {
        if (this.currentPlaylist.length === 0) return;

        if (this.position > 3000) {
            await this.seekTo(0);
            return;
        }

        let prevIndex;
        if (this.isShuffled) {
            prevIndex = Math.floor(Math.random() * this.currentPlaylist.length);
        } else {
            prevIndex = (this.currentIndex - 1 + this.currentPlaylist.length) % this.currentPlaylist.length;
        }

        const prevTrack = this.currentPlaylist[prevIndex];
        if (prevTrack && prevTrack.downloaded) {
            await this.playTrack(prevTrack, this.currentPlaylist, prevIndex);
        }
    }

    toggleLoop() {
        this.isLooping = !this.isLooping;
        if (this._useTrackPlayer) {
            TrackPlayer.setRepeatMode(
                this.isLooping ? TP_RepeatMode.Track : TP_RepeatMode.Off
            ).catch(() => { });
        } else if (this.sound) {
            this.sound.setIsLoopingAsync(this.isLooping).catch(() => { });
        }
        this._notify();
    }

    toggleShuffle() {
        this.isShuffled = !this.isShuffled;
        this._notify();
    }

    async setVolume(volume) {
        const v = Math.max(0, Math.min(1, volume));
        if (this._useTrackPlayer) {
            await TrackPlayer.setVolume(v);
        } else if (this.sound) {
            await this.sound.setVolumeAsync(v);
        }
    }

    async stop() {
        if (this._useTrackPlayer) {
            await TrackPlayer.reset();
        } else {
            await this._unloadSound();
        }
        this.isPlaying = false;
        this.currentTrack = null;
        this.position = 0;
        this.duration = 0;
        this.cancelSleepTimer();
        this._notify();
        await this._dismissNotification();
    }

    // ============= QUEUE MANAGEMENT =============

    addToQueue(track) {
        if (track && track.downloaded) {
            this.queue.push(track);
            this._notify();
        }
    }

    removeFromQueue(index) {
        if (index >= 0 && index < this.queue.length) {
            this.queue.splice(index, 1);
            this._notify();
        }
    }

    getQueue() {
        return [...this.queue];
    }

    clearQueue() {
        this.queue = [];
        this._notify();
    }

    // ============= SLEEP TIMER =============

    setSleepTimer(minutes) {
        this.cancelSleepTimer();
        if (minutes <= 0) return;
        this.sleepTimerEnd = Date.now() + minutes * 60 * 1000;
        this.sleepTimerId = setTimeout(async () => {
            await this.pause();
            this.sleepTimerEnd = null;
            this.sleepTimerId = null;
            this._notify();
        }, minutes * 60 * 1000);
        this._notify();
    }

    cancelSleepTimer() {
        if (this.sleepTimerId) {
            clearTimeout(this.sleepTimerId);
            this.sleepTimerId = null;
        }
        this.sleepTimerEnd = null;
        this._notify();
    }

    getSleepTimerRemaining() {
        if (!this.sleepTimerEnd) return null;
        const remaining = Math.max(0, this.sleepTimerEnd - Date.now());
        return Math.ceil(remaining / 60000); // minutes
    }

    // ============= PLAYBACK SPEED =============

    async setPlaybackSpeed(speed) {
        this.playbackSpeed = speed;
        if (this._useTrackPlayer) {
            await TrackPlayer.setRate(speed).catch(() => { });
        } else if (this.sound) {
            await this.sound.setRateAsync(speed, true).catch(() => { });
        }
        this._notify();
    }
}

export const playerService = new PlayerService();
export default playerService;
