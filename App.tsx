/**
 * Minimal reproducer: LaunchDarkly SessionReplay plugin on React Native iOS.
 *
 * Used to demonstrate two iOS build failures of
 * @launchdarkly/session-replay-react-native@0.8.0 when the host app uses
 * `use_frameworks! :linkage => :static` in its Podfile (required by
 * React Native Firebase).
 *
 * See README.md for the exact reproduction steps.
 */

import { NewAppScreen } from '@react-native/new-app-screen';
import { StatusBar, StyleSheet, useColorScheme, View } from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  ReactNativeLDClient,
  AutoEnvAttributes,
} from '@launchdarkly/react-native-client-sdk';
import { Observability } from '@launchdarkly/observability-react-native';
import { createSessionReplayPlugin } from '@launchdarkly/session-replay-react-native';

// Replace with a real mobile key only if you want to verify replays land in LD.
// The reproducer is about the iOS build itself, so any non-empty string works.
const MOBILE_KEY = 'mob-00000000-0000-0000-0000-000000000000';

const sessionReplayPlugin = createSessionReplayPlugin({
  isEnabled: true,
  maskTextInputs: true,
  maskWebViews: true,
  maskLabels: false,
  maskImages: false,
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ldClient = new ReactNativeLDClient(
  MOBILE_KEY,
  AutoEnvAttributes.Enabled,
  {
    plugins: [
      new Observability({
        serviceName: 'ld-sr-repro',
        serviceVersion: '1.0.0',
      }),
      sessionReplayPlugin,
    ],
  },
);

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  return (
    <SafeAreaProvider>
      <AppContent />
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const safeAreaInsets = useSafeAreaInsets();
  return (
    <View style={styles.container}>
      <NewAppScreen templateFileName="App.tsx" safeAreaInsets={safeAreaInsets} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;
