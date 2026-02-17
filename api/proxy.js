// api/proxy.js - Полная версия для КОЕ чата
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

  // ===== 2. ОТПРАВКА СООБЩЕНИЯ (С ПОДДЕРЖКОЙ HTML) =====
  else if (action === 'sendMessage' && req.method === 'POST') {
    try {
      const { text, parse_mode } = req.body; // получаем parse_mode из запроса
      
      const params = {
        chat_id: CHAT_ID,
        text: text
      };
      
      // Если передан parse_mode, добавляем его (для HTML-ссылок)
      if (parse_mode) {
        params.parse_mode = parse_mode;
      }
      
      const response = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      
      const data = await response.json();
      
      // Сохраняем сообщение локально, чтобы оно сразу появилось на сайте
      if (data.ok) {
        // Извлекаем чистый текст без HTML для локального хранения
        const cleanText = text.replace(/<[^>]*>/g, '');
        
        siteMessages.push({
          id: `site_${Date.now()}`,
          text: cleanText,
          fromName: 'Сайт',
          fromUsername: 'site_user',
          isFromSite: true,
          date: Math.floor(Date.now() / 1000)
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

  // ===== 3. ТЕСТОВЫЙ ЭНДПОИНТ =====
  else if (action === 'test') {
    res.status(200).json({ 
      ok: true, 
      message: 'Proxy is working',
      chatId: CHAT_ID,
      time: Date.now()
    });
  }

  // ===== 4. ПОЛУЧЕНИЕ ОБНОВЛЕНИЙ (ДЛЯ СОВМЕСТИМОСТИ СО СТАРЫМ КОДОМ) =====
  else if (action === 'getUpdates') {
    try {
      const response = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates`);
      const data = await response.json();
      res.status(200).json(data);
    } catch (error) {
      res.status(500).json({ ok: false, error: error.toString() });
    }
  }

  // ===== ЕСЛИ НЕИЗВЕСТНОЕ ДЕЙСТВИЕ =====
  else {
    res.status(404).json({ 
      ok: false, 
      error: 'Action not found',
      availableActions: ['test', 'getMessages', 'getUpdates', 'sendMessage']
    });
  }
}
