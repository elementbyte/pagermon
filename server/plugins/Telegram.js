var telegram = require('telegram-bot-api');
var util = require('util');
var logger = require('../log');

const sentMessages = new Set();

function run(trigger, scope, data, config, callback) {
    var tConf = data.pluginconf.Telegram;
    if (tConf && tConf.enable) {
        var telekey = config.teleAPIKEY;
        var t = new telegram({
            token: telekey
        });

        if (tConf.chat == 0 || !tConf.chat) {
            logger.main.error('Telegram: ' + data.address + ' No ChatID key set. Please enter ChatID.');
            return callback();
        }

        var messageKey = data.message.slice(3);

        if (sentMessages.has(messageKey)) {
            logger.main.debug('Telegram: Dropping duplicate message: ' + data.message);
            return callback();
        }

        sentMessages.add(messageKey);
        setTimeout(() => sentMessages.delete(messageKey), 2 * 60 * 1000); // 2 minutes

        // Use the full data.message for the notification
        var notificationText = `*${data.agency} - ${data.alias}*\n` + 
                                `Message: ${data.message}`;

        t.sendMessage({
            chat_id: tConf.chat,
            text: notificationText,
            parse_mode: "Markdown"
        }).then(function(response) {
            logger.main.debug('Telegram: ' + util.inspect(response, false, null));
            callback();
        }).catch(function(err) {
            logger.main.error('Telegram: ' + err);
            callback();
        });
    } else {
        callback();
    }
}

module.exports = {
    run: run
};
