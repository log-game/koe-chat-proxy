// api/proxy.js - РАБОЧАЯ ВЕРСИЯ
const TOKEN = '8550352315:AAEQ0Ixpe17_YEWiJD4RLhAs5BbqIoUirmY';
const CHAT_ID = '-1002168026878';

// Хранилище для кодов авторизации
const authCodes = new Map();

export default async function handler(req, res) {
  // CORS настройки
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { action } = req.query;

  // ===== ПОЛУЧЕНИЕ СООБЩЕНИЙ (ИСПРАВЛЕНО!) =====
  if (action === 'getMessages') {
    try {
      console.log('Fetching updates from Telegram...');
      
      // Получаем обновления из Telegram
      const response = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates`);
      const data = await response.json();
      
      console.log('Telegram response:', JSON.stringify(data).substring(0, 200) + '...');
      
      let messages = [];
      
      if (data.ok && data.result) {
        // Фильтруем только сообщения из нашего чата
        messages = data.result
          .filter(item => {
            return item.message && 
                   item.message.chat && 
                   item.message.chat.id == CHAT_ID &&
                   item.message.text; // только текстовые сообщения
          })
          .map(item => {
            const msg = item.message;
            return {
              id: msg.message_id,
              text: msg.text,
              date: msg.date,
              fromId: msg.from.id,
              fromName: msg.from.first_name,
              fromUsername: msg.from.username,
              isFromSite: msg.from.is_bot || false
            };
          });
      }
      
      console.log(`Found ${messages.length} messages`);
      
      res.status(200).json({ 
        ok: true, 
        messages: messages,
        count: messages.length
      });
      
    } catch (error) {
      console.error('Error in getMessages:', error);
      res.status(500).json({ ok: false, error: error.toString() });
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
      
      if (parse_mode) {
        params.parse_mode = parse_mode;
      }
      
      const response = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      
      const data = await response.json();
      res.status(200).json(data);
      
    } catch (error) {
      console.error('Error in sendMessage:', error);
      res.status(500).json({ error: error.toString() });
    }
    return;
  }

  // ===== ПРОВЕРКА АВТОРИЗАЦИИ =====
  if (action === 'checkAuth') {
    try {
      const { code } = req.query;
      
      if (authCodes.has(code)) {
        const user = authCodes.get(code);
        authCodes.delete(code);
        res.status(200).json({ ok: true, user });
      } else {
        res.status(200).json({ ok: false });
      }
    } catch (error) {
      res.status(500).json({ ok: false, error: error.toString() });
    }
    return;
  }

  // ===== ВЕБХУК ДЛЯ БОТА =====
  if (action === 'webhook' && req.method === 'POST') {
    try {
      const body = req.body;
      console.log('Webhook received:', body);
      
      if (body.message && body.message.text && body.message.text.startsWith('/start auth_')) {
        const authCode = body.message.text.replace('/start auth_', '');
        const user = {
          id: body.message.from.id,
          username: body.message.from.username,
          first_name: body.message.from.first_name
        };
        
        authCodes.set(authCode, user);
        
        // Отправляем подтверждение
        await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: body.message.chat.id,
            text: '✅ Авторизация успешна! Можете вернуться на сайт.'
          })
        });
        
        setTimeout(() => authCodes.delete(authCode), 300000); // 5 минут
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
      chatId: CHAT_ID
    });
    return;
  }

  res.status(404).json({ error: 'Action not found' });
}
