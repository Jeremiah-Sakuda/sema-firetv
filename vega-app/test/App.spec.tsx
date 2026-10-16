import * as React from 'react';
import {act, create, ReactTestRenderer} from 'react-test-renderer';
import {App} from '../src/App';
const mockHide = jest.fn(), mockExit = jest.fn(), mockInject = jest.fn();
let mockReader = false, mockReaderListener: (on: boolean) => void = () => {};
let mockBack: () => boolean;
const mockHandler = {exitApp: mockExit, addEventListener: jest.fn((_name, fn) => { mockBack = fn; return {remove: jest.fn()}; })};
jest.mock('@amazon-devices/webview', () => ({WebView: 'WebView'}));
jest.mock('@amazon-devices/react-native-kepler', () => ({
  StyleSheet: {create: (styles: unknown) => styles}, View: 'View', Text: 'Text', Pressable: 'Pressable',
  AccessibilityInfo: {announceForAccessibility: jest.fn(),
    isScreenReaderEnabled: jest.fn(() => Promise.resolve(mockReader)),
    addEventListener: jest.fn((_name: string, fn: (on: boolean) => void) => { mockReaderListener = fn; return {remove: jest.fn()}; })},
  usePreventHideSplashScreen: jest.fn(), useHideSplashScreenCallback: () => mockHide,
  useKeplerBackHandler: () => mockHandler,
}));
let screen: ReactTestRenderer;
const get = (id: string) => screen.root.findByProps({testID: id});
const count = (id: string) => screen.root.findAllByProps({testID: id}).length;
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); mockReader = false; act(() => { screen = create(<App />, {createNodeMock: () => ({injectJavaScript: mockInject})}); }); });
afterEach(() => { act(() => screen.unmount()); jest.useRealTimers(); });
test('missing ready handshake times out even after HTML loads', () => {
  act(() => get('sema-webview').props.onLoad());
  act(() => jest.advanceTimersByTime(15000));
  expect(count('startup-retry')).toBe(1); expect(count('sema-webview')).toBe(0);
  act(() => get('startup-exit').props.onPress()); expect(mockExit).toHaveBeenCalledTimes(1);
});
test('a ready player cancels the timeout', () => {
  act(() => get('sema-webview').props.onMessage({nativeEvent:{data:'{"sema":"ready"}'}}));
  act(() => jest.advanceTimersByTime(30000)); expect(count('startup-retry')).toBe(0);
});
test('error hides splash; retry rejects stale callbacks from the previous WebView', () => {
  const old = get('sema-webview').props;
  act(() => old.onError()); expect(mockHide).toHaveBeenCalled();
  act(() => get('startup-retry').props.onPress());
  act(() => { old.onMessage({nativeEvent:{data:'{"sema":"ready"}'}}); old.onError(); });
  expect(count('startup-retry')).toBe(0);
  act(() => jest.advanceTimersByTime(15000)); expect(count('startup-retry')).toBe(1);
});
test('Back exits failed startup; subresource errors do not close the player', () => {
  act(() => get('sema-webview').props.onHttpError({nativeEvent:{isMainFrame:false}}));
  expect(count('startup-retry')).toBe(0);
  act(() => get('sema-webview').props.onHttpError({nativeEvent:{isMainFrame:true}}));
  act(() => { expect(mockBack()).toBe(true); }); expect(mockExit).toHaveBeenCalledTimes(1);
});

test('player state changes are spoken by VoiceView through the native announce API', () => {
  const {AccessibilityInfo} = jest.requireMock('@amazon-devices/react-native-kepler');
  act(() => get('sema-webview').props.onMessage({nativeEvent: {data: JSON.stringify({sema: 'announce', text: 'Paused.'})}}));
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Paused.');
  act(() => get('sema-webview').props.onMessage({nativeEvent: {data: JSON.stringify({sema: 'announce'})}}));
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);
});
test('VoiceView state reaches the page once it is ready, and follows changes', async () => {
  mockReader = true;
  act(() => screen.unmount());
  await act(async () => { screen = create(<App />, {createNodeMock: () => ({injectJavaScript: mockInject})}); });
  expect(mockInject).not.toHaveBeenCalled();  // not before the page reports ready
  act(() => get('sema-webview').props.onMessage({nativeEvent: {data: JSON.stringify({sema: 'ready'})}}));
  expect(mockInject).toHaveBeenLastCalledWith(expect.stringContaining('__semaScreenReader(true)'));
  act(() => mockReaderListener(false));
  expect(mockInject).toHaveBeenLastCalledWith(expect.stringContaining('__semaScreenReader(false)'));
});
