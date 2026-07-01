/*
 * Copyright 2023 WPPConnect Team
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {
  CreateBucketCommand,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import api from 'axios';
import Crypto from 'crypto';
import { Request } from 'express';
import fs from 'fs';
import mimetypes from 'mime-types';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

import config from '../config';
import { convert } from '../mapper/index';
import { ServerOptions } from '../types/ServerOptions';
import { bucketAlreadyExists } from './bucketAlreadyExists';

let mime: any, crypto: any; //, aws: any;
if (config.webhook.uploadS3) {
  mime = config.webhook.uploadS3 ? mimetypes : null;
  crypto = config.webhook.uploadS3 ? Crypto : null;
}
if (config?.websocket?.uploadS3) {
  mime = config.websocket.uploadS3 ? mimetypes : null;
  crypto = config.websocket.uploadS3 ? Crypto : null;
}

export function contactToArray(
  number: any,
  isGroup?: boolean,
  isNewsletter?: boolean,
  isLid?: boolean
) {
  const localArr: any = [];
  if (Array.isArray(number)) {
    for (let contact of number) {
      isGroup || isNewsletter
        ? (contact = contact.split('@')[0])
        : (contact = contact.split('@')[0]?.replace(/[^\w ]/g, ''));
      if (contact !== '')
        if (isGroup) (localArr as any).push(`${contact}@g.us`);
        else if (isNewsletter) (localArr as any).push(`${contact}@newsletter`);
        else if (isLid || contact.length > 14)
          (localArr as any).push(`${contact}@lid`);
        else (localArr as any).push(`${contact}@c.us`);
    }
  } else {
    const arrContacts = number.split(/\s*[,;]\s*/g);
    for (let contact of arrContacts) {
      isGroup || isNewsletter
        ? (contact = contact.split('@')[0])
        : (contact = contact.split('@')[0]?.replace(/[^\w ]/g, ''));
      if (contact !== '')
        if (isGroup) (localArr as any).push(`${contact}@g.us`);
        else if (isNewsletter) (localArr as any).push(`${contact}@newsletter`);
        else if (isLid || contact.length > 14)
          (localArr as any).push(`${contact}@lid`);
        else (localArr as any).push(`${contact}@c.us`);
    }
  }

  return localArr;
}

export function groupToArray(group: any) {
  const localArr: any = [];
  if (Array.isArray(group)) {
    for (let contact of group) {
      contact = contact.split('@')[0];
      if (contact !== '') (localArr as any).push(`${contact}@g.us`);
    }
  } else {
    const arrContacts = group.split(/\s*[,;]\s*/g);
    for (let contact of arrContacts) {
      contact = contact.split('@')[0];
      if (contact !== '') (localArr as any).push(`${contact}@g.us`);
    }
  }

  return localArr;
}

export function groupNameToArray(group: any) {
  const localArr: any = [];
  if (Array.isArray(group)) {
    for (const contact of group) {
      if (contact !== '') (localArr as any).push(`${contact}`);
    }
  } else {
    const arrContacts = group.split(/\s*[,;]\s*/g);
    for (const contact of arrContacts) {
      if (contact !== '') (localArr as any).push(`${contact}`);
    }
  }

  return localArr;
}

function sanitizeWebhookPayload(data: any): Record<string, unknown> {
  if (data == null || typeof data !== 'object') {
    return { value: data };
  }

  const payload: Record<string, unknown> = {};
  const safeKeys = [
    'id',
    'body',
    'caption',
    'content',
    'from',
    'to',
    'author',
    'fromMe',
    'isGroupMsg',
    'type',
    't',
    'timestamp',
    'ack',
    'isMedia',
    'isMMS',
    'mimetype',
    'notifyName',
    'quotedMsgId',
    'mentionedIds',
    'broadcast',
    'isForwarded',
  ];

  for (const key of safeKeys) {
    if (data[key] !== undefined && data[key] !== null) {
      payload[key] = data[key];
    }
  }

  if (data.sender && typeof data.sender === 'object') {
    payload.sender = {
      id: data.sender.id?._serialized ?? data.sender.id ?? null,
      pushname: data.sender.pushname ?? data.sender.name ?? null,
      name: data.sender.name ?? null,
      formattedName: data.sender.formattedName ?? null,
      isMyContact: data.sender.isMyContact ?? false,
    };
  }

  if (data.chatId && typeof data.chatId === 'object') {
    payload.chatId =
      data.chatId._serialized ?? data.chatId.user ?? String(data.chatId);
  } else if (typeof data.chatId === 'string') {
    payload.chatId = data.chatId;
  }

  return payload;
}

function resolveWebhookUrl(client: any, req: Request): string | false {
  const sessionWebhook = client?.config?.webhook;
  if (typeof sessionWebhook === 'string' && sessionWebhook.trim()) {
    return sessionWebhook.trim();
  }
  const defaultUrl = req.serverOptions?.webhook?.url;
  if (typeof defaultUrl === 'string' && defaultUrl.trim()) {
    return defaultUrl.trim();
  }
  return false;
}

