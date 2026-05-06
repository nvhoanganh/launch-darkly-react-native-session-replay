# LDSessionReplayRepro

Minimal reproducer for two iOS build failures in
[`@launchdarkly/session-replay-react-native@0.8.0`](https://www.npmjs.com/package/@launchdarkly/session-replay-react-native)
when the host app uses `use_frameworks! :linkage => :static` in its Podfile.

This Podfile setting is **mandatory** for any React Native app that uses
[React Native Firebase](https://rnfirebase.io/) Auth — see the official
RNFirebase iOS install guide. So in practice, **no RN+Firebase app can
adopt LD Session Replay today** without patching the SDK.

## Setup

```bash
git clone <this-repo>
cd LDSessionReplayRepro
yarn install
cd ios && bundle install && bundle exec pod install
```

## What works — default Podfile (no `use_frameworks!`)

```bash
cd ios
bundle exec pod install
xcodebuild -workspace LDSessionReplayRepro.xcworkspace \
  -scheme LDSessionReplayRepro -configuration Debug \
  -sdk iphonesimulator \
  -destination "generic/platform=iOS Simulator" build
# ** BUILD SUCCEEDED **
```

The session replay plugin is wired into `App.tsx` next to Observability:

```tsx
const sessionReplayPlugin = createSessionReplayPlugin({
  isEnabled: true,
  maskTextInputs: true,
  maskWebViews: true,
});

const ldClient = new ReactNativeLDClient(
  MOBILE_KEY,
  AutoEnvAttributes.Enabled,
  {
    plugins: [
      new Observability({ serviceName: 'ld-sr-repro', serviceVersion: '1.0.0' }),
      sessionReplayPlugin,
    ],
  },
);
```

## What fails — `use_frameworks! :linkage => :static`

```bash
cd ios
USE_FRAMEWORKS=static bundle exec pod install
xcodebuild -workspace LDSessionReplayRepro.xcworkspace \
  -scheme LDSessionReplayRepro -configuration Debug \
  -sdk iphonesimulator \
  -destination "generic/platform=iOS Simulator" build
```

(The default RN 0.84 Podfile reads `USE_FRAMEWORKS` from the env. Equivalent
to manually adding `use_frameworks! :linkage => :static` to the Podfile.)

### Failure 1 — non-modular Swift bridging-header import

```
node_modules/@launchdarkly/session-replay-react-native/ios/SessionReplayReactNative.mm:3:9:
fatal error: 'SessionReplayReactNative-Swift.h' file not found
    #import "SessionReplayReactNative-Swift.h" // Auto-generated header
            ^~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

**Root cause** — under `use_frameworks! :static`, the Swift-generated
header is exposed only at the modular path
`<SessionReplayReactNative/SessionReplayReactNative-Swift.h>`. The quoted
import path doesn't resolve.

**One-line fix in `SessionReplayReactNative.mm`:**

```objc
#if __has_include(<SessionReplayReactNative/SessionReplayReactNative-Swift.h>)
#import <SessionReplayReactNative/SessionReplayReactNative-Swift.h>
#else
#import "SessionReplayReactNative-Swift.h" // Auto-generated header
#endif
```

This works under both static and dynamic linkage. Verified locally via
`patch-package`.

### Failure 2 — surfaces only after Failure 1 is patched

After applying the bridging-header patch, a second issue surfaces in the
linker in a real-world host app:

```
Undefined symbols for architecture arm64:
  "facebook::react::Sealable::Sealable()", referenced from:
      facebook::react::RNDateTimePickerProps::RNDateTimePickerProps()
        in RNDateTimePicker[arm64][5](RNDateTimePickerComponentView.o)
      facebook::react::RNGestureHandlerButtonProps::RNGestureHandlerButtonProps()
        in RNGestureHandler[arm64][8](RNGestureHandlerButtonComponentView.o)
      facebook::react::RNGoogleSigninButtonProps::RNGoogleSigninButtonProps()
        in RNGoogleSignin[arm64][7](RNGoogleSignInButtonComponentView.o)
      facebook::react::RNSVGCircleProps::RNSVGCircleProps()
        in RNSVG[arm64][8](RNSVGCircle.o)
      ...
```

Adding `LaunchDarklySessionReplay` to a static-frameworks workspace
appears to break Fabric C++ symbol exports for any pod that ships
codegen'd Fabric components (RNDateTimePicker, RNGestureHandler,
RNGoogleSignin, RNSVG, etc.). This minimal reproducer doesn't include
those pods, so Failure 2 doesn't surface here — but it occurs reliably
in any real-world RN app that includes any of them, which is nearly
all of them.

To reproduce Failure 2 on top of this repo:

```bash
yarn add react-native-svg react-native-gesture-handler @react-native-community/datetimepicker
USE_FRAMEWORKS=static bundle exec pod install
# apply the Failure 1 patch above to SessionReplayReactNative.mm
xcodebuild ... build
```

## Environment

- macOS 25.2.0 (Darwin), Xcode 17, iPhoneOS 26.4 SDK
- React Native 0.84.1
- `@launchdarkly/react-native-client-sdk@^10.15.2`
- `@launchdarkly/observability-react-native@^0.9.0`
- `@launchdarkly/session-replay-react-native@^0.8.0`
- `LaunchDarklySessionReplay` native pod 0.33.1 (transitive)
- `LaunchDarklyObservability` native pod (transitive)

## Why this matters

[React Native Firebase Auth](https://rnfirebase.io/auth/usage/installation/ios)
mandates `use_frameworks! :linkage => :static` because Firebase Auth
ships Swift modules. Most production RN apps that adopt LD also use
Firebase, so this combination is extremely common. Currently it's
impossible to enable LD Session Replay in any of those apps without
patching the SDK.

## Suggested fix

1. Replace the quoted Swift-header import in
   `node_modules/@launchdarkly/session-replay-react-native/ios/SessionReplayReactNative.mm`
   with the `__has_include`-guarded modular form shown above.
2. Investigate why the `LaunchDarklySessionReplay` framework's presence
   in a static-frameworks workspace breaks Fabric C++ symbol resolution
   for downstream pods that ship codegen'd Fabric components. (May be
   related to module-map exports or the way `LaunchDarklyObservability`
   re-exports React-graphics symbols.)
