import { ServerOptions } from './types/ServerOptions';

export default {
  secretKey: 'Loodwing_RealCoaching_2026',
  host: 'http://localhost',
  port: '21465',
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
    ],
    puppeteerOptions: {
      headless: true,
    },
    linkPreviewApiServers: null,
  },

  customUserDataDir: './userDataDir/',

  webhook: {
    url: 'http://127.0.0.1:8000/webhook',
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
    level: 'silly',
    logger: ['console', 'file'],
  },

  websocket: {
    autoDownload: false,
    uploadS3: false,
  },
} as any;
