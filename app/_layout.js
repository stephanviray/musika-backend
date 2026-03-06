import 'event-target-polyfill';
import 'react-native-url-polyfill/auto';
import 'text-encoding-polyfill';

// Polyfill: youtubei.js React Native platform expects globalThis.mmkvStorage (react-native-mmkv).
// Provide an in-memory shim so it works without installing the native MMKV module.
if (!globalThis.mmkvStorage) {
    globalThis.mmkvStorage = class MMKVShim {
        constructor() { this._map = new Map(); }
        getBuffer(key) {
            const v = this._map.get(key);
            return v ? { buffer: v } : undefined;
        }
        set(key, value) { this._map.set(key, value); }
        delete(key) { this._map.delete(key); }
    };
}

// Polyfill: Hermes doesn't have CustomEvent, needed by youtubei.js
if (!globalThis.CustomEvent) {
    globalThis.CustomEvent = class CustomEvent extends Event {
        constructor(type, params = {}) {
            super(type, params);
            this.detail = params.detail || null;
        }
    };
}

// Override youtubei.js's JavaScript evaluator for signature/n-parameter deciphering.
// The library extracts decipher functions from YouTube's player JS and generates a pure-JS
// IIFE script. This evaluator executes it using the Function constructor (supported by Hermes)
// and calls the extracted sigFunction/nFunction with the provided arguments.
import { Platform as YTPlatform } from 'youtubei.js/react-native';

YTPlatform.shim.eval = async function evaluate(scriptData, args) {
    try {
        const script = scriptData.output;
        if (!script) {
            console.warn('[YT-Eval] No script output to evaluate');
            return {};
        }

        // The script is an IIFE that returns { sigFunction, nFunction, rawValues }
        // Wrap it so we can capture the result
        const wrappedScript = `(function() { ${script} return exportedVars; })()`;
        const fn = new Function(wrappedScript);
        const exportedVars = fn();

        // Now call the extracted functions with the provided arguments
        const result = {};
        if (args.sig !== undefined && typeof exportedVars.sigFunction === 'function') {
            result.sig = exportedVars.sigFunction(args.sig);
        }
        if (args.n !== undefined && typeof exportedVars.nFunction === 'function') {
            result.n = exportedVars.nFunction(args.n);
        }

        return result;
    } catch (e) {
        console.warn('[YT-Eval] Decipher evaluation error:', e.message);
        return {};
    }
};
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, StatusBar, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MiniPlayer from '../components/MiniPlayer';
import playerService from '../services/player';
import { COLORS } from '../constants/theme';

export default function RootLayout() {
    const [playerState, setPlayerState] = useState(playerService.getState());

    useEffect(() => {
        const unsubscribe = playerService.subscribe((state) => {
            setPlayerState(state);
        });
        return unsubscribe;
    }, []);

    return (
        <SafeAreaProvider>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
            <View style={styles.container}>
                <Stack
                    screenOptions={{
                        headerShown: false,
                        contentStyle: { backgroundColor: COLORS.background },
                        animation: 'slide_from_right',
                    }}
                />
                {playerState.currentTrack && (
                    <MiniPlayer playerState={playerState} />
                )}
            </View>
        </SafeAreaProvider>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
});
