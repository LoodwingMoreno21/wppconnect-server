import cors from 'cors';
import express, { NextFunction } from 'express';
// @ts-ignore
import boolParser from 'express-query-boolean';
import { createServer } from 'http';
import mergeDeep from 'merge-deep';
import process from 'process';
import { Server as Socket } from 'socket.io';
import config from './config';
import { convert } from './mapper/index';
import routes from './routes';
import { ServerOptions } from './types/ServerOptions';
import {
  createFolders,
  setMaxListners,
  startAllSessions,
} from './util/functions';
import { createLogger } from './util/logger';

export const logger = createLogger(config.log);

const app = express();
const serverOptions = mergeDeep({}, config, {}) as ServerOptions;
const PORT = process.env.PORT || serverOptions.port;

const http = createServer(app);
export const io = new Socket(http, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/files', express.static('WhatsAppImages'));
app.use(boolParser());

app.use((req: any, res: any, next: NextFunction) => {
  req.serverOptions = serverOptions;
  req.logger = logger;
  req.io = io;

  const oldSend = res.send;
  res.send = async function (data: any) {
    const content = req.headers['content-type'];
    if (content == 'application/json') {
      data = JSON.parse(data);
      if (!data.session) data.session = req.client ? req.client.session : '';
      const mapperEnabled =
        req.serverOptions?.webhook?.mapper?.enable ??
        req.serverOptions?.mapper?.enable;
      const mapperPrefix =
        req.serverOptions?.webhook?.mapper?.prefix ??
        req.serverOptions?.mapper?.prefix ??
        'tagone-';
      if (data.mapper && mapperEnabled) {
        data.response = await convert(mapperPrefix, data.response, data.mapper);
        delete data.mapper;
      }
    }
    res.send = oldSend;
    return res.send(data);
  };
  next();
});

app.use(routes);

createFolders();
setMaxListners(serverOptions);

io.on('connection', (sock) => {
  logger.info(`ID: ${sock.id} connected`);
  sock.on('disconnect', () => {
    logger.info(`ID: ${sock.id} disconnected`);
  });
});

http.listen(PORT, () => {
  logger.info(`Server running on port: ${PORT}`);
  logger.info(`Swagger docs: http://localhost:${PORT}/api-docs`);
  logger.info(`Webhook destino: ${serverOptions.webhook?.url}`);
  if (serverOptions.startAllSession) startAllSessions(serverOptions, logger);
});
