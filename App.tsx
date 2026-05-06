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

import {
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  ReactNativeLDClient,
  AutoEnvAttributes,
} from '@launchdarkly/react-native-client-sdk';
import { LDObserve, Observability } from '@launchdarkly/observability-react-native';
import { createSessionReplayPlugin } from '@launchdarkly/session-replay-react-native';

// Reusing the AVTA Tour mobile environment key so replays land in the same
// LD project. Build reproducer is unaffected by the key value — this is purely
// to exercise the runtime path end-to-end.
const MOBILE_KEY = 'mob-f5faf094-837c-4682-8f83-45e41ba898c6';

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

function emitBreadcrumbLogs(buttonKind: 'caught' | 'uncaught' | 'log-only') {
  // Emit a few logs at varying levels so "Related logs" populates with
  // breadcrumbs leading up to (or independent of) the error.
  LDObserve?.recordLog?.('User tapped error-test button', 'info', {
    source: 'ld-sr-repro',
    button: buttonKind,
  });
  LDObserve?.recordLog?.('Preparing to throw simulated error…', 'debug', {
    source: 'ld-sr-repro',
    button: buttonKind,
    timestamp: new Date().toISOString(),
  });
  LDObserve?.recordLog?.(
    'About to call recordError / throw — this is the last breadcrumb',
    'warn',
    { source: 'ld-sr-repro', button: buttonKind },
  );
}

function triggerCaughtError() {
  emitBreadcrumbLogs('caught');
  try {
    throw new Error(
      'Simulated CAUGHT error from ld-sr-repro — manually reported via LDObserve.recordError',
    );
  } catch (err) {
    LDObserve?.recordError?.(err as Error, 'caught-error-button', {
      source: 'ld-sr-repro',
      kind: 'caught',
    });
  }
}

function triggerUncaughtError() {
  emitBreadcrumbLogs('uncaught');
  // Throwing synchronously from an event handler bubbles up to React Native's
  // global error handler (and ErrorUtils), which the LD Observability plugin
  // hooks into to auto-capture uncaught exceptions.
  throw new Error(
    'Simulated UNCAUGHT error from ld-sr-repro — should be auto-captured by the LD Observability plugin',
  );
}

function triggerLogOnly() {
  emitBreadcrumbLogs('log-only');
  LDObserve?.recordLog?.(
    'Standalone log emission — no error follows',
    'info',
    { source: 'ld-sr-repro', button: 'log-only' },
  );
}

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
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}>
      <Text style={styles.title}>LD Session Replay Repro</Text>
      <Text style={styles.subtitle}>
        service: ld-sr-repro · key ends …8c6
      </Text>

      <View style={styles.panel}>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.caughtButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={triggerCaughtError}>
          <Text style={styles.buttonText}>Trigger caught error</Text>
        </Pressable>
        <Text style={styles.helperText}>
          Reported via{' '}
          <Text style={styles.code}>LDObserve.recordError(err, action, ctx)</Text>
        </Text>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.uncaughtButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={triggerUncaughtError}>
          <Text style={styles.buttonText}>Trigger uncaught error</Text>
        </Pressable>
        <Text style={styles.helperText}>
          Throws synchronously — auto-captured by Observability&apos;s global handler.
          In Debug you&apos;ll see RN&apos;s red-screen; reload Metro to recover.
        </Text>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.logButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={triggerLogOnly}>
          <Text style={styles.buttonText}>Emit logs only</Text>
        </Pressable>
        <Text style={styles.helperText}>
          Sends 4 log records (info / debug / warn / info) via{' '}
          <Text style={styles.code}>LDObserve.recordLog(message, level, attrs)</Text>.
          Visible under Observability → Logs.
        </Text>
      </View>

      <Text style={styles.footer}>
        Check LD dashboard → Observability → Errors. Filter by{' '}
        <Text style={styles.code}>service.name = &quot;ld-sr-repro&quot;</Text>.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    backgroundColor: '#0b1020',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
    fontFamily: 'Menlo',
  },
  panel: {
    marginTop: 32,
    gap: 6,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  caughtButton: {
    backgroundColor: '#2563eb',
  },
  uncaughtButton: {
    backgroundColor: '#dc2626',
  },
  logButton: {
    backgroundColor: '#16a34a',
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  helperText: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  code: {
    fontFamily: 'Menlo',
    fontSize: 11,
    color: '#cbd5e1',
  },
  footer: {
    marginTop: 'auto',
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'center',
  },
});

export default App;
