require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { models, categories, products } = require('./data');  // data.js ichida to‘g‘ri ma'lumot bo‘lishi kerak
const { ADMINS } = require('./config');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const userState = {};  // Foydalanuvchi holatlarini saqlash

// /start komandasi
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userState[chatId] = null;
  sendModelSelection(chatId);
});

// Model tanlash
function sendModelSelection(chatId) {
  bot.sendMessage(chatId, "Qaysi model uchun mahsulot qidiryapsiz?", {
    reply_markup: {
      keyboard: models.map(m => [m]),
      resize_keyboard: true
    }
  });
}

// Kategoriya tanlash
function sendCategorySelection(chatId) {
  bot.sendMessage(chatId, "Qaysi kategoriya?", {
    reply_markup: {
      keyboard: [...categories.map(c => [c]), ["🔙 Orqaga qaytish"]],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  });
}

// Mahsulotni inline tugmalar bilan jo'natish
function sendProductWithInlineButtons(chatId, p, count = 0) {
  const caption = `🚗 ${p.fullname}\n🛒 ${p.name}\n📄 ${p.description}\n${p.line}\n\n📝${p.text}\n\n🧑🏻‍💻 ${p.admin}\n\nSizning soningiz: ${count}`;
  bot.sendPhoto(chatId, p.image, {
    caption,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "-", callback_data: `decrease|${p.name}` },
          { text: "Savatcha", callback_data: "show_cart" },
          { text: "+", callback_data: `increase|${p.name}` }
        ]
      ]
    }
  });
}
// Asosiy xabarlarni qabul qilish
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (msg.contact) return; // Kontakt alohida eventda

  if (!userState[chatId]) {
    if (models.includes(text)) {
      userState[chatId] = { step: 'category', model: text, cart: {} };
      sendCategorySelection(chatId);
    } else {
      sendModelSelection(chatId);
    }
    return;
  }

  const state = userState[chatId];

  if (state.step === 'category') {
    if (text === "🔙 Orqaga qaytish") {
      userState[chatId] = null;
      sendModelSelection(chatId);
      return;
    }

    if (categories.includes(text)) {
      state.category = text;
      state.step = 'showProducts';

      const productList = products?.[state.model]?.[text];
      if (productList?.length) {
        // Mahsulotlarni inline tugmalar bilan ko'rsatish
        productList.forEach(p => {
          const count = state.cart[p.name] || 0;
          sendProductWithInlineButtons(chatId, p, count);
        });

        bot.sendMessage(chatId, "Buyurtma berish uchun kontakt yuboring yoki boshqa kategoriya tanlang:", {
          reply_markup: {
            keyboard: [
              [{ text: "📞 Kontaktni yuborish", request_contact: true }],
              ["🔙 Boshqa kategoriya"]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        });

      } else {
        bot.sendMessage(chatId, "Bu bo‘limda hali mahsulotlar mavjud emas.");
        sendCategorySelection(chatId);
      }
      return;
    }

    bot.sendMessage(chatId, "Iltimos, kategoriyani tanlang.");
    return;
  }

  if (state.step === 'showProducts') {
    if (text === "🔙 Boshqa kategoriya") {
      state.step = 'category';
      sendCategorySelection(chatId);
      return;
    }
  }

  // Agar foydalanuvchi modelni qayta tanlasa
  if (models.includes(text)) {
    userState[chatId] = { step: 'category', model: text, cart: {} };
    sendCategorySelection(chatId);
    return;
  }
});
// Inline tugmalar bosilganda ishlov berish
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const state = userState[chatId];
  if (!state) {
    bot.answerCallbackQuery(query.id, { text: "Avval model va kategoriya tanlang" });
    return;
  }

  if (data.startsWith('increase|')) {
    const productName = data.split('|')[1];
    if (!state.cart) state.cart = {};
    state.cart[productName] = (state.cart[productName] || 0) + 1;
    bot.answerCallbackQuery(query.id, { text: `${productName} miqdori oshirildi` });
    updateProductMessage(chatId, query.message.message_id, productName, state);
    return;
  }

  if (data.startsWith('decrease|')) {
    const productName = data.split('|')[1];
    if (state.cart && state.cart[productName]) {
      state.cart[productName] = Math.max(0, state.cart[productName] - 1);
      if (state.cart[productName] === 0) delete state.cart[productName];
      bot.answerCallbackQuery(query.id, { text: `${productName} miqdori kamaytirildi` });
      updateProductMessage(chatId, query.message.message_id, productName, state);
    } else {
      bot.answerCallbackQuery(query.id, { text: `${productName} savatchada yoq` });
    }
    return;
  }

  if (data === "show_cart") {
    if (!state.cart || Object.keys(state.cart).length === 0) {
      bot.sendMessage(chatId, "Savatcha bo‘sh.");
    } else {
      let cartText = "Tanlangan mahsulotlar:\n\n";
      for (const [name, count] of Object.entries(state.cart)) {
        cartText += `• ${name}: ${count}\n`;
      }
      cartText += `\nBuyurtmani yuborish uchun quyidagini bosing:`;
      bot.sendMessage(chatId, cartText, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Buyurtmani adminlarga yuborish", callback_data: "send_order" }]
          ]
        }
      });
    }
    bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === "send_order") {
    if (!state.cart || Object.keys(state.cart).length === 0) {
      bot.answerCallbackQuery(query.id, { text: "Savatcha bo‘sh, hech narsa yuborilmadi." });
      return;
    }
    let orderText = "Yangi buyurtma:\n\n";
    for (const [name, count] of Object.entries(state.cart)) {
      orderText += `• ${name}: ${count}\n`;
    }
    ADMINS.forEach(admin => {
      bot.sendMessage(admin, orderText);
    });
    bot.sendMessage(chatId, "Buyurtmangiz adminlarga yuborildi. Iltimos, kontaktni yuboring.", {
      reply_markup: {
        keyboard: [[{
          text: "📞 Kontaktni yuborish",
          request_contact: true
        }]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
    userState[chatId].step = 'waiting_contact';
    bot.answerCallbackQuery(query.id, { text: "Buyurtma yuborildi." });
    return;
  }
});
function updateProductMessage(chatId, messageId, productName, state) {
  const productList = products?.[state.model]?.[state.category];
  if (!productList) return;

  const p = productList.find(prod => prod.name === productName);
  if (!p) return;

  const count = state.cart[productName] || 0;
  const caption = `🚗 ${p.fullname}\n🛒 ${p.name}\n📄 ${p.description}\n${p.line}\n\n📝${p.text}\n\n🧑🏻‍💻 ${p.admin}\n\nSizning soningiz: ${count}`;

  bot.editMessageCaption(caption, {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "-", callback_data: `decrease|${p.name}` },
          { text: "Savatcha", callback_data: "show_cart" },
          { text: "+", callback_data: `increase|${p.name}` }
        ]
      ]
    }
  }).catch(() => {
    // Ba'zida xatolik bo'lishi mumkin, masalan xabar o'zgartirilganda
  });
}
// Kontakt qabul qilish
bot.on('contact', (msg) => {
  const chatId = msg.chat.id;
  const contact = msg.contact;
  const state = userState[chatId];

  if (!state || state.step !== 'waiting_contact') {
    bot.sendMessage(chatId, "Iltimos, avval buyurtma bering.");
    return;
  }

  ADMINS.forEach(admin => {
    bot.sendMessage(admin, `📞 Kontakt ma’lumotlari:
Ismi: ${contact.first_name}
Telefon: ${contact.phone_number}`);
  });

  bot.sendMessage(chatId, "Rahmat! Tez orada siz bilan bog‘lanamiz.", {
    reply_markup: {
      keyboard: [['Bosh menyu']],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  });

  userState[chatId] = null; // holatni tozalash
});

// Asosiy menyuga qaytish tugmasi bosilganda
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === 'Bosh menyu') {
    sendModelSelection(chatId);
    userState[chatId] = null; // agar kerak bo‘lsa holatni tozalash
  }

  // ... qolgan xabarlarni qabul qilish kodi shu yerda davom etadi ...
});