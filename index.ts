import 'react-native-gesture-handler';

import { registerRootComponent } from 'expo';
import { Platform, LogBox } from 'react-native';

import App from './App';

// Suppress React Native Web compatibility warnings that come from RNW internals
// and third-party libraries (TouchableOpacity, gesture responder, etc.).
// These do not affect functionality on native (iOS/Android).
if (Platform.OS === 'web') {
  // Strip browser default focus ring (blue outline) from all input/textarea elements.
  // React Native Web renders TextInput as <input> or <textarea>.
  const style = document.createElement('style');
  style.textContent = 'input:focus,textarea:focus,select:focus{outline:none!important;box-shadow:none!important}';
  document.head.appendChild(style);

  LogBox.ignoreLogs([
    'shadow* style props are deprecated',
    'props.pointerEvents is deprecated',
    'TouchableMixin is deprecated',
  ]);

  // LogBox only suppresses the in-app overlay; these RNW-internal warnings also
  // appear in the browser console. Intercept console.warn to hide them there too.
  const _warn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    const msg = String(args[0] ?? '');
    if (
      msg.includes('props.pointerEvents is deprecated') ||
      msg.includes('shadow* style props are deprecated') ||
      msg.includes('TouchableMixin is deprecated')
    ) return;
    _warn(...args);
  };
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
