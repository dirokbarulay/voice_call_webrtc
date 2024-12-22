const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const admin = require('firebase-admin');

// firebase servis hesabını yapılandırma
const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
const { type } = require('os');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://flask-chats.firebaseio.com"
});


const db = admin.firestore();
const app = express();
const port = 3000;
const wss = new WebSocket.Server({ noServer: true });

const users = {};

// firebase'den kullanıcı listesini alma
async function getUserList() {
    const snapshot = await db.collection('users').get();
    const userList = [];
    snapshot.forEach(doc => {
        userList.push({ telefonNo: doc.data().telefonNo, id: doc.id});
    })
}


// bir kullanıcı bağlandığında veya bağlantısı kesildiğinde kullanıcı listesini güncelle ve herkese duyur
async function broadcastUserList() {
    const userList = await getUserList();
    const phoneNumbers = userList.map(user => user.telefonNo);
    const message = JSON.stringify({ type: "user-list", users: phoneNumbers });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}


// WebSocket Bağlantısı
wss.on('connection', (ws) => {
    let connectedPhoneNo;

    ws.on('message', async (message) => { // mesaj dinleniyor
        const data = JSON.parse(message);

        if (data.type == "register") {
            const user = (await db.collection('users').doc(data.telefonNo).get()).data();

            if(user) {
                connectedPhoneNo = user.telefonNo;
                users[connectedPhoneNo] = ws;
                // bağlanan kullanıcının IDsini gönder
                ws.send(JSON.stringify({ type: "register", userID: connectedPhoneNo}));
                broadcastUserList();
            }
        }

        if (data.target && users[data.target]) { // mesaj hedefe iletiliyor.
            users[data.target].send(JSON.stringify(data));
        }
    });

    ws.on('close', () => {
        // bağlantısı kesilen kullanıcıyı users objesinden sil
        if (connectedPhoneNo){
            delete users[connectedPhoneNo];
        }
        broadcastUserList(); 
    });
});


// HTTP suncuusunu başlatır.
app.server = app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

// HTTP bağlantısını bir websocket bağlantısına yükseltir.
app.server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});
// handleUpgrade: Bağlantıyı alır ve WebSocket sunucusuna bağlar.


// public klasöründeki dosyaları sttaik olarak sunarak.
app.use(express.static(path.join(__dirname, 'public')));

// ana sayfa isteğini dinliyor ve index.html dosyasını döndürür.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});