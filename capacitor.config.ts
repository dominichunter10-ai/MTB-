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
  },
} as const;

export default config;
