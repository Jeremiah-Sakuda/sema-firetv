import {WebView} from '@amazon-devices/webview';
import * as React from 'react';
import {useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, Pressable, StyleSheet, Text, View} from 'react-native';
import {useHideSplashScreenCallback, useKeplerBackHandler, usePreventHideSplashScreen} from '@amazon-devices/react-native-kepler';
import {WebViewMethods} from '@amazon-devices/webview/dist/types/WebViewTypes';

const STARTUP_TIMEOUT_MS = 15000;
const STARTUP_ERROR = 'Sema could not open. Select Try again to reload, or Exit to close Sema.';

export const App = () => {
  const webRef = useRef<WebViewMethods | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [focused, setFocused] = useState('retry');
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  // VoiceView state, forwarded to the page so Sema's own voice never talks over
  // the screen reader (the page turns its guidance off unless the viewer chose).
  const screenReader = useRef<boolean | null>(null);
  const sendScreenReader = () => {
    if (screenReader.current === null || phaseRef.current !== 'ready') return;
    webRef.current?.injectJavaScript(`window.__semaScreenReader && window.__semaScreenReader(${screenReader.current}); true;`);
  };
  usePreventHideSplashScreen();
  const hideSplash = useHideSplashScreenCallback();
  const backHandler = useKeplerBackHandler();
  const clearTimer = () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; };
  const fail = (current: number) => {
    if (generation.current !== current || phaseRef.current === 'error') return;
    clearTimer(); phaseRef.current = 'error'; setPhase('error'); hideSplash();
    try { AccessibilityInfo.announceForAccessibility(STARTUP_ERROR); } catch { /* visual and screen-reader controls remain */ }
  };
  useEffect(() => {
    const current = attempt;
    timer.current = setTimeout(() => fail(current), STARTUP_TIMEOUT_MS);
    return clearTimer;
    // A retry owns one timeout. Repeated load-start events must not extend it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then(on => { if (active) { screenReader.current = on; sendScreenReader(); } })
      .catch(() => { /* unknown: the page falls back after a short wait */ });
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', (on: boolean) => {
      screenReader.current = on; sendScreenReader();
    });
    return () => { active = false; subscription?.remove?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const subscription = backHandler.addEventListener('hardwareBackPress', () => {
      if (phaseRef.current !== 'ready') backHandler.exitApp();
      else webRef.current?.injectJavaScript('window.__semaBack && window.__semaBack(); true;');
      return true;
    });
    return () => subscription.remove();
  }, [backHandler]);
  const retry = () => {
    clearTimer(); generation.current += 1; phaseRef.current = 'loading';
    setFocused('retry'); setPhase('loading'); setAttempt(generation.current);
  };
  return (
    <View style={styles.container}>
      {phase !== 'error' && <WebView
        key={attempt}
        testID="sema-webview"
        ref={webRef}
        style={styles.webview}
        allowSystemKeyEvents allowsDefaultMediaControl domStorageEnabled hasTVPreferredFocus javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="compatibility"
        source={{uri: 'file:///pkg/assets/index.html'}}
        onLoad={() => { if (generation.current === attempt && phaseRef.current !== 'error') hideSplash(); }}
        onError={() => fail(attempt)}
        onHttpError={({nativeEvent}) => { if (nativeEvent.isMainFrame) fail(attempt); }}
        onMessage={event => {
          if (generation.current !== attempt || phaseRef.current === 'error') return;
          const data = event.nativeEvent.data;
          try {
            const message = JSON.parse(data);
            if (message?.sema === 'ready') {
              clearTimer(); phaseRef.current = 'ready'; setPhase('ready'); hideSplash();
              sendScreenReader();
            } else if (message?.sema === 'exit') backHandler.exitApp();
          } catch { /* optional plain-text diagnostic */ }
          console.info(`[WebViewMessage] ${data}`);
        }}
      />}
      {phase === 'error' && <View style={styles.error}>
        <Text style={styles.title} accessibilityRole="header">Sema could not open</Text>
        <Text style={styles.message}>Try loading the player again, or exit and reopen Sema.</Text>
        <View style={styles.actions}>
          <Pressable testID="startup-retry" accessibilityRole="button" accessibilityLabel="Try again"
            hasTVPreferredFocus onFocus={() => setFocused('retry')} onPress={retry}
            style={[styles.button, focused === 'retry' && styles.focused]}>
            <Text style={styles.label}>Try again</Text>
          </Pressable>
          <Pressable testID="startup-exit" accessibilityRole="button" accessibilityLabel="Exit"
            onFocus={() => setFocused('exit')} onPress={() => backHandler.exitApp()}
            style={[styles.button, focused === 'exit' && styles.focused]}>
            <Text style={styles.label}>Exit</Text>
          </Pressable>
        </View>
      </View>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#101722'},
  webview: {flex: 1, backgroundColor: '#000000'},
  error: {flex: 1, justifyContent: 'center', padding: 64},
  title: {fontSize: 40, fontWeight: '700', color: '#ffffff', marginBottom: 20},
  message: {fontSize: 26, color: '#e0e7ef', marginBottom: 32},
  actions: {flexDirection: 'row', gap: 24},
  button: {paddingVertical: 18, paddingHorizontal: 32, borderRadius: 12, borderWidth: 4, borderColor: '#344359', backgroundColor: '#243246'},
  focused: {borderColor: '#f4bd69'},
  label: {fontSize: 28, fontWeight: '600', color: '#ffffff'},
});
