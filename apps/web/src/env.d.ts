export {};

declare global {
  interface Window {
    __JONLIX: {
      lang: 'ru' | 'uz' | 'en';
      api: string;
      tg: string;
      ig: string;
      phone: string;
      ga: string;
      ym: string;
      pixel: string;
      privacy: string;
    };
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        platform?: string;
        initData?: string;
        viewportHeight?: number;
        viewportStableHeight?: number;
        isVersionAtLeast?: (version: string) => boolean;
        requestFullscreen?: () => void;
        disableVerticalSwipes?: () => void;
        onEvent?: (event: string, handler: () => void) => void;
        openTelegramLink?: (url: string) => void;
        initDataUnsafe?: {
          start_param?: string;
          user?: { id: number; username?: string; first_name?: string };
        };
      };
    };
  }
}
