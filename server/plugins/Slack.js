const Slack = require('slack');
const util = require('util');
const logger = require('../log');

const sentMessages = new Set();
const testMessages = [];
let healthCheckTimerStarted = false;
let healthCheckConfig = null;

const HEALTH_CHECK_CHANNEL = '#all-pagers';
const DUTY_OFFICERS_CHANNEL = '#seac-duty-officers';
const DO_KEYWORDS = ['LGDO', 'MODO', 'STDO'];

// Sends health check summary to the all-pagers channel
function sendHealthCheck() {
    if (!healthCheckConfig) {
        logger.main.error('Health Check: Config not available.');
        return;
    }

    const slackClient = new Slack({ token: healthCheckConfig.bottoken });

    const messageText = testMessages.length > 0
        ? `✅ *System health check:*\n\`\`\`\n${testMessages.length} pager test/s received in last 12 hours.\n\`\`\``
        : `❌ *System health check:*\n\`\`\`\nNO pager test/s received in last 12 hours.\n\`\`\``;

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

        if (!healthCheckTimerStarted) {
            healthCheckConfig = config;
            setInterval(sendHealthCheck, 12 * 60 * 60 * 1000);
            healthCheckTimerStarted = true;
        }

        if (data.message.toLowerCase().includes("test")) {
            testMessages.push(data.message);
            logger.main.debug('Slack: Test message detected, added to health check list.');
            return callback();
        }

        const slackClient = new Slack({ token: config.bottoken });

        const messageKey = data.message.slice(3);
        if (sentMessages.has(messageKey)) {
            logger.main.debug('Slack: Dropping duplicate message: ' + data.message);
            return callback();
        }

        sentMessages.add(messageKey);
        setTimeout(() => sentMessages.delete(messageKey), 5 * 60 * 1000);

        const formattedMessage = `*${data.agency} - ${data.alias}*\n\`\`\`\n${data.message}\n\`\`\``;

        // Function to send message to any channel
        const sendToChannel = (channel) => {
            return slackClient.chat.postMessage({
                channel: channel,
                text: formattedMessage
            });
        };

        // Always send to the configured channel
        sendToChannel(slConf.channel)
            .then((response) => {
                logger.main.debug('Slack: ' + util.inspect(response, false, null));

                // If the message contains any DO keywords, also send to the duty officers channel
                const upperMessage = data.message.toUpperCase();
                if (DO_KEYWORDS.some(keyword => upperMessage.includes(keyword))) {
                    return sendToChannel(DUTY_OFFICERS_CHANNEL);
                }
            })
            .then(() => callback())
            .catch((err) => {
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
