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
import { Platform as YTPlatform } from 'youtubei.js/react-native';

YTPlatform.shim.eval = async function evaluate(scriptData, args) {
    try {
        const script = scriptData.output;
        if (!script) {
            console.warn('[YT-Eval] No script output to evaluate');
            return {};
        }

        const wrappedScript = `(function() { ${script} return exportedVars; })()`;
        const fn = new Function(wrappedScript);
        const exportedVars = fn();

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
import { View, Text, StyleSheet, StatusBar, Platform, TouchableOpacity, Animated } from 'react-native';
import { Stack, useRouter, usePathname } from 'expo-router';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import MiniPlayer from '../components/MiniPlayer';
import playerService from '../services/player';
import { COLORS, SIZES, FONTS } from '../constants/theme';

function TabBar() {
    const router = useRouter();
    const pathname = usePathname();
    const insets = useSafeAreaInsets();

    const tabs = [
        { key: '/', icon: 'home', iconOutline: 'home-outline', label: 'Home' },
        { key: '/search', icon: 'search', iconOutline: 'search-outline', label: 'Search' },
        { key: '/liked', icon: 'heart', iconOutline: 'heart-outline', label: 'Liked' },
    ];

    // Don't show tab bar on certain screens
    const hideOn = ['/player', '/queue'];
    if (hideOn.some(p => pathname.startsWith(p)) || pathname.startsWith('/playlist/')) return null;

    return (
        <View style={[styles.tabBarContainer, { paddingBottom: insets.bottom }]}>
            <LinearGradient
                colors={['transparent', COLORS.background + 'E0', COLORS.background]}
                style={styles.tabBarGradient}
                pointerEvents="none"
            />
            <View style={styles.tabBar}>
                {tabs.map((tab) => {
                    const isActive = pathname === tab.key ||
                        (tab.key === '/' && pathname === '/index');
                    return (
                        <TouchableOpacity
                            key={tab.key}
                            style={styles.tabItem}
                            onPress={() => router.push(tab.key)}
                            activeOpacity={0.7}
                        >
                            <Ionicons
                                name={isActive ? tab.icon : tab.iconOutline}
                                size={24}
                                color={isActive ? COLORS.primary : COLORS.textMuted}
                            />
                            <Text style={[
                                styles.tabLabel,
                                isActive && styles.tabLabelActive,
                            ]}>
                                {tab.label}
                            </Text>
                            {isActive && <View style={styles.tabDot} />}
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

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
                <TabBar />
            </View>
        </SafeAreaProvider>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    tabBarContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
    },
    tabBarGradient: {
        position: 'absolute',
        top: -20,
        left: 0,
        right: 0,
        height: 20,
    },
    tabBar: {
        flexDirection: 'row',
        backgroundColor: COLORS.background,
        borderTopWidth: 1,
        borderTopColor: COLORS.border + '40',
        paddingTop: 8,
    },
    tabItem: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 4,
    },
    tabLabel: {
        fontSize: 10,
        color: COLORS.textMuted,
        ...FONTS.medium,
        marginTop: 3,
    },
    tabLabelActive: {
        color: COLORS.primary,
        ...FONTS.semiBold,
    },
    tabDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: COLORS.primary,
        marginTop: 3,
    },
});
