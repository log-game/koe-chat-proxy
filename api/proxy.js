// api/proxy.js - РАБОЧАЯ ВЕРСИЯ С АВТОРИЗАЦИЕЙ
const TOKEN = '8550352315:AAGSuiM_dm9ycPD2RmrxZjYxqhXL8U8B2A8';
const CHAT_ID = '-1002168026878';

// Хранилище кодов авторизации (в памяти Vercel, может сбрасываться, но для авторизации этого достаточно)
const authCodes = new Map();

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

  // ===== ПОЛУЧЕНИЕ СООБЩЕНИЙ (КАК В РАБОЧЕЙ ВЕРСИИ) =====
  if (action === 'getMessages') {
    try {
      const response = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates`);
      const data = await response.json();

      let messages = [];
      if (data.ok && data.result) {
        messages = data.result
          .filter(item => item.message && item.message.chat.id == CHAT_ID)
          .map(item => {
            const msg = item.message;
            const from = msg.from;
            return {
              id: msg.message_id,
              text: msg.text || '',
              fromId: from.id,
              fromName: from.first_name + (from.last_name ? ' ' + from.last_name : ''),
              fromUsername: from.username,
              isFromSite: from.is_bot || false, // true для сообщений, отправленных через бота (с сайта)
              date: msg.date
            };
          });
      }

      res.status(200).json({ ok: true, messages });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.toString() });
    }
    return;
  }

  // ===== ОТПРАВКА СООБЩЕНИЯ (КАК В РАБОЧЕЙ ВЕРСИИ, БЕЗ СОХРАНЕНИЯ) =====
  if (action === 'sendMessage' && req.method === 'POST') {
    try {
      const { text, parse_mode } = req.body;

      const params = {
        chat_id: CHAT_ID,
        text: text
      };
      if (parse_mode) params.parse_mode = parse_mode;

      const response = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });

      const data = await response.json();
      res.status(200).json(data);
    } catch (error) {
      res.status(500).json({ error: error.toString() });
    }
    return;
  }

  // ===== ПРОВЕРКА АВТОРИЗАЦИИ =====
  if (action === 'checkAuth') {
    const { code } = req.query;
    if (authCodes.has(code)) {
      const user = authCodes.get(code);
      authCodes.delete(code);
      res.status(200).json({ ok: true, user });
    } else {
      res.status(200).json({ ok: false });
    }
    return;
  }

  // ===== ВЕБХУК ДЛЯ БОТА =====
  if (action === 'webhook' && req.method === 'POST') {
    try {
      const body = req.body;
      if (body.message && body.message.text && body.message.text.startsWith('/start auth_')) {
        const authCode = body.message.text.replace('/start auth_', '');
        const user = {
          id: body.message.from.id,
          username: body.message.from.username,
          first_name: body.message.from.first_name
        };
        authCodes.set(authCode, user);

        // Подтверждение пользователю
        await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: body.message.chat.id,
            text: '✅ Авторизация успешна! Можете вернуться на сайт.'
          })
        });

        // Удаляем код через 5 минут
        setTimeout(() => authCodes.delete(authCode), 300000);
      }
      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).json({ error: error.toString() });
    }
    return;
  }

  // ===== ТЕСТОВЫЙ ЭНДПОИНТ =====
  if (action === 'test') {
    res.status(200).json({ ok: true, message: 'Proxy is working' });
    return;
  }

  res.status(404).json({ error: 'Action not found' });
}
