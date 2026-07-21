export const zhiliTokens = {
  color: {
    page: '#f8fafc',
    surface: '#ffffff',
    nav: '#1f2937',
    primary: '#0f766e',
    text: '#111827',
    muted: '#6b7280',
    border: '#e5e7eb',
    success: '#15803d',
    warning: '#d97706',
    danger: '#b91c1c',
  },
  shell: {
    sidebar: 224,
    sidebarCollapsed: 56,
    topbar: 48,
    tabbar: 36,
    drawer: 480,
    drawerWide: 640,
  },
  radius: { control: 4, panel: 6, large: 8 },
} as const;

export type ZhiliTokens = typeof zhiliTokens;