function isMapperEnabled(req: Request): boolean {
  return Boolean(
    req.serverOptions?.webhook?.mapper?.enable ??
      req.serverOptions?.mapper?.enable
  );
}

function isArchiveEnabled(req: Request): boolean {
  return Boolean(
    req.serverOptions?.webhook?.archive?.enable ??
      req.serverOptions?.archive?.enable
  );
}

async function applyMapperIfEnabled(
  req: Request,
  payload: any,
  event: string
): Promise<any> {
  if (!isMapperEnabled(req)) {
    console.log('[WEBHOOK] mapper desactivado — payload sin transformar');
    return payload;
  }

  // onmessage debe llegar con body/from intactos para FastAPI
  if (event === 'onmessage') {
    console.log(
      '[WEBHOOK] mapper activo pero onmessage se envía sin transformar (FastAPI usa body/from)'
    );
    return payload;
  }

  const prefix =
    req.serverOptions?.webhook?.mapper?.prefix ??
    req.serverOptions?.mapper?.prefix ??
    'tagone-';

  try {
    const mapped = await convert(prefix, payload);
    console.log(
      `[WEBHOOK] mapper activo — payload transformado (event=${event})`
    );
    return mapped;
  } catch (error) {
    console.warn(
      '[WEBHOOK] mapper falló, se envía payload original:',
      error instanceof Error ? error.message : error
    );
    return payload;
  }
}

export async function callWebHook(
  client: any,
  req: Request,
  event: any,
  data: any
) {
  if (!req || !req.serverOptions) {
    console.warn('[WEBHOOK] Abortado: req o serverOptions no definidos');
    return;
  }

  const webhook = resolveWebhookUrl(client, req);

  console.log(
    `[WEBHOOK] Disparando event="${event}" → ${webhook || 'SIN URL'} | from="${
      data?.from ?? 'n/a'
    }"`
  );

  if (!webhook) {
    console.warn('[WEBHOOK] Abortado: no hay URL (config.ts ni sesión)');
    return;
  }

  const ignoreList = req.serverOptions?.webhook?.ignore ?? [];
  if (
    ignoreList.includes(event) ||
    ignoreList.includes(data?.from) ||
    ignoreList.includes(data?.type)
  ) {
    console.log(`[WEBHOOK] Ignorado por ignore[]: event="${event}"`);
    return;
  }

  if (req.serverOptions?.webhook?.autoDownload) {
    try {
      await autoDownload(client, req, data);
    } catch (error) {
      console.warn(
        '[WEBHOOK] autoDownload falló, continuando POST:',
        error instanceof Error ? error.message : error
      );
    }
  }

  try {
    const chatId =
      data?.from ||
      data?.chatId ||
      (data?.chatId ? data.chatId._serialized : null);

    let payload: Record<string, unknown> = Object.assign(
      { event, session: client?.session ?? 'unknown' },
      sanitizeWebhookPayload(data)
    );

    payload = await applyMapperIfEnabled(req, payload, event);

    console.log(
      `[WEBHOOK] POST enviando → ${webhook} | body="${String(
        payload.body ?? ''
      ).slice(0, 60)}"`
    );

    const response = await api.post(webhook, payload, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });

    console.log(
      `[WEBHOOK] ✓ POST OK status=${response.status} event="${event}"`
    );

    try {
      const events = ['unreadmessages', 'onmessage'];
      if (
        events.includes(event) &&
        req.serverOptions?.webhook?.readMessage &&
        client?.sendSeen
      ) {
        await client.sendSeen(chatId);
      }
    } catch (seenError) {
      console.warn(
        '[WEBHOOK] sendSeen falló (no bloquea webhook):',
        seenError instanceof Error ? seenError.message : seenError
      );
    }
  } catch (error: any) {
    console.error(`[WEBHOOK] ✗ POST FAIL event="${event}"`);
    console.error(
      '[WEBHOOK] ✗',
      error?.message ?? error,
      '| httpStatus=',
      error?.response?.status ?? 'sin respuesta'
    );
    req.logger?.warn?.('Error calling Webhook.', error);
  }
}

