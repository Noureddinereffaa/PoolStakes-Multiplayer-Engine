const { WebSocketServer } = require('ws');

const wss = new WebSocketServer({ port: 8080 });
console.log("🎱 خادم البلياردو يعمل الآن على المنفذ 8080...");

wss.on('connection', (ws) => {
  console.log('لاعب جديد متصل!');

  ws.on('message', (message) => {
    // إعادة بث البيانات لجميع اللاعبين الآخرين في الغرفة (ترحيل البيانات)
    wss.clients.forEach(client => {
      if (client !== ws && client.readyState === 1) {
        client.send(message.toString());
      }
    });
  });
});