const config = {
  appId: 'com.hamsterleymtb.app',
  appName: 'HamsterleyMTB',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'automatic',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
    },
    // Native Google sign-in for the Android app. The token is handed to the
    // Firebase web SDK in src/App.tsx, so Firestore keeps working as before.
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
} as const;

export default config;
