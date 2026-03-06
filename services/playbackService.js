// This service is registered by TrackPlayer and runs in the background.
// It handles remote events from the MediaStyle notification and lock screen controls.
module.exports = async function () {
    try {
        const TrackPlayer = require('react-native-track-player').default;
        const { Event } = require('react-native-track-player');
        const { playerService } = require('./player');

        TrackPlayer.addEventListener(Event.RemotePlay, () => {
            playerService.play();
        });

        TrackPlayer.addEventListener(Event.RemotePause, () => {
            playerService.pause();
        });

        TrackPlayer.addEventListener(Event.RemoteStop, () => {
            playerService.stop();
        });

        TrackPlayer.addEventListener(Event.RemoteNext, () => {
            playerService.next();
        });

        TrackPlayer.addEventListener(Event.RemotePrevious, () => {
            playerService.previous();
        });

        TrackPlayer.addEventListener(Event.RemoteSeek, (event) => {
            // event.position is in seconds, our seekTo expects milliseconds
            playerService.seekTo(event.position * 1000);
        });
    } catch (e) {
        console.warn('[PlaybackService] TrackPlayer not available:', e.message);
    }
};
