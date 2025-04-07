const Slack = require('slack');
const util = require('util');
const logger = require('../log');

const sentMessages = new Set();
const testMessages = [];
let healthCheckTimerStarted = false;
let healthCheckConfig = null;

const HEALTH_CHECK_CHANNEL = '#all-pagers'; // All test summaries go here

// Sends a health check summary to the all-pagers channel
function sendHealthCheck() {
    if (!healthCheckConfig) {
        logger.main.error('Health Check: Config not available.');
        return;
    }

    const slackClient = new Slack({ token: healthCheckConfig.bottoken });

    const messageText = testMessages.length > 0
        ? `✅ *System health check:*\n\`\`\`\n${testMessages.length} pager test/s received in last 12 hours.\n\`\`\``
        : `❌ *System health check:*\n\`\`\`\nNO pager test/s received in last 12 hours.\n\`\`\``;

    // Clear test messages list
    testMessages.length = 0;

    slackClient.chat.postMessage({
        channel: HEALTH_CHECK_CHANNEL,
        text: messageText
    }).then((response) => {
        logger.main.debug('Slack Health Check: ' + util.inspect(response, false, null));
    }).catch((err) => {
        logger.main.error('Slack Health Check: ' + err);
    });
}

function run(trigger, scope, data, config, callback) {
    const slConf = data.pluginconf.Slack;

    if (slConf && slConf.enable) {
        if (!config.bottoken || !slConf.channel) {
            logger.main.error('Slack: ' + data.address + ' No Bot Token or Channel Set.');
            return callback();
        }

        if (!data.message || data.message.length < 7) {
            logger.main.error('Slack: ' + data.address + ' message is too short to process.');
            return callback();
        }

        // Start health check timer only once
        if (!healthCheckTimerStarted) {
            healthCheckConfig = config;

            // Send health check summary every 12 hours
            setInterval(sendHealthCheck, 12 * 60 * 60 * 1000);
            healthCheckTimerStarted = true;
        }

        // Test message handling
        if (data.message.toLowerCase().includes("test")) {
            testMessages.push(data.message);
            logger.main.debug('Slack: Test message detected, added to health check list.');
            return callback();
        }

        const slackClient = new Slack({ token: config.bottoken });

        // Deduplication: skip if message seen recently (ignoring first 3 characters)
        const messageKey = data.message.slice(3);
        if (sentMessages.has(messageKey)) {
            logger.main.debug('Slack: Dropping duplicate message: ' + data.message);
            return callback();
        }

        sentMessages.add(messageKey);
        setTimeout(() => sentMessages.delete(messageKey), 5 * 60 * 1000); // Expire after 5 minutes

        const messageData = `*${data.agency} - ${data.alias}*\n\`\`\`\n${data.message}\n\`\`\``;

        slackClient.chat.postMessage({
            channel: slConf.channel,
            text: messageData
        }).then((response) => {
            logger.main.debug('Slack: ' + util.inspect(response, false, null));
            callback();
        }).catch((err) => {
            logger.main.error('Slack: ' + err);
            callback();
        });
    } else {
        callback();
    }
}

module.exports = {
    run: run
};
