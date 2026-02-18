// api/proxy.js - Полная версия с поддержкой авторизации
const TOKEN = '8550352315:AAEQ0Ixpe17_YEWiJD4RLhAs5BbqIoUirmY';
const CHAT_ID = '-1002168026878';

// Хранилище для временных кодов авторизации (вне функции, чтобы сохранялось между запросами)
// ВНИМАНИЕ: Это in-memory хранилище, которое сбрасывается при перезапуске сервера
// Для продакшена лучше использовать Redis или другую БД
const authCodes = new Map();

// Хранилище для сообщений с сайта
let siteMessages = [];

export default async function handler(req, res) {
  // Настройки CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Обработка preflight запросов
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
        authCodes.delete(code); // Код одноразовый
        
        // Отправляем приветственное сообщение в личку
        try {
          await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: user.id,
              text: `👋 Добро пожаловать в КОЕ чат! Теперь вы можете писать сообщения с сайта.`,
              parse_mode: 'HTML'
            })
          });
        } catch (e) {
          console.log('Не удалось отправить приветствие');
        }
        
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
          .filter(item => item.message && item.message.chat.id == CHAT_ID)
          .map(item => {
            const msg = item.message;
            const from = msg.from;
            
            return {
              id: msg.message_id,
              text: msg.text || '',
              fromId: from.id,
              fromName: from.first_name,
              fromUsername: from.username,
              isFromSite: from.is_bot || false,
              date: msg.date
            };
          });
      }
      
      // Объединяем с сообщениями с сайта
      const allMessages = [...telegramMessages, ...siteMessages]
        .sort((a, b) => a.date - b.date);
      
      res.status(200).json({ ok: true, messages: allMessages });
    } catch (error) {
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
      
      // Сохраняем локально для мгновенного отображения
      if (data.ok) {
        const cleanText = text.replace(/<[^>]*>/g, '');
        siteMessages.push({
          id: `site_${Date.now()}`,
          text: cleanText,
          fromId: 0,
          fromName: 'Сайт',
          fromUsername: 'site',
          isFromSite: true,
          date: Math.floor(Date.now() / 1000)
        });
        
        // Ограничиваем историю
        if (siteMessages.length > 100) {
          siteMessages = siteMessages.slice(-100);
        }
      }
      
      res.status(200).json(data);
    } catch (error) {
      res.status(500).json({ error: error.toString() });
    }
    return;
  }

  // ===== ОБРАБОТКА ВЕБХУКА (ДЛЯ КОМАНД ОТ БОТА) =====
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
        
        // Сохраняем код авторизации (на 5 минут)
        authCodes.set(authCode, user);
        
        // Удаляем через 5 минут
        setTimeout(() => {
          authCodes.delete(authCode);
        }, 5 * 60 * 1000);
        
        // Отправляем подтверждение пользователю
        await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: body.message.chat.id,
            text: `✅ Авторизация успешна! Теперь вы можете писать в чат на сайте.\n\nВаш ник: ${user.username ? '@' + user.username : user.first_name}`,
            parse_mode: 'HTML'
          })
        });
        
        res.status(200).json({ ok: true });
        return;
      }
      
      // Обработка обычного /start
      if (body.message && body.message.text === '/start') {
        await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: body.message.chat.id,
            text: `👋 Привет! Чтобы авторизоваться на сайте, перейди по ссылке с сайта.`,
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
      authCodesCount: authCodes.size,
      siteMessagesCount: siteMessages.length
    });
    return;
  }

  // ===== НЕИЗВЕСТНОЕ ДЕЙСТВИЕ =====
  res.status(404).json({ 
    error: 'Action not found',
    availableActions: ['test', 'getMessages', 'sendMessage', 'checkAuth', 'webhook']
  });
}
