const express = require('express');
const app = express();
const server = require('http').createServer(app);
let fs = require('fs');
const options = {
    key: fs.readFileSync('encryption/key.pem'),
    cert: fs.readFileSync('encryption/cert.pem')
};
const https = require('https').createServer(options, app);
const io = require('socket.io')(https);
const { v4: uuidv4 } = require('uuid');
const uniqid = require('uniqid');

app.use('/', express.static('public'));

app.get('/clientId', (req, res) => {
    return res.json({
        'client-id': uniqid('cli-')
    });
});

app.get('/createRoom', (req, res) => {
    let newUUID = uuidv4();
    // let newUUID = '123';
    return res.json({
        'room-id': newUUID
    });
});

app.get('/joinRoom', (req, res) => {
    let roomId = req.query['roomId'];
    if(io.sockets.adapter.rooms.has(roomId) === true) {
        console.log('Room with ID : ' + roomId + ' Exists !');
        return res.status(200).send('Everything Cool !');
    }
    else {
        console.log('Room with ID : ' + roomId + ' do not Exist !');
        return res.status(400).send('No Room with such an ID');
    }
});

io.on('connect', (socket) => {
    socket.on('join', (data) => {
        if(io.sockets.adapter.rooms.has(data['room-id']) === true) {
            console.log(`Joining room ${data['room-id']} and emitting room_joined socket event`);
            socket.join(data['room-id']);
            socket.broadcast.in(data['room-id']).emit('room-joined', data);
        }
        else {
            console.log(`Creating room ${data['room-id']}`);
            socket.join(data['room-id']);
        }
    });

    socket.on('send-metadata', (data) => {
        socket.broadcast.in(data['room-id']).emit('send-metadata', data);
    });

    socket.on('ice-candidate', (data) => {
        socket.broadcast.in(data['room-id']).emit('ice-candidate', data);
    });

    socket.on('offer', (data) => {
        socket.broadcast.in(data['room-id']).emit('offer', data);
    });

    socket.on('answer', (data) => {
        socket.broadcast.in(data['room-id']).emit('answer', data);
    });
});

const port = process.env.PORT || 3000;

https.listen(port, () => {
    console.log(`Express server listening on port ${port}`)
});
