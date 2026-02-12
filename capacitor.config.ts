import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pxlpxl.app',
  appName: 'Pxlpxl',
  webDir: 'dist/pxlpxl/browser',
  plugins: {
    StatusBar: {
      style: 'DARK',
    },
    Keyboard: {
      resize: 'none',
      resizeOnFullScreen: true,
    },
  },
  android: {
    backgroundColor: '#1c1b1f',
  },
};

export default config;
