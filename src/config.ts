import { ServerOptions } from './types/ServerOptions';

const isProduction =
  process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT);

export default {
  secretKey: process.env.SECRET_KEY || 'Loodwing_RealCoaching_2026',
  host: process.env.WPP_HOST || 'http://127.0.0.1',
  port: process.env.PORT || '21465',
  deviceName: 'WppConnect',
  poweredBy: 'WPPConnect-Server',
  startAllSession: true,
  tokenStoreType: 'file',
  maxListeners: 15,

  createOptions: {
    browserArgs: [
      '--disable-web-security',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--hide-scrollbars',
      '--disable-software-rasterizer',
    ],
    puppeteerOptions: {
      headless: true,
      timeout: 60000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
      ...(process.env.PUPPETEER_EXECUTABLE_PATH
        ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
        : {}),
    },
    linkPreviewApiServers: null,
    logQR: true,
    // 0 = no cerrar la sesión mientras escaneás el QR (ideal en Railway)
    autoClose: Number(process.env.WPP_AUTO_CLOSE ?? 0),
    deviceSyncTimeout: Number(process.env.WPP_DEVICE_SYNC_TIMEOUT ?? 180000),
    waitForLogin: true,
    updatesLog: true,
  },

  customUserDataDir: './userDataDir/',

  webhook: {
    url: process.env.WEBHOOK_URL || 'http://127.0.0.1:8000/webhook',
    autoDownload: false,
    uploadS3: false,
    readMessage: true,
    allUnreadOnStart: false,
    listenAcks: false,
    onPresenceChanged: false,
    onParticipantsChanged: false,
    onReactionMessage: false,
    onPollResponse: false,
    onRevokedMessage: false,
    onLabelUpdated: false,
    onSelfMessage: false,
    ignore: ['status@broadcast', 'status-find', 'onack', 'onpresencechanged'],
    mapper: { enable: false, prefix: 'tagone-' },
    archive: { enable: false },
  },

  aws_s3: {
    region: 'sa-east-1' as any,
    access_key_id: null,
    secret_key: null,
    defaultBucketName: null,
    endpoint: null,
    forcePathStyle: null,
  },

  log: {
    level: isProduction ? 'info' : 'silly',
    logger: ['console', 'file'],
  },

  websocket: {
    autoDownload: false,
    uploadS3: false,
  },
} as any;
