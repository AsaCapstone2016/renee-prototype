'use strict';

const fetch = require('node-fetch');

let Wit = require('cse498capstonewit').Wit;
let log = require('cse498capstonewit').log;
// testing api gateway GET: hub.mode=subscribe&hub.verify_token=this_is_my_verify_token&hub.challenge=1

/** 
 * sends a fb message
 * needs to be replaced with custom messages
 */
const fbMessage = (id, text) => {
  console.log('fbMessage() invoked');
  const body = JSON.stringify({
    recipient: { id },
    message: { text }
  });
  const qs = `access_token=${encodeURIComponent(FB_PAGE_TOKEN)}`;
  return fetch(`https://graph.facebook.com/me/messages?${qs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  .then((response) => {
    console.log(`fbMessage() response: ${JSON.stringify(response)}`);
    return response.json();
  })
  .then((json) => {
    if (json.error && json.error.message) {
      throw new Error(json.error.message);
    }
    return json;
  });
};

const sessions = {};

const findOrCreateSession = (fbid) => {
  let sessionId;

  Object.keys(sessions).forEach((k) => {
    if (sessions[k].fbid === fbid) {
      sessionId = k;
    }
  });

  if (!sessionId) {
    sessionId = new Date().toISOString();
    sessions[sessionId] = { fbid: fbid, context: {} };
  }

  return sessionId;
};

const actions = {
  send(session, message) {
    const recipientId = sessions[session.sessionId].fbid;
    if (recipientId) {
      return fbMessage(recipientId, message.text)
      .then(() => null);
    } else {
      return Promise.resolve();
    }
  },
  // don't know what to call this object, rename it
  search(response) {
    return new Promise((resolve, reject) => {
      if ('search_query' in response.entities) {
        response.context.items = response.entities.search_query[0].value;
        delete response.context.missing_keywords;
      } else {
        response.context.missing_keywords = true;
        delete response.context.items;
      }
      return resolve(response.context);
    });
  }
};

let wit = new Wit({
  accessToken: WIT_TOKEN,
  actions,
  logger: new log.Logger(log.DEBUG)
});

module.exports.hello = (e, ctx, cb) => {
  let responseCode = 200;
  let responseHeaders = {};
  let responseBody = '';

  /**
   * POST request for fb webhook
   */
  if (e.httpMethod === 'POST') {
    // e.body is the request from fb
    const data = JSON.parse(e.body);
    console.log(`request: ${JSON.stringify(data)}`);

    if (data.object === 'page') {
      data.entry.forEach((entry) => {
        entry.messaging.forEach((event) => {
          if (event.message) {
            console.log(`recieved message: ${JSON.stringify(event.message.text)}`);

            const sender = event.sender.id;
            const sessionId = findOrCreateSession(sender);

            console.log(`senderId: ${sender}, sessionId: ${sessionId}`);

            const text = event.message.text;
            const attachments = event.message.attachments;

            if (attachments) {
              // attachment recieved, bot can only handle text
              console.log('attachment recieved, bot can only handle text');
            } else if (text) {
              // text recieved, proceed
              console.log('text message recieved, processing it');

              wit.runActions(sessionId, text, sessions[sessionId].context)
              .then((context) => {
                console.log('waiting for next user messages');

                sessions[sessionId].context = context;

                let response = {
                  statusCode: responseCode,
                  headers: responseHeaders,
                  body: responseBody
                };

                ctx.succeed(response);
              });
            }

          } else {
            console.log(`recieved event: ${JSON.stringify(event)}`);
          }
        });
      });
    }
  }

  /**
   * GET request for fb webhook
   */
  else if (e.httpMethod === 'GET') {
    let params = e.queryStringParameters;

    if (params['hub.mode'] === 'subscribe' && params['hub.verify_token'] === FB_VERIFY_TOKEN) {
      let challenge = params['hub.challenge'];
      responseBody = parseInt(challenge);
    } else {
      responseBody = 'Error, wrong validation token';
    }

    let response = {
      statusCode: responseCode,
      headers: responseHeaders,
      body: responseBody
    };

    ctx.succeed(response);
  }
};
