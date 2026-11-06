export interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  server?: {
    androidScheme?: string;
  };
  android?: {
    allowMixedContent?: boolean;
    captureInput?: boolean;
    webContentsDebuggingEnabled?: boolean;
  };
  plugins?: Record<string, unknown>;
}

const config: CapacitorConfig = {
  appId: "app.campusmesh.mobile",
  appName: "CampusMesh",
  webDir: "../web/dist",
  server: {
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#2563EB",
    },
  },
};

export default config;
