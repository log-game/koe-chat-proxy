// api/proxy.js - СТАБИЛЬНАЯ ВЕРСИЯ
const TOKEN = '8550352315:AAEQ0Ixpe17_YEWiJD4RLhAs5BbqIoUirmY';
const CHAT_ID = '-1002168026878';

// Используем глобальное хранилище (в Vercel оно сохраняется между вызовами)
// НО! При перезапуске функции данные всё равно сбросятся
// Для продакшена нужно использовать базу данных, но для теста сойдёт
const authStore = new Map();
const messageStore = new Map();

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

  // ===== ПОЛУЧЕНИЕ СООБЩЕНИЙ =====
  if (action === 'getMessages') {
    try {
      console.log('Fetching messages from Telegram...');
      
      // Получаем сообщения из Telegram
      const response = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates`);
      const data = await response.json();
      
      let messages = [];
      
      if (data.ok && data.result) {
        messages = data.result
          .filter(item => {
            return item.message && 
                   item.message.chat && 
                   item.message.chat.id == CHAT_ID &&
                   item.message.text;
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
              isFromBot: msg.from.is_bot || false
            };
          });
      }
      
      console.log(`Found ${messages.length} messages from Telegram`);
      
      // Добавляем сообщения из нашего хранилища (отправленные с сайта)
      const siteMessages = [];
      messageStore.forEach((value, key) => {
        siteMessages.push(value);
      });
      
      console.log(`Found ${siteMessages.length} messages from site store`);
      
      // Объединяем и сортируем
      const allMessages = [...messages, ...siteMessages]
        .sort((a, b) => a.date - b.date);
      
      res.status(200).json({ 
        ok: true, 
        messages: allMessages,
        count: allMessages.length
      });
      
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ ok: false, error: error.toString() });
    }
    return;
  }

  // ===== ОТПРАВКА СООБЩЕНИЯ =====
  if (action === 'sendMessage' && req.method === 'POST') {
    try {
      const { text, parse_mode, userId, userName } = req.body;
      
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
      
      // Сохраняем сообщение в наше хранилище
      if (data.ok) {
        const messageId = Date.now();
        messageStore.set(messageId.toString(), {
          id: messageId,
          text: text.replace(/<[^>]*>/g, ''), // очищаем от HTML
          date: Math.floor(Date.now() / 1000),
          fromId: userId || 0,
          fromName: userName || 'User',
          isFromBot: true,
          isFromSite: true
        });
        
        // Очищаем старые сообщения (оставляем последние 100)
        if (messageStore.size > 100) {
          const keys = Array.from(messageStore.keys()).slice(0, messageStore.size - 100);
          keys.forEach(key => messageStore.delete(key));
        }
      }
      
      res.status(200).json(data);
      
    } catch (error) {
      console.error('Send error:', error);
      res.status(500).json({ error: error.toString() });
    }
    return;
  }

  // ===== ПРОВЕРКА АВТОРИЗАЦИИ =====
  if (action === 'checkAuth') {
    try {
      const { code } = req.query;
      
      if (authStore.has(code)) {
        const user = authStore.get(code);
        authStore.delete(code);
        res.status(200).json({ ok: true, user });
      } else {
        res.status(200).json({ ok: false });
      }
    } catch (error) {
      res.status(500).json({ ok: false, error: error.toString() });
    }
    return;
  }

  // ===== ВЕБХУК =====
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
        
        authStore.set(authCode, user);
        
        await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: body.message.chat.id,
            text: '✅ Авторизация успешна! Можете вернуться на сайт.'
          })
        });
        
        setTimeout(() => authStore.delete(authCode), 300000);
      }
      
      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).json({ error: error.toString() });
    }
    return;
  }

  // ===== ТЕСТ =====
  if (action === 'test') {
    res.status(200).json({ 
      ok: true, 
      message: 'Proxy is working',
      chatId: CHAT_ID,
      authCount: authStore.size,
      messageCount: messageStore.size
    });
    return;
  }

  res.status(404).json({ error: 'Action not found' });
}
