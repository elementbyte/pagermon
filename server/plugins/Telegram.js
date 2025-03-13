var telegram = require('telegram-bot-api');
var util = require('util');
var logger = require('../log');

const sentMessages = new Set();
const testMessages = [];
let healthCheckTimerStarted = false;
let healthCheckConfig = null;
let healthCheckChat = null;

// Function to send the health check summary to Telegram and clear the list
function sendHealthCheck() {
    if (!healthCheckConfig || !healthCheckChat) {
        logger.main.error('Health Check: Config not available.');
        return;
    }
    const t = new telegram({
        token: healthCheckConfig.teleAPIKEY
    });
    let messageText;
    if (testMessages.length > 0) {
        messageText = `✅ System health check: ${testMessages.length} pager test/s received in last 12 hours.`;
    } else {
        messageText = `❌ System health check: NO pager test/s received in last 12 hours.`;
    }
    // Clear the list after sending the summary
    testMessages.length = 0;
    t.sendMessage({
        chat_id: healthCheckChat,
        text: messageText,
        parse_mode: "Markdown"
    }).then(function(response) {
        logger.main.debug('Telegram Health Check: ' + util.inspect(response, false, null));
    }).catch(function(err) {
        logger.main.error('Telegram Health Check: ' + err);
    });
}

function run(trigger, scope, data, config, callback) {
    var tConf = data.pluginconf.Telegram;
    if (tConf && tConf.enable) {
        // Check if data.message exists and is long enough
        if (!data.message || data.message.length < 7) {
            logger.main.error('Telegram: ' + data.address + ' message is too short to process.');
            return callback();
        }
        
        // Initialize the health check timer if not already started.
        // Store config and chat details for use in our health check notifications.
        if (!healthCheckTimerStarted) {
            healthCheckConfig = config;
            healthCheckChat = tConf.chat;
            // Set a timer for every 12 hours (12 * 60 * 60 * 1000 ms)
            setInterval(sendHealthCheck, 12 * 60 * 60 * 1000);
            healthCheckTimerStarted = true;
        }

        // If the message contains "test" (case-insensitive), add it to the testMessages list and do not send immediately.
        if (data.message.toLowerCase().includes("test")) {
            testMessages.push(data.message);
            logger.main.debug('Telegram: Test message detected, added to health check list.');
            return callback();
        }

        var telekey = config.teleAPIKEY;
        var t = new telegram({
            token: telekey
        });

        if (tConf.chat == 0 || !tConf.chat) {
            logger.main.error('Telegram: ' + data.address + ' No ChatID key set. Please enter ChatID.');
            return callback();
        }

        // Create a key for deduplication by ignoring the first 3 characters
        var messageKey = data.message.slice(3);

        // Check if the message (minus the first 3 characters) has already been processed
        if (sentMessages.has(messageKey)) {
            logger.main.debug('Telegram: Dropping duplicate message: ' + data.message);
            return callback();
        }

        // Add the key to the set and schedule its removal after 5 minutes
        sentMessages.add(messageKey);
        setTimeout(() => sentMessages.delete(messageKey), 5 * 60 * 1000); // 5 minutes

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
