// api/proxy.js - Прокси для КОЕ ЧАТа
export default async function handler(req, res) {
  // ===== НАСТРОЙКИ =====
  const TOKEN = '8550352315:AAEQ0Ixpe17_YEWiJD4RLhAs5BbqIoUirmY';
  const CHAT_ID = '-1002168026878'; // ID супергруппы КОЕ ЧАТ
  
  // Хранилище для сообщений с сайта (в памяти)
  let siteMessages = [];

  // Настройки CORS для доступа с любого сайта
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Обработка preflight запросов (OPTIONS)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { action } = req.query;

  // ===== 1. ПОЛУЧЕНИЕ СООБЩЕНИЙ =====
  if (action === 'getMessages') {
    try {
      // Получаем обновления из Telegram
      const response = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates`);
      const data = await response.json();
      
      let telegramMessages = [];
      if (data.ok && data.result) {
        telegramMessages = data.result
          // Фильтруем только сообщения из нашего чата
          .filter(item => item.message && item.message.chat.id == CHAT_ID)
          .map(item => {
            const msg = item.message;
            const from = msg.from;
            
            return {
              id: msg.message_id,
              text: msg.text || '',
              fromId: from.id,
              fromName: from.first_name + (from.last_name ? ' ' + from.last_name : ''),
              fromUsername: from.username || 'user_' + from.id,
              isFromSite: from.is_bot || false, // сообщения от бота считаем с сайта
              date: msg.date,
              replyTo: msg.reply_to_message?.message_id || null
            };
          });
      }
      
      // Объединяем с сообщениями, отправленными с этого сайта (хранятся локально)
      const allMessages = [...siteMessages, ...telegramMessages]
        .sort((a, b) => a.date - b.date); // сортируем по времени
      
      res.status(200).json({ ok: true, messages: allMessages });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.toString() });
    }
  }

  // ===== 2. ОТПРАВКА СООБЩЕНИЯ =====
  else if (action === 'sendMessage' && req.method === 'POST') {
    try {
      const { text, username, replyTo } = req.body;
      
      // Формируем текст с подписью "От @никнейм с сайта"
      const siteText = username 
        ? `👤 Сайт: @${username}\n${text}`
        : `👤 С сайта\n${text}`;
      
      // Параметры отправки
      const params = {
        chat_id: CHAT_ID,
        text: siteText
      };
      
      // Если это ответ на другое сообщение
      if (replyTo) {
        params.reply_parameters = {
          message_id: replyTo
        };
      }
      
      const response = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      
      const data = await response.json();
      
      // Сохраняем сообщение локально, чтобы оно сразу появилось на сайте
      if (data.ok) {
        siteMessages.push({
          id: `site_${Date.now()}`,
          text: text,
          fromName: username || 'Аноним',
          fromUsername: username,
          isFromSite: true,
          date: Math.floor(Date.now() / 1000),
          replyTo: replyTo
        });
        
        // Ограничиваем историю 100 сообщениями
        if (siteMessages.length > 100) {
          siteMessages = siteMessages.slice(-100);
        }
      }
      
      res.status(200).json(data);
    } catch (error) {
      res.status(500).json({ ok: false, error: error.toString() });
    }
  }

  // ===== 3. ДОБАВЛЕНИЕ РЕАКЦИИ =====
  else if (action === 'addReaction' && req.method === 'POST') {
    try {
      const { messageId, reaction } = req.body;
      
      // Проверяем, что реакция допустима
      const validReactions = ['👍', '💩', '🤝', '❤️'];
      if (!validReactions.includes(reaction)) {
        res.status(400).json({ ok: false, error: 'Invalid reaction' });
        return;
      }
      
      const response = await fetch(`https://api.telegram.org/bot${TOKEN}/setMessageReaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          message_id: messageId,
          reaction: [{ type: 'emoji', emoji: reaction }]
        })
      });
      
      const data = await response.json();
      res.status(200).json(data);
    } catch (error) {
      res.status(500).json({ ok: false, error: error.toString() });
    }
  }

  // ===== 4. ТЕСТОВЫЙ ЭНДПОИНТ =====
  else if (action === 'test') {
    res.status(200).json({ 
      ok: true, 
      message: 'Proxy is working',
      chatId: CHAT_ID,
      time: Date.now()
    });
  }

  // ===== ЕСЛИ НЕИЗВЕСТНОЕ ДЕЙСТВИЕ =====
  else {
    res.status(404).json({ 
      ok: false, 
      error: 'Action not found',
      availableActions: ['test', 'getMessages', 'sendMessage', 'addReaction']
    });
  }
              }
