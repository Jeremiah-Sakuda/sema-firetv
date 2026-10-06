import {WebView} from '@amazon-devices/webview';
import * as React from 'react';
import {useEffect, useRef} from 'react';
import {View, StyleSheet} from 'react-native';
import {
  useHideSplashScreenCallback,
  useKeplerBackHandler,
  usePreventHideSplashScreen,
} from '@amazon-devices/react-native-kepler';
import {
  SslErrorData,
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewMessageEvent,
  WebViewMethods,
  WebViewNavigationEvent,
} from '@amazon-devices/webview/dist/types/WebViewTypes';

export const App = () => {
  const webRef = useRef<WebViewMethods | null>(null);
  // By default splash screen is shown in app launch, as the splash
  // screen images are bundled in this app (assets/raw/ folder)
  // Declare that application wants to extend splash screen lifecycle
  usePreventHideSplashScreen();
  const hideSplashScreenCallback = useHideSplashScreenCallback();
  // Vega's root-tag-aware back handler: exitApp() closes this app's screen.
  // The page owns Back (it pauses, leaves the film, then returns to the
  // catalog), so claim every hardware Back here; otherwise the native handler
  // would exit the app on the first press. The page asks to exit on its root.
  const backHandler = useKeplerBackHandler();
  useEffect(() => {
    const subscription = backHandler.addEventListener('hardwareBackPress', () => {
      // Claiming Back stops the WebView receiving it, so forward it to the page.
      webRef.current?.injectJavaScript('window.__semaBack && window.__semaBack(); true;');
      return true;
    });
    return () => subscription.remove();
  }, [backHandler]);
  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        style={styles.webview}
        allowSystemKeyEvents
        allowsDefaultMediaControl
        domStorageEnabled
        hasTVPreferredFocus
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="compatibility"
        // thirdPartyCookiesEnabled
        // userAgent={''}
        source={{
          // headers: {},
          uri: "file:///pkg/assets/index.html",
        }}
        onLoad={(_event: WebViewNavigationEvent) => {
          console.info('Page loading completed...');
          // Hide the splash screen
          hideSplashScreenCallback();
        }}
        onLoadStart={(_event: WebViewNavigationEvent) => {
          console.info('Page loading started...');
        }}
        onError={({
          nativeEvent: {code, url, description},
        }: WebViewErrorEvent) => {
          console.error(`[onError]: (${code}: ${url}) ${description}`);
        }}
        onHttpError={({
          nativeEvent: {url, statusCode: code, description, isMainFrame},
        }: WebViewHttpErrorEvent) => {
          console.error(`[onHttpError]: (${code}: ${url}) ${description}`);
          console.error(`[onHttpError]: isMainFrame: ${isMainFrame}`);
        }}
        onSslError={({code, url, description}: SslErrorData) => {
          console.error(`[onSslError]: (${code}: ${url}) ${description}`);
        }}
        // Diagnostics bridge (Sema): setting onMessage injects
        // window.ReactNativeWebView.postMessage(string) into the page. Plain
        // http:// to a host collector is blocked (net::ERR_CLEARTEXT_NOT_PERMITTED),
        // so page diagnostics are written to the device log instead
        // (`loggingctl log -f`, or tools/vega-probe/collect.js --device-log).
        onMessage={(event: WebViewMessageEvent) => {
          const data = event.nativeEvent.data;
          // The page posts {"sema":"exit"} when Back is pressed on its root
          // catalog screen; the WebView consumes Back, so the host exits.
          try {
            if (JSON.parse(data)?.sema === 'exit') {
              backHandler.exitApp();
              return;
            }
          } catch {
            // Not JSON: a plain diagnostics line.
          }
          console.info(`[WebViewMessage] ${data}`);
        }}
      />
    </View>
  );
};

// Styles for layout, which are necessary for proper focus behavior
const styles = StyleSheet.create({
  container: {flex: 1},
  webview: {backgroundColor: '#000000'},
});
