const Slack = require('slack');
const util = require('util');
const logger = require('../log');

const sentMessages = new Set();
const testMessages = [];
let healthCheckTimerStarted = false;
let healthCheckConfig = null;

const HEALTH_CHECK_CHANNEL = '#all-pagers';
const DUTY_OFFICERS_CHANNEL = '#seac-duty-officers';
const BAD_DECODE_CHANNEL = '#possible-bad-decodes';

const DO_KEYWORDS = ['LGDO', 'MODO', 'STDO'];
const BAD_DECODE_ALPHA_THRESHOLD = 8;

// Send a health check summary every 12 hours
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

    if (!slConf || !slConf.enable) return callback();
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

    const slackClient = new Slack({ token: config.bottoken });
    const upperMessage = data.message.toUpperCase();

    // If test message, log it and skip sending
    if (upperMessage.includes("TEST")) {
        testMessages.push(data.message);
        logger.main.debug('Slack: Test message detected, added to health check list.');
        return callback();
    }

    // Deduplication check (ignoring first 3 chars)
    const messageKey = data.message.slice(3);
    if (sentMessages.has(messageKey)) {
        logger.main.debug('Slack: Dropping duplicate message: ' + data.message);
        return callback();
    }
    sentMessages.add(messageKey);
    setTimeout(() => sentMessages.delete(messageKey), 5 * 60 * 1000); // Expire after 5 minutes

    // Format the message
    const formattedMessage = `*${data.agency}*\n\`\`\`\n${data.message}\n\`\`\``;

    // Count alphabetic characters
    const alphaCount = (data.message.match(/[a-zA-Z]/g) || []).length;

    // Message sending logic
    const sendToChannel = (channel) => {
        return slackClient.chat.postMessage({
            channel: channel,
            text: formattedMessage
        });
    };

    // If it's likely a bad decode, send only to BAD_DECODE_CHANNEL
    if (alphaCount < BAD_DECODE_ALPHA_THRESHOLD) {
        logger.main.debug(`Slack: Message flagged as possible bad decode (${alphaCount} letters), sending to ${BAD_DECODE_CHANNEL}`);
        return sendToChannel(BAD_DECODE_CHANNEL)
            .then(() => callback())
            .catch((err) => {
                logger.main.error('Slack (Bad Decode): ' + err);
                callback();
            });
    }

    // Send to normal configured channel
    sendToChannel(slConf.channel)
        .then(() => {
            // If duty officer keywords present, also send to DO channel
            if (DO_KEYWORDS.some(keyword => upperMessage.includes(keyword))) {
                return sendToChannel(DUTY_OFFICERS_CHANNEL);
            }
        })
        .then(() => callback())
        .catch((err) => {
            logger.main.error('Slack: ' + err);
            callback();
        });
}

module.exports = {
    run: run
};
