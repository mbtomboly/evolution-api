// Backport of WhiskeySockets/Baileys#2883 (evolution-api #2778 / PR #2785) onto
// the Baileys version this build installs.
//
// Some accounts now receive contacts' statuses as a top-level <status> stanza
// instead of <message from="status@broadcast">. Baileys never acks it, so about
// 50 minutes later WhatsApp ends the stream with
// <stream:error><ack class="status" type="media"/></stream:error> and holds back
// new inbound messages: the instance stays "open" and can send, but receives
// nothing. Acking the stanza is enough.
//
// Runs after `npm ci`. Fails the build if the anchors are missing, so a Baileys
// upgrade cannot silently drop the fix.
const fs = require('node:fs');
const path = require('node:path');

const file = path.resolve(process.argv[2] || 'node_modules/baileys/lib/Socket/messages-recv.js');
let src = fs.readFileSync(file, 'utf8');

if (src.includes('const handleStatus = async')) {
  console.log('baileys status-ack patch: already applied');
  process.exit(0);
}

function replaceOnce(anchor, replacement) {
  const at = src.indexOf(anchor);
  if (at < 0 || src.indexOf(anchor, at + 1) >= 0) {
    console.error(`baileys status-ack patch: anchor not found exactly once:\n${anchor}`);
    process.exit(1);
  }
  src = src.slice(0, at) + replacement + src.slice(at + anchor.length);
}

replaceOnce(
  '    const makeOfflineNodeProcessor = () => {',
  `    const handleStatus = async (node) => {
        try {
            await sendMessageAck(node);
        }
        catch (error) {
            onUnexpectedError(error, 'acking status stanza');
        }
    };
    const makeOfflineNodeProcessor = () => {`,
);
replaceOnce(
  "            ['notification', handleNotification]\n",
  "            ['notification', handleNotification],\n            ['status', handleStatus]\n",
);
replaceOnce(
  "    ws.on('CB:ack,class:message', (node) => {",
  `    ws.on('CB:status', async (node) => {
        await processNode('status', node, 'acking status stanza', handleStatus).catch(error => onUnexpectedError(error, 'acking status stanza'));
    });
    ws.on('CB:ack,class:message', (node) => {`,
);

fs.writeFileSync(file, src);
console.log('baileys status-ack patch: applied to ' + file);
