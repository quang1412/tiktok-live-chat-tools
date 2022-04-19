const { WebcastPushConnection } = require('tiktok-livestream-chat-connector');
const ProxyAgent = require('proxy-agent');

//EXPRESS
var express = require('express'); 
var app = express();
var server = app.listen(process.env.PORT || 3000);
const path = require('path');

app.use(express.static('public'));
console.log('server running')

app.get('/tiktok-live-chat', function (req, res) {
   // res.send('Chốt đơn Tiktok');
  res.sendFile(path.join(__dirname, '/public/tiktok-live-chat.html'));
});

app.get('/undefined', function (req, res) {
   res.send('Chốt đơn Tiktok');
});
 
//SOCKET
var socket = require('socket.io');
var io = socket(server, {
  cors: {
    origin: '*',
  }
});

io.sockets.on('connection', (socket) => {
  console.log(`Kết nối socket mới, ID: ${socket.id}`)
  
  socket.on('disconnect', reason => {
    console.log(`Client ${socket.id} ngắt kết nối, lý do: ${reason}`)
  })
  
  socket.on('TiktokConnectStart', (tiktok_username) => {
    
    let tiktokChatConnection = new WebcastPushConnection(tiktok_username, {
      // 'requestOptions': {
      //   httpsAgent: new ProxyAgent('https://41.65.251.86:1981'),
      //   timeout: 10000 // 10 seconds 
      // },
      'requestPollingIntervalMs': 1000,
      'enableExtendedGiftInfo':true,
      'processInitialData':false
    });
    
    console.log(`Đang kết nối tới tiktok: ${tiktok_username}`);

    tiktokChatConnection.connect().then(state => {
      console.info(`Đã kết nối tới livestream ${tiktok_username}`);
      io.to(`${socket.id}`).emit('tiktokConnected', true);
    }).catch(err => {
      console.error('Kết nối thất bại:', tiktok_username, err.message);
      
      io.to(`${socket.id}`).emit('alertFromServer', `Kết nối thất bại: ${err.message}`);
      io.to(`${socket.id}`).emit('tiktokConnected', false);
      tiktokChatConnection = null;
    })
    
    tiktokChatConnection.on('connected', state => {
      io.to(`${socket.id}`).emit('eventConnected', state)
    })
    
    tiktokChatConnection.on('member', data => {
    // console.log(`${data.uniqueId} joins the stream!`);
    })

    tiktokChatConnection.on('chat', data => {
      io.to(`${socket.id}`).emit('eventChat', data);
      // console.log(`${data.uniqueId} writes: ${data.comment}`);
    })
 
    tiktokChatConnection.on('gift', data => {
      if(data.gift.gift_type == 1 && data.gift.repeat_end == 1){
        io.to(`${socket.id}`).emit('eventGift', data);
      }
      else if (data.gift.gift_type != 1){
        io.to(`${socket.id}`).emit('eventGift', data); 
      }
    })

    tiktokChatConnection.on('roomUser', data => {
      io.to(`${socket.id}`).emit('viewCount', data);
    })

    tiktokChatConnection.on('like', data => {
      io.to(`${socket.id}`).emit('eventLike', data);
    })

    tiktokChatConnection.on('social', data => {
      if(data.label.includes("followed")){
        io.to(`${socket.id}`).emit('eventFollow', data);
      }
      else if(data.label.includes("shared")){
        io.to(`${socket.id}`).emit('eventShare', data);
      }
    })
    

    tiktokChatConnection.on('questionNew', data => {
      // console.log(`${data.uniqueId} asks ${data.questionText}`);
    })

    tiktokChatConnection.on('linkMicBattle', (data) => {
      // console.log(`New Battle: ${data.battleUsers[0].uniqueId} VS ${data.battleUsers[1].uniqueId}`);
    })

    tiktokChatConnection.on('linkMicBattle', (data) => {
      // console.log(`New Battle: ${data.battleUsers[0].uniqueId} VS ${data.battleUsers[1].uniqueId}`);
    })

    tiktokChatConnection.on('liveIntro', (msg) => {
      // console.log(msg);
    })

    tiktokChatConnection.on('streamEnd', () => {
      io.to(`${socket.id}`).emit('streamEnd', true);
      tiktokChatConnection = null;
    })

    tiktokChatConnection.on('disconnected', () => {
      console.log(`Ngắt kết nối Tiktok: ${tiktok_username}`);
      tiktokChatConnection = null;
    })
 
    socket.on('stopTiktokConnection', i => {
      console.log('stopTiktokConnection', tiktok_username);
      tiktokChatConnection.disconnect();
      tiktokChatConnection = null;
      io.to(`${socket.id}`).emit('tiktokConnected', false);
      socket.removeAllListeners("stopTiktokConnection");
    })
  });
});
