// api/proxy.js - Полная версия с поддержкой авторизации и правильным отображением
const TOKEN = '8550352315:AAEQ0Ixpe17_YEWiJD4RLhAs5BbqIoUirmY';
const CHAT_ID = '-1002168026878';

// Хранилище для временных кодов авторизации
const authCodes = new Map();

// Хранилище для истории отправленных сообщений с сайта (чтобы избежать дублирования)
const sentMessages = new Map(); // key: userId_timestamp, value: true

export default async function handler(req, res) {
  // Настройки CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { action } = req.query;

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

  // ===== ПОЛУЧЕНИЕ СООБЩЕНИЙ =====
  if (action === 'getMessages') {
    try {
      const response = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates`);
      const data = await response.json();
      
      let telegramMessages = [];
      if (data.ok && data.result) {
        telegramMessages = data.result
          .filter(item => {
            // Показываем только сообщения из нашего чата
            return item.message && item.message.chat.id == CHAT_ID;
          })
          .map(item => {
            const msg = item.message;
            const from = msg.from;
            
            // Определяем, от кого сообщение
            let messageType = 'other';
            let userId = from.id;
            
            // Если сообщение от бота - проверяем, не с сайта ли оно
            if (from.is_bot) {
              // Сообщения от бота считаем "с сайта"
              messageType = 'site';
            }
            
            return {
              id: msg.message_id,
              text: msg.text || '',
              userId: userId,
              userFirstName: from.first_name,
              userUsername: from.username,
              messageType: messageType, // 'site' или 'other'
              date: msg.date,
              raw: msg // сохраняем для отладки
            };
          });
      }
      
      res.status(200).json({ 
        ok: true, 
        messages: telegramMessages,
        count: telegramMessages.length
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.toString() });
    }
    return;
  }

  // ===== ОТПРАВКА СООБЩЕНИЯ =====
  if (action === 'sendMessage' && req.method === 'POST') {
    try {
      const { text, parse_mode, userId, username } = req.body;
      
      // Проверяем, не забанен ли пользователь
      // В реальном проекте здесь должна быть проверка через Telegram API
      // Сейчас просто пропускаем
      
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
      
      // Создаем уникальный ключ для этого сообщения
      const messageKey = `${userId}_${Date.now()}`;
      sentMessages.set(messageKey, true);
      
      // Очищаем старые записи через 1 минуту
      setTimeout(() => {
        sentMessages.delete(messageKey);
      }, 60000);
      
      res.status(200).json(data);
    } catch (error) {
      console.error('Send message error:', error);
      res.status(500).json({ error: error.toString() });
    }
    return;
  }

  // ===== ОБРАБОТКА ВЕБХУКА =====
  if (action === 'webhook' && req.method === 'POST') {
    try {
      const body = req.body;
      console.log('Webhook received:', body);
      
      // Обработка команды /start с кодом авторизации
      if (body.message && body.message.text && body.message.text.startsWith('/start auth_')) {
        const authCode = body.message.text.replace('/start auth_', '');
        const user = {
          id: body.message.from.id,
          username: body.message.from.username,
          first_name: body.message.from.first_name,
          last_name: body.message.from.last_name
        };
        
        authCodes.set(authCode, user);
        
        // Удаляем через 5 минут
        setTimeout(() => {
          authCodes.delete(authCode);
        }, 5 * 60 * 1000);
        
        // Отправляем подтверждение
        await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: body.message.chat.id,
            text: `✅ Авторизация успешна! Теперь вы можете писать в чат на сайте.`,
            parse_mode: 'HTML'
          })
        });
        
        res.status(200).json({ ok: true });
        return;
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
      authCodesCount: authCodes.size
    });
    return;
  }

  res.status(404).json({ 
    error: 'Action not found',
    availableActions: ['test', 'getMessages', 'sendMessage', 'checkAuth', 'webhook']
  });
}
