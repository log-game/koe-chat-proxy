// api/proxy.js - ДЛЯ КОЕ ЧАТА (с авторизацией)
const TOKEN = '8550352315:AAGSuiM_dm9ycPD2RmrxZjYxqhXL8U8B2A8';
const CHAT_ID = '-1002168026878';


// ===== ХРАНИЛИЩЕ (MVP) =====
const authCodes = new Map();
const messagesStore = [];

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { action } = req.query;

  // =========================
  // ПОЛУЧЕНИЕ СООБЩЕНИЙ
  // =========================
  if (action === 'getMessages') {
    return res.status(200).json({
      ok: true,
      messages: messagesStore.slice(-50)
    });
  }

  // =========================
  // ОТПРАВКА СООБЩЕНИЯ
  // =========================
  if (action === 'sendMessage' && req.method === 'POST') {
    try {
      const { text, parse_mode } = req.body;

      const tgResponse = await fetch(
        `https://api.telegram.org/bot${TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: CHAT_ID,
            text,
            parse_mode: parse_mode || undefined
          })
        }
      );

      const data = await tgResponse.json();
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ error: error.toString() });
    }
  }

  // =========================
  // ПРОВЕРКА АВТОРИЗАЦИИ
  // =========================
  if (action === 'checkAuth') {
    const { code } = req.query;

    if (authCodes.has(code)) {
      const user = authCodes.get(code);
      authCodes.delete(code);
      return res.status(200).json({ ok: true, user });
    }

    return res.status(200).json({ ok: false });
  }

  // =========================
  // WEBHOOK
  // =========================
  if (action === 'webhook' && req.method === 'POST') {
    try {
      const body = req.body;

      if (body.message) {
        const msg = body.message;

        // ===== СОХРАНЯЕМ СООБЩЕНИЯ ИЗ ГРУППЫ =====
        if (msg.chat.id == CHAT_ID && msg.text) {
          messagesStore.push({
            id: msg.message_id,
            text: msg.text,
            fromId: msg.from.id,
            fromUsername: msg.from.username,
            fromName: msg.from.first_name,
            isFromSite: msg.from.is_bot || false,
            date: msg.date
          });

          if (messagesStore.length > 200) {
            messagesStore.shift();
          }
        }

        // ===== АВТОРИЗАЦИЯ =====
        if (msg.text && msg.text.startsWith('/start auth_')) {
          const authCode = msg.text.replace('/start ', '');

          const user = {
            id: msg.from.id,
            username: msg.from.username,
            first_name: msg.from.first_name
          };

          authCodes.set(authCode, user);

          await fetch(
            `https://api.telegram.org/bot${TOKEN}/sendMessage`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: msg.chat.id,
                text: '✅ Авторизация успешна! Возвращайтесь на сайт.'
              })
            }
          );

          setTimeout(() => authCodes.delete(authCode), 300000);
        }
      }

      return res.status(200).json({ ok: true });
    } catch (error) {
      return res.status(500).json({ error: error.toString() });
    }
  }

  return res.status(404).json({ error: 'Action not found' });
}
