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

        var notificationText = `*${data.agency} - ${data.alias}*\n` + 
                                `Message: ${data.message}`;

        if (sentMessages.has(data.message)) {
            logger.main.debug('Telegram: Dropping duplicate message: ' + data.message);
            return callback();
        }

        sentMessages.add(data.message);
        setTimeout(() => sentMessages.delete(data.message), 2 * 60 * 1000); 

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
