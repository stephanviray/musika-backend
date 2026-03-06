import { setAudioModeAsync, AudioModule } from 'expo-audio';

// Audio Player Service - Singleton (migrated from expo-av to expo-audio)
class PlayerService {
    constructor() {
        this.player = null;
        this.isPlaying = false;
        this.currentTrack = null;
        this.currentPlaylist = [];
        this.currentIndex = -1;
        this.position = 0;  // in milliseconds (for compatibility with UI)
        this.duration = 0;  // in milliseconds (for compatibility with UI)
        this.isLooping = false;
        this.isShuffled = false;
        this.shuffledOrder = [];
        this.listeners = new Set();
        this._initialized = false;
        this._statusSubscription = null;
    }

    async initialize() {
        if (this._initialized) return;
        try {
            await setAudioModeAsync({
                playsInSilentMode: true,
                shouldPlayInBackground: true,
                interruptionMode: 'duckOthers',
            });
            this._initialized = true;
        } catch (error) {
            console.error('Error initializing audio:', error);
        }
    }

    // Subscribe to player state changes
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    // Notify all listeners of state change
    _notify() {
        const state = this.getState();
        this.listeners.forEach(listener => listener(state));
    }

    // Get current player state
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
        };
    }

    // Clean up existing player
    _destroyPlayer() {
        if (this._statusSubscription) {
            this._statusSubscription.remove();
            this._statusSubscription = null;
        }
        if (this.player) {
            try {
                // MUST pause before removing — otherwise audio continues playing
                this.player.pause();
                this.player.remove();
            } catch (e) {
                // ignore cleanup errors
            }
            this.player = null;
        }
    }

    // Load and play a track
    async playTrack(track, playlist = [], index = 0) {
        await this.initialize();

        // Stop current playback
        this._destroyPlayer();

        if (!track.filePath || !track.downloaded) {
            console.warn('Track not downloaded:', track.title);
            return;
        }

        try {
            this.currentTrack = track;
            this.currentPlaylist = playlist;
            this.currentIndex = index;

            // Create a new AudioPlayer with the source
            this.player = new AudioModule.AudioPlayer(
                { uri: track.filePath },
                500,
                false
            );

            // Set looping state
            this.player.loop = this.isLooping;

            // Listen for status updates
            this._statusSubscription = this.player.addListener(
                'playbackStatusUpdate',
                (status) => this._onPlaybackStatusUpdate(status)
            );

            // Start playing
            this.player.play();
            this.isPlaying = true;
            this._notify();

            // Check after 2 seconds if playback actually started
            setTimeout(() => {
                if (this.currentTrack?.id === track.id && this.duration === 0 && this.position === 0) {
                    console.warn('[Player] Playback may have failed - no duration/position after 2s');
                }
            }, 2000);
        } catch (error) {
            console.error('Error playing track:', error);
            this.isPlaying = false;
            this._notify();
            // Show alert about corrupted file
            try {
                const { Alert } = require('react-native');
                Alert.alert(
                    'Playback Error',
                    `Could not play "${track.title}". The file may be corrupted. Try deleting and re-downloading.`,
                    [{ text: 'OK' }]
                );
            } catch { }
        }
    }

    // Playback status update handler
    _onPlaybackStatusUpdate(status) {
        // expo-audio uses seconds; convert to ms for UI compatibility
        this.position = (status.currentTime || 0) * 1000;
        this.duration = (status.duration || 0) * 1000;
        this.isPlaying = status.playing || false;

        // Track finished playing
        if (status.didJustFinish && !this.isLooping) {
            this._onTrackFinished();
        }

        this._notify();
    }

    // Handle track finished
    async _onTrackFinished() {
        if (this.isLooping) {
            await this.seekTo(0);
            await this.play();
        } else {
            await this.next();
        }
    }

    // Play / Resume
    async play() {
        if (this.player) {
            this.player.play();
            this.isPlaying = true;
            this._notify();
        }
    }

    // Pause
    async pause() {
        if (this.player) {
            this.player.pause();
            this.isPlaying = false;
            this._notify();
        }
    }

    // Toggle play/pause
    async togglePlay() {
        if (this.isPlaying) {
            await this.pause();
        } else {
            await this.play();
        }
    }

    // Seek to position (in milliseconds for UI compatibility)
    async seekTo(positionMs) {
        if (this.player) {
            // expo-audio seekTo takes seconds
            await this.player.seekTo(positionMs / 1000);
            this.position = positionMs;
            this._notify();
        }
    }

    // Next track
    async next() {
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
            // Skip undownloaded tracks
            if (nextIndex !== this.currentIndex) {
                this.currentIndex = nextIndex;
                await this.next();
            }
        }
    }

    // Previous track
    async previous() {
        if (this.currentPlaylist.length === 0) return;

        // If we're more than 3 seconds in, restart the current track
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

    // Toggle loop
    toggleLoop() {
        this.isLooping = !this.isLooping;
        if (this.player) {
            this.player.loop = this.isLooping;
        }
        this._notify();
    }

    // Toggle shuffle
    toggleShuffle() {
        this.isShuffled = !this.isShuffled;
        this._notify();
    }

    // Set volume (0.0 to 1.0)
    async setVolume(volume) {
        if (this.player) {
            this.player.volume = Math.max(0, Math.min(1, volume));
        }
    }

    // Stop and cleanup
    async stop() {
        this._destroyPlayer();
        this.isPlaying = false;
        this.currentTrack = null;
        this.position = 0;
        this.duration = 0;
        this._notify();
    }
}

// Singleton instance
export const playerService = new PlayerService();
export default playerService;
