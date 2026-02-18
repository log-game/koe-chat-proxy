// api/proxy.js - Версия с авторизацией через Telegram
export default async function handler(req, res) {
  // ===== НАСТРОЙКИ =====
  const TOKEN = '8550352315:AAEQ0Ixpe17_YEWiJD4RLhAs5BbqIoUirmY';
  const CHAT_ID = '-1002168026878'; // ID супергруппы КОЕ ЧАТ
  const BOT_USERNAME = '@koemess_bot'; // !!! ЗАМЕНИТЕ НА ИМЯ ВАШЕГО БОТА (без @)

  // Настройки CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { action } = req.query;

  // ===== 1. ПРОВЕРКА СТАТУСА ПОЛЬЗОВАТЕЛЯ =====
  if (action === 'checkUser' && req.method === 'POST') {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ ok: false, error: 'userId is required' });
      }

      // 1. Проверяем, является ли пользователь участником чата и не забанен ли он
      // К сожалению, Telegram Bot API не имеет метода для прямой проверки бана.
      // Мы можем использовать getChatMember, который вернет статус пользователя.
      const memberResponse = await fetch(`https://api.telegram.org/bot${TOKEN}/getChatMember`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          user_id: Number(userId)
        })
      });
      
      const memberData = await memberResponse.json();
      
      if (!memberData.ok) {
        // Пользователь не найден в чате или произошла ошибка
        return res.status(200).json({ 
          ok: true, 
          isMember: false, 
          canSend: false,
          status: 'left' 
        });
      }

      const status = memberData.result.status;
      // Статусы: 'creator', 'administrator', 'member', 'restricted', 'left', 'kicked'
      const isMember = ['creator', 'administrator', 'member', 'restricted'].includes(status);
      // Отправлять могут создатели, админы и обычные участники (member).
      // Если пользователь restricted (ограничен), нужно проверить, может ли он писать.
      let canSend = ['creator', 'administrator', 'member'].includes(status);
      
      // Для restricted проверяем отдельно права
      if (status === 'restricted' && memberData.result.permissions) {
        canSend = memberData.result.permissions.can_send_messages === true;
      }

      res.status(200).json({
        ok: true,
        isMember: isMember,
        canSend: canSend,
        status: status,
        user: memberData.result.user
      });

    } catch (error) {
      res.status(500).json({ ok: false, error: error.toString() });
    }
  }

  // ===== 2. ПОЛУЧЕНИЕ СООБЩЕНИЙ =====
  else if (action === 'getMessages') {
    try {
      const response = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates`);
      const data = await response.json();
      
      let messages = [];
      if (data.ok && data.result) {
        messages = data.result
          .filter(item => item.message && item.message.chat.id == CHAT_ID && item.message.text)
          .map(item => {
            const msg = item.message;
            return {
              id: msg.message_id,
              text: msg.text,
              fromId: msg.from.id,
              fromName: msg.from.first_name,
              date: msg.date
            };
          })
          .slice(-50); // Последние 50 сообщений
      }
      
      res.status(200).json({ ok: true, messages: messages });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.toString() });
    }
  }

  // ===== 3. ОТПРАВКА СООБЩЕНИЯ =====
  else if (action === 'sendMessage' && req.method === 'POST') {
    try {
      const { text, userId, userName } = req.body;
      
      if (!userId) {
        return res.status(403).json({ ok: false, error: 'User not authenticated' });
      }

      // Сначала проверяем, может ли пользователь писать
      const checkResponse = await fetch(`${process.env.VERCEL_URL || 'https://koe-chat-proxy.vercel.app'}/api/proxy?action=checkUser`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      
      const checkData = await checkResponse.json();
      
      if (!checkData.ok || !checkData.canSend) {
        return res.status(403).json({ 
          ok: false, 
          error: 'You are not allowed to send messages in this chat' 
        });
      }

      // Формируем ссылку на профиль пользователя
      const userLink = `tg://user?id=${userId}`;
      // Или можно использовать обычную ссылку: `https://t.me/${userName}` если есть username
      
      const messageText = `<a href="${userLink}">${userName || 'User'}</a>: ${text}`;
      
      const sendResponse = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: messageText,
          parse_mode: 'HTML'
        })
      });
      
      const sendData = await sendResponse.json();
      res.status(200).json(sendData);
      
    } catch (error) {
      res.status(500).json({ ok: false, error: error.toString() });
    }
  }

  // ===== 4. ТЕСТОВЫЙ ЭНДПОИНТ =====
  else if (action === 'test') {
    res.status(200).json({ 
      ok: true, 
      message: 'Proxy is working with auth',
      chatId: CHAT_ID
    });
  }

  else {
    res.status(404).json({ 
      ok: false, 
      error: 'Action not found'
    });
  }
}
