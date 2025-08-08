require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { models, categories, products } = require('./data');
const { ADMINS } = require('./config');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "Qaysi model uchun mahsulot qidiryapsiz?", {
        reply_markup: {
            keyboard: models.map(m => [m]),
            resize_keyboard: true
        }
    });
});
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (models.includes(text)) {
        const model = text;
        bot.sendMessage(chatId, "Qaysi kategoriya?", {
            reply_markup: {
                keyboard: categories.map(c => [c]),
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });

        bot.once('message', (catMsg) => {
            const category = catMsg.text;
            const productList = products?.[model]?.[category];

            if (productList?.length) {
                productList.forEach(p => {
                    bot.sendMessage(chatId, `🛒 ${p.name}
📄 ${p.description}`);
                });
                bot.sendMessage(chatId, "Buyurtma berish uchun kontakt yuboring:", {
                    reply_markup: {
                        keyboard: [[{
                            text: "📞 Kontaktni yuborish",
                            request_contact: true
                        }]],
                        resize_keyboard: true,
                        one_time_keyboard: true
                    }
                });
            } else {
                bot.sendMessage(chatId, "Bu bo‘limda hali mahsulotlar mavjud emas.");
            }

            bot.once('contact', (contactMsg) => {
                const contact = contactMsg.contact;
                ADMINS.forEach(admin => {
                    bot.sendMessage(@${admin}, `📞 Yangi buyurtma:
Ismi: ${contact.first_name}
Telefon: ${contact.phone_number}`);
                });
                bot.sendMessage(chatId, "Rahmat! Tez orada siz bilan bog‘lanamiz.");
            });
        });
    }
});