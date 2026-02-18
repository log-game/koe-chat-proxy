// api/proxy.js - ПОЛНАЯ РАБОЧАЯ ВЕРСИЯ
const TOKEN = '8550352315:AAEQ0Ixpe17_YEWiJD4RLhAs5BbqIoUirmY';
const CHAT_ID = '-1002168026878'; // ID супергруппы КОЕ ЧАТ

// Хранилища (в памяти Vercel)
const authCodes = new Map(); // коды авторизации
const siteMessages = []; // сообщения с сайта
const userSpam = new Map(); // для анти-спама { userId: [timestamps] }
const bannedUsers = new Set(); // заглушка для банов (в реальности нужно получать из Telegram)

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

  // ===== 1. ПОЛУЧЕНИЕ СООБЩЕНИЙ =====
  if (action === 'getMessages') {
    try {
      const response = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates`);
      const data = await response.json();
      
      let telegramMessages = [];
      if (data.ok && data.result) {
        telegramMessages = data.result
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
              isFromSite: from.is_bot || false,
              date: msg.date
            };
          });
      }
      
      // Объединяем с сообщениями с сайта
      const allMessages = [...siteMessages, ...telegramMessages]
        .sort((a, b) => a.date - b.date);
      
      res.status(200).json({ ok: true, messages: allMessages });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.toString() });
    }
    return;
  }

  // ===== 2. ОТПРАВКА СООБЩЕНИЯ =====
  if (action === 'sendMessage' && req.method === 'POST') {
    try {
      const { text, parse_mode, userId, username, first_name } = req.body;
      
      // ===== АНТИ-СПАМ ПРОВЕРКА =====
      const now = Date.now();
      const userTimestamps = userSpam.get(userId) || [];
      const recentMessages = userTimestamps.filter(t => now - t < 60000); // за последнюю минуту
      
      if (recentMessages.length >= 5) {
        res.status(429).json({ 
          ok: false, 
          error: 'SPAM_LIMIT',
          message: 'Слишком много сообщений. Подождите минуту.'
        });
        return;
      }
      
      // ===== ПРОВЕРКА БАНА/МУТА =====
      // В реальности нужно проверять через Telegram API статус участника
      // Это заглушка - проверяем наличие в Set
      if (bannedUsers.has(userId)) {
        res.status(403).json({ 
          ok: false, 
          error: 'USER_BANNED',
          message: 'Вы забанены в чате'
        });
        return;
      }
      
      // Формируем имя для отображения
      const displayName = username ? `@${username}` : (first_name || 'Пользователь');
      const messageText = `<a href="tg://user?id=${userId}">${displayName}</a>: ${text}`;
      
      // Отправляем в Telegram
      const params = {
        chat_id: CHAT_ID,
        text: messageText,
        parse_mode: 'HTML'
      };
      
      const response = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      
      const data = await response.json();
      
      // Если успешно - сохраняем
      if (data.ok) {
        // Обновляем спам-счетчик
        userTimestamps.push(now);
        userSpam.set(userId, userTimestamps.filter(t => now - t < 60000));
        
        // Сохраняем сообщение локально
        siteMessages.push({
          id: `site_${Date.now()}`,
          text: text,
          fromId: userId,
          fromName: displayName,
          fromUsername: username,
          isFromSite: true,
          date: Math.floor(now / 1000)
        });
        
        // Ограничиваем историю
        if (siteMessages.length > 100) {
          siteMessages.splice(0, siteMessages.length - 100);
        }
      }
      
      res.status(200).json(data);
    } catch (error) {
      res.status(500).json({ ok: false, error: error.toString() });
    }
    return;
  }

  // ===== 3. АВТОРИЗАЦИЯ =====
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

  // ===== 4. ВЕБХУК ДЛЯ БОТА =====
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

  // ===== 5. ТЕСТОВЫЙ ЭНДПОИНТ =====
  if (action === 'test') {
    res.status(200).json({ 
      ok: true, 
      message: 'Proxy is working',
      chatId: CHAT_ID,
      time: Date.now()
    });
    return;
  }

  // ===== 6. GET UPDATES ДЛЯ СОВМЕСТИМОСТИ =====
  if (action === 'getUpdates') {
    try {
      const response = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates`);
      const data = await response.json();
      res.status(200).json(data);
    } catch (error) {
      res.status(500).json({ ok: false, error: error.toString() });
    }
    return;
  }

  res.status(404).json({ 
    ok: false, 
    error: 'Action not found',
    availableActions: ['test', 'getMessages', 'getUpdates', 'sendMessage', 'checkAuth', 'webhook']
  });
}
