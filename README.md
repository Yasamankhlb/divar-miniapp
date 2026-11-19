# دیوار‌یار — Telegram Mini App (static)

Static front-end for the private Telegram bot @DivarMaava_bot. No backend, no data, no secrets:
the page builds a search and hands it to the bot through Telegram (`Telegram.WebApp.sendData` or a
`t.me/DivarMaava_bot?start=` link). Result pages are opened by the bot with a compressed list in the URL
fragment. Only the bot's owner can run searches; the bot checks the Telegram sender.
