// api/proxy.js - ИСПРАВЛЕННАЯ ВЕРСИЯ
const TOKEN = '8550352315:AAGSuiM_dm9ycPD2RmrxZjYxqhXL8U8B2A8';
const CHAT_ID = '-1002168026878';

// Хранилище кодов авторизации
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

  // ===== ПОЛУЧЕНИЕ СООБЩЕНИЙ (исправлено) =====
  if (action === 'getUpdates') {
    try {
      const response = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates`);
      const data = await response.json();
      res.status(200).json(data);
    } catch (error) {
      res.status(500).json({ error: error.toString() });
    }
    return;
  }

  // ===== ОТПРАВКА СООБЩЕНИЯ =====
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
    console.log('checkAuth called with code:', code);
    console.log('Current authCodes:', Array.from(authCodes.entries()));
    
    if (authCodes.has(code)) {
      const user = authCodes.get(code);
      authCodes.delete(code);
      console.log('User found and deleted:', user);
      res.status(200).json({ ok: true, user });
    } else {
      console.log('Code not found');
      res.status(200).json({ ok: false });
    }
    return;
  }

  // ===== ВЕБХУК ДЛЯ БОТА =====
  if (action === 'webhook' && req.method === 'POST') {
    try {
      const body = req.body;
      console.log('Webhook received:', JSON.stringify(body, null, 2));
      
      // Обработка /start с кодом
      if (body.message && body.message.text) {
        const text = body.message.text;
        
        if (text.startsWith('/start auth_')) {
          const authCode = text.replace('/start auth_', '');
          const user = {
            id: body.message.from.id,
            username: body.message.from.username,
            first_name: body.message.from.first_name
          };
          
          // Сохраняем пользователя
          authCodes.set(authCode, user);
          console.log('User saved with code:', authCode, user);
          
          // Отправляем подтверждение
          const displayName = user.username ? `@${user.username}` : user.first_name;
          await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: body.message.chat.id,
              text: `✅ Авторизация успешна! Теперь вы можете писать в чат на сайте.\n\nВаш ник: ${displayName}\n👋 Добро пожаловать в КОЕ чат!`
            })
          });

          // Удаляем код через 5 минут
          setTimeout(() => {
            authCodes.delete(authCode);
            console.log('Auth code expired:', authCode);
          }, 300000);
          
          res.status(200).json({ ok: true });
          return;
        }
        
        // Обычный /start
        if (text === '/start') {
          await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: body.message.chat.id,
              text: `👋 Привет! Чтобы авторизоваться на сайте, нажми кнопку "Войти через Telegram" на сайте.`
            })
          });
          res.status(200).json({ ok: true });
          return;
        }
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
    res.status(200).json({ 
      ok: true, 
      message: 'Proxy is working',
      chatId: CHAT_ID,
      authCodesCount: authCodes.size,
      authCodes: Array.from(authCodes.keys())
    });
    return;
  }

  res.status(404).json({ error: 'Action not found' });
}