export async function autoDownload(client: any, req: any, message: any) {
  try {
    if (message && (message['mimetype'] || message.isMedia || message.isMMS)) {
      const buffer = await client.decryptFile(message);
      if (
        req.serverOptions.webhook.uploadS3 ||
        req.serverOptions?.websocket?.uploadS3
      ) {
        const hashName = crypto.randomBytes(24).toString('hex');

        if (
          !config?.aws_s3?.region ||
          !config?.aws_s3?.access_key_id ||
          !config?.aws_s3?.secret_key
        )
          throw new Error('Please, configure your aws configs');
        const s3Client = new S3Client({
          region: config?.aws_s3?.region,
          endpoint: config?.aws_s3?.endpoint || undefined,
          forcePathStyle: config?.aws_s3?.forcePathStyle || undefined,
        });
        let bucketName = config?.aws_s3?.defaultBucketName
          ? config?.aws_s3?.defaultBucketName
          : client.session;
        bucketName = bucketName
          .normalize('NFD')
          .replace(/[\u0300-\u036f]|[— _.,?!]/g, '')
          .toLowerCase();
        bucketName =
          bucketName.length < 3
            ? bucketName +
              `${Math.floor(Math.random() * (999 - 100 + 1)) + 100}`
            : bucketName;
        const fileName = `${
          config.aws_s3.defaultBucketName ? client.session + '/' : ''
        }${hashName}.${mime.extension(message.mimetype)}`;

        if (
          !config.aws_s3.defaultBucketName &&
          !(await bucketAlreadyExists(bucketName))
        ) {
          await s3Client.send(
            new CreateBucketCommand({
              Bucket: bucketName,
              ObjectOwnership: 'ObjectWriter',
            })
          );
          await s3Client.send(
            new PutPublicAccessBlockCommand({
              Bucket: bucketName,
              PublicAccessBlockConfiguration: {
                BlockPublicAcls: false,
                IgnorePublicAcls: false,
                BlockPublicPolicy: false,
              },
            })
          );
        }

        await s3Client.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: fileName,
            Body: buffer,
            ContentType: message.mimetype,
            ACL: 'public-read',
          })
        );

        message.fileUrl = `https://${bucketName}.s3.amazonaws.com/${fileName}`;
      } else {
        message.body = await buffer.toString('base64');
      }
    }
  } catch (e) {
    req.logger.error(e);
  }
}

export async function startAllSessions(config: any, logger: any) {
  try {
    await api.post(
      `${config.host}:${config.port}/api/${config.secretKey}/start-all`
    );
  } catch (e) {
    logger.error(e);
  }
}

export async function startHelper(client: any, req: any) {
  if (req?.serverOptions?.webhook?.allUnreadOnStart) {
    await sendUnread(client, req);
  }

  if (isArchiveEnabled(req)) {
    await archive(client, req);
  }
}

async function sendUnread(client: any, req: any) {
  req.logger.info(`${client.session} : Inicio enviar mensagens não lidas`);

  try {
    const chats = await client.getAllChatsWithMessages(true);

    if (chats && chats.length > 0) {
      for (let i = 0; i < chats.length; i++)
        for (let j = 0; j < chats[i].msgs.length; j++) {
          callWebHook(client, req, 'unreadmessages', chats[i].msgs[j]);
        }
    }

    req.logger.info(`${client.session} : Fim enviar mensagens não lidas`);
  } catch (ex) {
    req.logger.error(ex);
  }
}

async function archive(client: any, req: any) {
  async function sleep(time: number) {
    return new Promise((resolve) => setTimeout(resolve, time * 10));
  }

  req.logger.info(`${client.session} : Inicio arquivando chats`);

  try {
    let chats = await client.getAllChats();
    if (chats && Array.isArray(chats) && chats.length > 0) {
      chats = chats.filter((c) => !c.archive);
    }
    if (chats && Array.isArray(chats) && chats.length > 0) {
      for (let i = 0; i < chats.length; i++) {
        const date = new Date(chats[i].t * 1000);

        if (DaysBetween(date) > req.serverOptions.archive.daysToArchive) {
          await client.archiveChat(
            chats[i].id.id || chats[i].id._serialized,
            true
          );
          await sleep(
            Math.floor(Math.random() * req.serverOptions.archive.waitTime + 1)
          );
        }
      }
    }
    req.logger.info(`${client.session} : Fim arquivando chats`);
  } catch (ex) {
    req.logger.error(ex);
  }
}

function DaysBetween(StartDate: Date) {
  const endDate = new Date();
  // The number of milliseconds in all UTC days (no DST)
  const oneDay = 1000 * 60 * 60 * 24;

  // A day in UTC always lasts 24 hours (unlike in other time formats)
  const start = Date.UTC(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate()
  );
  const end = Date.UTC(
    StartDate.getFullYear(),
    StartDate.getMonth(),
    StartDate.getDate()
  );

  // so it's safe to divide by 24 hours
  return (start - end) / oneDay;
}

export function createFolders() {
  const __dirname = path.resolve(path.dirname(''));
  const dirFiles = path.resolve(__dirname, 'WhatsAppImages');
  if (!fs.existsSync(dirFiles)) {
    fs.mkdirSync(dirFiles);
  }

  const dirUpload = path.resolve(__dirname, 'uploads');
  if (!fs.existsSync(dirUpload)) {
    fs.mkdirSync(dirUpload);
  }
}

export function strToBool(s: string) {
  return /^(true|1)$/i.test(s);
}

export function getIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface: any = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (
        alias.family === 'IPv4' &&
        alias.address !== '127.0.0.1' &&
        !alias.internal
      )
        return alias.address;
    }
  }
  return '0.0.0.0';
}

export function setMaxListners(serverOptions: ServerOptions) {
  if (serverOptions && Number.isInteger(serverOptions.maxListeners)) {
    process.setMaxListeners(serverOptions.maxListeners);
  }
}

export const unlinkAsync = promisify(fs.unlink);

export function createCatalogLink(session: any) {
  const [wid] = session.split('@');
  return `https://wa.me/c/${wid}`;
}
